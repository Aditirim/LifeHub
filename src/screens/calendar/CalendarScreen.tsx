/**
 * CalendarScreen — Monthly calendar with Firestore events.
 *
 * Features:
 *  - Month navigation (prev/next)
 *  - Custom 7-column calendar grid built with date-fns
 *  - Tap a day to see events for that day
 *  - Dots on days that have events
 *  - FAB to add a new event
 *  - Long-press an event to edit or delete it
 *  - All events stored in Firestore: users/{uid}/events
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Modal, TextInput, Alert, FlatList,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import DateTimePicker from '@react-native-community/datetimepicker';
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  getDay, addMonths, subMonths, isSameDay, parseISO, isToday,
} from 'date-fns';
import {
  query, where, orderBy, onSnapshot, addDoc, updateDoc, deleteDoc, doc,
} from '@react-native-firebase/firestore';

import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { eventsCollection, db, serverTimestamp } from '../../services/firebase';
import { SPACING, RADIUS } from '../../constants/spacing';
import { FONT_SIZE, FONT_WEIGHT } from '../../constants/typography';
import { GRADIENTS } from '../../constants/colors';
import { FAB, ConfirmDialog, LoadingSpinner, EmptyState } from '../../components';
import LinearGradient from 'react-native-linear-gradient';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CalendarEvent {
  id:          string;
  title:       string;
  date:        string;      // 'YYYY-MM-DD'
  startTime:   string;      // 'HH:MM'
  endTime?:    string;
  description?: string;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function CalendarScreen() {
  const { user }   = useAuth();
  const { colors } = useTheme();
  const uid        = user?.uid ?? '';

  // ── State ──────────────────────────────────────────────────────────────────
  const [viewMonth,    setViewMonth]    = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [events,       setEvents]       = useState<CalendarEvent[]>([]);
  const [loading,      setLoading]      = useState(true);

  // Modal state
  const [modalVisible,   setModalVisible]   = useState(false);
  const [editingEvent,   setEditingEvent]   = useState<CalendarEvent | null>(null);
  const [deleteTarget,   setDeleteTarget]   = useState<CalendarEvent | null>(null);
  const [confirmVisible, setConfirmVisible] = useState(false);

  // Form fields
  const [title,       setTitle]       = useState('');
  const [startTime,   setStartTime]   = useState(new Date());
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [description, setDescription] = useState('');
  const [saving,      setSaving]      = useState(false);

  // ── Firestore listener ────────────────────────────────────────────────────

  useEffect(() => {
    if (!uid) return;
    setLoading(true);
    const colRef = eventsCollection(uid);
    const q      = query(colRef, orderBy('date', 'asc'));
    const unsubscribe = onSnapshot(q,
      snap => {
        setEvents(snap.docs.map((d: any) => ({ id: d.id, ...d.data() } as CalendarEvent)));
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsubscribe;
  }, [uid]);

  // ── Calendar grid helpers ─────────────────────────────────────────────────

  /** Returns all days to render in the current month grid */
  const calendarDays = useCallback(() => {
    const monthStart = startOfMonth(viewMonth);
    const monthEnd   = endOfMonth(viewMonth);
    const days       = eachDayOfInterval({ start: monthStart, end: monthEnd });
    // Prefix empty cells for the weekday offset
    const offset     = getDay(monthStart); // 0=Sun
    return { days, offset };
  }, [viewMonth]);

  /** Returns events for a given date string */
  function eventsForDate(dateStr: string): CalendarEvent[] {
    return events.filter(e => e.date === dateStr);
  }

  const selectedDateStr = format(selectedDate, 'yyyy-MM-dd');
  const selectedEvents  = eventsForDate(selectedDateStr);

  // ── Add / Edit ───────────────────────────────────────────────────────────

  function openAdd() {
    setEditingEvent(null);
    setTitle('');
    setStartTime(new Date());
    setDescription('');
    setModalVisible(true);
  }

  function openEdit(event: CalendarEvent) {
    setEditingEvent(event);
    setTitle(event.title);
    // Parse the stored time string "HH:MM" into a Date
    const [h, m] = (event.startTime ?? '00:00').split(':').map(Number);
    const t = new Date(); t.setHours(h, m, 0, 0);
    setStartTime(t);
    setDescription(event.description ?? '');
    setModalVisible(true);
  }

  async function saveEvent() {
    if (!title.trim()) { Alert.alert('Error', 'Please enter an event title'); return; }
    setSaving(true);
    try {
      const data = {
        title:       title.trim(),
        date:        selectedDateStr,
        startTime:   format(startTime, 'HH:mm'),
        description: description.trim(),
        updatedAt:   serverTimestamp(),
      };

      if (editingEvent) {
        const docRef = doc(db, 'users', uid, 'events', editingEvent.id);
        await updateDoc(docRef, data);
      } else {
        await addDoc(eventsCollection(uid), { ...data, createdAt: serverTimestamp() });
      }
      setModalVisible(false);
    } catch (e) {
      Alert.alert('Error', 'Failed to save event. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteEvent() {
    if (!deleteTarget) return;
    try {
      const docRef = doc(db, 'users', uid, 'events', deleteTarget.id);
      await deleteDoc(docRef);
      setDeleteTarget(null);
      setConfirmVisible(false);
    } catch {
      Alert.alert('Error', 'Failed to delete event.');
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  const { days, offset } = calendarDays();

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView showsVerticalScrollIndicator={false}>

        {/* ── Month navigation ──────────────────────────────────────── */}
        <LinearGradient colors={['#16213E', '#0D0D1A']} style={styles.header}>
          <TouchableOpacity onPress={() => setViewMonth(m => subMonths(m, 1))} style={styles.navBtn}>
            <Icon name="chevron-left" size={28} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.monthTitle}>{format(viewMonth, 'MMMM yyyy')}</Text>
          <TouchableOpacity onPress={() => setViewMonth(m => addMonths(m, 1))} style={styles.navBtn}>
            <Icon name="chevron-right" size={28} color="#FFFFFF" />
          </TouchableOpacity>
        </LinearGradient>

        {/* ── Weekday headers ───────────────────────────────────────── */}
        <View style={[styles.weekRow, { backgroundColor: colors.surface }]}>
          {WEEKDAYS.map(d => (
            <Text key={d} style={[styles.weekDay, { color: colors.textSecondary }]}>{d}</Text>
          ))}
        </View>

        {/* ── Calendar grid ─────────────────────────────────────────── */}
        <View style={[styles.grid, { backgroundColor: colors.surface }]}>
          {/* Empty cells for offset */}
          {Array.from({ length: offset }).map((_, i) => (
            <View key={`empty-${i}`} style={styles.dayCell} />
          ))}

          {days.map(day => {
            const dateStr   = format(day, 'yyyy-MM-dd');
            const dayEvents = eventsForDate(dateStr);
            const isSelected = isSameDay(day, selectedDate);
            const isTodayDay = isToday(day);

            return (
              <TouchableOpacity
                key={dateStr}
                style={[
                  styles.dayCell,
                  isSelected && { backgroundColor: colors.primary, borderRadius: RADIUS.md },
                ]}
                onPress={() => setSelectedDate(day)}>
                <Text style={[
                  styles.dayNum,
                  { color: isSelected ? '#FFFFFF' : isTodayDay ? colors.primary : colors.text },
                  isTodayDay && !isSelected && { fontWeight: FONT_WEIGHT.bold },
                ]}>
                  {format(day, 'd')}
                </Text>
                {/* Event dot */}
                {dayEvents.length > 0 && (
                  <View style={[styles.dot, { backgroundColor: isSelected ? '#FFFFFF' : colors.accent }]} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── Selected day events ─────────────────────────────────── */}
        <View style={styles.eventsSection}>
          <Text style={[styles.selectedDateLabel, { color: colors.text }]}>
            {isToday(selectedDate) ? 'Today' : format(selectedDate, 'EEEE, MMMM d')}
            {' '}· {selectedEvents.length} event{selectedEvents.length !== 1 ? 's' : ''}
          </Text>

          {loading ? (
            <LoadingSpinner size="small" />
          ) : selectedEvents.length === 0 ? (
            <EmptyState
              icon="calendar-blank-outline"
              title="No events"
              subtitle="Tap + to add an event for this day"
              actionLabel="Add Event"
              onAction={openAdd}
            />
          ) : (
            selectedEvents.map(event => (
              <TouchableOpacity
                key={event.id}
                style={[styles.eventCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                onLongPress={() => {
                  Alert.alert(event.title, 'What would you like to do?', [
                    { text: 'Edit',   onPress: () => openEdit(event) },
                    { text: 'Delete', onPress: () => { setDeleteTarget(event); setConfirmVisible(true); }, style: 'destructive' },
                    { text: 'Cancel', style: 'cancel' },
                  ]);
                }}>
                <View style={[styles.eventTimeBar, { backgroundColor: colors.primary }]} />
                <View style={styles.eventInfo}>
                  <Text style={[styles.eventTitle, { color: colors.text }]}>{event.title}</Text>
                  <Text style={[styles.eventTime, { color: colors.textSecondary }]}>
                    <Icon name="clock-outline" size={13} /> {event.startTime}
                    {event.description ? `  ·  ${event.description}` : ''}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => openEdit(event)} style={{ padding: SPACING[2] }}>
                  <Icon name="pencil-outline" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              </TouchableOpacity>
            ))
          )}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* ── FAB ─────────────────────────────────────────────────────── */}
      <FAB iconName="plus" onPress={openAdd} />

      {/* ── Add/Edit Modal ──────────────────────────────────────────── */}
      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={() => setModalVisible(false)}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setModalVisible(false)} />
        <View style={[styles.bottomSheet, { backgroundColor: colors.surface }]}>
          <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
          <Text style={[styles.sheetTitle, { color: colors.text }]}>
            {editingEvent ? 'Edit Event' : 'New Event'}
          </Text>
          <Text style={[styles.sheetDate, { color: colors.textSecondary }]}>
            {format(selectedDate, 'MMMM d, yyyy')}
          </Text>

          {/* Title */}
          <TextInput
            style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
            placeholder="Event title"
            placeholderTextColor={colors.textMuted}
            value={title}
            onChangeText={setTitle}
          />

          {/* Start time picker */}
          <TouchableOpacity
            style={[styles.timePicker, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => setShowTimePicker(true)}>
            <Icon name="clock-outline" size={20} color={colors.primary} />
            <Text style={[styles.timePickerText, { color: colors.text }]}>
              {format(startTime, 'hh:mm a')}
            </Text>
          </TouchableOpacity>

          {showTimePicker && (
            <DateTimePicker
              value={startTime}
              mode="time"
              is24Hour={false}
              onChange={(_, date) => { setShowTimePicker(false); if (date) setStartTime(date); }}
            />
          )}

          {/* Description */}
          <TextInput
            style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text, height: 80 }]}
            placeholder="Description (optional)"
            placeholderTextColor={colors.textMuted}
            value={description}
            onChangeText={setDescription}
            multiline
          />

          {/* Buttons */}
          <View style={styles.modalBtns}>
            <TouchableOpacity
              style={[styles.cancelBtn, { borderColor: colors.border }]}
              onPress={() => setModalVisible(false)}>
              <Text style={[styles.cancelBtnText, { color: colors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: colors.primary }]}
              onPress={saveEvent}
              disabled={saving}>
              <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Delete confirmation ─────────────────────────────────────── */}
      <ConfirmDialog
        visible={confirmVisible}
        title="Delete Event"
        message={`Delete "${deleteTarget?.title}"? This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={deleteEvent}
        onCancel={() => { setConfirmVisible(false); setDeleteTarget(null); }}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', padding: SPACING[4], paddingTop: SPACING[6],
  },
  navBtn:     { padding: SPACING[2] },
  monthTitle: { fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.bold, color: '#FFFFFF' },

  // Calendar
  weekRow:  { flexDirection: 'row', paddingVertical: SPACING[2] },
  weekDay:  { flex: 1, textAlign: 'center', fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold },
  grid:     { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell:  { width: '14.28%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  dayNum:   { fontSize: FONT_SIZE.base },
  dot:      { width: 5, height: 5, borderRadius: 3, marginTop: 2 },

  // Events section
  eventsSection:    { padding: SPACING[4] },
  selectedDateLabel: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold, marginBottom: SPACING[3] },
  eventCard: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: RADIUS.lg, borderWidth: 1,
    marginBottom: SPACING[2], overflow: 'hidden',
  },
  eventTimeBar: { width: 4, alignSelf: 'stretch' },
  eventInfo:    { flex: 1, padding: SPACING[3] },
  eventTitle:   { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.medium },
  eventTime:    { fontSize: FONT_SIZE.sm, marginTop: 2 },

  // Modal
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  bottomSheet: {
    borderTopLeftRadius: RADIUS['2xl'], borderTopRightRadius: RADIUS['2xl'],
    padding: SPACING[6], paddingBottom: SPACING[10],
    elevation: 10,
  },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: SPACING[4] },
  sheetTitle:  { fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.bold, marginBottom: SPACING[1] },
  sheetDate:   { fontSize: FONT_SIZE.sm, marginBottom: SPACING[4] },
  input: {
    borderRadius: RADIUS.md, borderWidth: 1,
    paddingHorizontal: SPACING[4], paddingVertical: SPACING[3],
    fontSize: FONT_SIZE.base, marginBottom: SPACING[3],
  },
  timePicker: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: RADIUS.md, borderWidth: 1,
    padding: SPACING[4], marginBottom: SPACING[3], gap: SPACING[2],
  },
  timePickerText: { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.medium },
  modalBtns: { flexDirection: 'row', gap: SPACING[3], marginTop: SPACING[2] },
  cancelBtn: {
    flex: 1, paddingVertical: SPACING[4],
    borderRadius: RADIUS.md, borderWidth: 1, alignItems: 'center',
  },
  cancelBtnText: { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.medium },
  saveBtn:  {
    flex: 1, paddingVertical: SPACING[4],
    borderRadius: RADIUS.md, alignItems: 'center',
  },
  saveBtnText: { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.bold, color: '#FFFFFF' },
});
