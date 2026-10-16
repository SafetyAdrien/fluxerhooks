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

      val workers = (0 until threads).map { offset ->
        Thread {
          val mac = Mac.getInstance(macName)
          val pwd = ByteArray(nonce.size + 4)
          System.arraycopy(nonce, 0, pwd, 0, nonce.size)
          var counter = offset.toLong()
          while (found.get() < 0 && !cancelled.get() && counter <= 0xFFFFFFFFL) {
            pwd[nonce.size] = (counter ushr 24).toByte()
            pwd[nonce.size + 1] = (counter ushr 16).toByte()
            pwd[nonce.size + 2] = (counter ushr 8).toByte()
            pwd[nonce.size + 3] = counter.toByte()
            val key = pbkdf2(mac, pwd, salt, cost, keyLength)
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
            if (n % 64 == 0L) {
              if (System.currentTimeMillis() > deadline) break
              if (offset == 0) sendEvent("onProgress", mapOf("tries" to n.toDouble()))
            }
            counter += threads
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
