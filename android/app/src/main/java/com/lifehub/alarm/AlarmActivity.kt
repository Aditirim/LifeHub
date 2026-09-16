package com.lifehub.alarm

import android.app.Activity
import android.app.KeyguardManager
import android.content.Intent
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * AlarmActivity — full-screen native Android alarm UI.
 *
 * Shown over the lock screen when an alarm fires, even when the app is closed.
 *
 * Key behaviors:
 *  - Appears over the lock screen (FLAG_SHOW_WHEN_LOCKED + setShowWhenLocked)
 *  - Wakes the screen (FLAG_TURN_SCREEN_ON + setTurnScreenOn)
 *  - Keeps screen on while alarm is ringing (FLAG_KEEP_SCREEN_ON)
 *  - Live clock display updated every second
 *  - Snooze button: stops audio + schedules snooze alarm → finishes activity
 *  - Dismiss button: stops audio → finishes activity
 *
 * Communication with AlarmService:
 *  - We send explicit Intents to AlarmService to stop/snooze
 *  - AlarmService.currentAlarmId allows us to verify the right alarm is playing
 *
 * Layout is built programmatically (no XML layout file needed — simpler and
 * avoids resource conflicts with the main RN app layout).
 */
class AlarmActivity : Activity() {

    companion object {
        private const val TAG = "AlarmActivity"
    }

    private var alarmId: String? = null
    private var alarm: AlarmData? = null
    private val handler = Handler(Looper.getMainLooper())
    private val clockRunnable = object : Runnable {
        override fun run() {
            updateClock()
            handler.postDelayed(this, 1000)
        }
    }

    // ── Activity lifecycle ─────────────────────────────────────────────────────

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        alarmId = intent.getStringExtra(AlarmScheduler.EXTRA_ALARM_ID)
        alarm   = alarmId?.let { AlarmStorage.getById(this, it) }

        // Configure window to show over lock screen and wake the device
        setupWindowFlags()

        // Build and show the UI
        setContentView(buildLayout())

        // Start the live clock
        handler.post(clockRunnable)
    }

    override fun onDestroy() {
        handler.removeCallbacks(clockRunnable)
        super.onDestroy()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        // If a new alarm fires while this activity is on screen,
        // update to show the new alarm's info
        val newId = intent.getStringExtra(AlarmScheduler.EXTRA_ALARM_ID)
        if (newId != null && newId != alarmId) {
            alarmId = newId
            alarm   = AlarmStorage.getById(this, newId)
        }
    }

    // ── Window flags ──────────────────────────────────────────────────────────

    private fun setupWindowFlags() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
            val km = getSystemService(KEYGUARD_SERVICE) as KeyguardManager
            km.requestDismissKeyguard(this, null)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
                WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD,
            )
        }
        window.addFlags(
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or
            WindowManager.LayoutParams.FLAG_ALLOW_LOCK_WHILE_SCREEN_ON,
        )
    }

    // ── UI (programmatic layout) ──────────────────────────────────────────────

    private lateinit var clockText:  TextView
    private lateinit var dateText:   TextView
    private lateinit var labelText:  TextView
    private lateinit var ringtoneText: TextView

    private fun buildLayout(): View {
        val root = LinearLayout(this).apply {
            orientation  = LinearLayout.VERTICAL
            setBackgroundColor(Color.parseColor("#0D0D1A"))
            gravity      = android.view.Gravity.CENTER
        }

        // Clock
        clockText = TextView(this).apply {
            textSize  = 72f
            setTextColor(Color.WHITE)
            gravity   = android.view.Gravity.CENTER
            typeface  = android.graphics.Typeface.create("sans-serif-light", android.graphics.Typeface.NORMAL)
            includeFontPadding = false
        }
        root.addView(clockText, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT,
        ).apply { bottomMargin = dpToPx(8) })

        // Date
        dateText = TextView(this).apply {
            textSize  = 18f
            setTextColor(Color.parseColor("#9CA3AF"))
            gravity   = android.view.Gravity.CENTER
        }
        root.addView(dateText, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT,
        ).apply { bottomMargin = dpToPx(40) })

        // Label
        labelText = TextView(this).apply {
            text      = alarm?.label ?: "Alarm"
            textSize  = 28f
            setTextColor(Color.WHITE)
            gravity   = android.view.Gravity.CENTER
            typeface  = android.graphics.Typeface.create("sans-serif-medium", android.graphics.Typeface.NORMAL)
        }
        root.addView(labelText, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT,
        ).apply { bottomMargin = dpToPx(12) })

        // Ringtone name
        ringtoneText = TextView(this).apply {
            text      = "🔔 ${resolveRingtoneName()}"
            textSize  = 14f
            setTextColor(Color.parseColor("#A78BFA"))
            gravity   = android.view.Gravity.CENTER
        }
        root.addView(ringtoneText, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT,
        ).apply { bottomMargin = dpToPx(64) })

        // Button row
        val btnRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity     = android.view.Gravity.CENTER
        }

        // Snooze button
        val snoozeBtn = Button(this).apply {
            text            = "Snooze"
            textSize        = 16f
            setTextColor(Color.WHITE)
            setBackgroundColor(Color.parseColor("#374151"))
            setPadding(dpToPx(32), dpToPx(16), dpToPx(32), dpToPx(16))
            setOnClickListener { onSnooze() }
        }
        btnRow.addView(snoozeBtn, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT,
        ).apply { marginEnd = dpToPx(24) })

        // Dismiss button
        val dismissBtn = Button(this).apply {
            text            = "Dismiss"
            textSize        = 16f
            setTextColor(Color.WHITE)
            setBackgroundColor(Color.parseColor("#7C3AED"))
            setPadding(dpToPx(32), dpToPx(16), dpToPx(32), dpToPx(16))
            setOnClickListener { onDismiss() }
        }
        btnRow.addView(dismissBtn, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT,
        ))

        root.addView(btnRow)
        return root
    }

    // ── Clock updates ─────────────────────────────────────────────────────────

    private fun updateClock() {
        val now = Date()
        clockText.text = SimpleDateFormat("HH:mm", Locale.getDefault()).format(now)
        dateText.text  = SimpleDateFormat("EEEE, MMMM d", Locale.getDefault()).format(now)
    }

    // ── Actions ───────────────────────────────────────────────────────────────

    private fun onSnooze() {
        val id = alarmId ?: return
        val a  = alarm    ?: return

        // Schedule the snooze alarm (native, so it works with app closed)
        val snoozeMs = a.snoozeMinutes * 60 * 1000L
        val snoozeData = a.copy(
            id         = "${id}_snooze",
            enabled    = true,
            repeatDays = emptyList(), // one-time snooze
            updatedAt  = System.currentTimeMillis(),
        )
        AlarmStorage.save(this, snoozeData)
        AlarmScheduler.schedule(this, snoozeData, System.currentTimeMillis() + snoozeMs)

        // Stop the current ringtone
        stopService(Intent(this, AlarmService::class.java))

        finish()
    }

    private fun onDismiss() {
        // Tell the service to stop
        stopService(Intent(this, AlarmService::class.java))
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
