package com.ultragym.app.timer

import android.app.*
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.*
import androidx.core.app.NotificationCompat
import com.ultragym.app.MainActivity
import com.ultragym.app.R
import org.json.JSONObject

class WorkoutRestTimerService : Service() {

    companion object {
        const val CHANNEL_ID = "workout_rest_timer_channel"
        const val COMPLETION_CHANNEL_ID = "workout_rest_completion_channel"
        const val NOTIFICATION_ID = 9001
        const val COMPLETION_NOTIFICATION_ID = 9002

        const val ACTION_START_TIMER = "com.ultragym.app.timer.START"
        const val ACTION_UPDATE_TIMER = "com.ultragym.app.timer.UPDATE"
        const val ACTION_STOP_TIMER = "com.ultragym.app.timer.STOP"
        const val ACTION_ADD_15_SECONDS = "com.ultragym.app.timer.ADD_15"
        const val ACTION_END_REST = "com.ultragym.app.timer.END_REST"

        const val EXTRA_TIMER_JSON = "extra_timer_json"
        const val EXTRA_SETTINGS_JSON = "extra_settings_json"

        var currentTimerId: String? = null
        var currentEndsAt: Long = 0L
    }

    private val handler = Handler(Looper.getMainLooper())
    private var finishRunnable: Runnable? = null
    private var wakeLock: PowerManager.WakeLock? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannels()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action ?: return START_NOT_STICKY

        when (action) {
            ACTION_START_TIMER -> {
                val timerJsonStr = intent.getStringExtra(EXTRA_TIMER_JSON)
                val settingsJsonStr = intent.getStringExtra(EXTRA_SETTINGS_JSON)
                if (timerJsonStr != null) {
                    handleStartTimer(timerJsonStr, settingsJsonStr)
                }
            }
            ACTION_UPDATE_TIMER -> {
                val timerJsonStr = intent.getStringExtra(EXTRA_TIMER_JSON)
                if (timerJsonStr != null) {
                    handleUpdateTimer(timerJsonStr)
                }
            }
            ACTION_STOP_TIMER -> {
                handleStopTimer()
            }
            ACTION_ADD_15_SECONDS -> {
                handleAdd15Seconds()
            }
            ACTION_END_REST -> {
                handleEndRest()
            }
        }

