package com.duodevs.lifehub.alarm

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log
import androidx.core.app.NotificationCompat
import com.duodevs.lifehub.R

/**
 * TimerReceiver — fires when a countdown timer expires, and handles timer stop actions.
 *
 * Capabilities:
 *  1. Shows a high-importance, ongoing notification with an immediate "Stop" action button.
 *  2. Attaches a full-screen intent so that over the lock screen (or as a heads-up banner),
 *     AlarmActivity presents the full-screen Timer Done UI with a visible Stop control.
 *  3. Vibrates and triggers alarm audio via the dedicated high-importance notification channel.
 *  4. Stops audio, vibration, and dismisses UI immediately when "Stop" is pressed.
 *  5. Includes a 5-minute safety timeout to prevent indefinite ringing if left unattended.
 */
class TimerReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "TimerReceiver"

        const val CHANNEL_ID             = "lifehub_timer_v2"
        const val NOTIF_ID               = 9001
        const val ACTION_STOP_TIMER      = "com.duodevs.lifehub.STOP_TIMER"
        const val ACTION_TIMER_DISMISSED = "com.duodevs.lifehub.TIMER_DISMISSED"
        const val EXTRA_IS_TIMER         = "is_timer"

        private val handler = Handler(Looper.getMainLooper())
        private var autoDismissRunnable: Runnable? = null
        private var activeVibrator: Vibrator? = null

        /**
         * Stop the timer alert: dismiss notification, stop vibration, and notify UI.
         */
        @Synchronized
        fun stopTimer(context: Context) {
            Log.d(TAG, "Stopping timer alert")
            autoDismissRunnable?.let { handler.removeCallbacks(it) }
            autoDismissRunnable = null

            // Cancel notification (stops channel alarm sound immediately)
            try {
                val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                nm.cancel(NOTIF_ID)
            } catch (e: Exception) {
                Log.e(TAG, "Error cancelling timer notification: ${e.message}")
            }

            // Cancel vibration
            try {
                activeVibrator?.cancel()
                activeVibrator = null
            } catch (e: Exception) {
                Log.e(TAG, "Error cancelling timer vibrator: ${e.message}")
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
        when (intent.action) {
            ACTION_STOP_TIMER -> {
                Log.d(TAG, "Received ACTION_STOP_TIMER")
                stopTimer(context)
            }
            AlarmScheduler.ACTION_TIMER_FIRE -> {
                val timerId = intent.getStringExtra(AlarmScheduler.EXTRA_TIMER_ID) ?: "timer"
                val label   = intent.getStringExtra(AlarmScheduler.EXTRA_TIMER_LABEL) ?: "Timer"
                Log.d(TAG, "Timer fired: $timerId '$label'")

                createTimerChannel(context)
                showTimerNotification(context, timerId, label)
                startVibration(context)

                // Safety timeout: auto-stop after 5 minutes so it never rings forever
                autoDismissRunnable?.let { handler.removeCallbacks(it) }
                val runnable = Runnable { stopTimer(context.applicationContext) }
                autoDismissRunnable = runnable
                handler.postDelayed(runnable, 5 * 60 * 1000L)
            }
        }
    }

    private fun showTimerNotification(context: Context, timerId: String, label: String) {
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        // Stop Action Intent (broadcast to TimerReceiver)
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

        // Full-screen Activity Intent (opens AlarmActivity in Timer mode)
        val fullScreenIntent = Intent(context, AlarmActivity::class.java).apply {
            action = "com.duodevs.lifehub.TIMER_FULL_SCREEN_${timerId}"
            data = Uri.parse("lifehub://timer/${timerId}")
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
            data = Uri.parse("lifehub://timer/${timerId}")
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

    private fun startVibration(context: Context) {
        try {
            val pattern = longArrayOf(0, 500, 250, 500)
            val v: Vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val vm = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager
                vm.defaultVibrator
            } else {
                @Suppress("DEPRECATION")
                context.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
            }
            activeVibrator = v
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                v.vibrate(VibrationEffect.createWaveform(pattern, 0)) // loop until stopped
            } else {
                @Suppress("DEPRECATION")
                v.vibrate(pattern, 0)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Vibration error: ${e.message}")
        }
    }

    private fun createTimerChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (nm.getNotificationChannel(CHANNEL_ID) != null) return

        val alarmSoundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
            ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
        val audioAttrs = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()

        val channel = NotificationChannel(
            CHANNEL_ID,
            "Timer",
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = "Timer completion notifications"
            enableVibration(true)
            vibrationPattern = longArrayOf(0, 500, 250, 500)
            setSound(alarmSoundUri, audioAttrs)
            setBypassDnd(true)
            lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        }
        nm.createNotificationChannel(channel)
    }
}
