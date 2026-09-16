/**
 * CreateEditAlarmScreen — Full alarm editor.
 *
 * Supports both creating a new alarm and editing an existing one.
 * Route param: { alarm?: Alarm } — undefined = create new.
 *
 * Features:
 *  - Large time picker (hour/minute drums)
 *  - AM/PM selector
 *  - Repeat days (individual day chips + presets)
 *  - Label input
 *  - Built-in ringtone selector with preview
 *  - Vibration toggle
 *  - Snooze duration picker
 *  - Gradual volume toggle
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Switch, Alert, ActivityIndicator,
} from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import DateTimePicker from '@react-native-community/datetimepicker';

import { useTheme } from '../../context/ThemeContext';
import { SPACING, RADIUS } from '../../constants/spacing';
import { FONT_SIZE } from '../../constants/typography';
import { MainStackParamList } from '../../navigation/types';
import {
  Alarm, AlarmInput, BUILTIN_RINGTONES, RingtoneType,
  WEEKDAYS, WEEKENDS, EVERY_DAY, DAY_LABELS,
  previewRingtone, stopRingtonePreview,
} from '../../native/AlarmModule';
import { useAlarms, DEFAULT_ALARM_SETTINGS } from '../../hooks/useAlarms';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { format } from 'date-fns';

type Route = RouteProp<MainStackParamList, 'AlarmEdit'>;
type Nav   = NativeStackNavigationProp<MainStackParamList>;

const SETTINGS_KEY   = '@lifehub_alarm_settings';
const SNOOZE_OPTIONS = [5, 10, 15, 20, 30];

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function CreateEditAlarmScreen() {
  const { colors } = useTheme();
  const route      = useRoute<Route>();
  const nav        = useNavigation<Nav>();
  const { addOrUpdateAlarm } = useAlarms();

  const existing = route.params?.alarm;

  // ── State ──────────────────────────────────────────────────────────────────

  const [alarmDate,          setAlarmDate]          = useState<Date>(() => {
    const d = new Date();
    if (existing) { d.setHours(existing.hour, existing.minute, 0, 0); }
    else          { d.setSeconds(0, 0); }
    return d;
  });
  const [showPicker,         setShowPicker]         = useState(false);
  const [label,              setLabel]              = useState(existing?.label ?? '');
  const [repeatDays,         setRepeatDays]         = useState<number[]>(existing?.repeatDays ?? []);
  const [ringtoneType,       setRingtoneType]       = useState<RingtoneType>(existing?.ringtoneType ?? 'builtin');
  const [ringtoneUri,        setRingtoneUri]        = useState(existing?.ringtoneUri ?? 'alarm_classic');
  const [vibration,          setVibration]          = useState(existing?.vibrationEnabled ?? true);
  const [snoozeMinutes,      setSnoozeMinutes]      = useState(existing?.snoozeMinutes ?? 10);
  const [gradualVolume,      setGradualVolume]      = useState(existing?.gradualVolumeEnabled ?? false);
  const [gradualDuration,    setGradualDuration]    = useState(existing?.gradualVolumeDuration ?? 30);
  const [previewing,         setPreviewing]         = useState(false);
  const [saving,             setSaving]             = useState(false);
  const [use24Hour,          setUse24Hour]          = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(SETTINGS_KEY).then(raw => {
      if (raw) {
        const s = JSON.parse(raw);
        if (s.use24Hour !== undefined) setUse24Hour(s.use24Hour);
      }
    }).catch(() => {});

    return () => { stopRingtonePreview().catch(() => {}); };
  }, []);

  // ── Repeat day helpers ─────────────────────────────────────────────────────

  function toggleDay(day: number) {
    setRepeatDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort()
    );
  }

  function setPreset(days: number[]) {
    const isActive = days.every(d => repeatDays.includes(d)) && repeatDays.length === days.length;
    setRepeatDays(isActive ? [] : [...days]);
  }

  // ── Ringtone preview ───────────────────────────────────────────────────────

  async function togglePreview() {
    if (previewing) {
      await stopRingtonePreview().catch(() => {});
      setPreviewing(false);
    } else {
      setPreviewing(true);
      try {
        await previewRingtone(ringtoneUri, ringtoneType === 'builtin');
      } catch (e: any) {
        Alert.alert('Preview Failed', e.message);
      }
      setPreviewing(false);
    }
  }

  // ── Save ───────────────────────────────────────────────────────────────────

  async function handleSave() {
    const h = alarmDate.getHours();
    const m = alarmDate.getMinutes();

    const input: AlarmInput = {
      ...(existing?.id ? { id: existing.id } : {}),
      hour:                  h,
      minute:                m,
      enabled:               true,
      label:                 label.trim() || 'Alarm',
      repeatDays,
      ringtoneType,
      ringtoneUri,
      vibrationEnabled:      vibration,
      snoozeMinutes,
      gradualVolumeEnabled:  gradualVolume,
      gradualVolumeDuration: gradualDuration,
    } as AlarmInput;

    setSaving(true);
    try {
      await stopRingtonePreview().catch(() => {});
      const saved = await addOrUpdateAlarm(input);
      if (saved) {
        const nextMs  = saved.nextFireTimestamp ?? 0;
        const diff    = nextMs - Date.now();
        const hrs     = Math.floor(diff / 3_600_000);
        const mins    = Math.floor((diff % 3_600_000) / 60_000);
        const infoStr = diff > 0 ? ` (in ${hrs}h ${mins}m)` : '';
        Alert.alert('Alarm Set', `"${saved.label}" will ring at ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}${infoStr}`, [
          { text: 'OK', onPress: () => nav.goBack() },
        ]);
      } else {
        nav.goBack();
      }
    } finally {
      setSaving(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const timeLabel = format(alarmDate, use24Hour ? 'HH:mm' : 'hh:mm a');

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.scroll}
      keyboardShouldPersistTaps="handled">

      {/* ── Time display / picker trigger ─────────────────────────── */}
      <TouchableOpacity
        onPress={() => setShowPicker(true)}
        style={[styles.timeCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.timeBig, { color: colors.text }]}>{timeLabel}</Text>
        <Text style={[styles.timeSub, { color: colors.textSecondary }]}>Tap to change</Text>
      </TouchableOpacity>

      {showPicker && (
        <DateTimePicker
          value={alarmDate}
          mode="time"
          is24Hour={use24Hour}
          display="spinner"
          onChange={(_, date) => {
            setShowPicker(false);
            if (date) setAlarmDate(date);
          }}
        />
      )}

      {/* ── Label ──────────────────────────────────────────────────── */}
      <Section title="Label" colors={colors}>
        <TextInput
          style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
          placeholder="Alarm label (e.g. Wake up)"
          placeholderTextColor={colors.textMuted}
          value={label}
          onChangeText={setLabel}
          returnKeyType="done"
        />
      </Section>

      {/* ── Repeat ─────────────────────────────────────────────────── */}
      <Section title="Repeat" colors={colors}>
        {/* Presets */}
        <View style={styles.chipRow}>
          {[
            { label: 'Every day', days: EVERY_DAY },
            { label: 'Weekdays',  days: WEEKDAYS   },
            { label: 'Weekends',  days: WEEKENDS   },
          ].map(p => {
            const active = p.days.every(d => repeatDays.includes(d)) && repeatDays.length === p.days.length;
            return (
              <TouchableOpacity
                key={p.label}
                onPress={() => setPreset(p.days)}
                style={[styles.chip, { borderColor: active ? colors.primary : colors.border,
                  backgroundColor: active ? colors.primary + '22' : colors.card }]}>
                <Text style={[styles.chipText, { color: active ? colors.primary : colors.textSecondary }]}>
                  {p.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Individual days */}
        <View style={styles.dayRow}>
          {DAY_LABELS.map((day, idx) => {
            const active = repeatDays.includes(idx);
            return (
              <TouchableOpacity
                key={day}
                onPress={() => toggleDay(idx)}
                style={[styles.dayChip, {
                  backgroundColor: active ? colors.primary : colors.card,
                  borderColor:     active ? colors.primary : colors.border,
                }]}>
                <Text style={[styles.dayChipText, { color: active ? '#FFF' : colors.textSecondary }]}>
                  {day[0]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={[styles.repeatHint, { color: colors.textMuted }]}>
          {repeatDays.length === 0
            ? 'One-time alarm'
            : repeatDays.length === 7
            ? 'Repeats every day'
            : `Repeats on ${repeatDays.map(d => DAY_LABELS[d]).join(', ')}`}
        </Text>
      </Section>

      {/* ── Ringtone ───────────────────────────────────────────────── */}
      <Section title="Ringtone" colors={colors}>
        <View style={styles.ringtoneList}>
          {/* Default */}
          <RingtoneOption
            label="Default alarm"
            selected={ringtoneType === 'default'}
            onPress={() => { setRingtoneType('default'); setRingtoneUri(''); }}
            colors={colors}
          />
          {/* Built-ins */}
          {BUILTIN_RINGTONES.map(r => (
            <RingtoneOption
              key={r.id}
              label={r.label}
              selected={ringtoneType === 'builtin' && ringtoneUri === r.id}
              onPress={() => { setRingtoneType('builtin'); setRingtoneUri(r.id); }}
              colors={colors}
            />
          ))}
        </View>

        {/* Preview button */}
        <TouchableOpacity
          onPress={togglePreview}
          style={[styles.previewBtn, { borderColor: colors.primary }]}>
          <Icon name={previewing ? 'stop' : 'play-circle-outline'} size={20} color={colors.primary} />
          <Text style={[styles.previewText, { color: colors.primary }]}>
            {previewing ? 'Stop preview' : 'Preview ringtone'}
          </Text>
        </TouchableOpacity>
      </Section>

      {/* ── Vibration ──────────────────────────────────────────────── */}
      <Section title="Vibration" colors={colors}>
        <ToggleRow label="Vibrate when alarm rings" value={vibration} onToggle={setVibration} colors={colors} />
      </Section>

      {/* ── Snooze ─────────────────────────────────────────────────── */}
      <Section title="Snooze duration" colors={colors}>
        <View style={styles.chipRow}>
          {SNOOZE_OPTIONS.map(m => (
            <TouchableOpacity
              key={m}
              onPress={() => setSnoozeMinutes(m)}
              style={[styles.chip, {
                borderColor:     m === snoozeMinutes ? colors.primary : colors.border,
                backgroundColor: m === snoozeMinutes ? colors.primary + '22' : colors.card,
              }]}>
              <Text style={[styles.chipText, { color: m === snoozeMinutes ? colors.primary : colors.textSecondary }]}>
                {m}m
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </Section>

      {/* ── Gradual volume ─────────────────────────────────────────── */}
      <Section title="Volume" colors={colors}>
        <ToggleRow
          label="Gradually increase volume"
          value={gradualVolume}
          onToggle={setGradualVolume}
          colors={colors}
        />
        {gradualVolume && (
          <View style={styles.chipRow}>
            {[30, 60, 120].map(s => (
              <TouchableOpacity
                key={s}
                onPress={() => setGradualDuration(s)}
                style={[styles.chip, {
                  borderColor:     s === gradualDuration ? colors.primary : colors.border,
                  backgroundColor: s === gradualDuration ? colors.primary + '22' : colors.card,
                }]}>
                <Text style={[styles.chipText, { color: s === gradualDuration ? colors.primary : colors.textSecondary }]}>
                  {s}s
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </Section>

      {/* ── Save button ────────────────────────────────────────────── */}
      <TouchableOpacity
        onPress={handleSave}
        disabled={saving}
        style={[styles.saveBtn, { backgroundColor: colors.primary }]}>
        {saving
          ? <ActivityIndicator color="#FFF" />
          : <Text style={styles.saveBtnText}>{existing ? 'Update Alarm' : 'Set Alarm'}</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Section({ title, colors, children }: { title: string; colors: any; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{title.toUpperCase()}</Text>
      {children}
    </View>
  );
}

function ToggleRow({ label, value, onToggle, colors }: {
  label: string; value: boolean; onToggle: (v: boolean) => void; colors: any;
}) {
  return (
    <View style={[styles.toggleRow, { borderColor: colors.border, backgroundColor: colors.card }]}>
      <Text style={[styles.toggleLabel, { color: colors.text }]}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: colors.border, true: colors.primary + '88' }}
        thumbColor={value ? colors.primary : colors.textMuted}
      />
    </View>
  );
}

function RingtoneOption({ label, selected, onPress, colors }: {
  label: string; selected: boolean; onPress: () => void; colors: any;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.ringtoneRow, { borderColor: colors.border, backgroundColor: colors.card }]}>
      <Icon
        name={selected ? 'radiobox-marked' : 'radiobox-blank'}
        size={20}
        color={selected ? colors.primary : colors.textMuted}
      />
      <Text style={[styles.ringtoneLabel, { color: selected ? colors.text : colors.textSecondary }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scroll: { padding: SPACING[4], paddingBottom: 40 },

  timeCard: {
    borderRadius: RADIUS['2xl'], borderWidth: 1,
    padding: SPACING[8], alignItems: 'center', marginBottom: SPACING[5],
  },
  timeBig: { fontSize: 56, fontWeight: '800', fontVariant: ['tabular-nums'] },
  timeSub: { fontSize: FONT_SIZE.sm, marginTop: SPACING[1] },

  section: { marginBottom: SPACING[5] },
  sectionTitle: { fontSize: FONT_SIZE.xs, fontWeight: '700', letterSpacing: 1, marginBottom: SPACING[2] },

  input: {
    borderRadius: RADIUS.md, borderWidth: 1,
    paddingHorizontal: SPACING[4], paddingVertical: SPACING[3],
    fontSize: FONT_SIZE.base, height: 52,
  },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING[2] },
  chip: {
    paddingHorizontal: SPACING[4], paddingVertical: SPACING[2],
    borderRadius: RADIUS.full, borderWidth: 1,
  },
  chipText: { fontSize: FONT_SIZE.sm, fontWeight: '600' },

  dayRow: { flexDirection: 'row', gap: SPACING[2], marginTop: SPACING[3], marginBottom: SPACING[2] },
  dayChip: {
    width: 40, height: 40, borderRadius: 20, borderWidth: 1,
    justifyContent: 'center', alignItems: 'center',
  },
  dayChipText: { fontSize: FONT_SIZE.sm, fontWeight: '700' },

  repeatHint: { fontSize: FONT_SIZE.xs, marginTop: SPACING[1] },

  ringtoneList: { gap: SPACING[2], marginBottom: SPACING[3] },
  ringtoneRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING[3],
    borderRadius: RADIUS.md, borderWidth: 1, padding: SPACING[3],
  },
  ringtoneLabel: { fontSize: FONT_SIZE.base, flex: 1 },

  previewBtn: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING[2],
    paddingVertical: SPACING[3], paddingHorizontal: SPACING[4],
    borderRadius: RADIUS.md, borderWidth: 1, alignSelf: 'flex-start',
  },
  previewText: { fontSize: FONT_SIZE.sm, fontWeight: '600' },

  toggleRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderRadius: RADIUS.md, borderWidth: 1, padding: SPACING[4],
    marginBottom: SPACING[3],
  },
  toggleLabel: { fontSize: FONT_SIZE.base, flex: 1, marginRight: SPACING[3] },

  saveBtn: {
    borderRadius: RADIUS.lg, paddingVertical: SPACING[5],
    alignItems: 'center', marginTop: SPACING[4],
  },
  saveBtnText: { fontSize: FONT_SIZE.lg, fontWeight: '700', color: '#FFF' },
});
