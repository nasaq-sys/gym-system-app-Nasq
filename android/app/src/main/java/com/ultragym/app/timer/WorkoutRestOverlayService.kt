package com.ultragym.app.timer

import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.Settings
import android.util.DisplayMetrics
import android.view.*
import android.widget.*
import com.ultragym.app.MainActivity
import org.json.JSONObject

class WorkoutRestOverlayService : Service() {

    companion object {
        const val ACTION_SHOW_OVERLAY = "com.ultragym.app.timer.SHOW_OVERLAY"
        const val ACTION_HIDE_OVERLAY = "com.ultragym.app.timer.HIDE_OVERLAY"

        fun canDrawOverlays(context: Context): Boolean {
            return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                Settings.canDrawOverlays(context)
            } else {
                true
            }
        }
    }

    private var windowManager: WindowManager? = null
    private var overlayView: View? = null
    private var params: WindowManager.LayoutParams? = null

    private var endsAt: Long = 0L
    private var exerciseName: String? = null
    private var isExpanded: Boolean = false

    private val handler = Handler(Looper.getMainLooper())
    private var updateRunnable: Runnable? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action ?: return START_NOT_STICKY

        when (action) {
            ACTION_SHOW_OVERLAY -> {
                val timerJsonStr = intent.getStringExtra(WorkoutRestTimerService.EXTRA_TIMER_JSON)
                if (timerJsonStr != null) {
                    try {
                        val json = JSONObject(timerJsonStr)
                        endsAt = json.optLong("endsAt", 0L)
                        exerciseName = if (json.has("exerciseName")) json.getString("exerciseName") else null
                        showOverlay()
                    } catch (e: Exception) {
                        e.printStackTrace()
                    }
                }
            }
            ACTION_HIDE_OVERLAY -> {
                hideOverlay()
            }
        }

        return START_NOT_STICKY
    }

    private fun showOverlay() {
        if (!canDrawOverlays(this)) return
        if (overlayView != null) {
            updateViewContent()
            return
        }

        windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager

        val layoutType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_PHONE
        }

        params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            layoutType,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                    WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
                    WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = 40
            y = 200
        }

        overlayView = createOverlayView()
        setupTouchListener(overlayView!!)

        try {
            windowManager?.addView(overlayView, params)
            startPeriodicCountdown()
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun createOverlayView(): View {
        val context = this
        val container = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(24, 16, 24, 16)
            elevation = 16f
            clipToOutline = true
        }

        // Ultra Gym Premium Pill Background with #FF5A0A Orange Border
        val bgDrawable = GradientDrawable().apply {
            shape = GradientDrawable.RECTANGLE
            cornerRadius = 48f
            setColor(Color.parseColor("#E6181818")) // 90% obsidian dark
            setStroke(3, Color.parseColor("#FF5A0A"))
        }
        container.background = bgDrawable

        // Inner row (Timer Icon + Countdown Digits)
        val row = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }

        val iconView = ImageView(context).apply {
            setImageResource(android.R.drawable.ic_popup_sync)
            setColorFilter(Color.parseColor("#FF5A0A"))
            layoutParams = LinearLayout.LayoutParams(40, 40).apply {
                marginEnd = 12
            }
        }

        val timeTextView = TextView(context).apply {
            id = View.generateViewId()
            tag = "time_text"
            text = formatRemainingTime(endsAt)
            textSize = 15f
            setTextColor(Color.WHITE)
            typeface = android.graphics.Typeface.DEFAULT_BOLD
        }

        row.addView(iconView)
        row.addView(timeTextView)
        container.addView(row)

        container.setOnClickListener {
            // Click opens the main workout screen
            val openIntent = Intent(context, MainActivity::class.java).apply {
                action = Intent.ACTION_VIEW
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
            context.startActivity(openIntent)
        }

        return container
    }

    private fun setupTouchListener(view: View) {
        var initialX = 0
        var initialY = 0
        var initialTouchX = 0f
        var initialTouchY = 0f
        var isMoving = false

        view.setOnTouchListener { _, event ->
            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    initialX = params?.x ?: 0
                    initialY = params?.y ?: 0
                    initialTouchX = event.rawX
                    initialTouchY = event.rawY
                    isMoving = false
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    val deltaX = (event.rawX - initialTouchX).toInt()
                    val deltaY = (event.rawY - initialTouchY).toInt()

                    if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
                        isMoving = true
                    }

                    params?.x = initialX + deltaX
                    params?.y = initialY + deltaY
                    windowManager?.updateViewLayout(view, params)
                    true
                }
                MotionEvent.ACTION_UP -> {
                    if (!isMoving) {
                        view.performClick()
                    } else {
                        snapToNearestEdge()
                    }
                    true
                }
                else -> false
            }
        }
    }

    private fun snapToNearestEdge() {
        val displayMetrics = DisplayMetrics()
        windowManager?.defaultDisplay?.getMetrics(displayMetrics)
        val screenWidth = displayMetrics.widthPixels
        val viewWidth = overlayView?.width ?: 200

        val currentX = params?.x ?: 0
        val targetX = if (currentX + viewWidth / 2 < screenWidth / 2) 30 else (screenWidth - viewWidth - 30)

        params?.x = targetX
        windowManager?.updateViewLayout(overlayView, params)
    }

    private fun startPeriodicCountdown() {
        updateRunnable?.let { handler.removeCallbacks(it) }

        updateRunnable = object : Runnable {
            override fun run() {
                val remaining = endsAt - System.currentTimeMillis()
                if (remaining <= 0) {
                    hideOverlay()
                    return
                }

                updateViewContent()
                handler.postDelayed(this, 1000)
            }
        }
        handler.post(updateRunnable!!)
    }

    private fun updateViewContent() {
        val timeView = overlayView?.findViewWithTag<TextView>("time_text")
        timeView?.text = formatRemainingTime(endsAt)
    }

    private fun formatRemainingTime(targetTime: Long): String {
        val diff = Math.max(0L, targetTime - System.currentTimeMillis())
        val totalSecs = Math.ceil(diff / 1000.0).toInt()
        val mins = totalSecs / 60
        val secs = totalSecs % 60
        return String.format("%02d:%02d", mins, secs)
    }

    private fun hideOverlay() {
        updateRunnable?.let { handler.removeCallbacks(it) }
        updateRunnable = null

        if (overlayView != null) {
            try {
                windowManager?.removeView(overlayView)
            } catch (e: Exception) {
                e.printStackTrace()
            }
            overlayView = null
        }
        stopSelf()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        hideOverlay()
        super.onDestroy()
    }
}
