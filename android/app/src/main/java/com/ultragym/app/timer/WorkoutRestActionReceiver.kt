package com.ultragym.app.timer

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class WorkoutRestActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return

        when (action) {
            WorkoutRestTimerService.ACTION_ADD_15_SECONDS,
            WorkoutRestTimerService.ACTION_END_REST -> {
                val serviceIntent = Intent(context, WorkoutRestTimerService::class.java).apply {
                    this.action = action
                }
                context.startService(serviceIntent)
            }
        }
    }
}
