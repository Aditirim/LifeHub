/**
 * AlarmSettingsScreen — Global alarm and clock preferences.
 *
 * Persisted to AsyncStorage under '@lifehub_alarm_settings'.
 * Read by ClockScreen, CreateEditAlarmScreen, and useAlarms.
 */

import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Switch, Alert,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';

import { useTheme } from '../../context/ThemeContext';
import { SPACING, RADIUS } from '../../constants/spacing';
import { FONT_SIZE } from '../../constants/typography';
import { BUILTIN_RINGTONES } from '../../native/AlarmModule';
import {
  AlarmSettings, DEFAULT_ALARM_SETTINGS,
} from '../../hooks/useAlarms';
import { rescheduleAllAlarms, openExactAlarmSettings, checkExactAlarmPermission } from '../../native/AlarmModule';

const SETTINGS_KEY = '@lifehub_alarm_settings';

export default function AlarmSettingsScreen() {
  const { colors } = useTheme();
  const nav        = useNavigation();
  const [settings, setSettings] = useState<AlarmSettings>(DEFAULT_ALARM_SETTINGS);
  const [hasExactPerm, setHasExactPerm] = useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(SETTINGS_KEY).then(raw => {
      if (raw) setSettings({ ...DEFAULT_ALARM_SETTINGS, ...JSON.parse(raw) });
    }).catch(() => {});

    checkExactAlarmPermission().then(setHasExactPerm).catch(() => setHasExactPerm(true));
  }, []);

  async function update(patch: Partial<AlarmSettings>) {
    const updated = { ...settings, ...patch };
    setSettings(updated);
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(updated)).catch(() => {});
  }

  async function handleReschedule() {
    try {
      const count = await rescheduleAllAlarms();
      Alert.alert('Done', `Rescheduled ${count} alarm(s).`);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  }

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.scroll}>

      {/* Exact alarm permission banner */}
      {hasExactPerm === false && (
        <TouchableOpacity
          onPress={() => openExactAlarmSettings()}
          style={[styles.permBanner, { backgroundColor: '#F97316' + '22', borderColor: '#F97316' }]}>
          <Icon name="alert-circle-outline" size={20} color="#F97316" />
          <Text style={[styles.permText, { color: '#F97316' }]}>
            Exact alarm permission not granted. Tap to open Settings.
          </Text>
        </TouchableOpacity>
      )}

      {/* ── Clock Display ───────────────────────────────────────── */}
      <SectionHeader title="Clock Display" colors={colors} />

      <SettingRow colors={colors}>
        <Text style={[styles.settingLabel, { color: colors.text }]}>24-hour format</Text>
        <Switch
          value={settings.use24Hour}
          onValueChange={v => update({ use24Hour: v })}
          trackColor={{ false: colors.border, true: colors.primary + '88' }}
          thumbColor={settings.use24Hour ? colors.primary : colors.textMuted}
        />
      </SettingRow>

      <SettingRow colors={colors}>
        <Text style={[styles.settingLabel, { color: colors.text }]}>Show seconds</Text>
        <Switch
          value={settings.showSeconds}
          onValueChange={v => update({ showSeconds: v })}
          trackColor={{ false: colors.border, true: colors.primary + '88' }}
          thumbColor={settings.showSeconds ? colors.primary : colors.textMuted}
        />
      </SettingRow>

      {/* ── Alarm Defaults ──────────────────────────────────────── */}
      <SectionHeader title="Alarm Defaults" colors={colors} />

      <SettingRow colors={colors} label="Default snooze duration">
        <View style={styles.chipRow}>
          {[5, 10, 15, 20, 30].map(m => (
            <TouchableOpacity
              key={m}
              onPress={() => update({ defaultSnoozeMinutes: m })}
              style={[styles.chip, {
                borderColor:     m === settings.defaultSnoozeMinutes ? colors.primary : colors.border,
                backgroundColor: m === settings.defaultSnoozeMinutes ? colors.primary + '22' : colors.card,
              }]}>
              <Text style={[styles.chipText, {
                color: m === settings.defaultSnoozeMinutes ? colors.primary : colors.textSecondary,
              }]}>{m}m</Text>
            </TouchableOpacity>
          ))}
        </View>
      </SettingRow>

      <SettingRow colors={colors} label="Default ringtone">
        <View style={styles.chipRow}>
          <TouchableOpacity
            onPress={() => update({ defaultRingtoneType: 'default', defaultRingtoneUri: '' })}
            style={[styles.chip, {
              borderColor: settings.defaultRingtoneType === 'default' ? colors.primary : colors.border,
              backgroundColor: settings.defaultRingtoneType === 'default' ? colors.primary + '22' : colors.card,
            }]}>
            <Text style={[styles.chipText, {
              color: settings.defaultRingtoneType === 'default' ? colors.primary : colors.textSecondary,
            }]}>Default</Text>
          </TouchableOpacity>
          {BUILTIN_RINGTONES.map(r => (
            <TouchableOpacity
              key={r.id}
              onPress={() => update({ defaultRingtoneType: 'builtin', defaultRingtoneUri: r.id })}
              style={[styles.chip, {
                borderColor: settings.defaultRingtoneType === 'builtin' && settings.defaultRingtoneUri === r.id
                  ? colors.primary : colors.border,
                backgroundColor: settings.defaultRingtoneType === 'builtin' && settings.defaultRingtoneUri === r.id
                  ? colors.primary + '22' : colors.card,
              }]}>
              <Text style={[styles.chipText, {
                color: settings.defaultRingtoneType === 'builtin' && settings.defaultRingtoneUri === r.id
                  ? colors.primary : colors.textSecondary,
              }]}>{r.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </SettingRow>

      <SettingRow colors={colors}>
        <Text style={[styles.settingLabel, { color: colors.text }]}>Vibration by default</Text>
        <Switch
          value={settings.defaultVibration}
          onValueChange={v => update({ defaultVibration: v })}
          trackColor={{ false: colors.border, true: colors.primary + '88' }}
          thumbColor={settings.defaultVibration ? colors.primary : colors.textMuted}
        />
      </SettingRow>

      {/* ── Volume ──────────────────────────────────────────────── */}
      <SectionHeader title="Volume" colors={colors} />

      <SettingRow colors={colors}>
        <Text style={[styles.settingLabel, { color: colors.text }]}>Gradually increase volume</Text>
        <Switch
          value={settings.gradualVolume}
          onValueChange={v => update({ gradualVolume: v })}
          trackColor={{ false: colors.border, true: colors.primary + '88' }}
          thumbColor={settings.gradualVolume ? colors.primary : colors.textMuted}
        />
      </SettingRow>

      {settings.gradualVolume && (
        <SettingRow colors={colors} label="Volume ramp duration">
          <View style={styles.chipRow}>
            {[30, 60, 120].map(s => (
              <TouchableOpacity
                key={s}
                onPress={() => update({ gradualVolumeDuration: s })}
                style={[styles.chip, {
                  borderColor:     s === settings.gradualVolumeDuration ? colors.primary : colors.border,
                  backgroundColor: s === settings.gradualVolumeDuration ? colors.primary + '22' : colors.card,
                }]}>
                <Text style={[styles.chipText, {
                  color: s === settings.gradualVolumeDuration ? colors.primary : colors.textSecondary,
                }]}>{s}s</Text>
              </TouchableOpacity>
            ))}
          </View>
        </SettingRow>
      )}

      {/* ── Maintenance ─────────────────────────────────────────── */}
      <SectionHeader title="Maintenance" colors={colors} />

      <TouchableOpacity
        onPress={handleReschedule}
        style={[styles.actionBtn, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Icon name="refresh" size={18} color={colors.primary} />
        <Text style={[styles.actionText, { color: colors.text }]}>Reschedule all alarms</Text>
      </TouchableOpacity>

      {hasExactPerm === false && (
        <TouchableOpacity
          onPress={() => openExactAlarmSettings()}
          style={[styles.actionBtn, { backgroundColor: colors.card, borderColor: '#F97316' }]}>
          <Icon name="cog" size={18} color="#F97316" />
          <Text style={[styles.actionText, { color: '#F97316' }]}>Grant exact alarm permission</Text>
        </TouchableOpacity>
      )}

      <Text style={[styles.note, { color: colors.textMuted }]}>
        Note: Alarm volume is controlled by your device's alarm volume setting. Use the physical volume buttons while an alarm is ringing to adjust.
      </Text>
    </ScrollView>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ title, colors }: { title: string; colors: any }) {
  return (
    <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
      {title.toUpperCase()}
    </Text>
  );
}

function SettingRow({ children, colors, label }: { children: React.ReactNode; colors: any; label?: string }) {
  return (
    <View style={[styles.settingRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {label && <Text style={[styles.settingLabel, { color: colors.text, marginBottom: SPACING[2] }]}>{label}</Text>}
      {children}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scroll: { padding: SPACING[4], paddingBottom: 40 },

  permBanner: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING[3],
    borderRadius: RADIUS.lg, borderWidth: 1, padding: SPACING[4], marginBottom: SPACING[4],
  },
  permText: { fontSize: FONT_SIZE.sm, flex: 1 },

  sectionTitle: {
    fontSize: FONT_SIZE.xs, fontWeight: '700', letterSpacing: 1,
    marginBottom: SPACING[2], marginTop: SPACING[5],
  },

  settingRow: {
    borderRadius: RADIUS.lg, borderWidth: 1,
    paddingHorizontal: SPACING[4], paddingVertical: SPACING[4],
    marginBottom: SPACING[2],
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap',
  },
  settingLabel: { fontSize: FONT_SIZE.base, flex: 1 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING[2] },
  chip: {
    paddingHorizontal: SPACING[4], paddingVertical: SPACING[2],
    borderRadius: RADIUS.full, borderWidth: 1,
  },
  chipText: { fontSize: FONT_SIZE.sm, fontWeight: '600' },

  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING[3],
    borderRadius: RADIUS.lg, borderWidth: 1,
    padding: SPACING[4], marginBottom: SPACING[3],
  },
  actionText: { fontSize: FONT_SIZE.base },

  note: { fontSize: FONT_SIZE.xs, lineHeight: 18, marginTop: SPACING[4] },
});
