package com.duodevs.lifehub.alarm

import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Color
import android.graphics.Typeface
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * AlarmActivity — full-screen native Android alarm and timer completion UI.
 *
 * Shown over the lock screen when an alarm or timer completes, even when
 * LifeHub is closed, backgrounded, or swiped away from Recents.
 *
 * Key behaviors:
 *  - Appears over the lock screen (showWhenLocked + FLAG_SHOW_WHEN_LOCKED)
 *  - Wakes the screen (turnScreenOn + FLAG_TURN_SCREEN_ON)
 *  - Keeps screen awake while ringing (FLAG_KEEP_SCREEN_ON)
 *  - Displays live time for alarms, or "00:00" for timers
 *  - Stop / Snooze controls are prominent, high-contrast and immediately functional
 *  - Automatically finishes if dismissed via notification action
 */
class AlarmActivity : Activity() {

    companion object {
        private const val TAG = "AlarmActivity"
    }

    private var isTimer: Boolean = false
    private var timerId: String? = null
    private var timerLabel: String? = null

    private var alarmId: String? = null
    private var alarm: AlarmData? = null

    private val handler = Handler(Looper.getMainLooper())
    private val clockRunnable = object : Runnable {
        override fun run() {
            updateClock()
            handler.postDelayed(this, 1000)
        }
    }

