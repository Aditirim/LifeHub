package com.duodevs.lifehub.alarm

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat
import com.duodevs.lifehub.R
import com.duodevs.lifehub.alarm.AlarmData.Companion.nextFireTimestamp

/**
 * AlarmReceiver — receives AlarmManager broadcasts when an alarm fires,
 * and handles notification actions (Stop and Snooze).
 *
 * Flow:
 *  1. AlarmManager wakes device and triggers onReceive(ACTION_ALARM_FIRE)
 *  2. Wakes screen using PowerManager ACQUIRE_CAUSES_WAKEUP
 *  3. Loads AlarmData from storage
 *  4. Starts AlarmService (audio loop + vibration in foreground)
 *  5. Attempts direct launch of AlarmActivity
 *  6. Fallback: if Android restricts foreground service start,
 *     posts an immediate high-importance notification with full-screen intent directly.
 *  7. Reschedules repeating alarms or disables one-time alarms.
 *  8. Handles ACTION_STOP_ALARM and ACTION_SNOOZE_ALARM broadcasts from notification actions.
 */
class AlarmReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "AlarmReceiver"
    }

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action
        Log.d(TAG, "onReceive action=$action")

        when (action) {
            AlarmService.ACTION_STOP_ALARM -> {
                handleStop(context, intent)
                return
            }
            AlarmService.ACTION_SNOOZE_ALARM -> {
                handleSnooze(context, intent)
                return
            }
            AlarmScheduler.ACTION_ALARM_FIRE -> {
                handleAlarmFire(context, intent)
                return
            }
        }
    }

    private fun handleAlarmFire(context: Context, intent: Intent) {
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

        // 1. Physically turn on the screen
        wakeScreen(context)

        // 2. Ensure notification channels exist
        AlarmService.createChannels(context)

        // 3. Start the foreground service that plays the ringtone & posts notification
        val serviceIntent = Intent(context, AlarmService::class.java).apply {
            putExtra(AlarmScheduler.EXTRA_ALARM_ID, alarmId)
        }
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent)
            } else {
                context.startService(serviceIntent)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Could not start AlarmService directly (${e.message}). Showing fallback notification.", e)
            showFallbackAlarmNotification(context, alarm)
        }

        // 4. Attempt direct activity launch
        tryDirectActivityLaunch(context, alarmId)

        // 5. Handle repeating vs one-time
        if (alarm.repeatDays.isNotEmpty()) {
            val nextFire = alarm.nextFireTimestamp(System.currentTimeMillis() + 60_000L)
            AlarmScheduler.schedule(context, alarm, nextFire)
            Log.d(TAG, "Rescheduled repeating alarm ${alarm.id} for $nextFire")
        } else {
            AlarmStorage.setEnabled(context, alarmId, false)
            Log.d(TAG, "One-time alarm ${alarm.id} disabled after firing")
        }
    }

    private fun wakeScreen(context: Context) {
        try {
            val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
            @Suppress("DEPRECATION")
            val screenLock = pm.newWakeLock(
                PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP or PowerManager.ON_AFTER_RELEASE,
                "lifehub:AlarmScreenTurnOn"
            )
            screenLock.acquire(3000L)
        } catch (e: Exception) {
            Log.w(TAG, "Screen wake-lock error: ${e.message}")
        }
    }

    private fun tryDirectActivityLaunch(context: Context, alarmId: String) {
        try {
            val activityIntent = Intent(context, AlarmActivity::class.java).apply {
                action = "com.duodevs.lifehub.ALARM_DIRECT_${alarmId}"
                data = Uri.parse("lifehub://alarm/direct/${alarmId}")
                putExtra(AlarmScheduler.EXTRA_ALARM_ID, alarmId)
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                        Intent.FLAG_ACTIVITY_CLEAR_TOP or
                        Intent.FLAG_ACTIVITY_SINGLE_TOP
            }
            context.startActivity(activityIntent)
            Log.d(TAG, "Direct launch startActivity called for alarm $alarmId")
        } catch (e: Exception) {
            Log.d(TAG, "Direct launch suppressed: ${e.message}")
        }
    }

    private fun handleStop(context: Context, intent: Intent) {
        val alarmId = intent.getStringExtra(AlarmScheduler.EXTRA_ALARM_ID)
        Log.d(TAG, "Handling Stop for alarm: $alarmId")

        // Stop foreground service
        try {
            val stopIntent = Intent(context, AlarmService::class.java).apply {
                action = AlarmService.ACTION_STOP_ALARM
            }
            context.startService(stopIntent)
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping AlarmService: ${e.message}")
        }

        // Cancel notification
        if (alarmId != null) {
            try {
                val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                nm.cancel(AlarmService.notifIdForAlarm(alarmId))
            } catch (e: Exception) {
                Log.e(TAG, "Error cancelling notification: ${e.message}")
            }
        }

        // Notify open AlarmActivity to close
        try {
            context.sendBroadcast(Intent(AlarmService.ACTION_ALARM_DISMISSED).setPackage(context.packageName))
        } catch (e: Exception) {
            Log.e(TAG, "Error broadcasting dismiss: ${e.message}")
        }
    }

    private fun handleSnooze(context: Context, intent: Intent) {
        val alarmId = intent.getStringExtra(AlarmScheduler.EXTRA_ALARM_ID)
        Log.d(TAG, "Handling Snooze for alarm: $alarmId")

        // Stop foreground service
        try {
            val stopIntent = Intent(context, AlarmService::class.java).apply {
                action = AlarmService.ACTION_STOP_ALARM
            }
            context.startService(stopIntent)
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping AlarmService: ${e.message}")
        }

        // Cancel notification
        if (alarmId != null) {
            try {
                val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                nm.cancel(AlarmService.notifIdForAlarm(alarmId))
            } catch (e: Exception) {
                Log.e(TAG, "Error cancelling notification: ${e.message}")
            }

            // Schedule the snooze occurrence
            val alarm = AlarmStorage.getById(context, alarmId)
            if (alarm != null) {
                val snoozeMs = alarm.snoozeMinutes * 60 * 1000L
                val snoozeData = alarm.copy(
                    id         = "${alarm.id}_snooze_${System.currentTimeMillis()}",
                    enabled    = true,
                    repeatDays = emptyList(),
                    updatedAt  = System.currentTimeMillis(),
                )
                AlarmStorage.save(context, snoozeData)
                AlarmScheduler.schedule(context, snoozeData, System.currentTimeMillis() + snoozeMs)
                Log.d(TAG, "Snoozed alarm ${alarm.id} for ${alarm.snoozeMinutes} min")
            }
        }

        // Notify open AlarmActivity to close
        try {
            context.sendBroadcast(Intent(AlarmService.ACTION_ALARM_DISMISSED).setPackage(context.packageName))
        } catch (e: Exception) {
            Log.e(TAG, "Error broadcasting dismiss: ${e.message}")
        }
    }

    private fun showFallbackAlarmNotification(context: Context, alarm: AlarmData) {
        AlarmService.createChannels(context)
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        val notifId = AlarmService.notifIdForAlarm(alarm.id)
        val baseCode = alarm.id.hashCode() and 0x7FFF

        // Stop action
        val stopIntent = Intent(context, AlarmReceiver::class.java).apply {
            action = AlarmService.ACTION_STOP_ALARM
            data = Uri.parse("lifehub://alarm/stop/${alarm.id}")
            putExtra(AlarmScheduler.EXTRA_ALARM_ID, alarm.id)
            `package` = context.packageName
        }
        val stopPending = PendingIntent.getBroadcast(
            context, baseCode, stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        // Snooze action
        val snoozeIntent = Intent(context, AlarmReceiver::class.java).apply {
            action = AlarmService.ACTION_SNOOZE_ALARM
            data = Uri.parse("lifehub://alarm/snooze/${alarm.id}")
            putExtra(AlarmScheduler.EXTRA_ALARM_ID, alarm.id)
            `package` = context.packageName
        }
        val snoozePending = PendingIntent.getBroadcast(
            context, baseCode + 1, snoozeIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        // Tap
        val tapIntent = Intent(context, AlarmActivity::class.java).apply {
            action = "com.duodevs.lifehub.ALARM_TAP_${alarm.id}"
            data = Uri.parse("lifehub://alarm/tap/${alarm.id}")
            putExtra(AlarmScheduler.EXTRA_ALARM_ID, alarm.id)
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                    Intent.FLAG_ACTIVITY_CLEAR_TOP or
                    Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val tapPending = PendingIntent.getActivity(
            context, baseCode + 2, tapIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        // Full-screen intent
        val fullScreenIntent = Intent(context, AlarmActivity::class.java).apply {
            action = "com.duodevs.lifehub.ALARM_FULL_SCREEN_${alarm.id}"
            data = Uri.parse("lifehub://alarm/fullscreen/${alarm.id}")
            putExtra(AlarmScheduler.EXTRA_ALARM_ID, alarm.id)
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                    Intent.FLAG_ACTIVITY_CLEAR_TOP or
                    Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val fullScreenPending = PendingIntent.getActivity(
            context, baseCode + 3, fullScreenIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val timeStr = String.format("%02d:%02d", alarm.hour, alarm.minute)

        val notification = NotificationCompat.Builder(context, AlarmService.CHANNEL_ID_ALARM)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("⏰ ${alarm.label}")
            .setContentText(timeStr)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(false)
            .setAutoCancel(true)
            .setContentIntent(tapPending)
            .setFullScreenIntent(fullScreenPending, true)
            .addAction(0, "Snooze", snoozePending)
            .addAction(0, "Stop", stopPending)
            .build()

        nm.notify(notifId, notification)
    }
}
