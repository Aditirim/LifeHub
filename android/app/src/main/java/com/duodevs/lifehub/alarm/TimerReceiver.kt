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

/**
 * TimerReceiver — fires when a countdown timer expires via AlarmManager,
 * and handles timer stop actions.
 *
 * Flow:
 *  1. AlarmManager wakes device and triggers onReceive(ACTION_TIMER_FIRE)
 *  2. Turns on physical screen using ACQUIRE_CAUSES_WAKEUP
 *  3. Starts AlarmService as a foreground service (loops alarm ringtone + vibration + foreground notification)
 *  4. Attempts direct launch of AlarmActivity (for instant display if screen is on or overlay permission granted)
 *  5. Shows fallback full-screen notification if foreground service launch is blocked
 *  6. Handles ACTION_STOP_TIMER broadcast from notification or UI
 */
class TimerReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "TimerReceiver"

        const val CHANNEL_ID             = AlarmService.CHANNEL_ID_TIMER
        const val NOTIF_ID               = AlarmService.TIMER_NOTIF_ID
        const val ACTION_STOP_TIMER      = AlarmService.ACTION_STOP_TIMER
        const val ACTION_TIMER_DISMISSED = AlarmService.ACTION_TIMER_DISMISSED
        const val EXTRA_IS_TIMER         = "is_timer"

        /**
         * Stop the timer alert: dismiss notification, stop service & audio, dismiss UI.
         */
        @Synchronized
        fun stopTimer(context: Context) {
            Log.d(TAG, "Stopping timer alert")

            // Stop AlarmService
            try {
                val serviceIntent = Intent(context, AlarmService::class.java).apply {
                    action = ACTION_STOP_TIMER
                }
                context.startService(serviceIntent)
            } catch (e: Exception) {
                Log.e(TAG, "Error sending stop to AlarmService: ${e.message}")
            }

            // Cancel notification
            try {
                val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                nm.cancel(NOTIF_ID)
            } catch (e: Exception) {
                Log.e(TAG, "Error cancelling timer notification: ${e.message}")
            }

            // Dismiss any open AlarmActivity showing this timer
            try {
                context.sendBroadcast(Intent(ACTION_TIMER_DISMISSED).setPackage(context.packageName))
            } catch (e: Exception) {
                Log.e(TAG, "Error sending timer dismissed broadcast: ${e.message}")
            }
        }
    }

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action
        Log.d(TAG, "onReceive action=$action")

        when (action) {
            ACTION_STOP_TIMER -> {
                Log.d(TAG, "Received ACTION_STOP_TIMER")
                stopTimer(context)
                return
            }
            AlarmScheduler.ACTION_TIMER_FIRE -> {
                val timerId = intent.getStringExtra(AlarmScheduler.EXTRA_TIMER_ID) ?: "timer_${System.currentTimeMillis()}"
                val label   = intent.getStringExtra(AlarmScheduler.EXTRA_TIMER_LABEL) ?: "Timer"
                Log.d(TAG, "Timer fired: $timerId '$label'")

                // 1. Physically turn on the screen
                wakeScreen(context)

                // 2. Ensure channels exist
                AlarmService.createChannels(context)

                // 3. Start AlarmService for continuous ringtone, vibration, and foreground notification
                val serviceIntent = Intent(context, AlarmService::class.java).apply {
                    this.action = AlarmService.ACTION_START_TIMER
                    putExtra(EXTRA_IS_TIMER, true)
                    putExtra(AlarmScheduler.EXTRA_TIMER_ID, timerId)
                    putExtra(AlarmScheduler.EXTRA_TIMER_LABEL, label)
                }

                try {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        context.startForegroundService(serviceIntent)
                    } else {
                        context.startService(serviceIntent)
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Could not start AlarmService directly: ${e.message}. Showing fallback notification.", e)
                    showFallbackTimerNotification(context, timerId, label)
                }

                // 4. Attempt direct activity launch
                tryDirectActivityLaunch(context, timerId, label)
            }
        }
    }

    private fun wakeScreen(context: Context) {
        try {
            val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
            @Suppress("DEPRECATION")
            val screenLock = pm.newWakeLock(
                PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP or PowerManager.ON_AFTER_RELEASE,
                "lifehub:TimerScreenTurnOn"
            )
            screenLock.acquire(3000L) // Release automatically after 3s
        } catch (e: Exception) {
            Log.w(TAG, "Screen wake-lock error: ${e.message}")
        }
    }

    private fun tryDirectActivityLaunch(context: Context, timerId: String, label: String) {
        try {
            val activityIntent = Intent(context, AlarmActivity::class.java).apply {
                action = "com.duodevs.lifehub.TIMER_DIRECT_${timerId}"
                data = Uri.parse("lifehub://timer/direct/${timerId}")
                putExtra(EXTRA_IS_TIMER, true)
                putExtra(AlarmScheduler.EXTRA_TIMER_ID, timerId)
                putExtra(AlarmScheduler.EXTRA_TIMER_LABEL, label)
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                        Intent.FLAG_ACTIVITY_CLEAR_TOP or
                        Intent.FLAG_ACTIVITY_SINGLE_TOP
            }
            context.startActivity(activityIntent)
            Log.d(TAG, "Direct launch startActivity called for timer $timerId")
        } catch (e: Exception) {
            Log.d(TAG, "Direct launch suppressed: ${e.message}")
        }
    }

    private fun showFallbackTimerNotification(context: Context, timerId: String, label: String) {
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        // Stop Action Intent
        val stopIntent = Intent(context, TimerReceiver::class.java).apply {
            action = ACTION_STOP_TIMER
            putExtra(AlarmScheduler.EXTRA_TIMER_ID, timerId)
            `package` = context.packageName
        }
        val stopPending = PendingIntent.getBroadcast(
            context,
            NOTIF_ID + 1,
            stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        // Full-screen Activity Intent
        val fullScreenIntent = Intent(context, AlarmActivity::class.java).apply {
            action = "com.duodevs.lifehub.TIMER_FULL_SCREEN_${timerId}"
            data = Uri.parse("lifehub://timer/fullscreen/${timerId}")
            putExtra(EXTRA_IS_TIMER, true)
            putExtra(AlarmScheduler.EXTRA_TIMER_ID, timerId)
            putExtra(AlarmScheduler.EXTRA_TIMER_LABEL, label)
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                    Intent.FLAG_ACTIVITY_CLEAR_TOP or
                    Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val fullScreenPending = PendingIntent.getActivity(
            context,
            NOTIF_ID + 2,
            fullScreenIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        // Notification tap intent
        val tapIntent = Intent(context, AlarmActivity::class.java).apply {
            action = "com.duodevs.lifehub.TIMER_TAP_${timerId}"
            data = Uri.parse("lifehub://timer/tap/${timerId}")
            putExtra(EXTRA_IS_TIMER, true)
            putExtra(AlarmScheduler.EXTRA_TIMER_ID, timerId)
            putExtra(AlarmScheduler.EXTRA_TIMER_LABEL, label)
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                    Intent.FLAG_ACTIVITY_CLEAR_TOP or
                    Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val tapPending = PendingIntent.getActivity(
            context,
            NOTIF_ID + 3,
            tapIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("⏱️ Timer Done!")
            .setContentText(label)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(false)
            .setAutoCancel(true)
            .setContentIntent(tapPending)
            .setFullScreenIntent(fullScreenPending, true)
            .addAction(0, "Stop", stopPending)
            .build()

        nm.notify(NOTIF_ID, notification)
    }
}
