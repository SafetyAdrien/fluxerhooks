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
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * Service au premier plan qui garde un bot Fluxer « en ligne » :
 * connexion au gateway (WebSocket JSON v1), Identify, heartbeats, reprise de session (Resume)
 * et reconnexion automatique. Les événements lourds (messages, présences…) sont ignorés côté
 * serveur via `ignored_events` pour économiser batterie et données.
 */
class BotGatewayService : Service() {
  companion object {
    const val ACTION_START = "app.fluxerhooks.gateway.START"
    const val ACTION_STOP = "app.fluxerhooks.gateway.STOP"
    const val ACTION_PRESENCE = "app.fluxerhooks.gateway.PRESENCE"
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
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val action = intent?.action ?: ACTION_START
    when (action) {
      ACTION_STOP -> {
        handler.post { shutdown("Arrêté") }
        return START_NOT_STICKY
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
      .put("ignored_events", JSONArray(IGNORED))
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