        return START_NOT_STICKY
    }

    private fun handleStartTimer(timerJsonStr: String, settingsJsonStr: String?) {
        try {
            val timerJson = JSONObject(timerJsonStr)
            val id = timerJson.optString("id", "")
            val endsAt = timerJson.optLong("endsAt", 0L)
            val exerciseName = if (timerJson.has("exerciseName")) timerJson.getString("exerciseName") else null
            val durationSeconds = timerJson.optInt("durationSeconds", 60)

            var hideExerciseName = false
            var soundEnabled = true
            var vibrationEnabled = true
            var overlayEnabled = false

            if (settingsJsonStr != null) {
                val settings = JSONObject(settingsJsonStr)
                hideExerciseName = settings.optBoolean("hideExerciseName", false)
                soundEnabled = settings.optBoolean("soundEnabled", true)
                vibrationEnabled = settings.optBoolean("vibrationEnabled", true)
                overlayEnabled = settings.optBoolean("floatingOverlayEnabled", false)
            }

            currentTimerId = id
            currentEndsAt = endsAt

            // Start floating overlay if enabled and permitted
            if (overlayEnabled && WorkoutRestOverlayService.canDrawOverlays(this)) {
                val overlayIntent = Intent(this, WorkoutRestOverlayService::class.java).apply {
                    this.action = WorkoutRestOverlayService.ACTION_SHOW_OVERLAY
                    putExtra(EXTRA_TIMER_JSON, timerJsonStr)
                }
                startService(overlayIntent)
            }

            // Build ongoing notification with native Chronometer
            val notification = buildOngoingNotification(exerciseName, endsAt, hideExerciseName)
            startForeground(NOTIFICATION_ID, notification)

            // Schedule completion alarm / handler
            scheduleTimerCompletion(endsAt, exerciseName, soundEnabled, vibrationEnabled)

        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun handleUpdateTimer(timerJsonStr: String) {
        try {
            val timerJson = JSONObject(timerJsonStr)
            val endsAt = timerJson.optLong("endsAt", 0L)
            val exerciseName = if (timerJson.has("exerciseName")) timerJson.getString("exerciseName") else null

            currentEndsAt = endsAt

            val notification = buildOngoingNotification(exerciseName, endsAt, false)
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.notify(NOTIFICATION_ID, notification)

            scheduleTimerCompletion(endsAt, exerciseName, true, true)

        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun handleAdd15Seconds() {
        val newEndsAt = currentEndsAt + 15000L
        currentEndsAt = newEndsAt

        // Broadcast to web layer if active
        val broadcastIntent = Intent("com.ultragym.app.TIMER_ACTION").apply {
            putExtra("action", "add15")
            putExtra("timerId", currentTimerId)
            putExtra("newEndsAt", newEndsAt)
        }
        sendBroadcast(broadcastIntent)

        val notification = buildOngoingNotification(null, newEndsAt, false)
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.notify(NOTIFICATION_ID, notification)

        scheduleTimerCompletion(newEndsAt, null, true, true)
    }

    private fun handleEndRest() {
        handleStopTimer()

        val broadcastIntent = Intent("com.ultragym.app.TIMER_ACTION").apply {
            putExtra("action", "end")
            putExtra("timerId", currentTimerId)
        }
        sendBroadcast(broadcastIntent)
    }

    private fun handleStopTimer() {
        finishRunnable?.let { handler.removeCallbacks(it) }
        finishRunnable = null
        currentTimerId = null
        currentEndsAt = 0L

        // Dismiss floating overlay
        val overlayIntent = Intent(this, WorkoutRestOverlayService::class.java).apply {
            this.action = WorkoutRestOverlayService.ACTION_HIDE_OVERLAY
        }
        startService(overlayIntent)

        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    private fun scheduleTimerCompletion(
        endsAt: Long,
        exerciseName: String?,
        soundEnabled: Boolean,
        vibrationEnabled: Boolean
    ) {
        finishRunnable?.let { handler.removeCallbacks(it) }

        val delay = Math.max(0L, endsAt - System.currentTimeMillis())
        finishRunnable = Runnable {
            onTimerFinished(exerciseName, soundEnabled, vibrationEnabled)
        }
        handler.postDelayed(finishRunnable!!, delay)
    }

    private fun onTimerFinished(exerciseName: String?, soundEnabled: Boolean, vibrationEnabled: Boolean) {
        handleStopTimer()

        // Send completion notification
        showCompletionNotification(exerciseName, soundEnabled, vibrationEnabled)
    }

    private fun buildOngoingNotification(
        exerciseName: String?,
        endsAt: Long,
        hideExerciseName: Boolean
    ): Notification {
        val openIntent = Intent(this, MainActivity::class.java).apply {
            action = Intent.ACTION_VIEW
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val openPendingIntent = PendingIntent.getActivity(
            this,
            101,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val add15Intent = Intent(this, WorkoutRestTimerService::class.java).apply {
            action = ACTION_ADD_15_SECONDS
        }
        val add15PendingIntent = PendingIntent.getService(
            this,
            102,
            add15Intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val endRestIntent = Intent(this, WorkoutRestTimerService::class.java).apply {
            action = ACTION_END_REST
        }
        val endRestPendingIntent = PendingIntent.getService(
            this,
            103,
            endRestIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val contentTitle = "راحة التمرين ⏱️"
        val contentText = if (!hideExerciseName && !exerciseName.isNullOrEmpty()) {
            "التمرين: $exerciseName"
        } else {
            "فترة الاستشفاء بين المجموعات"
        }

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_popup_sync)
            .setContentTitle(contentTitle)
            .setContentText(contentText)
            .setUsesChronometer(true)
            .setChronometerCountDown(true)
            .setWhen(endsAt)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setColor(0xFFFF5A0A.toInt())
            .setContentIntent(openPendingIntent)
            .addAction(android.R.drawable.ic_input_add, "+15 ثانية", add15PendingIntent)
            .addAction(android.R.drawable.checkbox_on_background, "إنهاء الراحة", endRestPendingIntent)
            .setCategory(NotificationCompat.CATEGORY_STOPWATCH)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    private fun showCompletionNotification(
        exerciseName: String?,
        soundEnabled: Boolean,
        vibrationEnabled: Boolean
    ) {
        val openIntent = Intent(this, MainActivity::class.java).apply {
            action = Intent.ACTION_VIEW
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val openPendingIntent = PendingIntent.getActivity(
            this,
            104,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val title = "انتهت فترة الراحة! ⏱️"
        val body = if (!exerciseName.isNullOrEmpty()) {
            "حان وقت الجولة التالية في تمرين: $exerciseName"
        } else {
            "حان وقت الجولة التالية في تمرينك!"
        }

        val builder = NotificationCompat.Builder(this, COMPLETION_CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setColor(0xFFFF5A0A.toInt())
            .setContentIntent(openPendingIntent)
            .setPriority(NotificationCompat.PRIORITY_HIGH)

        if (vibrationEnabled) {
            builder.setVibrate(longArrayOf(0, 200, 100, 200, 100, 300))
        }

        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.notify(COMPLETION_NOTIFICATION_ID, builder.build())
    }

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

            // Ongoing timer channel (Low sound to prevent periodic chime while countdown runs)
            val timerChannel = NotificationChannel(
                CHANNEL_ID,
                "مؤقت راحة التمرين (Workout Rest Timer)",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "يعرض العد التنازلي المباشر لفترة الراحة بين المجموعات"
                enableLights(true)
                lightColor = Color.parseColor("#FF5A0A")
                setShowBadge(false)
            }

            // Completion alert channel (High importance with sound & vibration)
            val completionChannel = NotificationChannel(
                COMPLETION_CHANNEL_ID,
                "تنبيه انتهاء الراحة (Rest Timer Alerts)",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "ينبهك بالصوت والاهتزاز عند انتهاء وقت الراحة لبدء الجولة التالية"
                enableLights(true)
                lightColor = Color.parseColor("#FF5A0A")
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 200, 100, 200, 100, 300)
            }

            notificationManager.createNotificationChannel(timerChannel)
            notificationManager.createNotificationChannel(completionChannel)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        finishRunnable?.let { handler.removeCallbacks(it) }
        wakeLock?.let { if (it.isHeld) it.release() }
        super.onDestroy()
    }
}
