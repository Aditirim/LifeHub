package com.lifehub.alarm

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.net.Uri
import android.os.Binder
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log
import androidx.core.app.NotificationCompat
import com.lifehub.R

/**
 * AlarmService — foreground service responsible for alarm audio playback.
 *
 * Lifecycle:
 *  1. Started by AlarmReceiver when an alarm fires
 *  2. Shows a foreground notification immediately (required by Android)
 *  3. Plays the selected ringtone in a loop
 *  4. Optionally ramps volume gradually
 *  5. Optionally vibrates
 *  6. Stopped when the user Dismisses or Snoozes from AlarmActivity
 *
 * Audio handling:
 *  - Uses AudioManager.STREAM_ALARM for proper alarm audio routing
 *  - Requests audio focus before playing
 *  - Handles invalid/missing URIs with fallback to default alarm
 *
 * Auto-dismiss:
 *  - Stops itself after MAX_ALARM_DURATION_MS to prevent indefinite ringing
 *    (e.g. if the user doesn't interact with the phone)
 */
class AlarmService : Service() {

    companion object {
        private const val TAG = "AlarmService"

        /** Notification ID for the foreground service notification */
        private const val NOTIF_ID   = 8888
        private const val CHANNEL_ID = "lifehub_alarm_service"

        /** Intent action sent to this service to stop it */
        const val ACTION_STOP_ALARM  = "com.lifehub.STOP_ALARM"
        const val ACTION_SNOOZE_ALARM = "com.lifehub.SNOOZE_ALARM"

        /** Auto-dismiss after this duration if user doesn't interact */
        private const val MAX_ALARM_DURATION_MS = 5 * 60 * 1000L // 5 minutes

        /** Current alarm being played — used by AlarmActivity to communicate */
        @Volatile var currentAlarmId: String? = null
    }

    private var mediaPlayer: MediaPlayer? = null
    private var vibrator: Vibrator? = null
    private val handler = Handler(Looper.getMainLooper())
    private val autoDismissRunnable = Runnable { stopSelf() }

    inner class LocalBinder : Binder() {
        fun getService(): AlarmService = this@AlarmService
    }
    private val binder = LocalBinder()
    override fun onBind(intent: Intent?): IBinder = binder

