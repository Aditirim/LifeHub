package com.lifehub.alarm

import android.app.AlarmManager
import android.content.Intent
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Log
import com.facebook.react.bridge.*
import com.lifehub.alarm.AlarmData.Companion.nextFireTimestamp
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

/**
 * AlarmModule — React Native bridge (NativeModule) for the alarm system.
 *
 * This is the single point of contact between the React Native JS layer
 * and the native Android alarm implementation.
 *
 * All public @ReactMethod functions are accessible from JS via:
 *   import { NativeModules } from 'react-native';
 *   const { AlarmModule } = NativeModules;
 *   AlarmModule.scheduleAlarm(alarmJson).then(...);
 *
 * Threading:
 *  - @ReactMethod annotated functions run on the React Native JS thread by default
 *  - We use runOnUiThread / coroutines only where necessary
 *  - All heavy work (storage, scheduling) happens synchronously on the calling thread
 *    since they're non-blocking SharedPreferences operations
 *
 * Error handling:
 *  - All promise.reject() calls include an error code and message
 *  - JS layer should always catch these rejections
 */
class AlarmModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "AlarmModule"
        // Unique timer ID key (persisted in SharedPreferences for cancellation)
        private const val PREFS_TIMER  = "lifehub_timer_prefs"
        private const val KEY_TIMER_ID = "current_timer_id"
    }

    override fun getName(): String = "AlarmModule"

    // ── Preview player (for ringtone preview in UI) ──────────────────────────
    private var previewPlayer: MediaPlayer? = null

    // ══════════════════════════════════════════════════════════════════════════
    // ALARM CRUD
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * Create or update an alarm.
     * Expects a JSON string representing an AlarmData object.
     * If an alarm with the same ID already exists, it is cancelled and replaced.
     * Resolves with the alarm's next fire timestamp (epoch ms).
     */
    @ReactMethod
    fun scheduleAlarm(alarmJson: String, promise: Promise) {
        try {
            val json  = JSONObject(alarmJson)
            // Generate a new ID if none provided
            if (!json.has("id") || json.getString("id").isBlank()) {
                json.put("id", UUID.randomUUID().toString())
            }
            json.put("createdAt", json.optLong("createdAt", System.currentTimeMillis()))
            json.put("updatedAt", System.currentTimeMillis())

            val alarm = AlarmData.fromJson(json)

            // Cancel any existing alarm with this ID first
            AlarmScheduler.cancel(reactContext, alarm.id)

            // Persist
            AlarmStorage.save(reactContext, alarm)

            // Schedule if enabled
            val nextFire: Long
            if (alarm.enabled) {
                nextFire = alarm.nextFireTimestamp()
                AlarmScheduler.schedule(reactContext, alarm, nextFire)
                Log.d(TAG, "Scheduled alarm ${alarm.id} '${alarm.label}' at $nextFire")
            } else {
                nextFire = alarm.nextFireTimestamp() // still compute for UI info
                Log.d(TAG, "Saved disabled alarm ${alarm.id}")
            }

            // Return the updated alarm JSON with the computed next fire time
            val result = alarm.toJson().apply { put("nextFireTimestamp", nextFire) }
            promise.resolve(result.toString())
        } catch (e: Exception) {
            Log.e(TAG, "scheduleAlarm error: ${e.message}", e)
            promise.reject("SCHEDULE_ERROR", e.message ?: "Failed to schedule alarm", e)
        }
    }

    /**
     * Cancel and delete an alarm by ID.
     */
    @ReactMethod
    fun cancelAlarm(alarmId: String, promise: Promise) {
        try {
            AlarmScheduler.cancel(reactContext, alarmId)
            AlarmStorage.delete(reactContext, alarmId)
            Log.d(TAG, "Cancelled alarm $alarmId")
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("CANCEL_ERROR", e.message, e)
        }
    }

    /**
     * Enable an existing disabled alarm. Re-schedules it.
     */
    @ReactMethod
    fun enableAlarm(alarmId: String, promise: Promise) {
        try {
            val alarm = AlarmStorage.getById(reactContext, alarmId)
                ?: return promise.reject("NOT_FOUND", "Alarm $alarmId not found")
            val updated = alarm.copy(enabled = true, updatedAt = System.currentTimeMillis())
            AlarmStorage.save(reactContext, updated)
            val nextFire = updated.nextFireTimestamp()
            AlarmScheduler.schedule(reactContext, updated, nextFire)
            promise.resolve(nextFire.toString())
        } catch (e: Exception) {
            promise.reject("ENABLE_ERROR", e.message, e)
        }
    }

    /**
     * Disable an existing alarm without deleting it.
     */
    @ReactMethod
    fun disableAlarm(alarmId: String, promise: Promise) {
        try {
            AlarmScheduler.cancel(reactContext, alarmId)
            AlarmStorage.setEnabled(reactContext, alarmId, false)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("DISABLE_ERROR", e.message, e)
        }
    }

    /**
     * Return all persisted alarms as a JSON array string.
     */
    @ReactMethod
    fun getAlarms(promise: Promise) {
        try {
            val alarms = AlarmStorage.getAll(reactContext)
            val arr    = JSONArray()
            alarms.forEach { alarm ->
                val obj = alarm.toJson()
                obj.put("nextFireTimestamp", alarm.nextFireTimestamp())
                arr.put(obj)
            }
            promise.resolve(arr.toString())
        } catch (e: Exception) {
            promise.reject("GET_ERROR", e.message, e)
        }
    }

    /**
     * Reschedule all enabled alarms (called after settings change, etc.).
     */
    @ReactMethod
    fun rescheduleAllAlarms(promise: Promise) {
        try {
            var count = 0
            AlarmStorage.getAll(reactContext).filter { it.enabled }.forEach { alarm ->
                AlarmScheduler.cancel(reactContext, alarm.id)
                AlarmScheduler.schedule(reactContext, alarm)
                count++
            }
            promise.resolve(count)
        } catch (e: Exception) {
            promise.reject("RESCHEDULE_ERROR", e.message, e)
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // SNOOZE / DISMISS (called from JS after user interaction in AlarmActivity)
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * Snooze the currently firing alarm.
     * Stops the service and schedules a snooze re-alarm.
     */
    @ReactMethod
    fun snoozeAlarm(alarmId: String, snoozeMinutes: Int, promise: Promise) {
        try {
            reactContext.stopService(Intent(reactContext, AlarmService::class.java))

            val alarm = AlarmStorage.getById(reactContext, alarmId) ?: run {
                promise.resolve(null); return
            }
            val snoozeMs   = snoozeMinutes * 60 * 1000L
            val snoozeData = alarm.copy(
                id         = "${alarmId}_snooze_${System.currentTimeMillis()}",
                enabled    = true,
                repeatDays = emptyList(),
                updatedAt  = System.currentTimeMillis(),
            )
            AlarmStorage.save(reactContext, snoozeData)
            AlarmScheduler.schedule(reactContext, snoozeData, System.currentTimeMillis() + snoozeMs)
            promise.resolve(snoozeData.id)
        } catch (e: Exception) {
            promise.reject("SNOOZE_ERROR", e.message, e)
        }
    }

    /**
     * Dismiss the currently firing alarm. Stops ringtone.
     */
    @ReactMethod
    fun dismissAlarm(alarmId: String, promise: Promise) {
        try {
            reactContext.stopService(Intent(reactContext, AlarmService::class.java))
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("DISMISS_ERROR", e.message, e)
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // TIMER
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * Schedule a native timer notification after [durationMs] milliseconds.
     * Returns the timer ID for later cancellation.
     */
    @ReactMethod
    fun scheduleTimer(durationMs: Double, label: String, promise: Promise) {
        try {
            val timerId = "timer_${System.currentTimeMillis()}"
            AlarmScheduler.scheduleTimer(reactContext, timerId, label, durationMs.toLong())
            // Persist timer ID for cancellation
            reactContext.getSharedPreferences(PREFS_TIMER, 0)
                .edit().putString(KEY_TIMER_ID, timerId).apply()
            promise.resolve(timerId)
        } catch (e: Exception) {
            promise.reject("TIMER_ERROR", e.message, e)
        }
    }

    /**
     * Cancel a pending timer by ID.
     */
    @ReactMethod
    fun cancelTimer(timerId: String, promise: Promise) {
        try {
            AlarmScheduler.cancelTimer(reactContext, timerId)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("TIMER_CANCEL_ERROR", e.message, e)
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // PERMISSIONS
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * Check if the app can schedule exact alarms (Android 12+).
     * Returns true if permission is granted or API < 31.
     */
    @ReactMethod
    fun checkExactAlarmPermission(promise: Promise) {
        promise.resolve(AlarmScheduler.canScheduleExactAlarms(reactContext))
    }

    /**
     * Open system settings for exact alarm permission (Android 12+).
     * On older versions, this is a no-op.
     */
    @ReactMethod
    fun openExactAlarmSettings(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val intent = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM).apply {
                    data = Uri.parse("package:${reactContext.packageName}")
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                }
                reactContext.startActivity(intent)
            }
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("SETTINGS_ERROR", e.message, e)
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // RINGTONE PREVIEW
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * Preview a ringtone. [ringtoneRef] is either a raw resource name (builtin)
     * or a content:// URI string (device).
     */
    @ReactMethod
    fun previewRingtone(ringtoneRef: String, isBuiltin: Boolean, promise: Promise) {
        try {
            stopRingtonePreviewInternal()

            val uri: Uri = if (isBuiltin) {
                val resId = reactContext.resources.getIdentifier(ringtoneRef, "raw", reactContext.packageName)
                if (resId != 0) {
                    Uri.parse("android.resource://${reactContext.packageName}/$resId")
                } else {
                    RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
                }
            } else if (ringtoneRef.isNotBlank()) {
                Uri.parse(ringtoneRef)
            } else {
                RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
            }

            previewPlayer = MediaPlayer().apply {
                setDataSource(reactContext, uri)
                isLooping = false
                setOnCompletionListener { it.release(); previewPlayer = null }
                prepare()
                start()
            }
            promise.resolve(null)
        } catch (e: Exception) {
            Log.e(TAG, "previewRingtone error: ${e.message}")
            promise.reject("PREVIEW_ERROR", e.message, e)
        }
    }

    /**
     * Stop any currently playing ringtone preview.
     */
    @ReactMethod
    fun stopRingtonePreview(promise: Promise) {
        stopRingtonePreviewInternal()
        promise.resolve(null)
    }

    private fun stopRingtonePreviewInternal() {
        try {
            previewPlayer?.let {
                if (it.isPlaying) it.stop()
                it.release()
            }
            previewPlayer = null
        } catch (_: Exception) {}
    }

    // ══════════════════════════════════════════════════════════════════════════
    // BUILT-IN RINGTONE LIST
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * Returns the list of built-in ringtone names as a JSON array string.
     */
    @ReactMethod
    fun getBuiltinRingtones(promise: Promise) {
        val ringtones = listOf("alarm_classic", "alarm_morning", "alarm_gentle", "alarm_digital", "alarm_sunrise")
        val arr = JSONArray(ringtones)
        promise.resolve(arr.toString())
    }

    // ══════════════════════════════════════════════════════════════════════════
    // MODULE INVALIDATION
    // ══════════════════════════════════════════════════════════════════════════

    override fun invalidate() {
        stopRingtonePreviewInternal()
        super.invalidate()
    }
}
