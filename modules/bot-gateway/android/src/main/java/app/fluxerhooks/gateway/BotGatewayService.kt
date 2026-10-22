package app.fluxerhooks.gateway

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.os.PowerManager
import okhttp3.Call
import okhttp3.Callback
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * Service au premier plan qui garde un bot Fluxer « en ligne » :
 * connexion au gateway (WebSocket JSON v1), Identify, heartbeats, reprise de session (Resume)
 * et reconnexion automatique. Les événements lourds (messages, présences…) sont ignorés côté
 * serveur via `ignored_events` pour économiser batterie et données.
 *
 * Systèmes du bot : les règles (rôles par réaction, bienvenue, départ) sont reçues de l'app
 * (`saveRules`, JSON de botEngine.compileRules) et appliquées ici, même app fermée : seuls les
 * événements nécessaires sont alors écoutés, et les rôles / messages passent par l'API HTTP.
 */
class BotGatewayService : Service() {
  companion object {
    const val ACTION_START = "app.fluxerhooks.gateway.START"
    const val ACTION_STOP = "app.fluxerhooks.gateway.STOP"
    const val ACTION_PRESENCE = "app.fluxerhooks.gateway.PRESENCE"
    const val ACTION_RULES = "app.fluxerhooks.gateway.RULES"
    private const val PREFS = "fluxerhooks_bot"

    /** Enregistre les règles des systèmes du bot (relues au démarrage du service). */
    fun saveRules(ctx: Context, json: String) {
      ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("rules", json).apply()
    }
    private const val CHANNEL_ID = "fluxerhooks_bot"
    private const val NOTIF_ID = 4107

    /** Codes de fermeture définitifs (token refusé, version, sharding…) : pas de reconnexion. */
    private val FATAL = setOf(4004, 4010, 4011, 4012, 4013, 4014)

    private val IGNORED = listOf(
      "TYPING_START", "MESSAGE_CREATE", "MESSAGE_UPDATE", "MESSAGE_DELETE", "MESSAGE_DELETE_BULK", "MESSAGE_ACK",
      "MESSAGE_REACTION_ADD", "MESSAGE_REACTION_ADD_MANY", "MESSAGE_REACTION_REMOVE", "MESSAGE_REACTION_REMOVE_ALL",
      "MESSAGE_REACTION_REMOVE_EMOJI", "PRESENCE_UPDATE", "PRESENCE_UPDATE_BULK", "PASSIVE_UPDATES",
      "GUILD_MEMBER_ADD", "GUILD_MEMBER_UPDATE", "GUILD_MEMBER_REMOVE", "GUILD_MEMBERS_CHUNK", "GUILD_MEMBER_LIST_UPDATE",
      "VOICE_STATE_UPDATE", "VOICE_SERVER_UPDATE", "VOICE_SIGNAL", "ENTRANCE_SOUND_PLAY", "CALL_CREATE", "CALL_UPDATE",
      "CALL_DELETE", "CHANNEL_PINS_UPDATE", "CHANNEL_PINS_ACK", "GUILD_AUDIT_LOG_ENTRY_CREATE", "GUILD_COUNTS_UPDATE",
      "CHANNEL_MEMBER_COUNTS_UPDATE", "INVITE_CREATE", "INVITE_DELETE", "GUILD_BAN_ADD", "GUILD_BAN_REMOVE",
    )

    @Volatile var listener: ((Map<String, Any?>) -> Unit)? = null
    @Volatile var lastState: Map<String, Any?> = mapOf("state" to "offline")

    fun emit(m: Map<String, Any?>) {
      lastState = m
      try { listener?.invoke(m) } catch (_: Throwable) {}
    }
  }

  private val client = OkHttpClient.Builder()
    .readTimeout(0, TimeUnit.MILLISECONDS)
    .connectTimeout(20, TimeUnit.SECONDS)
    .build()
  private val http = client.newBuilder().readTimeout(20, TimeUnit.SECONDS).build()
  private var rules = JSONObject()
  private lateinit var thread: HandlerThread
  private lateinit var handler: Handler
  private var wakeLock: PowerManager.WakeLock? = null