    // ── Service lifecycle ─────────────────────────────────────────────────────

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP_ALARM, ACTION_SNOOZE_ALARM -> {
                stopAlarm()
                stopSelf()
                return START_NOT_STICKY
            }
        }

        val alarmId = intent?.getStringExtra(AlarmScheduler.EXTRA_ALARM_ID) ?: run {
            Log.e(TAG, "Started with no alarm ID")
            stopSelf()
            return START_NOT_STICKY
        }

        currentAlarmId = alarmId

        val alarm = AlarmStorage.getById(this, alarmId) ?: run {
            Log.e(TAG, "Alarm $alarmId not found")
            stopSelf()
            return START_NOT_STICKY
        }

        // Show foreground notification immediately to satisfy Android's requirement
        createServiceChannel()
        startForeground(NOTIF_ID, buildForegroundNotification(alarm))

        // Start audio + vibration
        playRingtone(alarm)
        if (alarm.vibrationEnabled) startVibration()

        // Auto-dismiss safety net
        handler.postDelayed(autoDismissRunnable, MAX_ALARM_DURATION_MS)

        return START_NOT_STICKY // Don't restart if killed — alarm has fired
    }

    override fun onDestroy() {
        stopAlarm()
        super.onDestroy()
    }

    // ── Audio ─────────────────────────────────────────────────────────────────

    private fun playRingtone(alarm: AlarmData) {
        val ringtoneUri = resolveRingtoneUri(alarm)

        try {
            mediaPlayer = MediaPlayer().apply {
                val attrs = AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .setLegacyStreamType(AudioManager.STREAM_ALARM)
                    .build()
                setAudioAttributes(attrs)

                if (ringtoneUri != null) {
                    setDataSource(applicationContext, ringtoneUri)
                } else {
                    // Fallback to system default alarm
                    val defaultUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
                    setDataSource(applicationContext, defaultUri)
                }

                isLooping = true
                prepare()

                if (alarm.gradualVolumeEnabled) {
                    // Start at ~10% volume and ramp up
                    setVolume(0.1f, 0.1f)
                    start()
                    rampVolume(alarm.gradualVolumeDuration)
                } else {
                    setVolume(1.0f, 1.0f)
                    start()
                }
            }
            Log.d(TAG, "Ringtone playing for alarm ${alarm.id}")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to play ringtone: ${e.message}")
            // Attempt fallback with system ringtone API
            playFallbackRingtone(alarm)
        }
    }

    /**
     * Gradually ramp MediaPlayer volume from ~0.1 to 1.0 over [durationSeconds].
     */
    private fun rampVolume(durationSeconds: Int) {
        val steps        = 20
        val stepMs       = (durationSeconds * 1000L) / steps
        val stepSize     = 0.9f / steps  // 0.1 → 1.0 = 0.9 range

        var currentStep  = 0
        val rampRunnable = object : Runnable {
            override fun run() {
                val mp = mediaPlayer ?: return
                if (!mp.isPlaying) return
                currentStep++
                val vol = 0.1f + (stepSize * currentStep)
                mp.setVolume(vol.coerceAtMost(1.0f), vol.coerceAtMost(1.0f))
                if (currentStep < steps) {
                    handler.postDelayed(this, stepMs)
                }
            }
        }
        handler.postDelayed(rampRunnable, stepMs)
    }

    /**
     * Fallback: use RingtoneManager to play (simpler, no loop, but reliable).
     */
    private fun playFallbackRingtone(alarm: AlarmData) {
        try {
            val uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
            val rt  = RingtoneManager.getRingtone(this, uri)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                rt.isLooping = true
            }
            rt.play()
        } catch (e: Exception) {
            Log.e(TAG, "Fallback ringtone also failed: ${e.message}")
        }
    }

    /**
     * Resolve the ringtone URI based on alarm settings.
     * Returns null if the default alarm should be used.
     */
    private fun resolveRingtoneUri(alarm: AlarmData): Uri? {
        return when (alarm.ringtoneType) {
            "builtin" -> {
                // Look up res/raw/ resource by name
                val resName = alarm.ringtoneUri.ifBlank { "alarm_classic" }
                val resId   = resources.getIdentifier(resName, "raw", packageName)
                if (resId != 0) {
                    Uri.parse("android.resource://$packageName/$resId")
                } else {
                    null // fallback to default
                }
            }
            "device" -> {
                // content:// URI from media picker
                if (alarm.ringtoneUri.isNotBlank()) {
                    runCatching { Uri.parse(alarm.ringtoneUri) }.getOrNull()
                } else null
            }
            else -> null // "default" → use system alarm
        }
    }

    // ── Vibration ─────────────────────────────────────────────────────────────

    private fun startVibration() {
        try {
            val pattern = longArrayOf(0, 500, 500) // wait 0ms, vibrate 500ms, pause 500ms, repeat
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val vm = getSystemService(VIBRATOR_MANAGER_SERVICE) as VibratorManager
                vibrator = vm.defaultVibrator
            } else {
                @Suppress("DEPRECATION")
                vibrator = getSystemService(VIBRATOR_SERVICE) as Vibrator
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator?.vibrate(VibrationEffect.createWaveform(pattern, 0)) // repeat index 0
            } else {
                @Suppress("DEPRECATION")
                vibrator?.vibrate(pattern, 0)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Vibration failed: ${e.message}")
        }
    }

    // ── Stop ──────────────────────────────────────────────────────────────────

    private fun stopAlarm() {
        handler.removeCallbacks(autoDismissRunnable)
        currentAlarmId = null

        try {
            mediaPlayer?.let {
                if (it.isPlaying) it.stop()
                it.release()
            }
            mediaPlayer = null
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping MediaPlayer: ${e.message}")
        }

        try {
            vibrator?.cancel()
            vibrator = null
        } catch (e: Exception) {
            Log.e(TAG, "Error cancelling vibrator: ${e.message}")
        }
    }

    // ── Notification ──────────────────────────────────────────────────────────

    private fun buildForegroundNotification(alarm: AlarmData): Notification {
        // Dismiss action
        val dismissIntent = Intent(this, AlarmService::class.java).apply {
            action = ACTION_STOP_ALARM
        }
        val dismissPending = PendingIntent.getService(
            this, 0, dismissIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        // Snooze action
        val snoozeIntent = Intent(this, AlarmService::class.java).apply {
            action = ACTION_SNOOZE_ALARM
            putExtra(AlarmScheduler.EXTRA_ALARM_ID, alarm.id)
        }
        val snoozePending = PendingIntent.getService(
            this, 1, snoozeIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        // Tap → open AlarmActivity
        val tapIntent = Intent(this, AlarmActivity::class.java).apply {
            putExtra(AlarmScheduler.EXTRA_ALARM_ID, alarm.id)
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val tapPending = PendingIntent.getActivity(
            this, 2, tapIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val timeStr = String.format("%02d:%02d", alarm.hour, alarm.minute)

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("⏰ ${alarm.label}")
            .setContentText(timeStr)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setAutoCancel(false)
            .setContentIntent(tapPending)
            .addAction(0, "Snooze", snoozePending)
            .addAction(0, "Dismiss", dismissPending)
            .build()
    }

    private fun createServiceChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        if (nm.getNotificationChannel(CHANNEL_ID) != null) return
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Alarm Playing",
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = "Active alarm service"
            setBypassDnd(true)
            lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            setSound(null, null) // sound is handled by MediaPlayer, not the notification
        }
        nm.createNotificationChannel(channel)
    }
}