    private var isReceiverRegistered = false
    private val dismissReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            Log.d(TAG, "Dismiss broadcast received (${intent.action}) — finishing AlarmActivity")
            finish()
        }
    }

    private lateinit var clockText: TextView
    private lateinit var dateText: TextView
    private lateinit var labelText: TextView
    private lateinit var ringtoneText: TextView

    // ── Activity lifecycle ─────────────────────────────────────────────────────

    override fun onCreate(savedInstanceState: Bundle?) {
        setupWindowFlags()
        super.onCreate(savedInstanceState)
        this.volumeControlStream = android.media.AudioManager.STREAM_ALARM
        extractIntentData(intent)

        // Build and show the UI
        setContentView(buildLayout())

        // Start clock ticker
        handler.post(clockRunnable)

        // Listen for dismissal broadcasts from AlarmService or TimerReceiver
        registerDismissReceiver()
    }

    override fun onDestroy() {
        handler.removeCallbacks(clockRunnable)
        unregisterDismissReceiver()
        super.onDestroy()
    }

    override fun onNewIntent(intent: Intent) {
        setupWindowFlags()
        super.onNewIntent(intent)
        setIntent(intent)
        extractIntentData(intent)
        setContentView(buildLayout())
    }

    private fun extractIntentData(intent: Intent?) {
        if (intent == null) return
        isTimer    = intent.getBooleanExtra(TimerReceiver.EXTRA_IS_TIMER, false)
        timerId    = intent.getStringExtra(AlarmScheduler.EXTRA_TIMER_ID)
        timerLabel = intent.getStringExtra(AlarmScheduler.EXTRA_TIMER_LABEL) ?: "Timer"

        alarmId    = intent.getStringExtra(AlarmScheduler.EXTRA_ALARM_ID)
        alarm      = alarmId?.let { AlarmStorage.getById(this, it) }
    }

    // ── Window flags ──────────────────────────────────────────────────────────

    private fun setupWindowFlags() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
            val km = getSystemService(Context.KEYGUARD_SERVICE) as? android.app.KeyguardManager
            km?.requestDismissKeyguard(this, null)
        }
        @Suppress("DEPRECATION")
        window.addFlags(
            WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
            WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or
            WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD or
            WindowManager.LayoutParams.FLAG_ALLOW_LOCK_WHILE_SCREEN_ON
        )
    }

    private fun registerDismissReceiver() {
        if (isReceiverRegistered) return
        val filter = IntentFilter().apply {
            addAction(AlarmService.ACTION_ALARM_DISMISSED)
            addAction(TimerReceiver.ACTION_TIMER_DISMISSED)
        }
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                registerReceiver(dismissReceiver, filter, RECEIVER_NOT_EXPORTED)
            } else {
                registerReceiver(dismissReceiver, filter)
            }
            isReceiverRegistered = true
        } catch (e: Exception) {
            Log.e(TAG, "Error registering dismissReceiver: ${e.message}")
        }
    }

    private fun unregisterDismissReceiver() {
        if (!isReceiverRegistered) return
        try {
            unregisterReceiver(dismissReceiver)
            isReceiverRegistered = false
        } catch (_: Exception) {}
    }

    // ── UI (programmatic layout) ──────────────────────────────────────────────

    private fun buildLayout(): View {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.parseColor("#0D0D1A"))
            gravity = Gravity.CENTER
            setPadding(dpToPx(24), dpToPx(48), dpToPx(24), dpToPx(48))
        }

        // Clock display
        clockText = TextView(this).apply {
            textSize = 72f
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
            typeface = Typeface.create("sans-serif-light", Typeface.NORMAL)
            includeFontPadding = false
        }
        root.addView(clockText, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT,
        ).apply { bottomMargin = dpToPx(8) })

        // Date / status line
        dateText = TextView(this).apply {
            textSize = 18f
            setTextColor(Color.parseColor("#9CA3AF"))
            gravity = Gravity.CENTER
        }
        root.addView(dateText, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT,
        ).apply { bottomMargin = dpToPx(36) })

        // Label
        labelText = TextView(this).apply {
            text = if (isTimer) (timerLabel ?: "Timer") else (alarm?.label ?: "Alarm")
            textSize = 28f
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
            typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
        }
        root.addView(labelText, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT,
        ).apply { bottomMargin = dpToPx(12) })

        // Ringtone / Subtitle
        ringtoneText = TextView(this).apply {
            text = if (isTimer) "⏱️ Time's up!" else "🔔 ${resolveRingtoneName()}"
            textSize = 15f
            setTextColor(Color.parseColor("#A78BFA"))
            gravity = Gravity.CENTER
        }
        root.addView(ringtoneText, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT,
        ).apply { bottomMargin = dpToPx(56) })

        // Control buttons
        if (isTimer) {
            // Single prominent Stop button for timer
            val stopBtn = Button(this).apply {
                text = "Stop Timer"
                textSize = 18f
                setTextColor(Color.WHITE)
                setBackgroundColor(Color.parseColor("#7C3AED"))
                setPadding(dpToPx(40), dpToPx(18), dpToPx(40), dpToPx(18))
                setOnClickListener { onTimerStop() }
            }
            root.addView(stopBtn, LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            ))
        } else {
            // Snooze & Stop buttons for alarm
            val btnRow = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER
            }

            val snoozeBtn = Button(this).apply {
                text = "Snooze"
                textSize = 16f
                setTextColor(Color.WHITE)
                setBackgroundColor(Color.parseColor("#374151"))
                setPadding(dpToPx(32), dpToPx(16), dpToPx(32), dpToPx(16))
                setOnClickListener { onSnooze() }
            }
            btnRow.addView(snoozeBtn, LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            ).apply { marginEnd = dpToPx(24) })

            val stopBtn = Button(this).apply {
                text = "Stop"
                textSize = 16f
                setTextColor(Color.WHITE)
                setBackgroundColor(Color.parseColor("#7C3AED"))
                setPadding(dpToPx(36), dpToPx(16), dpToPx(36), dpToPx(16))
                setOnClickListener { onDismiss() }
            }
            btnRow.addView(stopBtn, LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            ))

            root.addView(btnRow)
        }

        updateClock()
        return root
    }

    // ── Clock updates ─────────────────────────────────────────────────────────

    private fun updateClock() {
        val now = Date()
        if (isTimer) {
            clockText.text = SimpleDateFormat("HH:mm", Locale.getDefault()).format(now)
            dateText.text  = "Timer Finished"
        } else {
            clockText.text = SimpleDateFormat("HH:mm", Locale.getDefault()).format(now)
            dateText.text  = SimpleDateFormat("EEEE, MMMM d", Locale.getDefault()).format(now)
        }
    }

    // ── Actions ───────────────────────────────────────────────────────────────

    private fun onTimerStop() {
        TimerReceiver.stopTimer(this)
        finish()
    }

    private fun onSnooze() {
        val id = alarmId
        val a  = alarm

        if (id != null && a != null) {
            val snoozeMs = a.snoozeMinutes * 60 * 1000L
            val snoozeData = a.copy(
                id         = "${id}_snooze_${System.currentTimeMillis()}",
                enabled    = true,
                repeatDays = emptyList(), // one-time snooze
                updatedAt  = System.currentTimeMillis(),
            )
            AlarmStorage.save(this, snoozeData)
            AlarmScheduler.schedule(this, snoozeData, System.currentTimeMillis() + snoozeMs)
        }

        startService(Intent(this, AlarmService::class.java).apply {
            action = AlarmService.ACTION_STOP_ALARM
            putExtra(AlarmScheduler.EXTRA_ALARM_ID, id ?: "")
        })

        finish()
    }

    private fun onDismiss() {
        startService(Intent(this, AlarmService::class.java).apply {
            action = AlarmService.ACTION_STOP_ALARM
            putExtra(AlarmScheduler.EXTRA_ALARM_ID, alarmId ?: "")
        })
        finish()
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private fun resolveRingtoneName(): String {
        val a = alarm ?: return "Default"
        return when (a.ringtoneType) {
            "builtin" -> a.ringtoneUri.replaceFirstChar { it.uppercase() }.replace('_', ' ')
            "device"  -> "Custom"
            else      -> "Default"
        }
    }

    private fun dpToPx(dp: Int): Int =
        (dp * resources.displayMetrics.density).toInt()
}
