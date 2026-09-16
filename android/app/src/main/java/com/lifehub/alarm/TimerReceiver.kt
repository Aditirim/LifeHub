package com.lifehub.alarm

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log
import androidx.core.app.NotificationCompat
import com.lifehub.MainActivity
import com.lifehub.R

/**
 * TimerReceiver — fires when a countdown timer expires.
 *
 * Shows a high-priority notification with sound.
 * Does NOT start a foreground service or full-screen activity
 * (timers are less intrusive than alarms by design).
 */
class TimerReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG        = "TimerReceiver"
        private const val CHANNEL_ID = "lifehub_timer"
        private const val NOTIF_ID   = 9001
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != AlarmScheduler.ACTION_TIMER_FIRE) return

        val timerId = intent.getStringExtra(AlarmScheduler.EXTRA_TIMER_ID) ?: return
        val label   = intent.getStringExtra(AlarmScheduler.EXTRA_TIMER_LABEL) ?: "Timer"
        Log.d(TAG, "Timer fired: $timerId '$label'")

        createTimerChannel(context)
        showTimerNotification(context, label)
        vibrate(context)
    }

    private fun showTimerNotification(context: Context, label: String) {
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        // Tap notification → open LifeHub
        val tapIntent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val tapPending = PendingIntent.getActivity(
            context, 0, tapIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("⏱️ Timer Done!")
            .setContentText(label)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setContentIntent(tapPending)
            .setAutoCancel(true)
            .build()

        nm.notify(NOTIF_ID, notification)
    }

    private fun vibrate(context: Context) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val vm = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager
                val v  = vm.defaultVibrator
                v.vibrate(VibrationEffect.createWaveform(longArrayOf(0, 400, 200, 400, 200, 400), -1))
            } else {
                @Suppress("DEPRECATION")
                val v = context.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    v.vibrate(VibrationEffect.createWaveform(longArrayOf(0, 400, 200, 400), -1))
                } else {
                    @Suppress("DEPRECATION")
                    v.vibrate(longArrayOf(0, 400, 200, 400), -1)
                }
            }
        } catch (_: Exception) {}
    }

    private fun createTimerChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (nm.getNotificationChannel(CHANNEL_ID) != null) return
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Timer",
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = "Timer completion notifications"
            enableVibration(true)
        }
        nm.createNotificationChannel(channel)
    }
}
