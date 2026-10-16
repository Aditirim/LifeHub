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
 * AlarmService — foreground service responsible for both Alarm and Timer
 * audio playback, vibration, wake-lock, and foreground notification management.
 *
 * Capabilities:
 *  1. Foreground service: immune to Android background execution / Doze kills.
 *  2. High-importance notification with full-screen intent over lock screen.
 *  3. Continuous looping ringtone on AudioManager.STREAM_ALARM with audio focus.
 *  4. Direct activity launch attempt (if screen is active or overlay permission granted).
 *  5. Auto-dismiss timeout (5 mins) to prevent indefinite battery drain if unattended.
 */
class AlarmService : Service() {

    companion object {
        private const val TAG = "AlarmService"

        const val CHANNEL_ID_ALARM       = "lifehub_alarm_v3"
        const val CHANNEL_ID_TIMER       = "lifehub_timer_v3"
        const val TIMER_NOTIF_ID         = 9001

        /** Intent actions */
        const val ACTION_STOP_ALARM      = "com.duodevs.lifehub.STOP_ALARM"
        const val ACTION_SNOOZE_ALARM    = "com.duodevs.lifehub.SNOOZE_ALARM"
        const val ACTION_STOP_TIMER      = "com.duodevs.lifehub.STOP_TIMER"
        const val ACTION_START_TIMER     = "com.duodevs.lifehub.START_TIMER"
        const val ACTION_ALARM_DISMISSED = "com.duodevs.lifehub.ALARM_DISMISSED"
        const val ACTION_TIMER_DISMISSED = "com.duodevs.lifehub.TIMER_DISMISSED"

        /** Auto-dismiss after 5 minutes if user doesn't interact */
        private const val MAX_ALARM_DURATION_MS = 5 * 60 * 1000L

        /** Current alarm being played — used by AlarmActivity */
        @Volatile var currentAlarmId: String? = null
        @Volatile var isTimerRunning: Boolean = false

        fun notifIdForAlarm(alarmId: String): Int = 10_000 + (alarmId.hashCode() and 0x7FFFF)

        /**
         * Create high-importance notification channels for alarms and timers.
         */
        fun createChannels(context: Context) {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
            val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

            // Remove legacy channels if they exist to force clean settings
            runCatching {
                nm.deleteNotificationChannel("lifehub_alarm_v2")
                nm.deleteNotificationChannel("lifehub_timer_v2")
            }

            // 1. Alarm channel
            if (nm.getNotificationChannel(CHANNEL_ID_ALARM) == null) {
                val alarmChannel = NotificationChannel(
                    CHANNEL_ID_ALARM,
                    "Alarms",
                    NotificationManager.IMPORTANCE_HIGH,
                ).apply {
                    description = "Active alarm ringing notifications"
                    setBypassDnd(true)
                    lockscreenVisibility = Notification.VISIBILITY_PUBLIC
                    enableVibration(true)
                    vibrationPattern = longArrayOf(0, 500, 250, 500)
                    setSound(null, null) // Handled by MediaPlayer via STREAM_ALARM
                }
                nm.createNotificationChannel(alarmChannel)
            }

            // 2. Timer channel
            if (nm.getNotificationChannel(CHANNEL_ID_TIMER) == null) {
                val timerChannel = NotificationChannel(
                    CHANNEL_ID_TIMER,
                    "Timers",
                    NotificationManager.IMPORTANCE_HIGH,
                ).apply {
                    description = "Timer completion notifications"
                    setBypassDnd(true)
                    lockscreenVisibility = Notification.VISIBILITY_PUBLIC
                    enableVibration(true)
                    vibrationPattern = longArrayOf(0, 500, 250, 500)
                    setSound(null, null) // Handled by MediaPlayer via STREAM_ALARM
                }
                nm.createNotificationChannel(timerChannel)
            }
        }

        // Backward compatibility method
        fun createChannel(context: Context) {
            createChannels(context)
        }
    }

    private var currentNotifId = 10_000
    private var isCurrentTimer = false
    private var currentTimerId: String? = null
    private var currentTimerLabel: String? = null

    private var mediaPlayer: MediaPlayer? = null
    private var preparingPlayer: MediaPlayer? = null
    private var vibrator: Vibrator? = null
    private var audioManager: AudioManager? = null
    private var audioFocusRequest: AudioFocusRequest? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private val handler = Handler(Looper.getMainLooper())
    private val autoDismissRunnable = Runnable { stopSelf() }

