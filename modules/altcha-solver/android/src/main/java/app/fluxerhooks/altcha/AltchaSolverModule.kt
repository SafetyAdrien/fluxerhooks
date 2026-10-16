package app.fluxerhooks.altcha

import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/**
 * Solveur ALTCHA v2 natif : cherche le compteur tel que
 * PBKDF2-HMAC(nonce ‖ uint32_be(counter), salt, cost, keyLength) commence par keyPrefix.
 * Le calcul est réparti sur tous les cœurs du processeur (compteurs entrelacés).
 */
class AltchaSolverModule : Module() {
  private val cancelled = AtomicBoolean(false)

  override fun definition() = ModuleDefinition {
    Name("AltchaSolver")
    Events("onProgress")

    AsyncFunction("cancel") { cancelled.set(true) }

    AsyncFunction("solve") { opts: Map<String, Any?>, promise: Promise ->
      cancelled.set(false)
      val algorithm = opts["algorithm"] as? String ?: "PBKDF2/SHA-256"
      val nonceHex = opts["nonce"] as String
      val saltHex = opts["salt"] as String
      val cost = (opts["cost"] as Number).toInt()
      val keyLength = (opts["keyLength"] as? Number)?.toInt() ?: 32
      val prefixHex = (opts["keyPrefix"] as String).lowercase()
      val timeoutMs = (opts["timeoutMs"] as? Number)?.toDouble() ?: 180000.0
      val macName = when (algorithm) {
        "PBKDF2/SHA-384" -> "HmacSHA384"
        "PBKDF2/SHA-512" -> "HmacSHA512"
        else -> "HmacSHA256"
      }
      val nonce = hex(nonceHex)
      val salt = hex(saltHex)
      val prefix = hex(prefixHex.substring(0, prefixHex.length - prefixHex.length % 2))
      val oddNibble = if (prefixHex.length % 2 == 1) Character.digit(prefixHex.last(), 16) else -1
      val threads = Runtime.getRuntime().availableProcessors().coerceIn(1, 8)
      val found = AtomicLong(-1)
      val tries = AtomicLong(0)
      val deadline = System.currentTimeMillis() + timeoutMs.toLong()
      var resultKey: ByteArray? = null
      val lock = Any()

      // Fluxer choisit le compteur dans [maxCounter/2, maxCounter] (1000 par défaut) :
      // on explore d'abord cette plage, puis le début, puis la suite → ~3× moins de calculs.
      val hintLo = (opts["hintLo"] as? Number)?.toLong() ?: 500L
      val hintHi = (opts["hintHi"] as? Number)?.toLong() ?: 1000L
      val span = hintHi - hintLo + 1
      fun counterAt(i: Long): Long = when {
        i < span -> hintLo + i
        i < span + hintLo -> i - span
        else -> i
      }
      val next = AtomicLong(0)
      val fastSha256 = macName == "HmacSHA256" && nonce.size + 4 <= 64 && keyLength <= 32

      val workers = (0 until threads).map {
        Thread {
          val mac = Mac.getInstance(macName)
          val fast = if (fastSha256) FastPbkdf2() else null
          val pwd = ByteArray(nonce.size + 4)
          System.arraycopy(nonce, 0, pwd, 0, nonce.size)
          while (found.get() < 0 && !cancelled.get()) {
            val counter = counterAt(next.getAndIncrement())
            if (counter > 0xFFFFFFFFL) break
            pwd[nonce.size] = (counter ushr 24).toByte()
            pwd[nonce.size + 1] = (counter ushr 16).toByte()
            pwd[nonce.size + 2] = (counter ushr 8).toByte()
            pwd[nonce.size + 3] = counter.toByte()
            val key = fast?.derive(mac, pwd, salt, cost, keyLength) ?: pbkdf2(mac, pwd, salt, cost, keyLength)
            if (matches(key, prefix, oddNibble)) {
              synchronized(lock) {
                if (found.get() < 0) {
                  found.set(counter)
                  resultKey = key
                }
              }
              break
            }
            val n = tries.incrementAndGet()
            if (n % 8 == 0L) {
              if (System.currentTimeMillis() > deadline) break
              sendEvent("onProgress", mapOf("tries" to n.toDouble()))
            }
          }
        }.apply { priority = Thread.NORM_PRIORITY - 1; start() }
      }

      Thread {
        workers.forEach { it.join() }
        val c = found.get()
        val k = resultKey
        when {
          c >= 0 && k != null -> promise.resolve(mapOf("counter" to c.toDouble(), "derivedKey" to toHex(k), "tries" to tries.get().toDouble()))
          cancelled.get() -> promise.reject("CANCELLED", "Vérification annulée.", null)
          else -> promise.reject("TIMEOUT", "La vérification anti-robot a pris trop de temps.", null)
        }
      }.start()
    }
  }

  private fun pbkdf2(mac: Mac, password: ByteArray, salt: ByteArray, iterations: Int, dkLen: Int): ByteArray {
    mac.init(SecretKeySpec(password, mac.algorithm))
    val hLen = mac.macLength
    val blocks = (dkLen + hLen - 1) / hLen
    val out = ByteArray(dkLen)
    var pos = 0
    for (i in 1..blocks) {
      mac.update(salt)
      mac.update(byteArrayOf((i ushr 24).toByte(), (i ushr 16).toByte(), (i ushr 8).toByte(), i.toByte()))
      var u = mac.doFinal()
      val t = u.copyOf()
      for (j in 1 until iterations) {
        u = mac.doFinal(u)
        for (b in t.indices) t[b] = (t[b].toInt() xor u[b].toInt()).toByte()
      }
      val len = minOf(hLen, dkLen - pos)
      System.arraycopy(t, 0, out, pos, len)
      pos += len
    }
    return out
  }

