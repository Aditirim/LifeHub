package com.lifehub.alarm

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject

/**
 * AlarmStorage — thread-safe persistence of all alarms.
 *
 * Stores alarm JSON in SharedPreferences under key "alarms" as a JSON array.
 * All public methods are synchronised to prevent race conditions when
 * AlarmReceiver and AlarmModule run on different threads.
 *
 * SharedPreferences file: "lifehub_alarms"
 */
object AlarmStorage {

    private const val PREFS_NAME  = "lifehub_alarms"
    private const val KEY_ALARMS  = "alarms"

    private fun prefs(context: Context): SharedPreferences =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    // ── Read ─────────────────────────────────────────────────────────────────

    @Synchronized
    fun getAll(context: Context): List<AlarmData> {
        val json = prefs(context).getString(KEY_ALARMS, "[]") ?: "[]"
        return try {
            val arr = JSONArray(json)
            (0 until arr.length()).mapNotNull {
                runCatching { AlarmData.fromJson(arr.getJSONObject(it)) }.getOrNull()
            }
        } catch (e: Exception) {
            emptyList()
        }
    }

    @Synchronized
    fun getById(context: Context, id: String): AlarmData? =
        getAll(context).firstOrNull { it.id == id }

    // ── Write ─────────────────────────────────────────────────────────────────

    /**
     * Save or replace an alarm. If an alarm with the same ID exists, it is replaced.
     */
    @Synchronized
    fun save(context: Context, alarm: AlarmData) {
        val list = getAll(context).filter { it.id != alarm.id }.toMutableList()
        list.add(alarm)
        persist(context, list)
    }

    /**
     * Remove an alarm by ID. No-op if not found.
     */
    @Synchronized
    fun delete(context: Context, id: String) {
        val list = getAll(context).filter { it.id != id }
        persist(context, list)
    }

    /**
     * Update only the `enabled` flag for an alarm.
     */
    @Synchronized
    fun setEnabled(context: Context, id: String, enabled: Boolean) {
        val alarm = getById(context, id) ?: return
        save(context, alarm.copy(enabled = enabled, updatedAt = System.currentTimeMillis()))
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    private fun persist(context: Context, alarms: List<AlarmData>) {
        val arr = JSONArray()
        alarms.forEach { arr.put(it.toJson()) }
        prefs(context).edit().putString(KEY_ALARMS, arr.toString()).apply()
    }
}
