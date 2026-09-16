package com.lifehub.alarm

import org.json.JSONArray
import org.json.JSONObject

/**
 * AlarmData — the canonical data model for a single alarm.
 *
 * This is the single source of truth shared between:
 *  - AlarmStorage (persistence in SharedPreferences)
 *  - AlarmScheduler (AlarmManager scheduling)
 *  - AlarmReceiver / AlarmActivity (display and playback)
 *  - AlarmModule (React Native bridge)
 *
 * Ringtone handling:
 *  - ringtoneType = "builtin"  → ringtoneUri is the raw resource name (e.g. "alarm_classic")
 *  - ringtoneType = "device"   → ringtoneUri is a content:// URI string
 *  - ringtoneType = "default"  → uses RingtoneManager.getDefaultUri(TYPE_ALARM)
 *
 * repeatDays: 0=Sunday, 1=Monday, ..., 6=Saturday (matches Android Calendar constants).
 * Empty list = one-time alarm (fires once, does NOT auto re-enable).
 */
data class AlarmData(
    val id: String,
    val hour: Int,           // 0-23
    val minute: Int,         // 0-59
    val enabled: Boolean,
    val label: String,
    val repeatDays: List<Int>,          // empty = one-time; [1,2,3,4,5] = weekdays
    val ringtoneType: String,           // "builtin" | "device" | "default"
    val ringtoneUri: String,            // resource name or content:// URI
    val vibrationEnabled: Boolean,
    val snoozeMinutes: Int,             // 5, 10, 15, 20, 30
    val gradualVolumeEnabled: Boolean,
    val gradualVolumeDuration: Int,     // seconds: 30, 60, 120
    val createdAt: Long,
    val updatedAt: Long,
) {
    fun toJson(): JSONObject = JSONObject().apply {
        put("id",                    id)
        put("hour",                  hour)
        put("minute",                minute)
        put("enabled",               enabled)
        put("label",                 label)
        put("repeatDays",            JSONArray(repeatDays))
        put("ringtoneType",          ringtoneType)
        put("ringtoneUri",           ringtoneUri)
        put("vibrationEnabled",      vibrationEnabled)
        put("snoozeMinutes",         snoozeMinutes)
        put("gradualVolumeEnabled",  gradualVolumeEnabled)
        put("gradualVolumeDuration", gradualVolumeDuration)
        put("createdAt",             createdAt)
        put("updatedAt",             updatedAt)
    }

    companion object {
        fun fromJson(json: JSONObject): AlarmData {
            val daysArray = json.optJSONArray("repeatDays") ?: JSONArray()
            val days = (0 until daysArray.length()).map { daysArray.getInt(it) }
            return AlarmData(
                id                   = json.getString("id"),
                hour                 = json.getInt("hour"),
                minute               = json.getInt("minute"),
                enabled              = json.getBoolean("enabled"),
                label                = json.optString("label", "Alarm"),
                repeatDays           = days,
                ringtoneType         = json.optString("ringtoneType", "default"),
                ringtoneUri          = json.optString("ringtoneUri", ""),
                vibrationEnabled     = json.optBoolean("vibrationEnabled", true),
                snoozeMinutes        = json.optInt("snoozeMinutes", 10),
                gradualVolumeEnabled = json.optBoolean("gradualVolumeEnabled", false),
                gradualVolumeDuration= json.optInt("gradualVolumeDuration", 30),
                createdAt            = json.optLong("createdAt", System.currentTimeMillis()),
                updatedAt            = json.optLong("updatedAt", System.currentTimeMillis()),
            )
        }

        /**
         * Calculate the next fire timestamp (epoch ms) for this alarm.
         * For one-time alarms: today if time hasn't passed, else tomorrow.
         * For repeating: finds the next matching weekday at the alarm's hour:minute.
         *
         * @param fromMs  Reference time in epoch ms (usually System.currentTimeMillis())
         */
        fun AlarmData.nextFireTimestamp(fromMs: Long = System.currentTimeMillis()): Long {
            val cal = java.util.Calendar.getInstance().apply {
                timeInMillis = fromMs
                set(java.util.Calendar.HOUR_OF_DAY, hour)
                set(java.util.Calendar.MINUTE, minute)
                set(java.util.Calendar.SECOND, 0)
                set(java.util.Calendar.MILLISECOND, 0)
            }
            if (repeatDays.isEmpty()) {
                // One-time: if the time is in the past (or now), push to tomorrow
                if (cal.timeInMillis <= fromMs) {
                    cal.add(java.util.Calendar.DAY_OF_YEAR, 1)
                }
                return cal.timeInMillis
            }
            // Repeating: find the nearest matching day
            for (offset in 0..7) {
                val candidate = java.util.Calendar.getInstance().apply {
                    timeInMillis = fromMs
                    add(java.util.Calendar.DAY_OF_YEAR, offset)
                    set(java.util.Calendar.HOUR_OF_DAY, hour)
                    set(java.util.Calendar.MINUTE, minute)
                    set(java.util.Calendar.SECOND, 0)
                    set(java.util.Calendar.MILLISECOND, 0)
                }
                val dayOfWeek = candidate.get(java.util.Calendar.DAY_OF_WEEK) - 1 // 0=Sun
                if (dayOfWeek in repeatDays && candidate.timeInMillis > fromMs) {
                    return candidate.timeInMillis
                }
            }
            // Fallback (shouldn't happen if repeatDays is non-empty)
            return cal.timeInMillis + 7L * 24 * 60 * 60 * 1000
        }
    }
}