    inner class LocalBinder : Binder() {
        fun getService(): AlarmService = this@AlarmService
    }
    private val binder = LocalBinder()
    override fun onBind(intent: Intent?): IBinder = binder

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
        val action = intent?.action
        Log.d(TAG, "onStartCommand action=$action")

        when (action) {
            ACTION_STOP_ALARM -> {
                stopAlarm()
                stopSelf()
                return START_NOT_STICKY
            }
            ACTION_STOP_TIMER -> {
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

        val isTimerExtra = intent?.getBooleanExtra(TimerReceiver.EXTRA_IS_TIMER, false) == true
                || intent?.hasExtra(AlarmScheduler.EXTRA_TIMER_ID) == true
                || action == ACTION_START_TIMER

        createChannels(this)

        if (isTimerExtra) {
            handleStartTimer(intent)
        } else {
            handleStartAlarm(intent)
        }

        return START_NOT_STICKY
    }

    private fun handleStartTimer(intent: Intent?) {
        isCurrentTimer = true
        isTimerRunning = true
        val timerId = intent?.getStringExtra(AlarmScheduler.EXTRA_TIMER_ID) ?: "timer_${System.currentTimeMillis()}"
        val label   = intent?.getStringExtra(AlarmScheduler.EXTRA_TIMER_LABEL) ?: "Timer"

        currentTimerId    = timerId
        currentTimerLabel = label
        currentNotifId    = TIMER_NOTIF_ID

        Log.d(TAG, "Starting foreground service for timer: $timerId '$label'")

        val notification = buildTimerNotification(timerId, label)
        startServiceForeground(currentNotifId, notification)

        // Ensure notification is posted via NotificationManager as well
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.notify(currentNotifId, notification)

        // Try direct launch if overlay permission or screen interactive
        tryDirectActivityLaunch(isTimer = true, id = timerId, label = label)

        requestAlarmAudioFocus()
        playDefaultAlarmSoundLoop()
        startVibration()

        handler.removeCallbacks(autoDismissRunnable)
        handler.postDelayed(autoDismissRunnable, MAX_ALARM_DURATION_MS)
    }

    private fun handleStartAlarm(intent: Intent?) {
        isCurrentTimer = false
        isTimerRunning = false
        val alarmId = intent?.getStringExtra(AlarmScheduler.EXTRA_ALARM_ID) ?: run {
            Log.e(TAG, "Started with no alarm ID")
            stopSelf()
            return
        }

        currentAlarmId = alarmId
        currentNotifId = notifIdForAlarm(alarmId)

        val alarm = AlarmStorage.getById(this, alarmId) ?: run {
            Log.e(TAG, "Alarm $alarmId not found in storage")
            stopSelf()
            return
        }

        Log.d(TAG, "Starting foreground service for alarm: $alarmId '${alarm.label}'")

        val notification = buildAlarmNotification(alarm)
        startServiceForeground(currentNotifId, notification)

        // Ensure notification is posted via NotificationManager as well
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.notify(currentNotifId, notification)

        // Try direct launch if overlay permission or screen interactive
        tryDirectActivityLaunch(isTimer = false, id = alarmId, label = alarm.label)

        requestAlarmAudioFocus()
        playRingtone(alarm)
        if (alarm.vibrationEnabled) startVibration()

        handler.removeCallbacks(autoDismissRunnable)
        handler.postDelayed(autoDismissRunnable, MAX_ALARM_DURATION_MS)
    }

    private fun startServiceForeground(notifId: Int, notification: Notification) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(notifId, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
            } else {
                startForeground(notifId, notification)
            }
        } catch (e: Exception) {
            Log.e(TAG, "startForeground error: ${e.message}", e)
        }
    }

    private fun tryDirectActivityLaunch(isTimer: Boolean, id: String, label: String) {
        try {
            val activityIntent = Intent(this, AlarmActivity::class.java).apply {
                if (isTimer) {
                    action = "com.duodevs.lifehub.TIMER_DIRECT_${id}"
                    data = Uri.parse("lifehub://timer/direct/${id}")
                    putExtra(TimerReceiver.EXTRA_IS_TIMER, true)
                    putExtra(AlarmScheduler.EXTRA_TIMER_ID, id)
                    putExtra(AlarmScheduler.EXTRA_TIMER_LABEL, label)
                } else {
                    action = "com.duodevs.lifehub.ALARM_DIRECT_${id}"
                    data = Uri.parse("lifehub://alarm/direct/${id}")
                    putExtra(AlarmScheduler.EXTRA_ALARM_ID, id)
                }
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                        Intent.FLAG_ACTIVITY_CLEAR_TOP or
                        Intent.FLAG_ACTIVITY_SINGLE_TOP
            }
            startActivity(activityIntent)
            Log.d(TAG, "Direct startActivity succeeded for ${if (isTimer) "timer" else "alarm"} $id")
        } catch (e: Exception) {
            Log.d(TAG, "Direct launch suppressed (normal if lockscreen/BAL restriction): ${e.message}")
        }
    }

    override fun onDestroy() {
        stopAlarm()
        releaseWakeLock()
        super.onDestroy()
    }

    // ── Audio Focus ──────────────────────────────────────────────────────────

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
                .setOnAudioFocusChangeListener { } // Hold focus
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

    // ── Audio Playback ────────────────────────────────────────────────────────

    private fun playDefaultAlarmSoundLoop() {
        try {
            mediaPlayer?.release()
            mediaPlayer = null

            val defaultUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
                ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)

            val mp = MediaPlayer()
            preparingPlayer = mp
            val attrs = AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .setLegacyStreamType(AudioManager.STREAM_ALARM)
                .build()
            mp.setAudioAttributes(attrs)
            mp.setDataSource(applicationContext, defaultUri)
            mp.isLooping = true

            mp.setOnPreparedListener { player ->
                preparingPlayer = null
                mediaPlayer = player
                player.setVolume(1.0f, 1.0f)
                player.start()
                Log.d(TAG, "Timer alarm sound loop playing")
            }
            mp.setOnErrorListener { _, what, extra ->
                preparingPlayer = null
                Log.e(TAG, "Timer MediaPlayer error: what=$what extra=$extra")
                mp.release()
                mediaPlayer = null
                true
            }
            mp.prepareAsync()
        } catch (e: Exception) {
            preparingPlayer = null
            Log.e(TAG, "Failed to play timer sound loop: ${e.message}", e)
        }
    }

    private fun playRingtone(alarm: AlarmData) {
        val ringtoneUri = resolveRingtoneUri(alarm)
        val uriToPlay = ringtoneUri
            ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)

        try {
            val mp = MediaPlayer()
            preparingPlayer = mp
            val attrs = AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .setLegacyStreamType(AudioManager.STREAM_ALARM)
                .build()
            mp.setAudioAttributes(attrs)
            mp.setDataSource(applicationContext, uriToPlay)
            mp.isLooping = true

            mp.setOnPreparedListener { player ->
                preparingPlayer = null
                if (currentAlarmId == null && !isTimerRunning) {
                    player.release()
                    return@setOnPreparedListener
                }
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
            playFallbackRingtone()
        }
    }

    private fun rampVolume(durationSeconds: Int) {
        val steps    = 20
        val stepMs   = (durationSeconds * 1000L) / steps
        val stepSize = 0.9f / steps

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

    private fun playFallbackRingtone() {
        try {
            mediaPlayer?.release()
            mediaPlayer = null

            val defaultUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
            val mp = MediaPlayer()
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

    private fun resolveRingtoneUri(alarm: AlarmData): Uri? {
        return when (alarm.ringtoneType) {
            "builtin" -> {
                val resName = alarm.ringtoneUri.ifBlank { "alarm_classic" }
                val resId   = resources.getIdentifier(resName, "raw", packageName)
                if (resId != 0) {
                    Uri.parse("android.resource://$packageName/$resId")
                } else {
                    Log.w(TAG, "Built-in ringtone '$resName' not found, using system default")
                    null
                }
            }
            "device" -> {
                if (alarm.ringtoneUri.isNotBlank()) {
                    runCatching { Uri.parse(alarm.ringtoneUri) }.getOrElse { null }
                } else null
            }
            else -> null
        }
    }

    // ── Vibration ─────────────────────────────────────────────────────────────

    private fun startVibration() {
        try {
            val pattern = longArrayOf(0, 500, 250, 500)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val vm = getSystemService(VIBRATOR_MANAGER_SERVICE) as VibratorManager
                vibrator = vm.defaultVibrator
            } else {
                @Suppress("DEPRECATION")
                vibrator = getSystemService(VIBRATOR_SERVICE) as Vibrator
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator?.vibrate(VibrationEffect.createWaveform(pattern, 0))
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
        isTimerRunning = false
        currentTimerId = null
        currentTimerLabel = null

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
            nm.cancel(TIMER_NOTIF_ID)
        } catch (e: Exception) {
            Log.e(TAG, "Error cancelling notification: ${e.message}")
        }

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

        // Notify AlarmActivity to finish
        try {
            sendBroadcast(Intent(ACTION_ALARM_DISMISSED).setPackage(packageName))
            sendBroadcast(Intent(ACTION_TIMER_DISMISSED).setPackage(packageName))
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

    // ── Notifications ─────────────────────────────────────────────────────────

    private fun buildAlarmNotification(alarm: AlarmData): Notification {
        val baseCode = alarm.id.hashCode() and 0x7FFF

        // Stop action
        val dismissIntent = Intent(this, AlarmReceiver::class.java).apply {
            action = ACTION_STOP_ALARM
            data = Uri.parse("lifehub://alarm/stop/${alarm.id}")
            putExtra(AlarmScheduler.EXTRA_ALARM_ID, alarm.id)
            `package` = packageName
        }
        val dismissPending = PendingIntent.getBroadcast(
            this, baseCode, dismissIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        // Snooze action
        val snoozeIntent = Intent(this, AlarmReceiver::class.java).apply {
            action = ACTION_SNOOZE_ALARM
            data = Uri.parse("lifehub://alarm/snooze/${alarm.id}")
            putExtra(AlarmScheduler.EXTRA_ALARM_ID, alarm.id)
            `package` = packageName
        }
        val snoozePending = PendingIntent.getBroadcast(
            this, baseCode + 1, snoozeIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        // Tap
        val tapIntent = Intent(this, AlarmActivity::class.java).apply {
            action = "com.duodevs.lifehub.ALARM_TAP_${alarm.id}"
            data = Uri.parse("lifehub://alarm/tap/${alarm.id}")
            putExtra(AlarmScheduler.EXTRA_ALARM_ID, alarm.id)
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                    Intent.FLAG_ACTIVITY_CLEAR_TOP or
                    Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val tapPending = PendingIntent.getActivity(
            this, baseCode + 2, tapIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        // Full-screen intent
        val fullScreenIntent = Intent(this, AlarmActivity::class.java).apply {
            action = "com.duodevs.lifehub.ALARM_FULL_SCREEN_${alarm.id}"
            data = Uri.parse("lifehub://alarm/fullscreen/${alarm.id}")
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

        return NotificationCompat.Builder(this, CHANNEL_ID_ALARM)
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

    private fun buildTimerNotification(timerId: String, label: String): Notification {
        // Stop action
        val stopIntent = Intent(this, TimerReceiver::class.java).apply {
            action = ACTION_STOP_TIMER
            putExtra(AlarmScheduler.EXTRA_TIMER_ID, timerId)
            `package` = packageName
        }
        val stopPending = PendingIntent.getBroadcast(
            this,
            TIMER_NOTIF_ID + 1,
            stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        // Tap
        val tapIntent = Intent(this, AlarmActivity::class.java).apply {
            action = "com.duodevs.lifehub.TIMER_TAP_${timerId}"
            data = Uri.parse("lifehub://timer/tap/${timerId}")
            putExtra(TimerReceiver.EXTRA_IS_TIMER, true)
            putExtra(AlarmScheduler.EXTRA_TIMER_ID, timerId)
            putExtra(AlarmScheduler.EXTRA_TIMER_LABEL, label)
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                    Intent.FLAG_ACTIVITY_CLEAR_TOP or
                    Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val tapPending = PendingIntent.getActivity(
            this,
            TIMER_NOTIF_ID + 2,
            tapIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        // Full-screen intent
        val fullScreenIntent = Intent(this, AlarmActivity::class.java).apply {
            action = "com.duodevs.lifehub.TIMER_FULL_SCREEN_${timerId}"
            data = Uri.parse("lifehub://timer/fullscreen/${timerId}")
            putExtra(TimerReceiver.EXTRA_IS_TIMER, true)
            putExtra(AlarmScheduler.EXTRA_TIMER_ID, timerId)
            putExtra(AlarmScheduler.EXTRA_TIMER_LABEL, label)
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                    Intent.FLAG_ACTIVITY_CLEAR_TOP or
                    Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val fullScreenPending = PendingIntent.getActivity(
            this,
            TIMER_NOTIF_ID + 3,
            fullScreenIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        return NotificationCompat.Builder(this, CHANNEL_ID_TIMER)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("⏱️ Timer Done!")
            .setContentText(label)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setAutoCancel(false)
            .setContentIntent(tapPending)
            .setFullScreenIntent(fullScreenPending, true)
            .addAction(0, "Stop", stopPending)
            .build()
    }
}
