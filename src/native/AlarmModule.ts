/**
 * AlarmModule.ts — TypeScript bridge to the native Android AlarmModule.
 *
 * All functions here call the Kotlin AlarmModule via NativeModules.
 * The native module name is "AlarmModule" as returned by getName() in Kotlin.
 *
 * All async operations return Promises. Always handle rejections in the UI layer.
 *
 * On non-Android platforms (iOS, web preview), all functions no-op gracefully.
 */

import { NativeModules, Platform } from 'react-native';

// ─── Types ────────────────────────────────────────────────────────────────────

export type RingtoneType = 'builtin' | 'device' | 'default';

export interface Alarm {
  id: string;
  hour: number;            // 0–23
  minute: number;          // 0–59
  enabled: boolean;
  label: string;
  repeatDays: number[];    // 0=Sun, 1=Mon, ..., 6=Sat. Empty = one-time.
  ringtoneType: RingtoneType;
  ringtoneUri: string;     // builtin: resource name; device: content:// URI
  vibrationEnabled: boolean;
  snoozeMinutes: number;   // 5, 10, 15, 20, 30
  gradualVolumeEnabled: boolean;
  gradualVolumeDuration: number; // seconds
  createdAt: number;
  updatedAt: number;
  nextFireTimestamp?: number; // computed by native layer
}

export type AlarmInput = Omit<Alarm, 'id' | 'createdAt' | 'updatedAt' | 'nextFireTimestamp'> & {
  id?: string;
};

// ─── Built-in ringtone definitions ───────────────────────────────────────────

export const BUILTIN_RINGTONES: { id: string; label: string }[] = [
  { id: 'alarm_classic', label: 'Classic' },
  { id: 'alarm_morning', label: 'Morning' },
  { id: 'alarm_gentle',  label: 'Gentle'  },
  { id: 'alarm_digital', label: 'Digital' },
  { id: 'alarm_sunrise', label: 'Sunrise' },
];

export function getRingtoneLabel(type: RingtoneType, uri: string): string {
  if (type === 'builtin') {
    return BUILTIN_RINGTONES.find(r => r.id === uri)?.label ?? uri;
  }
  if (type === 'device') return 'Custom';
  return 'Default';
}

// ─── Repeat day helpers ───────────────────────────────────────────────────────

export const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const WEEKDAYS   = [1, 2, 3, 4, 5];
export const WEEKENDS   = [0, 6];
export const EVERY_DAY  = [0, 1, 2, 3, 4, 5, 6];

export function repeatDaysLabel(days: number[]): string {
  if (days.length === 0) return 'Once';
  if (days.length === 7) return 'Every day';
  if (days.every(d => WEEKDAYS.includes(d)) && days.length === 5) return 'Weekdays';
  if (days.every(d => WEEKENDS.includes(d)) && days.length === 2) return 'Weekends';
  return days.map(d => DAY_LABELS[d]).join(' ');
}

// ─── Native module access ─────────────────────────────────────────────────────

const { AlarmModule: NativeAlarmModule } = NativeModules;

/**
 * Check if the native module is available.
 * It will be null on iOS or when running in a JS-only environment.
 */
function isAvailable(): boolean {
  return Platform.OS === 'android' && NativeAlarmModule != null;
}