  private var ws: WebSocket? = null
  private var socketGen = 0
  private var token = ""
  private var url = ""
  private var appName = "FluxerHooks"
  private var status = "online"
  private var text = ""
  private var seq: Long? = null
  private var sessionId: String? = null
  private var heartbeatMs = 41250L
  private var acked = true
  private var stopping = false
  private var attempts = 0
  private var username = ""
  private var userId = ""
  private var guilds = 0
  private var since = 0L

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    thread = HandlerThread("fluxer-gateway").also { it.start() }
    handler = Handler(thread.looper)
    loadRules()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val action = intent?.action ?: ACTION_START
    when (action) {
      ACTION_STOP -> {
        handler.post { shutdown("Arrêté") }
        return START_NOT_STICKY
      }
      ACTION_RULES -> {
        handler.post {
          val before = ruleEvents()
          loadRules()
          // Nouveaux événements à écouter : nouvelle identification auprès du gateway.
          if (before != ruleEvents() && ws != null) reconnect(resume = false)
        }
        return START_REDELIVER_INTENT
      }
      ACTION_PRESENCE -> {
        status = intent?.getStringExtra("status") ?: status
        text = intent?.getStringExtra("text") ?: text
        handler.post {
          sendPresence()
          updateNotification()
        }
        return START_REDELIVER_INTENT
      }
      else -> {
        val tk = intent?.getStringExtra("token").orEmpty()
        if (tk.isEmpty()) {
          stopSelf()
          return START_NOT_STICKY
        }
        if (!goForeground()) return START_NOT_STICKY
        handler.post {
          val changed = tk != token
          token = tk
          url = intent?.getStringExtra("url") ?: url
          status = intent?.getStringExtra("status") ?: status
          text = intent?.getStringExtra("text") ?: text
          appName = intent?.getStringExtra("appName") ?: appName
          stopping = false
          if (changed || ws == null) {
            sessionId = null
            seq = null
            connect()
          } else {
            sendPresence()
          }
        }
        return START_REDELIVER_INTENT
      }
    }
  }

  override fun onDestroy() {
    stopping = true
    ws?.close(1000, "stop")
    ws = null
    releaseWake()
    thread.quitSafely()
    super.onDestroy()
  }

  /* ---------- Gateway ---------- */

  private fun connect() {
    handler.removeCallbacksAndMessages(null)
    ws?.cancel()
    val gen = ++socketGen
    emitState(if (attempts == 0) "connecting" else "reconnecting")
    val sep = if (url.contains("?")) "&" else "?"
    val req = Request.Builder().url("$url${sep}v=1&encoding=json").header("User-Agent", "$appName (Android)").build()
    ws = client.newWebSocket(req, object : WebSocketListener() {
      override fun onMessage(webSocket: WebSocket, text: String) {
        handler.post { if (gen == socketGen) onPayload(text) }
      }

      override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
        webSocket.close(code, null)
        handler.post { if (gen == socketGen) onClosed(code, reason) }
      }

      override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
        handler.post { if (gen == socketGen) onClosed(-1, t.message ?: "Connexion perdue") }
      }
    })
  }

  private fun onPayload(raw: String) {
    val p = try { JSONObject(raw) } catch (_: Throwable) { return }
    when (p.optInt("op", -1)) {
      10 -> {
        heartbeatMs = p.optJSONObject("d")?.optLong("heartbeat_interval", 41250L) ?: 41250L
        acked = true
        scheduleHeartbeat((heartbeatMs * Math.random()).toLong().coerceAtLeast(1000L))
        if (sessionId != null && seq != null) {
          send(JSONObject().put("op", 6).put("d", JSONObject().put("token", token).put("session_id", sessionId).put("seq", seq)))
        } else identify()
      }
      0 -> {
        if (p.has("s") && !p.isNull("s")) seq = p.optLong("s")
        val d = p.optJSONObject("d")
        when (p.optString("t")) {
          "READY" -> {
            sessionId = d?.optString("session_id")
            val u = d?.optJSONObject("user")
            username = u?.optString("username").orEmpty()
            userId = u?.optString("id").orEmpty()
            guilds = d?.optJSONArray("guilds")?.length() ?: 0
            since = System.currentTimeMillis()
            attempts = 0
            if (text.isNotEmpty()) sendPresence()
            emitState("online")
          }
          "RESUMED" -> {
            attempts = 0
            emitState("online")
          }
          "MESSAGE_REACTION_ADD" -> d?.let { onReaction(true, it) }
          "MESSAGE_REACTION_REMOVE" -> d?.let { onReaction(false, it) }
          "GUILD_MEMBER_ADD" -> d?.let { onMember(true, it) }
          "GUILD_MEMBER_REMOVE" -> d?.let { onMember(false, it) }
          "GUILD_CREATE" -> if (since > 0) { guilds += 1; emitState("online") }
          "GUILD_DELETE" -> if (d?.optBoolean("unavailable") != true && guilds > 0) { guilds -= 1; emitState("online") }
        }
      }
      1 -> heartbeat()
      7 -> reconnect(resume = true)
      9 -> {
        // Session impossible à reprendre : nouvel Identify après une courte pause.
        sessionId = null
        seq = null
        handler.postDelayed({ identify() }, 1500L + (Math.random() * 3000).toLong())
      }
      11 -> acked = true
    }
  }

  private fun identify() {
    val presence = JSONObject().put("status", status).put("afk", false).put("mobile", true)
    if (text.isNotEmpty()) presence.put("custom_status", JSONObject().put("text", text))
    val d = JSONObject()
      .put("token", token)
      .put("properties", JSONObject().put("os", "Android").put("browser", appName).put("device", appName).put("mobile", true))
      .put("presence", presence)
      .put("ignored_events", JSONArray(IGNORED.filter { it !in ruleEvents() }))
    send(JSONObject().put("op", 2).put("d", d))
  }

  private fun sendPresence() {
    if (sessionId == null) return
    val d = JSONObject().put("status", status).put("afk", false).put("mobile", true)
    d.put("custom_status", if (text.isNotEmpty()) JSONObject().put("text", text) else JSONObject.NULL)
    send(JSONObject().put("op", 3).put("d", d))
  }

  private fun scheduleHeartbeat(delay: Long) {
    handler.postDelayed({ heartbeat(); scheduleHeartbeat(heartbeatMs) }, delay)
  }

  private fun heartbeat() {
    if (!acked) {
      // Pas d'ACK depuis le dernier battement : connexion zombie, on reprend la session.
      reconnect(resume = true)
      return
    }
    acked = false
    send(JSONObject().put("op", 1).put("d", seq ?: JSONObject.NULL))
  }

  private fun send(o: JSONObject) {
    ws?.send(o.toString())
  }

  private fun reconnect(resume: Boolean) {
    if (!resume) {
      sessionId = null
      seq = null
    }
    ws?.close(4900, "reconnect")
    ws = null
    scheduleReconnect()
  }

  private fun onClosed(code: Int, reason: String) {
    ws = null
    handler.removeCallbacksAndMessages(null)
    if (stopping) return
    if (code in FATAL) {
      val msg = when (code) {
        4004 -> "Token du bot refusé par Fluxer."
        4011 -> "Bot présent sur trop de serveurs (sharding requis)."
        else -> "Fermé par Fluxer ($code) : $reason"
      }
      emitState("error", msg, code)
      shutdown(null)
      return
    }
    scheduleReconnect()
  }

  private fun scheduleReconnect() {
    attempts += 1
    val delay = listOf(1000L, 2000L, 5000L, 10000L, 30000L, 60000L)[minOf(attempts - 1, 5)]
    emitState("reconnecting")
    handler.postDelayed({ if (!stopping) connect() }, delay)
  }

  private fun shutdown(reason: String?) {
    stopping = true
    handler.removeCallbacksAndMessages(null)
    ws?.close(1000, "stop")
    ws = null
    sessionId = null
    seq = null
    if (reason != null) emitState("offline")
    releaseWake()
    stopForeground(STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

  private fun emitState(state: String, error: String? = null, code: Int? = null) {
    emit(
      mapOf(
        "state" to state,
        "username" to username,
        "userId" to userId,
        "guilds" to guilds.toDouble(),
        "since" to since.toDouble(),
        "error" to error,
        "code" to code?.toDouble(),
      ),
    )
    updateNotification()
  }

  /* ---------- Systèmes du bot ---------- */

  private fun loadRules() {
    rules = try {
      JSONObject(getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("rules", null) ?: "{}")
    } catch (_: Throwable) {
      JSONObject()
    }
  }

  private fun ruleEvents(): Set<String> {
    val a = rules.optJSONArray("events") ?: return emptySet()
    return (0 until a.length()).map { a.optString(it) }.toSet()
  }

  private fun str(o: JSONObject?, k: String): String = if (o == null || !o.has(k) || o.isNull(k)) "" else o.optString(k)

  /** Même clé que botEngine.emojiKey : id pour un émoji du serveur, sinon le caractère sans U+FE0F. */
  private fun emojiKey(e: JSONObject?): String {
    val id = str(e, "id")
    return if (id.isNotEmpty()) "id:$id" else "u:" + str(e, "name").replace("\uFE0F", "")
  }

  private fun onReaction(add: Boolean, d: JSONObject) {
    val member = d.optJSONObject("member")
    val user = str(d, "user_id").ifEmpty { str(member?.optJSONObject("user"), "id") }
    val me = str(rules, "botId").ifEmpty { userId }
    if (user.isEmpty() || user == me || member?.optJSONObject("user")?.optBoolean("bot") == true) return
    val key = emojiKey(d.optJSONObject("emoji"))
    val msg = str(d, "message_id")
    val rr = rules.optJSONArray("rr") ?: return
    for (i in 0 until rr.length()) {
      val r = rr.optJSONObject(i) ?: continue
      if (str(r, "m") != msg) continue
      val pairs = r.optJSONArray("p") ?: continue
      val guild = str(d, "guild_id").ifEmpty { str(r, "g") }
      var role = ""
      for (j in 0 until pairs.length()) {
        val p = pairs.optJSONObject(j) ?: continue
        if (str(p, "k") == key) { role = str(p, "r"); break }
      }
      if (role.isEmpty()) continue
      val mode = str(r, "mode").ifEmpty { "toggle" }
      if (add) {
        call("PUT", "/guilds/$guild/members/$user/roles/$role")
        // Un seul rôle du groupe à la fois : les autres sont retirés.
        if (mode == "unique") {
          for (j in 0 until pairs.length()) {
            val other = str(pairs.optJSONObject(j), "r")
            if (other.isNotEmpty() && other != role) call("DELETE", "/guilds/$guild/members/$user/roles/$other")
          }
        }
      } else if (mode != "add") call("DELETE", "/guilds/$guild/members/$user/roles/$role")
    }
  }

  private fun onMember(add: Boolean, d: JSONObject) {
    val u = d.optJSONObject("user") ?: return
    if (u.optBoolean("bot")) return
    val guild = str(d, "guild_id")
    val mm = rules.optJSONArray("mm") ?: return
    val name = str(u, "global_name").ifEmpty { str(u, "username") }
    for (i in 0 until mm.length()) {
      val r = mm.optJSONObject(i) ?: continue
      if (str(r, "g") != guild || str(r, "ev") != (if (add) "add" else "remove")) continue
      val content = str(r, "content")
        .replace("{user}", "<@${str(u, "id")}>")
        .replace("{username}", name)
        .replace("{server}", str(r, "gn"))
      val body = JSONObject().put("content", content).put("allowed_mentions", JSONObject().put("parse", JSONArray().put("users")))
      call("POST", "/channels/${str(r, "c")}/messages", body)
    }
  }

  /** Requête HTTP vers l'API Fluxer avec le token du bot (asynchrone, hors du fil du gateway). */
  private fun call(method: String, path: String, body: JSONObject? = null) {
    if (token.isEmpty()) return
    val api = str(rules, "api").ifEmpty { "https://api.fluxer.app" }.trimEnd('/')
    val rb = when {
      body != null -> body.toString().toRequestBody("application/json".toMediaType())
      method == "PUT" || method == "POST" -> ByteArray(0).toRequestBody(null)
      else -> null
    }
    val req = Request.Builder()
      .url("$api/v1$path")
      .header("Authorization", "Bot $token")
      .header("User-Agent", "$appName (Android)")
      .method(method, rb)
      .build()
    http.newCall(req).enqueue(object : Callback {
      override fun onFailure(call: Call, e: IOException) {}
      override fun onResponse(call: Call, response: Response) { response.close() }
    })
  }

  /* ---------- Notification au premier plan ---------- */

  private fun goForeground(): Boolean {
    return try {
      val n = buildNotification()
      if (Build.VERSION.SDK_INT >= 34) startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
      else startForeground(NOTIF_ID, n)
      acquireWake()
      true
    } catch (t: Throwable) {
      emit(mapOf("state" to "error", "error" to "Android a refusé de démarrer le service : ouvre l’app puis réessaie."))
      stopSelf()
      false
    }
  }

  private fun buildNotification(): Notification {
    val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CHANNEL_ID) == null) {
      nm.createNotificationChannel(NotificationChannel(CHANNEL_ID, "Bot Fluxer en ligne", NotificationManager.IMPORTANCE_LOW).apply {
        description = "Affichée tant que ton bot est connecté au gateway Fluxer."
        setShowBadge(false)
      })
    }
    val flags = if (Build.VERSION.SDK_INT >= 23) PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT else PendingIntent.FLAG_UPDATE_CURRENT
    val open = packageManager.getLaunchIntentForPackage(packageName)?.let { PendingIntent.getActivity(this, 0, it, flags) }
    val stop = PendingIntent.getService(this, 1, Intent(this, BotGatewayService::class.java).setAction(ACTION_STOP), flags)
    val name = username.ifEmpty { "Bot Fluxer" }
    val st = lastState["state"] as? String ?: "connecting"
    val title = when (st) {
      "online" -> "$name est en ligne"
      "reconnecting" -> "$name : reconnexion…"
      "error" -> "$name : erreur"
      else -> "$name : connexion…"
    }
    val label = mapOf("online" to "En ligne", "idle" to "Absent", "dnd" to "Ne pas déranger", "invisible" to "Invisible")[status] ?: status
    val body = buildString {
      append(label)
      if (guilds > 0) append(" · $guilds serveur${if (guilds > 1) "s" else ""}")
      if (text.isNotEmpty()) append(" · « $text »")
    }
    val b = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, CHANNEL_ID) else @Suppress("DEPRECATION") Notification.Builder(this)
    b.setContentTitle(title)
      .setContentText(body)
      .setSmallIcon(applicationInfo.icon)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .addAction(Notification.Action.Builder(0, "Arrêter le bot", stop).build())
    if (open != null) b.setContentIntent(open)
    if (Build.VERSION.SDK_INT >= 31) b.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE)
    return b.build()
  }

  private fun updateNotification() {
    if (stopping) return
    try {
      (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).notify(NOTIF_ID, buildNotification())
    } catch (_: Throwable) {}
  }

  /** Verrou partiel léger : évite que le processeur s'endorme entre deux battements. */
  private fun acquireWake() {
    if (wakeLock?.isHeld == true) return
    try {
      wakeLock = (getSystemService(Context.POWER_SERVICE) as PowerManager)
        .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "FluxerHooks:gateway")
        .apply { setReferenceCounted(false); acquire() }
    } catch (_: Throwable) {}
  }

  private fun releaseWake() {
    try { if (wakeLock?.isHeld == true) wakeLock?.release() } catch (_: Throwable) {}
    wakeLock = null
  }
}
