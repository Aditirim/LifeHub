package com.duodevs.lifehub.alarm

import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.net.Uri
import android.os.Binder
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log
import androidx.core.app.NotificationCompat
import com.duodevs.lifehub.R

/**
 * AlarmService — foreground service responsible for alarm audio playback.
 *
 * Lifecycle:
 *  1. Started by AlarmReceiver when an alarm fires
 *  2. Shows a foreground notification immediately (required by Android)
 *  3. Plays the selected ringtone in a loop
 *  4. Optionally ramps volume gradually
 *  5. Optionally vibrates
 *  6. Stopped when the user Dismisses or Snoozes from AlarmActivity or notification
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

        const val CHANNEL_ID = "lifehub_alarm_v2"

        /** Intent action sent to this service to stop or snooze it */
        const val ACTION_STOP_ALARM      = "com.duodevs.lifehub.STOP_ALARM"
        const val ACTION_SNOOZE_ALARM    = "com.duodevs.lifehub.SNOOZE_ALARM"
        const val ACTION_ALARM_DISMISSED = "com.duodevs.lifehub.ALARM_DISMISSED"

        /** Auto-dismiss after this duration if user doesn't interact */
        private const val MAX_ALARM_DURATION_MS = 5 * 60 * 1000L // 5 minutes

        /** Current alarm being played — used by AlarmActivity to communicate */
        @Volatile var currentAlarmId: String? = null

        /**
         * Derive a unique-per-alarm notification ID from the alarm's string ID.
         * Kept in the range [10000, 10000+0x7FFFF].
         */
        fun notifIdForAlarm(alarmId: String): Int = 10_000 + (alarmId.hashCode() and 0x7FFFF)

        /**
         * Ensure the notification channel exists with IMPORTANCE_HIGH.
         * Required for full-screen intents and heads-up notifications.
         */
        fun createChannel(context: Context) {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
            val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (nm.getNotificationChannel(CHANNEL_ID) != null) return
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Alarms",
                NotificationManager.IMPORTANCE_HIGH,
            ).apply {
                description = "Active alarm ringing notifications"
                setBypassDnd(true)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 500, 500)
                setSound(null, null) // Sound is looped by MediaPlayer via STREAM_ALARM
            }
            nm.createNotificationChannel(channel)
        }
    }

    /** Per-instance notification ID, set when the service starts. */
    private var currentNotifId = 10_000

    private var mediaPlayer: MediaPlayer? = null
    /** Tracks a player that's still in prepareAsync() — needed so stopAlarm() can abort it */
    private var preparingPlayer: MediaPlayer? = null
    private var vibrator: Vibrator? = null
    private var audioManager: AudioManager? = null
    private var audioFocusRequest: AudioFocusRequest? = null  // API 26+
    private var wakeLock: PowerManager.WakeLock? = null
    private val handler = Handler(Looper.getMainLooper())
    private val autoDismissRunnable = Runnable { stopSelf() }

    inner class LocalBinder : Binder() {
        fun getService(): AlarmService = this@AlarmService
    }
    private val binder = LocalBinder()
    override fun onBind(intent: Intent?): IBinder = binder

    // ── Service lifecycle ─────────────────────────────────────────────────────

    override fun onCreate() {
        super.onCreate()
        val pm = getSystemService(POWER_SERVICE) as PowerManager
        wakeLock = pm.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "lifehub:AlarmWakeLock"
        ).apply {
            acquire(MAX_ALARM_DURATION_MS + 10_000L)
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP_ALARM -> {
                stopAlarm()
                stopSelf()
                return START_NOT_STICKY
            }
            ACTION_SNOOZE_ALARM -> {
                val id = intent.getStringExtra(AlarmScheduler.EXTRA_ALARM_ID) ?: currentAlarmId
                if (id != null) {
                    val alarm = AlarmStorage.getById(this, id)
                    if (alarm != null) {
                        val snoozeMs = alarm.snoozeMinutes * 60 * 1000L
                        val snoozeData = alarm.copy(
                            id         = "${alarm.id}_snooze_${System.currentTimeMillis()}",
                            enabled    = true,
                            repeatDays = emptyList(),
                            updatedAt  = System.currentTimeMillis(),
                        )
                        AlarmStorage.save(this, snoozeData)
                        AlarmScheduler.schedule(this, snoozeData, System.currentTimeMillis() + snoozeMs)
                        Log.d(TAG, "Snoozed alarm ${alarm.id} for ${alarm.snoozeMinutes} min")
                    }
                }
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
        currentNotifId = notifIdForAlarm(alarmId)

        val alarm = AlarmStorage.getById(this, alarmId) ?: run {
            Log.e(TAG, "Alarm $alarmId not found")
            stopSelf()
            return START_NOT_STICKY
        }

        createServiceChannel()
        val notification = buildForegroundNotification(alarm)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(currentNotifId, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
        } else {
            startForeground(currentNotifId, notification)
        }

        // Request audio focus so audio plays correctly on STREAM_ALARM
        requestAlarmAudioFocus()

        // Start audio + vibration
        playRingtone(alarm)
        if (alarm.vibrationEnabled) startVibration()

        // Auto-dismiss safety net
        handler.removeCallbacks(autoDismissRunnable)
        handler.postDelayed(autoDismissRunnable, MAX_ALARM_DURATION_MS)

        return START_NOT_STICKY
    }

    override fun onDestroy() {
        stopAlarm()
        releaseWakeLock()
        super.onDestroy()
    }

    // ── Audio focus ──────────────────────────────────────────────────────────

    @SuppressLint("NewApi")
    private fun requestAlarmAudioFocus() {
        audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val attrs = AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build()
            val req = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_EXCLUSIVE)
                .setAudioAttributes(attrs)
                .setAcceptsDelayedFocusGain(false)
                .setOnAudioFocusChangeListener { } // hold focus; ignore changes
                .build()
            audioFocusRequest = req
            audioManager?.requestAudioFocus(req)
        } else {
            @Suppress("DEPRECATION")
            audioManager?.requestAudioFocus(
                null,
                AudioManager.STREAM_ALARM,
                AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_EXCLUSIVE
            )
        }
    }

    private fun abandonAudioFocus() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            audioFocusRequest?.let { audioManager?.abandonAudioFocusRequest(it) }
        } else {
            @Suppress("DEPRECATION")
            audioManager?.abandonAudioFocus(null)
        }
    }

    // ── Audio ─────────────────────────────────────────────────────────────────

    private fun playRingtone(alarm: AlarmData) {
        val ringtoneUri = resolveRingtoneUri(alarm)
        val uriToPlay = ringtoneUri
            ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)

        try {
            val mp = MediaPlayer()
            preparingPlayer = mp
            // IMPORTANT: AudioAttributes MUST be set before setDataSource on Android 12+
            val attrs = AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .setLegacyStreamType(AudioManager.STREAM_ALARM)
                .build()
            mp.setAudioAttributes(attrs)

            mp.setDataSource(applicationContext, uriToPlay)
            mp.isLooping = true

            // Use prepareAsync to avoid blocking the main thread (which could cause ANR)
            mp.setOnPreparedListener { player ->
                preparingPlayer = null
                // If service was stopped while we were preparing, release immediately
                if (currentAlarmId == null) { player.release(); return@setOnPreparedListener }
                mediaPlayer = player
                if (alarm.gradualVolumeEnabled) {
                    player.setVolume(0.1f, 0.1f)
                    player.start()
                    rampVolume(alarm.gradualVolumeDuration)
                } else {
                    player.setVolume(1.0f, 1.0f)
                    player.start()
                }
                Log.d(TAG, "Ringtone playing for alarm ${alarm.id}")
            }
            mp.setOnErrorListener { _, what, extra ->
                preparingPlayer = null
                Log.e(TAG, "MediaPlayer error: what=$what extra=$extra")
                mp.release()
                mediaPlayer = null
                playFallbackRingtone()
                true
            }
            mp.prepareAsync()
        } catch (e: Exception) {
            preparingPlayer = null
            Log.e(TAG, "Failed to prepare ringtone: ${e.message}", e)
            // Attempt fallback with system ringtone API
            playFallbackRingtone()
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
     * Fallback: use a fresh MediaPlayer with the system default alarm sound.
     * Releases any existing player first.
     */
    private fun playFallbackRingtone() {
        try {
            mediaPlayer?.release()
            mediaPlayer = null

            val defaultUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
            val mp = MediaPlayer()
            // AudioAttributes MUST come before setDataSource
            val attrs = AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .setLegacyStreamType(AudioManager.STREAM_ALARM)
                .build()
            mp.setAudioAttributes(attrs)
            mp.setDataSource(applicationContext, defaultUri)
            mp.isLooping = true
            mp.setOnPreparedListener { player ->
                mediaPlayer = player
                player.setVolume(1.0f, 1.0f)
                player.start()
                Log.d(TAG, "Fallback ringtone playing")
            }
            mp.setOnErrorListener { _, what, extra ->
                Log.e(TAG, "Fallback MediaPlayer error: what=$what extra=$extra")
                mp.release()
                mediaPlayer = null
                true
            }
            mp.prepareAsync()
        } catch (e: Exception) {
            Log.e(TAG, "Fallback ringtone also failed: ${e.message}", e)
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
                    Log.w(TAG, "Built-in ringtone '$resName' not found in res/raw/, using system default")
                    null // fallback to default
                }
            }
            "device" -> {
                // content:// URI from media picker
                if (alarm.ringtoneUri.isNotBlank()) {
                    runCatching { Uri.parse(alarm.ringtoneUri) }.getOrElse {
                        Log.w(TAG, "Invalid device URI: ${alarm.ringtoneUri}")
                        null
                    }
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
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                stopForeground(STOP_FOREGROUND_REMOVE)
            } else {
                @Suppress("DEPRECATION")
                stopForeground(true)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping foreground: ${e.message}")
        }

        try {
            val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
            nm.cancel(currentNotifId)
        } catch (e: Exception) {
            Log.e(TAG, "Error cancelling notification: ${e.message}")
        }

        // Release any player still in prepareAsync() phase
        try {
            preparingPlayer?.release()
            preparingPlayer = null
        } catch (_: Exception) {}

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

        abandonAudioFocus()

        // Notify AlarmActivity to finish if running
        try {
            sendBroadcast(Intent(ACTION_ALARM_DISMISSED).setPackage(packageName))
        } catch (e: Exception) {
            Log.e(TAG, "Error broadcasting dismiss: ${e.message}")
        }
    }

    private fun releaseWakeLock() {
        try {
            if (wakeLock?.isHeld == true) {
                wakeLock?.release()
            }
            wakeLock = null
        } catch (e: Exception) {
            Log.e(TAG, "Error releasing WakeLock: ${e.message}")
        }
    }

    // ── Notification ──────────────────────────────────────────────────────────

    private fun buildForegroundNotification(alarm: AlarmData): Notification {
        val baseCode = alarm.id.hashCode() and 0x7FFF

        // Stop action (broadcast to AlarmReceiver)
        val dismissIntent = Intent(this, AlarmReceiver::class.java).apply {
            action = ACTION_STOP_ALARM
            putExtra(AlarmScheduler.EXTRA_ALARM_ID, alarm.id)
            `package` = packageName
        }
        val dismissPending = PendingIntent.getBroadcast(
            this, baseCode, dismissIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        // Snooze action (broadcast to AlarmReceiver)
        val snoozeIntent = Intent(this, AlarmReceiver::class.java).apply {
            action = ACTION_SNOOZE_ALARM
            putExtra(AlarmScheduler.EXTRA_ALARM_ID, alarm.id)
            `package` = packageName
        }
        val snoozePending = PendingIntent.getBroadcast(
            this, baseCode + 1, snoozeIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        // Tap → open AlarmActivity
        val tapIntent = Intent(this, AlarmActivity::class.java).apply {
            action = "com.duodevs.lifehub.ALARM_TAP_${alarm.id}"
            data = Uri.parse("lifehub://alarm/${alarm.id}")
            putExtra(AlarmScheduler.EXTRA_ALARM_ID, alarm.id)
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                    Intent.FLAG_ACTIVITY_CLEAR_TOP or
                    Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val tapPending = PendingIntent.getActivity(
            this, baseCode + 2, tapIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        // Full-screen intent — shows AlarmActivity over the lock screen.
        val fullScreenIntent = Intent(this, AlarmActivity::class.java).apply {
            action = "com.duodevs.lifehub.ALARM_FULL_SCREEN_${alarm.id}"
            data = Uri.parse("lifehub://alarm/${alarm.id}")
            putExtra(AlarmScheduler.EXTRA_ALARM_ID, alarm.id)
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                    Intent.FLAG_ACTIVITY_CLEAR_TOP or
                    Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val fullScreenPending = PendingIntent.getActivity(
            this, baseCode + 3, fullScreenIntent,
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
            .setFullScreenIntent(fullScreenPending, true)
            .addAction(0, "Snooze", snoozePending)
            .addAction(0, "Stop", dismissPending)
            .build()
    }

    private fun createServiceChannel() {
        createChannel(this)
    }
}