function unavailable(): Promise<never> {
  return Promise.reject(new Error('AlarmModule not available on this platform'));
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Create or update an alarm.
 * Returns the saved alarm (with native-computed nextFireTimestamp).
 */
export async function scheduleAlarm(alarm: AlarmInput): Promise<Alarm> {
  if (!isAvailable()) throw new Error('AlarmModule not available');
  const now = Date.now();
  const payload = {
    id:                    alarm.id ?? '',
    hour:                  alarm.hour,
    minute:                alarm.minute,
    enabled:               alarm.enabled,
    label:                 alarm.label,
    repeatDays:            alarm.repeatDays,
    ringtoneType:          alarm.ringtoneType,
    ringtoneUri:           alarm.ringtoneUri,
    vibrationEnabled:      alarm.vibrationEnabled,
    snoozeMinutes:         alarm.snoozeMinutes,
    gradualVolumeEnabled:  alarm.gradualVolumeEnabled,
    gradualVolumeDuration: alarm.gradualVolumeDuration,
    createdAt:             now,
    updatedAt:             now,
  };
  const result = await NativeAlarmModule.scheduleAlarm(JSON.stringify(payload));
  return JSON.parse(result) as Alarm;
}

/**
 * Cancel and permanently delete an alarm.
 */
export async function cancelAlarm(alarmId: string): Promise<void> {
  if (!isAvailable()) return;
  await NativeAlarmModule.cancelAlarm(alarmId);
}

/**
 * Enable a disabled alarm (re-schedules it).
 */
export async function enableAlarm(alarmId: string): Promise<void> {
  if (!isAvailable()) return;
  await NativeAlarmModule.enableAlarm(alarmId);
}

/**
 * Disable an alarm without deleting it.
 */
export async function disableAlarm(alarmId: string): Promise<void> {
  if (!isAvailable()) return;
  await NativeAlarmModule.disableAlarm(alarmId);
}

/**
 * Load all alarms from native storage.
 */
export async function getAlarms(): Promise<Alarm[]> {
  if (!isAvailable()) return [];
  const json = await NativeAlarmModule.getAlarms();
  return JSON.parse(json) as Alarm[];
}

/**
 * Reschedule all enabled alarms (e.g., after settings change).
 */
export async function rescheduleAllAlarms(): Promise<number> {
  if (!isAvailable()) return 0;
  return NativeAlarmModule.rescheduleAllAlarms();
}

/**
 * Snooze the currently firing alarm.
 * Returns the ID of the snooze alarm that was scheduled.
 */
export async function snoozeAlarm(alarmId: string, snoozeMinutes: number): Promise<string> {
  if (!isAvailable()) return '';
  return NativeAlarmModule.snoozeAlarm(alarmId, snoozeMinutes);
}

/**
 * Dismiss the currently firing alarm (stops ringtone).
 */
export async function dismissAlarm(alarmId: string): Promise<void> {
  if (!isAvailable()) return;
  await NativeAlarmModule.dismissAlarm(alarmId);
}

// ── Timer ─────────────────────────────────────────────────────────────────────

/**
 * Schedule a native timer notification after [durationMs] milliseconds.
 * Returns the timer ID.
 */
export async function scheduleTimer(durationMs: number, label: string): Promise<string> {
  if (!isAvailable()) return 'mock_timer';
  return NativeAlarmModule.scheduleTimer(durationMs, label);
}

/**
 * Cancel a pending timer notification.
 */
export async function cancelTimer(timerId: string): Promise<void> {
  if (!isAvailable()) return;
  await NativeAlarmModule.cancelTimer(timerId);
}

// ── Permissions ───────────────────────────────────────────────────────────────

/**
 * Check if exact alarm scheduling is permitted.
 * Returns true on API < 31 (no restriction), or if granted on API 31+.
 */
export async function checkExactAlarmPermission(): Promise<boolean> {
  if (!isAvailable()) return true;
  return NativeAlarmModule.checkExactAlarmPermission();
}

/**
 * Open the system settings page for exact alarm permission (Android 12+).
 */
export async function openExactAlarmSettings(): Promise<void> {
  if (!isAvailable()) return;
  await NativeAlarmModule.openExactAlarmSettings();
}

// ── Ringtone preview ──────────────────────────────────────────────────────────

/**
 * Preview a ringtone in the alarm settings UI.
 * @param ringtoneRef  Resource name (builtin) or content:// URI (device)
 * @param isBuiltin    True for built-in ringtones, false for device URIs
 */
export async function previewRingtone(ringtoneRef: string, isBuiltin: boolean): Promise<void> {
  if (!isAvailable()) return;
  await NativeAlarmModule.previewRingtone(ringtoneRef, isBuiltin);
}

/**
 * Stop the current ringtone preview.
 */
export async function stopRingtonePreview(): Promise<void> {
  if (!isAvailable()) return;
  await NativeAlarmModule.stopRingtonePreview();
}
