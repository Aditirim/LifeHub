package com.lifehub.alarm

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import com.lifehub.alarm.AlarmData.Companion.nextFireTimestamp

/**
 * AlarmReceiver — receives the AlarmManager broadcast when an alarm fires.
 *
 * Flow:
 *  1. Android wakes the device and fires this receiver
 *  2. We load the AlarmData from storage
 *  3. Start AlarmService (plays ringtone + vibration in foreground)
 *  4. Launch AlarmActivity (full-screen UI over lock screen)
 *  5. For repeating alarms: schedule the next occurrence
 *  6. For one-time alarms: mark disabled in storage
 *
 * IMPORTANT: BroadcastReceivers run on the main thread with a limited window (~10s).
 * We start a Service for the heavy work (audio) and finish quickly here.
 */
class AlarmReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "AlarmReceiver"
        const val CHANNEL_ID = "lifehub_alarm_firing"
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != AlarmScheduler.ACTION_ALARM_FIRE) return

        val alarmId = intent.getStringExtra(AlarmScheduler.EXTRA_ALARM_ID) ?: run {
            Log.e(TAG, "Received alarm broadcast with no alarm ID")
            return
        }
        Log.d(TAG, "Alarm fired: $alarmId")

        val alarm = AlarmStorage.getById(context, alarmId) ?: run {
            Log.w(TAG, "Alarm $alarmId not found in storage (deleted?)")
            return
        }

        if (!alarm.enabled) {
            Log.d(TAG, "Alarm $alarmId is disabled — ignoring")
            return
        }

        // Ensure notification channel exists (idempotent)
        createAlarmChannel(context)

        // 1. Start the foreground service that plays the ringtone
        val serviceIntent = Intent(context, AlarmService::class.java).apply {
            putExtra(AlarmScheduler.EXTRA_ALARM_ID, alarmId)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(serviceIntent)
        } else {
            context.startService(serviceIntent)
        }

        // 2. Launch the full-screen alarm activity
        val activityIntent = Intent(context, AlarmActivity::class.java).apply {
            putExtra(AlarmScheduler.EXTRA_ALARM_ID, alarmId)
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                    Intent.FLAG_ACTIVITY_NO_USER_ACTION or
                    Intent.FLAG_ACTIVITY_NO_HISTORY
        }
        context.startActivity(activityIntent)

        // 3. Handle repeating vs one-time
        if (alarm.repeatDays.isNotEmpty()) {
            // Schedule the next occurrence of this repeating alarm
            val nextFire = alarm.nextFireTimestamp(System.currentTimeMillis() + 60_000L) // +1 min to skip current fire
            AlarmScheduler.schedule(context, alarm, nextFire)
            Log.d(TAG, "Rescheduled repeating alarm ${alarm.id} for $nextFire")
        } else {
            // One-time alarm: disable it so it doesn't fire again
            AlarmStorage.setEnabled(context, alarmId, false)
            Log.d(TAG, "One-time alarm ${alarm.id} disabled after firing")
        }
    }

    private fun createAlarmChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (nm.getNotificationChannel(CHANNEL_ID) != null) return
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Alarm",
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = "LifeHub alarm notifications"
            setBypassDnd(true)
            enableVibration(true)
            lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
        }
        nm.createNotificationChannel(channel)
    }
}
