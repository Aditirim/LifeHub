/**
 * NotesScreen — Full-featured notes with Firestore.
 *
 * Features:
 *  - Grid view of note cards
 *  - Real-time search (client-side filter)
 *  - Pin / unpin notes (pinned notes float to top)
 *  - Create note via FAB → bottom-sheet form
 *  - Tap note to edit in-place
 *  - Long-press → pin or delete
 *  - All notes stored per user in Firestore: users/{uid}/notes
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Modal, Alert, FlatList, KeyboardAvoidingView, Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { format } from 'date-fns';
import {
  query, orderBy, onSnapshot, addDoc, updateDoc, deleteDoc, doc,
} from '@react-native-firebase/firestore';

import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { notesCollection, db, serverTimestamp, toDate } from '../../services/firebase';
import { SPACING, RADIUS } from '../../constants/spacing';
import { FONT_SIZE, FONT_WEIGHT } from '../../constants/typography';
import { GRADIENTS, CATEGORY_COLORS } from '../../constants/colors';
import { FAB, ConfirmDialog, EmptyState, LoadingSpinner } from '../../components';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Note {
  id:        string;
  title:     string;
  body:      string;
  isPinned:  boolean;
  color:     string;      // background tint for the card
  createdAt: any;
  updatedAt: any;
}

// Note card colors (a small palette)
const NOTE_COLORS = [
  '#1E2A48', '#1E3A2A', '#3A2A1E',
  '#2A1E3A', '#1E3A3A', '#3A1E2A',
];

export default function NotesScreen() {
  const { user }   = useAuth();
  const { colors } = useTheme();
  const uid        = user?.uid ?? '';

  // ── State ──────────────────────────────────────────────────────────────────
  const [notes,       setNotes]       = useState<Note[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Modal state for create/edit
  const [modalVisible, setModalVisible] = useState(false);
  const [editNote,     setEditNote]     = useState<Note | null>(null);
  const [title,        setTitle]        = useState('');
  const [body,         setBody]         = useState('');
  const [noteColor,    setNoteColor]    = useState(NOTE_COLORS[0]);
  const [saving,       setSaving]       = useState(false);

  // Delete confirm
  const [deleteTarget,   setDeleteTarget]   = useState<Note | null>(null);
  const [confirmVisible, setConfirmVisible] = useState(false);

  // ── Firestore listener ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!uid) return;
    const colRef = notesCollection(uid);
    const q      = query(colRef, orderBy('updatedAt', 'desc'));
    const unsubscribe = onSnapshot(q,
      snap => {
        setNotes(snap.docs.map((d: any) => ({ id: d.id, ...d.data() } as Note)));
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsubscribe;
  }, [uid]);

  // ── Filtered + sorted notes ────────────────────────────────────────────────

  const displayedNotes = useMemo(() => {
    let filtered = notes;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = notes.filter(
        n => n.title?.toLowerCase().includes(q) || n.body?.toLowerCase().includes(q),
      );
    }
    // Pinned notes come first
    return [
      ...filtered.filter(n => n.isPinned),
      ...filtered.filter(n => !n.isPinned),
    ];
  }, [notes, searchQuery]);

  // ── CRUD ───────────────────────────────────────────────────────────────────

  function openCreate() {
    setEditNote(null);
    setTitle('');
    setBody('');
    setNoteColor(NOTE_COLORS[Math.floor(Math.random() * NOTE_COLORS.length)]);
    setModalVisible(true);
  }

  function openEdit(note: Note) {
    setEditNote(note);
    setTitle(note.title);
    setBody(note.body);
    setNoteColor(note.color ?? NOTE_COLORS[0]);
    setModalVisible(true);
  }

  async function saveNote() {
    if (!title.trim() && !body.trim()) {
      Alert.alert('Empty Note', 'Please add a title or some content.');
      return;
    }
    setSaving(true);
    try {
      const data = {
        title:     title.trim(),
        body:      body.trim(),
        color:     noteColor,
        updatedAt: serverTimestamp(),
      };
      if (editNote) {
        const docRef = doc(db, 'users', uid, 'notes', editNote.id);
        await updateDoc(docRef, data);
      } else {
        await addDoc(notesCollection(uid), {
          ...data,
          isPinned:  false,
          createdAt: serverTimestamp(),
        });
      }
      setModalVisible(false);
    } catch {
      Alert.alert('Error', 'Failed to save note.');
    } finally {
      setSaving(false);
    }
  }

  async function togglePin(note: Note) {
    try {
      const docRef = doc(db, 'users', uid, 'notes', note.id);
      await updateDoc(docRef, { isPinned: !note.isPinned, updatedAt: serverTimestamp() });
    } catch {
      Alert.alert('Error', 'Failed to update note.');
    }
  }

  async function deleteNote() {
    if (!deleteTarget) return;
    try {
      const docRef = doc(db, 'users', uid, 'notes', deleteTarget.id);
      await deleteDoc(docRef);
      setDeleteTarget(null);
      setConfirmVisible(false);
    } catch {
      Alert.alert('Error', 'Failed to delete note.');
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>

      {/* ── Search bar ──────────────────────────────────────────────── */}
      <View style={[styles.searchBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Icon name="magnify" size={20} color={colors.textMuted} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder="Search notes..."
          placeholderTextColor={colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery ? (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Icon name="close-circle" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* ── Notes grid ──────────────────────────────────────────────── */}
      {loading ? (
        <LoadingSpinner message="Loading notes..." />
      ) : displayedNotes.length === 0 ? (
        <EmptyState
          icon="note-plus-outline"
          title={searchQuery ? 'No notes found' : 'No notes yet'}
          subtitle={searchQuery ? 'Try a different search' : 'Tap + to create your first note'}
          actionLabel={!searchQuery ? 'Create Note' : undefined}
          onAction={!searchQuery ? openCreate : undefined}
        />
      ) : (
        <FlatList
          data={displayedNotes}
          keyExtractor={item => item.id}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item: note }) => (
            <TouchableOpacity
              style={[styles.noteCard, { backgroundColor: note.color ?? colors.card, borderColor: colors.border }]}
              onPress={() => openEdit(note)}
              onLongPress={() => {
                Alert.alert(note.title || 'Note', 'What would you like to do?', [
                  { text: note.isPinned ? 'Unpin' : 'Pin', onPress: () => togglePin(note) },
                  { text: 'Edit',   onPress: () => openEdit(note) },
                  { text: 'Delete', onPress: () => { setDeleteTarget(note); setConfirmVisible(true); }, style: 'destructive' },
                  { text: 'Cancel', style: 'cancel' },
                ]);
              }}
              activeOpacity={0.85}>
              {/* Pin indicator */}
              {note.isPinned && (
                <View style={styles.pinBadge}>
                  <Icon name="pin" size={14} color="#FFFFFF" />
                </View>
              )}
              {note.title ? (
                <Text style={styles.noteTitle} numberOfLines={2}>{note.title}</Text>
              ) : null}
              {note.body ? (
                <Text style={styles.noteBody} numberOfLines={6}>{note.body}</Text>
              ) : null}
              <Text style={styles.noteDate}>
                {note.updatedAt ? format(toDate(note.updatedAt), 'MMM d') : ''}
              </Text>
            </TouchableOpacity>
          )}
        />
      )}

      {/* ── FAB ─────────────────────────────────────────────────────── */}
      <FAB iconName="plus" onPress={openCreate} />

      {/* ── Create / Edit Modal ─────────────────────────────────────── */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[styles.editorRoot, { backgroundColor: noteColor }]}>

          {/* Top bar */}
          <View style={styles.editorTopBar}>
            <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.editorBtn}>
              <Icon name="arrow-left" size={24} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={styles.editorLabel}>{editNote ? 'Edit Note' : 'New Note'}</Text>
            <TouchableOpacity onPress={saveNote} style={styles.editorBtn} disabled={saving}>
              <Text style={styles.editorSave}>{saving ? '...' : 'Save'}</Text>
            </TouchableOpacity>
          </View>

          {/* Color picker */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.colorPicker}>
            {NOTE_COLORS.map(c => (
              <TouchableOpacity
                key={c}
                onPress={() => setNoteColor(c)}
                style={[styles.colorDot, { backgroundColor: c }, noteColor === c && styles.colorDotSelected]}
              />
            ))}
          </ScrollView>

          {/* Editor fields */}
          <ScrollView style={styles.editorScroll} keyboardShouldPersistTaps="handled">
            <TextInput
              style={styles.titleInput}
              placeholder="Title"
              placeholderTextColor="rgba(255,255,255,0.4)"
              value={title}
              onChangeText={setTitle}
              multiline
            />
            <TextInput
              style={styles.bodyInput}
              placeholder="Start writing..."
              placeholderTextColor="rgba(255,255,255,0.4)"
              value={body}
              onChangeText={setBody}
              multiline
              textAlignVertical="top"
            />
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Delete confirm ──────────────────────────────────────────── */}
      <ConfirmDialog
        visible={confirmVisible}
        title="Delete Note"
        message={`Delete "${deleteTarget?.title || 'this note'}"? This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={deleteNote}
        onCancel={() => { setConfirmVisible(false); setDeleteTarget(null); }}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },

  // Search bar
  searchBar: {
    flexDirection:     'row',
    alignItems:        'center',
    margin:            SPACING[4],
    paddingHorizontal: SPACING[4],
    paddingVertical:   SPACING[2],
    borderRadius:      RADIUS.full,
    borderWidth:       1,
    gap:               SPACING[2],
  },
  searchInput: { flex: 1, fontSize: FONT_SIZE.base, height: 40 },

  // Notes list
  listContent: { padding: SPACING[3], paddingBottom: 100 },
  row:         { justifyContent: 'space-between', paddingHorizontal: SPACING[1] },

  // Note card
  noteCard: {
    flex:          1,
    maxWidth:      '48%',
    borderRadius:  RADIUS.lg,
    borderWidth:   1,
    padding:       SPACING[4],
    marginBottom:  SPACING[3],
    minHeight:     120,
    position:      'relative',
  },
  pinBadge: {
    position:        'absolute',
    top:             SPACING[2],
    right:           SPACING[2],
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius:    RADIUS.full,
    padding:         4,
  },
  noteTitle: {
    fontSize:     FONT_SIZE.base,
    fontWeight:   FONT_WEIGHT.bold,
    color:        '#FFFFFF',
    marginBottom: SPACING[2],
  },
  noteBody: {
    fontSize:  FONT_SIZE.sm,
    color:     'rgba(255,255,255,0.75)',
    lineHeight: 18,
    flex:      1,
  },
  noteDate: {
    fontSize:  FONT_SIZE.xs,
    color:     'rgba(255,255,255,0.45)',
    marginTop: SPACING[3],
  },

  // Editor
  editorRoot: { flex: 1 },
  editorTopBar: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    paddingHorizontal: SPACING[4],
    paddingTop:     Platform.OS === 'android' ? SPACING[5] : SPACING[12],
    paddingBottom:  SPACING[3],
  },
  editorBtn:   { padding: SPACING[2] },
  editorLabel: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold, color: '#FFFFFF' },
  editorSave:  { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.bold, color: '#FFFFFF' },

  colorPicker:  { paddingHorizontal: SPACING[4], maxHeight: 44, marginBottom: SPACING[2] },
  colorDot: {
    width:        28, height:      28,
    borderRadius: 14, marginRight: SPACING[2],
  },
  colorDotSelected: {
    borderWidth: 3, borderColor: '#FFFFFF',
  },

  editorScroll: { flex: 1, paddingHorizontal: SPACING[5] },
  titleInput: {
    fontSize:   FONT_SIZE['2xl'],
    fontWeight: FONT_WEIGHT.bold,
    color:      '#FFFFFF',
    marginBottom: SPACING[3],
    minHeight:  60,
  },
  bodyInput: {
    fontSize:  FONT_SIZE.base,
    color:     'rgba(255,255,255,0.85)',
    lineHeight: 24,
    minHeight:  300,
  },
});
