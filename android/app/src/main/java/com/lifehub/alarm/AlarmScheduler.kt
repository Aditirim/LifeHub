package com.lifehub.alarm

import android.annotation.SuppressLint
import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import com.lifehub.alarm.AlarmData.Companion.nextFireTimestamp

/**
 * AlarmScheduler — wraps Android AlarmManager for exact alarm scheduling.
 *
 * Strategy:
 *  1. Use AlarmManager.setAlarmClock() — this is what the Android Clock app uses.
 *     - Fires even in Doze mode (exempt by Android)
 *     - Shows alarm icon in the status bar
 *     - No user grant required beyond SCHEDULE_EXACT_ALARM
 *  2. If setAlarmClock is unavailable (shouldn't happen), fall back to
 *     setExactAndAllowWhileIdle().
 *
 * PendingIntent flags:
 *  - FLAG_UPDATE_CURRENT: replacing an existing PendingIntent with the same ID
 *  - FLAG_IMMUTABLE: required on API 31+ for security
 *
 * Action string: "com.lifehub.ALARM_FIRE"
 * Extra keys:    "alarm_id" (String)
 */
object AlarmScheduler {

    private const val TAG = "AlarmScheduler"
    const val ACTION_ALARM_FIRE  = "com.lifehub.ALARM_FIRE"
    const val ACTION_TIMER_FIRE  = "com.lifehub.TIMER_FIRE"
    const val EXTRA_ALARM_ID     = "alarm_id"
    const val EXTRA_TIMER_ID     = "timer_id"
    const val EXTRA_TIMER_LABEL  = "timer_label"

    // ── Schedule / cancel alarm ───────────────────────────────────────────────

    /**
     * Schedule an exact alarm for [alarm]. If already scheduled, replaces it.
     * Call this for both new alarms and re-enabling existing alarms.
     *
     * @param fireAtMs  Override the fire time (used for snooze). Null = auto-calculate.
     */
    @SuppressLint("MissingPermission")
    fun schedule(context: Context, alarm: AlarmData, fireAtMs: Long? = null) {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val triggerMs    = fireAtMs ?: alarm.nextFireTimestamp()

        Log.d(TAG, "Scheduling alarm ${alarm.id} '${alarm.label}' at $triggerMs")

        val intent = Intent(context, AlarmReceiver::class.java).apply {
            action = ACTION_ALARM_FIRE
            putExtra(EXTRA_ALARM_ID, alarm.id)
            // Explicit package to prevent interception
            `package` = context.packageName
        }
        val pending = PendingIntent.getBroadcast(
            context,
            alarm.id.hashCode(),               // unique request code per alarm
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        // setAlarmClock fires even in Doze and shows status-bar icon
        val clockInfo = AlarmManager.AlarmClockInfo(triggerMs, pending)
        alarmManager.setAlarmClock(clockInfo, pending)
    }

    /**
     * Cancel a previously scheduled alarm PendingIntent.
     * Safe to call even if no alarm was scheduled for this ID.
     */
    fun cancel(context: Context, alarmId: String) {
        Log.d(TAG, "Cancelling alarm $alarmId")
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val intent = Intent(context, AlarmReceiver::class.java).apply {
            action = ACTION_ALARM_FIRE
            `package` = context.packageName
        }
        val pending = PendingIntent.getBroadcast(
            context,
            alarmId.hashCode(),
            intent,
            PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE,
        )
        pending?.let { alarmManager.cancel(it); it.cancel() }
    }

    // ── Timer scheduling ──────────────────────────────────────────────────────

    /**
     * Schedule a one-shot timer notification after [durationMs] milliseconds.
     * Uses setExactAndAllowWhileIdle because timers are not alarm-clock events.
     */
    @SuppressLint("MissingPermission")
    fun scheduleTimer(context: Context, timerId: String, label: String, durationMs: Long) {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val triggerMs    = System.currentTimeMillis() + durationMs

        val intent = Intent(context, TimerReceiver::class.java).apply {
            action = ACTION_TIMER_FIRE
            putExtra(EXTRA_TIMER_ID, timerId)
            putExtra(EXTRA_TIMER_LABEL, label)
            `package` = context.packageName
        }
        val pending = PendingIntent.getBroadcast(
            context,
            timerId.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerMs, pending)
        } else {
            alarmManager.setExact(AlarmManager.RTC_WAKEUP, triggerMs, pending)
        }
    }

    fun cancelTimer(context: Context, timerId: String) {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val intent = Intent(context, TimerReceiver::class.java).apply {
            action = ACTION_TIMER_FIRE
            `package` = context.packageName
        }
        val pending = PendingIntent.getBroadcast(
            context,
            timerId.hashCode(),
            intent,
            PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE,
        )
        pending?.let { alarmManager.cancel(it); it.cancel() }
    }

    // ── Permission check ──────────────────────────────────────────────────────

    fun canScheduleExactAlarms(context: Context): Boolean {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            alarmManager.canScheduleExactAlarms()
        } else {
            true // Below API 31, no special permission needed
        }
    }
}
