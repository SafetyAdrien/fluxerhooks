package app.fluxerhooks.gateway

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** Pont JS ↔ service : démarrer/arrêter le bot, changer son statut, suivre son état. */
class BotGatewayModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("BotGateway")
    Events("onState")

    OnCreate {
      BotGatewayService.listener = { state -> sendEvent("onState", state) }
    }

    OnDestroy {
      BotGatewayService.listener = null
    }

    Function("getState") { BotGatewayService.lastState }

    AsyncFunction("start") { opts: Map<String, Any?> ->
      val ctx = appContext.reactContext ?: throw CodedException("NO_CONTEXT", "Application indisponible.", null)
      // Android 13+ : la notification « bot en ligne » demande l'autorisation d'afficher des notifications.
      if (Build.VERSION.SDK_INT >= 33 &&
        ctx.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
      ) {
        appContext.currentActivity?.requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 4107)
      }
      val i = Intent(ctx, BotGatewayService::class.java)
        .setAction(BotGatewayService.ACTION_START)
        .putExtra("token", opts["token"] as? String ?: "")
        .putExtra("url", opts["url"] as? String ?: "wss://gateway.fluxer.app")
        .putExtra("status", opts["status"] as? String ?: "online")
        .putExtra("text", opts["text"] as? String ?: "")
        .putExtra("appName", opts["appName"] as? String ?: "FluxerHooks")
      if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i) else ctx.startService(i)
      null
    }

    AsyncFunction("stop") {
      val ctx = appContext.reactContext ?: return@AsyncFunction null
      try {
        ctx.startService(Intent(ctx, BotGatewayService::class.java).setAction(BotGatewayService.ACTION_STOP))
      } catch (_: Throwable) {
        ctx.stopService(Intent(ctx, BotGatewayService::class.java))
      }
      BotGatewayService.emit(mapOf("state" to "offline"))
      null
    }

    AsyncFunction("setPresence") { opts: Map<String, Any?> ->
      val ctx = appContext.reactContext ?: return@AsyncFunction null
      if (BotGatewayService.lastState["state"] == "offline") return@AsyncFunction null
      try {
        ctx.startService(
          Intent(ctx, BotGatewayService::class.java)
            .setAction(BotGatewayService.ACTION_PRESENCE)
            .putExtra("status", opts["status"] as? String ?: "online")
            .putExtra("text", opts["text"] as? String ?: ""),
        )
      } catch (_: Throwable) {}
      null
    }
  }
}
