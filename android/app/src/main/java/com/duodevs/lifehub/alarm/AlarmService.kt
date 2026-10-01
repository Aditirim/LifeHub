package com.duodevs.lifehub.alarm

import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
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

        private const val CHANNEL_ID = "lifehub_alarm_service"

        /** Intent action sent to this service to stop it */
        const val ACTION_STOP_ALARM  = "com.duodevs.lifehub.STOP_ALARM"
        const val ACTION_SNOOZE_ALARM = "com.duodevs.lifehub.SNOOZE_ALARM"

        /** Auto-dismiss after this duration if user doesn't interact */
        private const val MAX_ALARM_DURATION_MS = 5 * 60 * 1000L // 5 minutes

        /** Current alarm being played — used by AlarmActivity to communicate */
        @Volatile var currentAlarmId: String? = null

        /**
         * Derive a unique-per-alarm notification ID from the alarm's string ID.
         * Using a fixed ID (e.g. 8888) caused the Android OS to treat Alarm #2's
         * full-screen notification as an *update* to Alarm #1's already-consumed
         * notification, suppressing the full-screen intent on repeated alarms.
         * We keep the ID in the range [10000, 10000+0x7FFFF] to avoid collisions
         * with other notification IDs used elsewhere in the app.
         */
        fun notifIdForAlarm(alarmId: String): Int = 10_000 + (alarmId.hashCode() and 0x7FFFF)
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
        // Acquire WakeLock immediately so the CPU stays awake long enough
        // to start the foreground service and audio before Android can suspend us.
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
        currentNotifId = notifIdForAlarm(alarmId)

        val alarm = AlarmStorage.getById(this, alarmId) ?: run {
            Log.e(TAG, "Alarm $alarmId not found")
            stopSelf()
            return START_NOT_STICKY
        }

        // Show foreground notification immediately to satisfy Android's requirement.
        // Must be called within 5 seconds of startForegroundService().
        // We use a unique notification ID per alarm (currentNotifId) so Android treats
        // each alarm as a fresh notification and re-triggers the full-screen intent.
        createServiceChannel()
        startForeground(currentNotifId, buildForegroundNotification(alarm))

        // Request audio focus so audio plays correctly on STREAM_ALARM
        requestAlarmAudioFocus()

        // Start audio + vibration
        playRingtone(alarm)
        if (alarm.vibrationEnabled) startVibration()

        // Auto-dismiss safety net
        handler.postDelayed(autoDismissRunnable, MAX_ALARM_DURATION_MS)

        return START_NOT_STICKY // Don't restart if killed — alarm has fired
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
        // Use alarm.id hashCode as the base request code so PendingIntents are
        // unique per alarm. Using fixed codes (0,1,2,3) caused the system to
        // return stale PendingIntents from Alarm #1 for Alarm #2.
        val baseCode = alarm.id.hashCode() and 0x7FFF  // keep in safe range

        // Dismiss action
        val dismissIntent = Intent(this, AlarmService::class.java).apply {
            action = ACTION_STOP_ALARM
            putExtra(AlarmScheduler.EXTRA_ALARM_ID, alarm.id)
        }
        val dismissPending = PendingIntent.getService(
            this, baseCode, dismissIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        // Snooze action
        val snoozeIntent = Intent(this, AlarmService::class.java).apply {
            action = ACTION_SNOOZE_ALARM
            putExtra(AlarmScheduler.EXTRA_ALARM_ID, alarm.id)
        }
        val snoozePending = PendingIntent.getService(
            this, baseCode + 1, snoozeIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        // Tap → open AlarmActivity
        val tapIntent = Intent(this, AlarmActivity::class.java).apply {
            putExtra(AlarmScheduler.EXTRA_ALARM_ID, alarm.id)
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val tapPending = PendingIntent.getActivity(
            this, baseCode + 2, tapIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        // Full-screen intent — shows AlarmActivity over the lock screen.
        // CRITICAL: Use FLAG_CANCEL_CURRENT (not FLAG_UPDATE_CURRENT) so Android always
        // creates a *new* PendingIntent for the full-screen intent on each alarm.
        // With FLAG_UPDATE_CURRENT, the second alarm reused the first alarm's
        // PendingIntent from the OS cache, which had already been consumed/delivered,
        // causing the full-screen intent to be silently skipped for Alarm #2+.
        val fullScreenPending = PendingIntent.getActivity(
            this, baseCode + 3, tapIntent,
            PendingIntent.FLAG_CANCEL_CURRENT or PendingIntent.FLAG_IMMUTABLE,
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
            enableVibration(false) // vibration is handled by startVibration() directly
        }
        nm.createNotificationChannel(channel)
    }
}
