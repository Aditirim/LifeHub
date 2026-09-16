/**
 * ClockScreen — 4-tab clock hub: Clock | Stopwatch | Timer | Alarms
 *
 * Architecture notes:
 *  - Clock:     live setInterval display only (no persistence needed)
 *  - Stopwatch: timestamp-based via useStopwatch hook (AsyncStorage persisted)
 *  - Timer:     absolute targetTimestamp via useTimer hook (native notification on end)
 *  - Alarms:    managed by native AlarmModule via useAlarms hook
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Switch, Alert, Animated,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { format } from 'date-fns';

import { useTheme } from '../../context/ThemeContext';
import { SPACING, RADIUS } from '../../constants/spacing';
import { FONT_SIZE, FONT_WEIGHT } from '../../constants/typography';
import { ConfirmDialog } from '../../components';
import { MainStackParamList } from '../../navigation/types';
import { useAlarms, DEFAULT_ALARM_SETTINGS } from '../../hooks/useAlarms';
import { useStopwatch } from '../../hooks/useStopwatch';
import { useTimer } from '../../hooks/useTimer';
import { Alarm, repeatDaysLabel, getRingtoneLabel } from '../../native/AlarmModule';
import { formatStopwatch, formatCountdown } from '../../utils/formatters';
import AsyncStorage from '@react-native-async-storage/async-storage';

type Nav = NativeStackNavigationProp<MainStackParamList>;
type ClockTab = 'clock' | 'stopwatch' | 'timer' | 'alarms';

const TAB_ICONS: Record<ClockTab, string> = {
  clock:     'clock-outline',
  stopwatch: 'timer-outline',
  timer:     'timer-sand',
  alarms:    'alarm',
};

const SETTINGS_KEY = '@lifehub_alarm_settings';

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function ClockScreen() {
  const { colors } = useTheme();
  const [activeTab, setActiveTab] = useState<ClockTab>('clock');
  const [use24Hour, setUse24Hour] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(SETTINGS_KEY).then(raw => {
      if (raw) {
        const s = JSON.parse(raw);
        if (s.use24Hour !== undefined) setUse24Hour(s.use24Hour);
      }
    }).catch(() => {});
  }, []);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Tab bar */}
      <View style={[styles.tabBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {(['clock', 'stopwatch', 'timer', 'alarms'] as ClockTab[]).map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && { backgroundColor: colors.primary }]}
            onPress={() => setActiveTab(tab)}>
            <Icon
              name={TAB_ICONS[tab]}
              size={16}
              color={activeTab === tab ? '#FFF' : colors.textSecondary}
            />
            <Text style={[styles.tabLabel, { color: activeTab === tab ? '#FFF' : colors.textSecondary }]}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {activeTab === 'clock'     && <ClockTabView     colors={colors} use24Hour={use24Hour} />}
      {activeTab === 'stopwatch' && <StopwatchTabView colors={colors} />}
      {activeTab === 'timer'     && <TimerTabView     colors={colors} />}
      {activeTab === 'alarms'    && <AlarmsTabView    colors={colors} use24Hour={use24Hour} />}
    </View>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// CLOCK TAB
// ══════════════════════════════════════════════════════════════════════════════

function ClockTabView({ colors, use24Hour }: { colors: any; use24Hour: boolean }) {
  const [now, setNow] = useState(new Date());
  const [showSeconds, setShowSeconds] = useState(true);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const timeFormat = use24Hour
    ? (showSeconds ? 'HH:mm:ss' : 'HH:mm')
    : (showSeconds ? 'hh:mm:ss' : 'hh:mm');

  return (
    <LinearGradient colors={['#0D0D1A', '#1A1A2E']} style={styles.fullCenter}>
      {/* AM/PM badge */}
      {!use24Hour && (
        <View style={[styles.ampmBadge, { backgroundColor: 'rgba(124,58,237,0.25)' }]}>
          <Text style={styles.ampmText}>{format(now, 'a')}</Text>
        </View>
      )}

      {/* Digital clock */}
      <Text style={styles.digitalClock}>{format(now, timeFormat)}</Text>

      <Text style={[styles.clockDate, { color: 'rgba(255,255,255,0.55)' }]}>
        {format(now, 'EEEE, MMMM d, yyyy')}
      </Text>

      {/* Seconds toggle */}
      <TouchableOpacity
        onPress={() => setShowSeconds(v => !v)}
        style={[styles.secondsToggle, { backgroundColor: 'rgba(124,58,237,0.15)' }]}>
        <Text style={{ color: '#A78BFA', fontSize: FONT_SIZE.sm }}>
          {showSeconds ? 'Hide seconds' : 'Show seconds'}
        </Text>
      </TouchableOpacity>
    </LinearGradient>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// STOPWATCH TAB
// ══════════════════════════════════════════════════════════════════════════════

function StopwatchTabView({ colors }: { colors: any }) {
  const { elapsed, running, laps, start, pause, reset, lap } = useStopwatch();

  // Calculate lap deltas
  const lapDeltas = laps.map((lapMs, i) => lapMs - (i > 0 ? laps[i - 1] : 0));

  // Find fastest / slowest lap for highlighting
  const minDelta = lapDeltas.length > 0 ? Math.min(...lapDeltas) : -1;
  const maxDelta = lapDeltas.length > 0 ? Math.max(...lapDeltas) : -1;

  return (
    <ScrollView contentContainerStyle={styles.centered}>
      {/* Circular display */}
      <LinearGradient colors={['#16213E', '#0D0D1A']} style={styles.circleDisplay}>
        <Text style={styles.stopwatchTime}>{formatStopwatch(elapsed)}</Text>
        {laps.length > 0 && (
          <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: FONT_SIZE.sm, marginTop: 4 }}>
            Lap {laps.length + 1}
          </Text>
        )}
      </LinearGradient>

      {/* Controls */}
      <View style={styles.controlRow}>
        <TouchableOpacity
          onPress={running ? lap : reset}
          style={[styles.roundBtn, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.roundBtnText, { color: colors.text }]}>
            {running ? 'Lap' : 'Reset'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={running ? pause : start}
          style={[styles.mainBtn, { backgroundColor: running ? '#EF4444' : '#10B981' }]}>
          <Icon name={running ? 'pause' : 'play'} size={32} color="#FFF" />
        </TouchableOpacity>

        <View style={[styles.roundBtn, { borderColor: 'transparent' }]} />
      </View>

      {/* Lap list */}
      {laps.length > 0 && (
        <View style={{ width: '100%' }}>
          <View style={[styles.lapHeader, { borderColor: colors.border }]}>
            <Text style={[styles.lapHeaderText, { color: colors.textSecondary }]}>Lap</Text>
            <Text style={[styles.lapHeaderText, { color: colors.textSecondary }]}>+Time</Text>
            <Text style={[styles.lapHeaderText, { color: colors.textSecondary }]}>Total</Text>
          </View>
          {[...laps].reverse().map((lapTotal, revIdx) => {
            const i       = laps.length - 1 - revIdx;
            const delta   = lapDeltas[i];
            const isFast  = lapDeltas.length > 1 && delta === minDelta;
            const isSlow  = lapDeltas.length > 1 && delta === maxDelta;
            const rowColor = isFast ? '#10B981' : isSlow ? '#EF4444' : colors.text;
            return (
              <View key={i} style={[styles.lapRow, { borderColor: colors.border }]}>
                <Text style={[styles.lapLabel, { color: rowColor }]}>Lap {i + 1}</Text>
                <Text style={[styles.lapTime, { color: rowColor }]}>{formatStopwatch(delta)}</Text>
                <Text style={[styles.lapTime, { color: colors.textSecondary }]}>{formatStopwatch(lapTotal)}</Text>
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TIMER TAB
// ══════════════════════════════════════════════════════════════════════════════

const TIMER_PRESETS = [
  { label: '1m',  ms: 60_000 },
  { label: '3m',  ms: 180_000 },
  { label: '5m',  ms: 300_000 },
  { label: '10m', ms: 600_000 },
  { label: '15m', ms: 900_000 },
  { label: '20m', ms: 1_200_000 },
  { label: '25m', ms: 1_500_000 },
  { label: '30m', ms: 1_800_000 },
];

function TimerTabView({ colors }: { colors: any }) {
  const { status, remaining, totalMs, progress, start, pause, resume, reset } = useTimer();
  const [inputMins, setInputMins] = useState('05');
  const [inputSecs, setInputSecs] = useState('00');
  const progressAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: progress,
      duration: 500,
      useNativeDriver: false,
    }).start();
  }, [progress]);

  const isIdle = status === 'idle';
  const isDone = status === 'done';
  const isRunning = status === 'running';
  const isPaused  = status === 'paused';

  function handleStart() {
    const mins  = parseInt(inputMins, 10) || 0;
    const secs  = parseInt(inputSecs, 10) || 0;
    const total = (mins * 60 + secs) * 1000;
    if (total === 0) { Alert.alert('Set Duration', 'Please set a timer duration first.'); return; }
    start(total, `${mins}m ${secs}s timer`);
  }

  function handlePreset(ms: number) {
    start(ms, `${TIMER_PRESETS.find(p => p.ms === ms)?.label ?? ''} timer`);
  }

  const displaySecs = Math.ceil(remaining / 1000);
  const displayStr  = (isIdle || isDone) ? '00:00' : formatCountdown(displaySecs);

  // Circumference-based progress ring
  const RING_R = 110;
  const CIRC   = 2 * Math.PI * RING_R;

  return (
    <ScrollView contentContainerStyle={[styles.centered, { paddingBottom: 24 }]}>
      {/* Timer ring */}
      <View style={styles.timerRingContainer}>
        <LinearGradient colors={['#16213E', '#0D0D1A']} style={styles.timerCircle}>
          <Text style={styles.timerRemaining}>{displayStr}</Text>
          {!isIdle && !isDone && (
            <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: FONT_SIZE.sm }}>
              {Math.round(progress * 100)}%
            </Text>
          )}
          {isDone && (
            <Text style={{ color: '#10B981', fontSize: FONT_SIZE.base, fontWeight: '600' }}>
              Done! ✓
            </Text>
          )}
        </LinearGradient>
      </View>

      {/* Preset buttons — only shown when idle */}
      {isIdle && (
        <>
          <View style={styles.presetRow}>
            {TIMER_PRESETS.map(p => (
              <TouchableOpacity
                key={p.ms}
                onPress={() => handlePreset(p.ms)}
                style={[styles.presetBtn, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.presetLabel, { color: colors.primary }]}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Custom input */}
          <View style={styles.timerInputRow}>
            <View style={[styles.timerInputBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text
                style={[styles.timerInputNum, { color: colors.text }]}
                onPress={() => {}}>
                {inputMins}
              </Text>
              <Text style={[styles.timerUnit, { color: colors.textSecondary }]}>min</Text>
            </View>
            <Text style={[styles.timerColon, { color: colors.text }]}>:</Text>
            <View style={[styles.timerInputBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.timerInputNum, { color: colors.text }]}>{inputSecs}</Text>
              <Text style={[styles.timerUnit, { color: colors.textSecondary }]}>sec</Text>
            </View>
          </View>
        </>
      )}

      {/* Controls */}
      <View style={styles.controlRow}>
        {(!isIdle) && (
          <TouchableOpacity
            onPress={reset}
            style={[styles.roundBtn, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.roundBtnText, { color: colors.text }]}>Reset</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          onPress={isRunning ? pause : isPaused ? resume : handleStart}
          style={[styles.mainBtn, { backgroundColor: isRunning ? '#EF4444' : colors.primary }]}>
          <Icon
            name={isRunning ? 'pause' : isDone ? 'refresh' : 'play'}
            size={32}
            color="#FFF"
          />
        </TouchableOpacity>

        {!isIdle && <View style={[styles.roundBtn, { borderColor: 'transparent' }]} />}
      </View>
    </ScrollView>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ALARMS TAB
// ══════════════════════════════════════════════════════════════════════════════

function AlarmsTabView({ colors, use24Hour }: { colors: any; use24Hour: boolean }) {
  const nav = useNavigation<Nav>();
  const { alarms, loading, toggleAlarm, removeAlarm, loadAll } = useAlarms();
  const [deleteTarget, setDeleteTarget] = useState<Alarm | null>(null);
  const [confirmVis,   setConfirmVis]   = useState(false);

  // Refresh when screen focuses (after edit/create)
  useEffect(() => {
    const unsubscribe = nav.addListener('focus', loadAll);
    return unsubscribe;
  }, [nav, loadAll]);

  function formatAlarmTime(alarm: Alarm): string {
    const date = new Date();
    date.setHours(alarm.hour, alarm.minute, 0, 0);
    return format(date, use24Hour ? 'HH:mm' : 'hh:mm');
  }

  function formatAmPm(alarm: Alarm): string {
    const date = new Date();
    date.setHours(alarm.hour, alarm.minute, 0, 0);
    return format(date, 'a');
  }

  function formatNextFire(alarm: Alarm): string {
    if (!alarm.enabled) return 'Disabled';
    if (!alarm.nextFireTimestamp) return '';
    const diff = alarm.nextFireTimestamp - Date.now();
    if (diff < 0) return '';
    const hrs  = Math.floor(diff / 3_600_000);
    const mins = Math.floor((diff % 3_600_000) / 60_000);
    if (hrs === 0) return `in ${mins}m`;
    return `in ${hrs}h ${mins}m`;
  }

  async function doDelete() {
    if (!deleteTarget) return;
    await removeAlarm(deleteTarget.id);
    setDeleteTarget(null);
    setConfirmVis(false);
  }

  return (
    <View style={{ flex: 1 }}>
      {/* Header row: title + settings gear */}
      <View style={[styles.alarmsHeader, { borderColor: colors.border }]}>
        <Text style={[styles.alarmsTitle, { color: colors.text }]}>Alarms</Text>
        <TouchableOpacity onPress={() => nav.navigate('AlarmSettings')} style={styles.gearBtn}>
          <Icon name="cog-outline" size={22} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.alarmsContent}>
        {loading ? (
          <View style={styles.centered}>
            <Text style={{ color: colors.textMuted }}>Loading…</Text>
          </View>
        ) : alarms.length === 0 ? (
          <View style={[styles.centered, { paddingTop: 60 }]}>
            <Icon name="alarm-off" size={64} color={colors.textMuted} />
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>No alarms set</Text>
            <Text style={[styles.emptySubText, { color: colors.textMuted }]}>Tap + to add an alarm</Text>
          </View>
        ) : (
          alarms.map(alarm => (
            <TouchableOpacity
              key={alarm.id}
              onPress={() => nav.navigate('AlarmEdit', { alarm })}
              onLongPress={() => { setDeleteTarget(alarm); setConfirmVis(true); }}
              style={[
                styles.alarmCard,
                {
                  backgroundColor: colors.card,
                  borderColor: alarm.enabled ? colors.primary + '44' : colors.border,
                  opacity: alarm.enabled ? 1 : 0.6,
                },
              ]}>
              {/* Time + label column */}
              <View style={{ flex: 1 }}>
                <View style={styles.alarmTimeRow}>
                  <Text style={[styles.alarmTime, { color: alarm.enabled ? colors.text : colors.textMuted }]}>
                    {formatAlarmTime(alarm)}
                  </Text>
                  {!use24Hour && (
                    <Text style={[styles.alarmAmPm, { color: alarm.enabled ? colors.primary : colors.textMuted }]}>
                      {formatAmPm(alarm)}
                    </Text>
                  )}
                </View>

                <Text style={[styles.alarmLabel, { color: colors.textSecondary }]}>
                  {alarm.label || 'Alarm'}
                </Text>

                <View style={styles.alarmMeta}>
                  <Text style={[styles.alarmMetaText, { color: colors.textMuted }]}>
                    {repeatDaysLabel(alarm.repeatDays)}
                  </Text>
                  {alarm.ringtoneUri ? (
                    <Text style={[styles.alarmMetaText, { color: colors.textMuted }]}>
                      {'  ·  '}🔔 {getRingtoneLabel(alarm.ringtoneType, alarm.ringtoneUri)}
                    </Text>
                  ) : null}
                </View>

                {alarm.enabled && alarm.nextFireTimestamp ? (
                  <Text style={[styles.alarmNext, { color: colors.primary }]}>
                    {formatNextFire(alarm)}
                  </Text>
                ) : null}
              </View>

              {/* Toggle switch */}
              <Switch
                value={alarm.enabled}
                onValueChange={() => toggleAlarm(alarm)}
                trackColor={{ false: colors.border, true: colors.primary + '88' }}
                thumbColor={alarm.enabled ? colors.primary : colors.textMuted}
              />
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      {/* FAB — add alarm */}
      <TouchableOpacity
        onPress={() => nav.navigate('AlarmEdit', {})}
        style={[styles.fab, { backgroundColor: colors.primary }]}>
        <Icon name="plus" size={28} color="#FFF" />
      </TouchableOpacity>

      <ConfirmDialog
        visible={confirmVis}
        title="Delete Alarm"
        message={`Delete "${deleteTarget?.label}"?`}
        confirmLabel="Delete"
        destructive
        onConfirm={doDelete}
        onCancel={() => { setConfirmVis(false); setDeleteTarget(null); }}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },

  // Tab bar
  tabBar: {
    flexDirection: 'row',
    margin: SPACING[4],
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    padding: 4,
  },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', paddingVertical: SPACING[2],
    borderRadius: RADIUS.md, gap: 4,
  },
  tabLabel: { fontSize: 11, fontWeight: '600' },

  // Shared
  fullCenter: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  centered:   { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: SPACING[4] },

  // Clock
  digitalClock: {
    fontSize: 72, fontWeight: '900', color: '#FFF',
    letterSpacing: -2, fontVariant: ['tabular-nums'],
  },
  clockDate: { fontSize: FONT_SIZE.lg, marginTop: SPACING[2] },
  ampmBadge: {
    marginBottom: SPACING[3], paddingHorizontal: SPACING[5],
    paddingVertical: SPACING[1], borderRadius: RADIUS.full,
  },
  ampmText: { fontSize: FONT_SIZE.base, fontWeight: '700', color: '#A78BFA' },
  secondsToggle: {
    marginTop: SPACING[6], paddingHorizontal: SPACING[5],
    paddingVertical: SPACING[2], borderRadius: RADIUS.full,
  },

  // Stopwatch / Timer shared circle
  circleDisplay: {
    width: 240, height: 240, borderRadius: 120,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: SPACING[8],
  },
  stopwatchTime: {
    fontSize: 40, fontWeight: '700', color: '#FFF', fontVariant: ['tabular-nums'],
  },

  // Timer
  timerRingContainer: { marginBottom: SPACING[6] },
  timerCircle: {
    width: 240, height: 240, borderRadius: 120,
    justifyContent: 'center', alignItems: 'center',
  },
  timerRemaining: {
    fontSize: 48, fontWeight: '900', color: '#FFF', fontVariant: ['tabular-nums'],
  },
  presetRow: {
    flexDirection: 'row', flexWrap: 'wrap',
    justifyContent: 'center', gap: SPACING[2], marginBottom: SPACING[4],
    paddingHorizontal: SPACING[4],
  },
  presetBtn: {
    paddingHorizontal: SPACING[4], paddingVertical: SPACING[2],
    borderRadius: RADIUS.full, borderWidth: 1,
  },
  presetLabel: { fontSize: FONT_SIZE.sm, fontWeight: '600' },
  timerInputRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING[3], marginBottom: SPACING[6] },
  timerInputBox: {
    borderRadius: RADIUS.md, borderWidth: 1, padding: SPACING[4],
    alignItems: 'center', minWidth: 80,
  },
  timerInputNum: { fontSize: FONT_SIZE['3xl'], fontWeight: '700', textAlign: 'center' },
  timerUnit:     { fontSize: FONT_SIZE.sm, marginTop: 2 },
  timerColon:    { fontSize: FONT_SIZE['3xl'], fontWeight: '700' },

  // Controls
  controlRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: SPACING[8], marginBottom: SPACING[6],
  },
  mainBtn: {
    width: 80, height: 80, borderRadius: 40,
    justifyContent: 'center', alignItems: 'center', elevation: 4,
  },
  roundBtn: {
    width: 56, height: 56, borderRadius: 28, borderWidth: 1,
    justifyContent: 'center', alignItems: 'center',
  },
  roundBtnText: { fontSize: FONT_SIZE.sm, fontWeight: '600' },

  // Lap rows
  lapHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: SPACING[2], paddingHorizontal: SPACING[4],
    borderTopWidth: 1,
  },
  lapHeaderText: { fontSize: FONT_SIZE.xs, fontWeight: '600', flex: 1, textAlign: 'center' },
  lapRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: SPACING[3], borderTopWidth: 1, width: '100%',
    paddingHorizontal: SPACING[4],
  },
  lapLabel: { fontSize: FONT_SIZE.base, flex: 1 },
  lapTime:  { fontSize: FONT_SIZE.base, fontWeight: '600', fontVariant: ['tabular-nums'], flex: 1, textAlign: 'center' },

  // Alarms
  alarmsHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING[5], paddingVertical: SPACING[3],
    borderBottomWidth: 1,
  },
  alarmsTitle: { fontSize: FONT_SIZE.xl, fontWeight: '700' },
  gearBtn: { padding: SPACING[2] },
  alarmsContent: { padding: SPACING[4], paddingBottom: 100 },

  alarmCard: {
    flexDirection: 'row', alignItems: 'center', borderRadius: RADIUS.xl,
    borderWidth: 1.5, padding: SPACING[5], marginBottom: SPACING[3], elevation: 2,
  },
  alarmTimeRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  alarmTime: { fontSize: 40, fontWeight: '800', fontVariant: ['tabular-nums'] },
  alarmAmPm: { fontSize: FONT_SIZE.xl, fontWeight: '700', marginBottom: 4 },
  alarmLabel: { fontSize: FONT_SIZE.base, marginTop: 2 },
  alarmMeta: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 },
  alarmMetaText: { fontSize: FONT_SIZE.xs },
  alarmNext: { fontSize: FONT_SIZE.xs, fontWeight: '600', marginTop: 4 },

  emptyText: { fontSize: FONT_SIZE.xl, fontWeight: '700', marginTop: SPACING[4] },
  emptySubText: { fontSize: FONT_SIZE.base, marginTop: SPACING[2] },

  fab: {
    position: 'absolute', bottom: SPACING[6], right: SPACING[5],
    width: 56, height: 56, borderRadius: 28,
    justifyContent: 'center', alignItems: 'center', elevation: 6,
  },
});
