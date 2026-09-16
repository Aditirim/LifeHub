/**
 * useAlarms — React hook for managing the alarm list.
 *
 * Loads alarms from native storage on mount, provides CRUD operations,
 * and handles permission checks.
 */

import { useState, useEffect, useCallback } from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Alarm, AlarmInput,
  getAlarms, scheduleAlarm, cancelAlarm,
  enableAlarm, disableAlarm,
  checkExactAlarmPermission, openExactAlarmSettings,
} from '../native/AlarmModule';

// Settings key for alarm preferences
const ALARM_SETTINGS_KEY = '@lifehub_alarm_settings';

export interface AlarmSettings {
  use24Hour:            boolean;
  defaultSnoozeMinutes: number;
  defaultRingtoneType:  'builtin' | 'device' | 'default';
  defaultRingtoneUri:   string;
  defaultVibration:     boolean;
  gradualVolume:        boolean;
  gradualVolumeDuration:number; // seconds
  showSeconds:          boolean; // clock display
}

export const DEFAULT_ALARM_SETTINGS: AlarmSettings = {
  use24Hour:            false,
  defaultSnoozeMinutes: 10,
  defaultRingtoneType:  'builtin',
  defaultRingtoneUri:   'alarm_classic',
  defaultVibration:     true,
  gradualVolume:        false,
  gradualVolumeDuration:30,
  showSeconds:          true,
};

export function useAlarms() {
  const [alarms,      setAlarms]      = useState<Alarm[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [settings,    setSettings]    = useState<AlarmSettings>(DEFAULT_ALARM_SETTINGS);

  // ── Load alarms + check permission ────────────────────────────────────────

  useEffect(() => {
    loadAll();
    checkPermission();
    loadSettings();
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const list = await getAlarms();
      setAlarms(list.sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute)));
    } catch (e: any) {
      console.warn('useAlarms: loadAll failed:', e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const checkPermission = useCallback(async () => {
    try {
      const granted = await checkExactAlarmPermission();
      setHasPermission(granted);
      if (!granted) {
        Alert.alert(
          'Alarm Permission Required',
          'LifeHub needs permission to schedule exact alarms. Tap "Settings" to grant it.',
          [
            { text: 'Later', style: 'cancel' },
            { text: 'Settings', onPress: () => openExactAlarmSettings() },
          ],
        );
      }
    } catch (e) {
      setHasPermission(true); // Assume OK if check fails (API < 31)
    }
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(ALARM_SETTINGS_KEY);
      if (raw) setSettings({ ...DEFAULT_ALARM_SETTINGS, ...JSON.parse(raw) });
    } catch {}
  }, []);

  const saveSettings = useCallback(async (updated: AlarmSettings) => {
    setSettings(updated);
    await AsyncStorage.setItem(ALARM_SETTINGS_KEY, JSON.stringify(updated)).catch(() => {});
  }, []);

  // ── CRUD operations ───────────────────────────────────────────────────────

  const addOrUpdateAlarm = useCallback(async (input: AlarmInput): Promise<Alarm | null> => {
    try {
      const saved = await scheduleAlarm(input);
      await loadAll();
      return saved;
    } catch (e: any) {
      Alert.alert('Error', `Could not save alarm: ${e.message}`);
      return null;
    }
  }, [loadAll]);

  const removeAlarm = useCallback(async (alarmId: string) => {
    try {
      await cancelAlarm(alarmId);
      setAlarms(prev => prev.filter(a => a.id !== alarmId));
    } catch (e: any) {
      Alert.alert('Error', `Could not delete alarm: ${e.message}`);
    }
  }, []);

  const toggleAlarm = useCallback(async (alarm: Alarm) => {
    try {
      if (alarm.enabled) {
        await disableAlarm(alarm.id);
      } else {
        await enableAlarm(alarm.id);
      }
      setAlarms(prev => prev.map(a =>
        a.id === alarm.id ? { ...a, enabled: !a.enabled } : a
      ));
    } catch (e: any) {
      Alert.alert('Error', `Could not toggle alarm: ${e.message}`);
    }
  }, []);

  return {
    alarms,
    loading,
    hasPermission,
    settings,
    loadAll,
    addOrUpdateAlarm,
    removeAlarm,
    toggleAlarm,
    saveSettings,
  };
}
