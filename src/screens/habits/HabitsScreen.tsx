/**
 * HabitsScreen — Habit tracker with streaks and weekly progress.
 *
 * Features:
 *  - List of habits with daily completion toggle
 *  - Streak counter (consecutive days ending today)
 *  - 7-day weekly progress bar (last 7 days)
 *  - FAB → add habit (name + color)
 *  - Long-press → edit/delete habit
 *  - Dashboard shows today's completion ratio (X/Y)
 *
 * Firestore structure: users/{uid}/habits
 *   { name, color, completedDates: string[], createdAt }
 *   completedDates: array of 'YYYY-MM-DD' strings
 */

import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Modal, TextInput, Alert, FlatList,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { format, subDays, isToday } from 'date-fns';

import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import {
  onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, orderBy,
} from '@react-native-firebase/firestore';
import { habitsCollection, db, serverTimestamp } from '../../services/firebase';
import { SPACING, RADIUS } from '../../constants/spacing';
import { FONT_SIZE, FONT_WEIGHT } from '../../constants/typography';
import { HABIT_COLORS } from '../../constants/colors';
import { FAB, ConfirmDialog, EmptyState, LoadingSpinner } from '../../components';
import { formatStreak } from '../../utils/formatters';
import LinearGradient from 'react-native-linear-gradient';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Habit {
  id:             string;
  name:           string;
  color:          string;
  completedDates: string[];  // array of 'YYYY-MM-DD'
  createdAt:      any;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TODAY = format(new Date(), 'yyyy-MM-dd');

/** Calculate the current streak (consecutive days ending today or yesterday). */
function calculateStreak(completedDates: string[]): number {
  if (!completedDates?.length) return 0;
  let streak = 0;
  let checkDate = new Date();

  // Check if today is completed — if not, start from yesterday
  if (!completedDates.includes(format(checkDate, 'yyyy-MM-dd'))) {
    checkDate = subDays(checkDate, 1);
  }

  while (true) {
    const dateStr = format(checkDate, 'yyyy-MM-dd');
    if (completedDates.includes(dateStr)) {
      streak++;
      checkDate = subDays(checkDate, 1);
    } else {
      break;
    }
  }
  return streak;
}

/** Returns the last 7 days as 'YYYY-MM-DD' strings (today last). */
function getLast7Days(): string[] {
  return Array.from({ length: 7 }, (_, i) =>
    format(subDays(new Date(), 6 - i), 'yyyy-MM-dd'),
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function HabitsScreen() {
  const { user }   = useAuth();
  const { colors } = useTheme();
  const uid        = user?.uid ?? '';

  const [habits,       setHabits]       = useState<Habit[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editHabit,    setEditHabit]    = useState<Habit | null>(null);
  const [habitName,    setHabitName]    = useState('');
  const [habitColor,   setHabitColor]   = useState(HABIT_COLORS[0].color);
  const [saving,       setSaving]       = useState(false);

  const [deleteTarget,   setDeleteTarget]   = useState<Habit | null>(null);
  const [confirmVisible, setConfirmVisible] = useState(false);

  const last7Days = getLast7Days();

  // ── Firestore listener ────────────────────────────────────────────────────

  useEffect(() => {
    if (!uid) return;
    const colRef = habitsCollection(uid);
    const q = query(colRef, orderBy('createdAt', 'asc'));
    const unsub = onSnapshot(q,
      snap => {
        setHabits(snap.docs.map((d: any) => ({ id: d.id, ...d.data() } as Habit)));
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsub;
  }, [uid]);

  // ── Mark/Unmark habit for today ───────────────────────────────────────────

  async function toggleToday(habit: Habit) {
    const dates    = habit.completedDates ?? [];
    const isMarked = dates.includes(TODAY);
    const newDates = isMarked
      ? dates.filter(d => d !== TODAY)                           // unmark
      : [...dates, TODAY];                                       // mark

    try {
      const docRef = doc(db, 'users', uid, 'habits', habit.id);
      await updateDoc(docRef, { completedDates: newDates });
    } catch {
      Alert.alert('Error', 'Failed to update habit.');
    }
  }

  // ── CRUD ───────────────────────────────────────────────────────────────────

  function openCreate() {
    setEditHabit(null);
    setHabitName('');
    setHabitColor(HABIT_COLORS[0].color);
    setModalVisible(true);
  }

  function openEdit(h: Habit) {
    setEditHabit(h);
    setHabitName(h.name);
    setHabitColor(h.color);
    setModalVisible(true);
  }

  async function saveHabit() {
    if (!habitName.trim()) { Alert.alert('Error', 'Please enter a habit name.'); return; }
    setSaving(true);
    try {
      if (editHabit) {
        const docRef = doc(db, 'users', uid, 'habits', editHabit.id);
        await updateDoc(docRef, { name: habitName.trim(), color: habitColor });
      } else {
        await addDoc(habitsCollection(uid), {
          name:           habitName.trim(),
          color:          habitColor,
          completedDates: [],
          createdAt:      serverTimestamp(),
        });
      }
      setModalVisible(false);
    } catch {
      Alert.alert('Error', 'Failed to save habit.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteHabit() {
    if (!deleteTarget) return;
    try {
      const docRef = doc(db, 'users', uid, 'habits', deleteTarget.id);
      await deleteDoc(docRef);
      setDeleteTarget(null);
      setConfirmVisible(false);
    } catch {
      Alert.alert('Error', 'Failed to delete habit.');
    }
  }

  // ── Progress stats ────────────────────────────────────────────────────────

  const completedToday = habits.filter(h => h.completedDates?.includes(TODAY)).length;
  const progressPct    = habits.length ? (completedToday / habits.length) * 100 : 0;

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>

      {/* ── Header progress banner ───────────────────────────────────── */}
      <LinearGradient colors={['#16213E', '#0D0D1A']} style={styles.header}>
        <Text style={styles.headerTitle}>Today's Habits</Text>
        <Text style={styles.headerSub}>
          {completedToday} of {habits.length} completed
        </Text>
        {/* Progress bar */}
        <View style={styles.progressBarBg}>
          <View style={[styles.progressBarFill, { width: `${progressPct}%` }]} />
        </View>
      </LinearGradient>

      {/* ── Habits list ──────────────────────────────────────────────── */}
      {loading ? (
        <LoadingSpinner message="Loading habits..." />
      ) : habits.length === 0 ? (
        <EmptyState
          icon="checkbox-marked-circle-outline"
          title="No habits yet"
          subtitle="Start building good habits. Tap + to create your first one!"
          actionLabel="Create Habit"
          onAction={openCreate}
        />
      ) : (
        <FlatList
          data={habits}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item: habit }) => {
            const isCompletedToday = habit.completedDates?.includes(TODAY);
            const streak           = calculateStreak(habit.completedDates ?? []);

            return (
              <TouchableOpacity
                style={[styles.habitCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                onLongPress={() => {
                  Alert.alert(habit.name, 'What would you like to do?', [
                    { text: 'Edit',   onPress: () => openEdit(habit) },
                    { text: 'Delete', onPress: () => { setDeleteTarget(habit); setConfirmVisible(true); }, style: 'destructive' },
                    { text: 'Cancel', style: 'cancel' },
                  ]);
                }}
                activeOpacity={0.9}>

                {/* Left: color bar + name */}
                <View style={[styles.colorBar, { backgroundColor: habit.color }]} />
                <View style={styles.habitInfo}>
                  <Text style={[styles.habitName, { color: colors.text }]}>{habit.name}</Text>
                  <Text style={[styles.habitStreak, { color: colors.textSecondary }]}>
                    {formatStreak(streak)}
                  </Text>

                  {/* Last 7 days progress dots */}
                  <View style={styles.weekRow}>
                    {last7Days.map((day, i) => {
                      const done = habit.completedDates?.includes(day);
                      const isTodayDay = day === TODAY;
                      return (
                        <View key={day} style={styles.dayDotWrap}>
                          <View style={[
                            styles.dayDot,
                            done
                              ? { backgroundColor: habit.color }
                              : { backgroundColor: colors.border },
                            isTodayDay && { borderWidth: 2, borderColor: habit.color },
                          ]} />
                          <Text style={[styles.dayLabel, { color: colors.textMuted }]}>
                            {format(new Date(day + 'T12:00:00'), 'EE')[0]}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                </View>

                {/* Right: complete toggle button */}
                <TouchableOpacity
                  onPress={() => toggleToday(habit)}
                  style={styles.checkBtn}>
                  <View style={[
                    styles.checkCircle,
                    isCompletedToday
                      ? { backgroundColor: habit.color, borderColor: habit.color }
                      : { backgroundColor: 'transparent', borderColor: colors.border },
                  ]}>
                    {isCompletedToday && <Icon name="check" size={20} color="#FFFFFF" />}
                  </View>
                </TouchableOpacity>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* ── FAB ─────────────────────────────────────────────────────── */}
      <FAB iconName="plus" onPress={openCreate} />

      {/* ── Add/Edit Habit Modal ─────────────────────────────────────── */}
      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={() => setModalVisible(false)}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setModalVisible(false)} />
        <View style={[styles.bottomSheet, { backgroundColor: colors.surface }]}>
          <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
          <Text style={[styles.sheetTitle, { color: colors.text }]}>
            {editHabit ? 'Edit Habit' : 'New Habit'}
          </Text>

          <TextInput
            style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
            placeholder="Habit name (e.g. Meditate, Read, Exercise)"
            placeholderTextColor={colors.textMuted}
            value={habitName}
            onChangeText={setHabitName}
          />

          {/* Color picker */}
          <Text style={[styles.colorLabel, { color: colors.textSecondary }]}>Choose color:</Text>
          <View style={styles.colorRow}>
            {HABIT_COLORS.map(({ color, label }) => (
              <TouchableOpacity
                key={color}
                onPress={() => setHabitColor(color)}
                style={[
                  styles.colorDot,
                  { backgroundColor: color },
                  habitColor === color && { borderWidth: 3, borderColor: '#FFFFFF' },
                ]}
              />
            ))}
          </View>

          <View style={styles.modalBtns}>
            <TouchableOpacity
              style={[styles.cancelBtn, { borderColor: colors.border }]}
              onPress={() => setModalVisible(false)}>
              <Text style={[styles.cancelBtnText, { color: colors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: habitColor }]}
              onPress={saveHabit}
              disabled={saving}>
              <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Delete confirm ─────────────────────────────────────────── */}
      <ConfirmDialog
        visible={confirmVisible}
        title="Delete Habit"
        message={`Delete "${deleteTarget?.name}"? All progress will be lost.`}
        confirmLabel="Delete"
        destructive
        onConfirm={deleteHabit}
        onCancel={() => { setConfirmVisible(false); setDeleteTarget(null); }}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },

  // Header banner
  header: {
    padding:    SPACING[5],
    paddingTop: SPACING[6],
  },
  headerTitle: { fontSize: FONT_SIZE['2xl'], fontWeight: FONT_WEIGHT.bold, color: '#FFFFFF' },
  headerSub:   { fontSize: FONT_SIZE.sm, color: 'rgba(255,255,255,0.6)', marginTop: SPACING[1], marginBottom: SPACING[3] },
  progressBarBg: {
    height: 8, borderRadius: RADIUS.full,
    backgroundColor: 'rgba(255,255,255,0.15)', overflow: 'hidden',
  },
  progressBarFill: {
    height: 8, borderRadius: RADIUS.full,
    backgroundColor: '#7C3AED',
  },

  // Habits list
  listContent: { padding: SPACING[4], paddingBottom: 100 },

  habitCard: {
    flexDirection:  'row',
    alignItems:     'center',
    borderRadius:   RADIUS.lg,
    borderWidth:    1,
    marginBottom:   SPACING[3],
    overflow:       'hidden',
  },
  colorBar:  { width: 5, alignSelf: 'stretch' },
  habitInfo: { flex: 1, padding: SPACING[4] },
  habitName: { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.semibold, marginBottom: SPACING[1] },
  habitStreak: { fontSize: FONT_SIZE.sm, marginBottom: SPACING[2] },

  // Week dots
  weekRow:   { flexDirection: 'row', gap: SPACING[2] },
  dayDotWrap: { alignItems: 'center', gap: 3 },
  dayDot: { width: 18, height: 18, borderRadius: 9 },
  dayLabel: { fontSize: 9, fontWeight: FONT_WEIGHT.medium },

  // Check button
  checkBtn:   { padding: SPACING[4] },
  checkCircle: {
    width:  36, height: 36, borderRadius: 18,
    borderWidth: 2,
    justifyContent: 'center', alignItems: 'center',
  },

  // Modal
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  bottomSheet: {
    borderTopLeftRadius: RADIUS['2xl'], borderTopRightRadius: RADIUS['2xl'],
    padding: SPACING[6], paddingBottom: SPACING[10], elevation: 10,
  },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: SPACING[4] },
  sheetTitle:  { fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.bold, marginBottom: SPACING[4] },
  input: {
    borderRadius: RADIUS.md, borderWidth: 1,
    paddingHorizontal: SPACING[4], paddingVertical: SPACING[3],
    fontSize: FONT_SIZE.base, marginBottom: SPACING[4],
  },
  colorLabel: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.medium, marginBottom: SPACING[2] },
  colorRow:   { flexDirection: 'row', gap: SPACING[3], marginBottom: SPACING[5] },
  colorDot:   { width: 32, height: 32, borderRadius: 16 },

  modalBtns: { flexDirection: 'row', gap: SPACING[3] },
  cancelBtn: {
    flex: 1, paddingVertical: SPACING[4],
    borderRadius: RADIUS.md, borderWidth: 1, alignItems: 'center',
  },
  cancelBtnText: { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.medium },
  saveBtn: { flex: 1, paddingVertical: SPACING[4], borderRadius: RADIUS.md, alignItems: 'center' },
  saveBtnText: { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.bold, color: '#FFFFFF' },
});