  private fun matches(key: ByteArray, prefix: ByteArray, oddNibble: Int): Boolean {
    for (i in prefix.indices) if (key[i] != prefix[i]) return false
    if (oddNibble >= 0) return ((key[prefix.size].toInt() ushr 4) and 0xF) == oddNibble
    return true
  }

  private fun hex(s: String): ByteArray = ByteArray(s.length / 2) { i -> ((Character.digit(s[i * 2], 16) shl 4) + Character.digit(s[i * 2 + 1], 16)).toByte() }

  private fun toHex(b: ByteArray): String {
    val sb = StringBuilder(b.size * 2)
    for (x in b) sb.append(String.format("%02x", x.toInt() and 0xFF))
    return sb.toString()
  }
}

/**
 * PBKDF2-HMAC-SHA256 optimisé : états HMAC (ipad/opad) précalculés, puis chaque itération
 * ne coûte que 2 compressions SHA-256 sur des entiers, sans allocation ni appel JNI.
 * Vérifié contre javax.crypto (Mac HmacSHA256) sur des entrées aléatoires.
 */
private class FastPbkdf2 {
  private val w = IntArray(64)
  private val ist = IntArray(8)
  private val ost = IntArray(8)
  private val u = IntArray(8)
  private val t = IntArray(8)
  private val tmp = IntArray(8)
  private val kb = ByteArray(64)

  fun derive(mac: Mac, pwd: ByteArray, salt: ByteArray, c: Int, dk: Int): ByteArray {
    java.util.Arrays.fill(kb, 0)
    System.arraycopy(pwd, 0, kb, 0, pwd.size)
    loadKey(0x36); compress(IV, w, ist)
    loadKey(0x5c); compress(IV, w, ost)
    mac.init(SecretKeySpec(pwd, "HmacSHA256"))
    mac.update(salt)
    mac.update(byteArrayOf(0, 0, 0, 1))
    val u1 = mac.doFinal()
    for (i in 0 until 8) {
      u[i] = ((u1[i * 4].toInt() and 255) shl 24) or ((u1[i * 4 + 1].toInt() and 255) shl 16) or
        ((u1[i * 4 + 2].toInt() and 255) shl 8) or (u1[i * 4 + 3].toInt() and 255)
      t[i] = u[i]
    }
    for (j in 1 until c) {
      pad(u); compress(ist, w, tmp)
      pad(tmp); compress(ost, w, u)
      for (i in 0 until 8) t[i] = t[i] xor u[i]
    }
    return ByteArray(dk) { i -> (t[i shr 2] ushr (24 - 8 * (i and 3))).toByte() }
  }

  private fun loadKey(x: Int) {
    for (i in 0 until 16) {
      w[i] = (((kb[i * 4].toInt() xor x) and 255) shl 24) or (((kb[i * 4 + 1].toInt() xor x) and 255) shl 16) or
        (((kb[i * 4 + 2].toInt() xor x) and 255) shl 8) or ((kb[i * 4 + 3].toInt() xor x) and 255)
    }
  }

  /** Bloc unique : message de 32 octets précédé d'un bloc de clé (longueur totale 96 octets = 768 bits). */
  private fun pad(src: IntArray) {
    System.arraycopy(src, 0, w, 0, 8)
    w[8] = Int.MIN_VALUE
    for (i in 9 until 15) w[i] = 0
    w[15] = 768
  }

  private fun compress(st: IntArray, w: IntArray, out: IntArray) {
    for (i in 16 until 64) {
      val a = w[i - 15]
      val b = w[i - 2]
      val s0 = Integer.rotateRight(a, 7) xor Integer.rotateRight(a, 18) xor (a ushr 3)
      val s1 = Integer.rotateRight(b, 17) xor Integer.rotateRight(b, 19) xor (b ushr 10)
      w[i] = w[i - 16] + s0 + w[i - 7] + s1
    }
    var a = st[0]; var b = st[1]; var c = st[2]; var d = st[3]
    var e = st[4]; var f = st[5]; var g = st[6]; var h = st[7]
    for (i in 0 until 64) {
      val s1 = Integer.rotateRight(e, 6) xor Integer.rotateRight(e, 11) xor Integer.rotateRight(e, 25)
      val ch = (e and f) xor (e.inv() and g)
      val t1 = h + s1 + ch + K[i] + w[i]
      val s0 = Integer.rotateRight(a, 2) xor Integer.rotateRight(a, 13) xor Integer.rotateRight(a, 22)
      val mj = (a and b) xor (a and c) xor (b and c)
      val t2 = s0 + mj
      h = g; g = f; f = e; e = d + t1; d = c; c = b; b = a; a = t1 + t2
    }
    out[0] = st[0] + a; out[1] = st[1] + b; out[2] = st[2] + c; out[3] = st[3] + d
    out[4] = st[4] + e; out[5] = st[5] + f; out[6] = st[6] + g; out[7] = st[7] + h
  }

  companion object {
    private val IV = intArrayOf(
      0x6a09e667, -0x4498517b, 0x3c6ef372, -0x5ab00ac6, 0x510e527f, -0x64fa9774, 0x1f83d9ab, 0x5be0cd19,
    )
    private val K = longArrayOf(
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
    ).map { it.toInt() }.toIntArray()
  }
}
