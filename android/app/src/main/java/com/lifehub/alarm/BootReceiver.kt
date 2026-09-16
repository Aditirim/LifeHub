package com.lifehub.alarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.lifehub.alarm.AlarmData.Companion.nextFireTimestamp

/**
 * BootReceiver — restores all enabled alarms after device reboot.
 *
 * Android cancels all AlarmManager alarms on reboot.
 * This receiver is triggered by BOOT_COMPLETED and QUICKBOOT_POWERON,
 * reloads all enabled alarms from SharedPreferences, and reschedules them.
 *
 * Declared in AndroidManifest.xml with RECEIVE_BOOT_COMPLETED permission.
 *
 * Note: On Android 12+, broadcast receivers from killed apps may be delayed.
 * AlarmManager alarms are still reliably restored even after a reboot
 * because BootReceiver runs as soon as the system permits.
 */
class BootReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "BootReceiver"
    }

    override fun onReceive(context: Context, intent: Intent) {
        val validActions = setOf(
            Intent.ACTION_BOOT_COMPLETED,
            "android.intent.action.QUICKBOOT_POWERON",
            "com.htc.intent.action.QUICKBOOT_POWERON",
        )
        if (intent.action !in validActions) return

        Log.d(TAG, "Boot completed — restoring alarms")

        val alarms = AlarmStorage.getAll(context)
        var rescheduled = 0

        alarms.filter { it.enabled }.forEach { alarm ->
            try {
                val nextFire = alarm.nextFireTimestamp()
                AlarmScheduler.schedule(context, alarm, nextFire)
                rescheduled++
                Log.d(TAG, "Restored alarm ${alarm.id} '${alarm.label}' → $nextFire")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to restore alarm ${alarm.id}: ${e.message}")
            }
        }

        Log.d(TAG, "Boot restore complete: $rescheduled of ${alarms.size} alarms rescheduled")
    }
}
