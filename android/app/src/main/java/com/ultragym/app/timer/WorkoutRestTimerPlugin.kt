package com.ultragym.app.timer

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "WorkoutRestTimerPlugin")
class WorkoutRestTimerPlugin : Plugin() {

    @PluginMethod
    fun startTimer(call: PluginCall) {
        val timerJson = call.getString("timerJson")
        val settingsJson = call.getString("settingsJson")

        if (timerJson.isNullOrEmpty()) {
            call.reject("Must provide timerJson")
            return
        }

        val serviceIntent = Intent(context, WorkoutRestTimerService::class.java).apply {
            action = WorkoutRestTimerService.ACTION_START_TIMER
            putExtra(WorkoutRestTimerService.EXTRA_TIMER_JSON, timerJson)
            putExtra(WorkoutRestTimerService.EXTRA_SETTINGS_JSON, settingsJson)
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(serviceIntent)
        } else {
            context.startService(serviceIntent)
        }

        val ret = JSObject()
        ret.put("success", true)
        call.resolve(ret)
    }

    @PluginMethod
    fun updateTimer(call: PluginCall) {
        val timerJson = call.getString("timerJson")
        if (timerJson.isNullOrEmpty()) {
            call.reject("Must provide timerJson")
            return
        }

        val serviceIntent = Intent(context, WorkoutRestTimerService::class.java).apply {
            action = WorkoutRestTimerService.ACTION_UPDATE_TIMER
            putExtra(WorkoutRestTimerService.EXTRA_TIMER_JSON, timerJson)
        }
        context.startService(serviceIntent)

        val ret = JSObject()
        ret.put("success", true)
        call.resolve(ret)
    }

    @PluginMethod
    fun stopTimer(call: PluginCall) {
        val serviceIntent = Intent(context, WorkoutRestTimerService::class.java).apply {
            action = WorkoutRestTimerService.ACTION_STOP_TIMER
        }
        context.startService(serviceIntent)

        val ret = JSObject()
        ret.put("success", true)
        call.resolve(ret)
    }

    @PluginMethod
    fun syncSettings(call: PluginCall) {
        val settingsJson = call.getString("settingsJson")
        val prefs = context.getSharedPreferences("ug_timer_prefs", Context.MODE_PRIVATE)
        prefs.edit().putString("settings", settingsJson).apply()

        val ret = JSObject()
        ret.put("success", true)
        call.resolve(ret)
    }

    @PluginMethod
    fun checkOverlayPermission(call: PluginCall) {
        val granted = WorkoutRestOverlayService.canDrawOverlays(context)
        val ret = JSObject()
        ret.put("granted", granted)
        call.resolve(ret)
    }

    @PluginMethod
    fun requestOverlayPermission(call: PluginCall) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            if (!Settings.canDrawOverlays(context)) {
                val intent = Intent(
                    Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:" + context.packageName)
                ).apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                }
                context.startActivity(intent)
            }
        }
        val ret = JSObject()
        ret.put("granted", WorkoutRestOverlayService.canDrawOverlays(context))
        call.resolve(ret)
    }
}
