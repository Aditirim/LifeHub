/**
 * MoneyScreen — Income/Expense tracker with balance and category breakdown.
 *
 * Features:
 *  - Balance header: Total Income | Total Expenses | Net Balance
 *  - Transaction list sorted by date (newest first)
 *  - FAB → add transaction (income or expense)
 *  - Category breakdown with color-coded bars
 *  - Long-press → delete transaction
 *  - All data stored in Firestore: users/{uid}/transactions
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Modal, TextInput, Alert, FlatList, KeyboardAvoidingView, Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { format } from 'date-fns';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import {
  onSnapshot, addDoc, deleteDoc, doc, query, orderBy, where,
} from '@react-native-firebase/firestore';
import { transactionsCollection, db, serverTimestamp, toDate } from '../../services/firebase';
import { SPACING, RADIUS } from '../../constants/spacing';
import { FONT_SIZE, FONT_WEIGHT } from '../../constants/typography';
import { GRADIENTS, EXPENSE_CATEGORIES, INCOME_CATEGORIES, CATEGORY_COLORS } from '../../constants/colors';
import { FAB, ConfirmDialog, EmptyState, LoadingSpinner } from '../../components';
import { formatCurrency } from '../../utils/formatters';
import { isValidAmount } from '../../utils/validators';
import LinearGradient from 'react-native-linear-gradient';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Transaction {
  id:          string;
  type:        'income' | 'expense';
  amount:      number;
  category:    string;
  date:        any;         // Firestore Timestamp
  description: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MoneyScreen() {
  const { user }   = useAuth();
  const { colors } = useTheme();
  const uid        = user?.uid ?? '';

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading,      setLoading]      = useState(true);

  // Modal
  const [modalVisible, setModalVisible] = useState(false);
  const [txType,       setTxType]       = useState<'income' | 'expense'>('expense');
  const [amount,       setAmount]       = useState('');
  const [category,     setCategory]     = useState('');
  const [description,  setDescription]  = useState('');
  const [saving,       setSaving]       = useState(false);

  // Delete
  const [deleteTarget,   setDeleteTarget]   = useState<Transaction | null>(null);
  const [confirmVisible, setConfirmVisible] = useState(false);

  // ── Firestore listener ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!uid) return;
    const colRef = transactionsCollection(uid);
    const q = query(colRef, orderBy('date', 'desc'));
    const unsub = onSnapshot(q,
      snap => {
        setTransactions(snap.docs.map((d: any) => ({ id: d.id, ...d.data() } as Transaction)));
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsub;
  }, [uid]);

  // ── Summary calculations ───────────────────────────────────────────────────

  const { totalIncome, totalExpenses, balance, categoryBreakdown } = useMemo(() => {
    const income   = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expenses = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

    // Group expenses by category
    const catMap: Record<string, number> = {};
    transactions.filter(t => t.type === 'expense').forEach(t => {
      catMap[t.category] = (catMap[t.category] ?? 0) + t.amount;
    });

    const breakdown = Object.entries(catMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    return {
      totalIncome:       income,
      totalExpenses:     expenses,
      balance:           income - expenses,
      categoryBreakdown: breakdown,
    };
  }, [transactions]);

  // ── CRUD ───────────────────────────────────────────────────────────────────

  function openAdd() {
    setTxType('expense');
    setAmount('');
    setCategory(EXPENSE_CATEGORIES[0]);
    setDescription('');
    setModalVisible(true);
  }

  // Update default category when type changes
  function switchType(type: 'income' | 'expense') {
    setTxType(type);
    setCategory(type === 'expense' ? EXPENSE_CATEGORIES[0] : INCOME_CATEGORIES[0]);
  }

  async function saveTransaction() {
    if (!isValidAmount(amount)) { Alert.alert('Error', 'Please enter a valid amount.'); return; }
    if (!category) { Alert.alert('Error', 'Please select a category.'); return; }
    setSaving(true);
    try {
      await addDoc(transactionsCollection(uid), {
        type:        txType,
        amount:      parseFloat(amount),
        category,
        description: description.trim(),
        date:        serverTimestamp(),
      });
      setModalVisible(false);
    } catch {
      Alert.alert('Error', 'Failed to save transaction.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteTransaction() {
    if (!deleteTarget) return;
    try {
      const docRef = doc(db, 'users', uid, 'transactions', deleteTarget.id);
      await deleteDoc(docRef);
      setDeleteTarget(null);
      setConfirmVisible(false);
    } catch {
      Alert.alert('Error', 'Failed to delete transaction.');
    }
  }

  const categories = txType === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
  const maxCatAmount = categoryBreakdown[0]?.[1] ?? 1;

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView showsVerticalScrollIndicator={false}>

        {/* ── Balance header ───────────────────────────────────────── */}
        <LinearGradient colors={GRADIENTS.primary} style={styles.header}>
          <Text style={styles.balanceLabel}>Net Balance</Text>
          <Text style={[styles.balance, { color: balance >= 0 ? '#FFFFFF' : '#FCA5A5' }]}>
            {formatCurrency(Math.abs(balance))}
            {balance < 0 ? ' (deficit)' : ''}
          </Text>

          <View style={styles.summaryRow}>
            <View style={styles.summaryBox}>
              <Icon name="arrow-down-circle" size={18} color="#86EFAC" />
              <Text style={styles.summaryAmount}>{formatCurrency(totalIncome)}</Text>
              <Text style={styles.summaryLabel}>Income</Text>
            </View>
            <View style={[styles.summaryDivider]} />
            <View style={styles.summaryBox}>
              <Icon name="arrow-up-circle" size={18} color="#FCA5A5" />
              <Text style={styles.summaryAmount}>{formatCurrency(totalExpenses)}</Text>
              <Text style={styles.summaryLabel}>Expenses</Text>
            </View>
          </View>
        </LinearGradient>

        {/* ── Category breakdown ─────────────────────────────────── */}
        {categoryBreakdown.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Top Categories</Text>
            {categoryBreakdown.map(([cat, amt], i) => (
              <View key={cat} style={styles.catRow}>
                <Text style={[styles.catName, { color: colors.text }]}>{cat}</Text>
                <View style={styles.catBarBg}>
                  <View style={[
                    styles.catBarFill,
                    {
                      width:           `${(amt / maxCatAmount) * 100}%`,
                      backgroundColor: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
                    },
                  ]} />
                </View>
                <Text style={[styles.catAmt, { color: colors.textSecondary }]}>
                  {formatCurrency(amt)}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* ── Transactions list ─────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Transactions</Text>
          {loading ? (
            <LoadingSpinner size="small" />
          ) : transactions.length === 0 ? (
            <EmptyState
              icon="wallet-outline"
              title="No transactions yet"
              subtitle="Tap + to record your first income or expense"
              actionLabel="Add Transaction"
              onAction={openAdd}
            />
          ) : (
            transactions.map(tx => (
              <TouchableOpacity
                key={tx.id}
                style={[styles.txCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                onLongPress={() => {
                  Alert.alert('Delete?', `Delete this ${tx.type} of ${formatCurrency(tx.amount)}?`, [
                    { text: 'Delete', onPress: () => { setDeleteTarget(tx); setConfirmVisible(true); }, style: 'destructive' },
                    { text: 'Cancel', style: 'cancel' },
                  ]);
                }}>
                {/* Category icon */}
                <View style={[
                  styles.txIcon,
                  { backgroundColor: tx.type === 'income' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)' },
                ]}>
                  <Icon
                    name={tx.type === 'income' ? 'arrow-down' : 'arrow-up'}
                    size={20}
                    color={tx.type === 'income' ? colors.success : colors.error}
                  />
                </View>

                {/* Details */}
                <View style={styles.txDetails}>
                  <Text style={[styles.txCategory, { color: colors.text }]}>{tx.category}</Text>
                  {tx.description ? (
                    <Text style={[styles.txDesc, { color: colors.textSecondary }]} numberOfLines={1}>
                      {tx.description}
                    </Text>
                  ) : null}
                  <Text style={[styles.txDate, { color: colors.textMuted }]}>
                    {tx.date?.toDate ? format(tx.date.toDate(), 'MMM d, yyyy') : ''}
                  </Text>
                </View>

                {/* Amount */}
                <Text style={[
                  styles.txAmount,
                  { color: tx.type === 'income' ? colors.success : colors.error },
                ]}>
                  {tx.type === 'income' ? '+' : '-'}{formatCurrency(tx.amount)}
                </Text>
              </TouchableOpacity>
            ))
          )}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* ── FAB ─────────────────────────────────────────────────────── */}
      <FAB iconName="plus" onPress={openAdd} />

      {/* ── Add Transaction Modal ───────────────────────────────────── */}
      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={() => setModalVisible(false)}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setModalVisible(false)} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.bottomSheet, { backgroundColor: colors.surface }]}>
            <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
            <Text style={[styles.sheetTitle, { color: colors.text }]}>Add Transaction</Text>

            {/* Type toggle */}
            <View style={[styles.typeToggle, { backgroundColor: colors.card }]}>
              {(['expense', 'income'] as const).map(t => (
                <TouchableOpacity
                  key={t}
                  style={[
                    styles.typeBtn,
                    txType === t && { backgroundColor: t === 'income' ? colors.success : colors.error },
                  ]}
                  onPress={() => switchType(t)}>
                  <Text style={[
                    styles.typeBtnText,
                    { color: txType === t ? '#FFFFFF' : colors.textSecondary },
                  ]}>
                    {t === 'income' ? '📈 Income' : '📉 Expense'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Amount */}
            <TextInput
              style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
              placeholder="Amount (e.g. 500)"
              placeholderTextColor={colors.textMuted}
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
            />

            {/* Category scroll */}
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll}>
              {categories.map(cat => (
                <TouchableOpacity
                  key={cat}
                  onPress={() => setCategory(cat)}
                  style={[
                    styles.catChip,
                    {
                      backgroundColor: category === cat ? colors.primary : colors.card,
                      borderColor:     category === cat ? colors.primary : colors.border,
                    },
                  ]}>
                  <Text style={[styles.catChipText, { color: category === cat ? '#FFFFFF' : colors.text }]}>
                    {cat}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Description */}
            <TextInput
              style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
              placeholder="Description (optional)"
              placeholderTextColor={colors.textMuted}
              value={description}
              onChangeText={setDescription}
            />

            {/* Buttons */}
            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={[styles.cancelBtn, { borderColor: colors.border }]}
                onPress={() => setModalVisible(false)}>
                <Text style={[styles.cancelBtnText, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: txType === 'income' ? colors.success : colors.error }]}
                onPress={saveTransaction}
                disabled={saving}>
                <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Delete confirm ─────────────────────────────────────────── */}
      <ConfirmDialog
        visible={confirmVisible}
        title="Delete Transaction"
        message="Delete this transaction? This cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={deleteTransaction}
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
    padding:    SPACING[6],
    paddingTop: SPACING[8],
    alignItems: 'center',
  },
  balanceLabel: { fontSize: FONT_SIZE.sm, color: 'rgba(255,255,255,0.7)', letterSpacing: 1, textTransform: 'uppercase' },
  balance:      { fontSize: FONT_SIZE['4xl'], fontWeight: FONT_WEIGHT.black, color: '#FFFFFF', marginVertical: SPACING[2] },
  summaryRow:   { flexDirection: 'row', marginTop: SPACING[3], width: '100%', justifyContent: 'center' },
  summaryBox:   { flex: 1, alignItems: 'center', gap: SPACING[1] },
  summaryDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.2)', marginHorizontal: SPACING[4] },
  summaryAmount: { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.bold, color: '#FFFFFF' },
  summaryLabel:  { fontSize: FONT_SIZE.xs, color: 'rgba(255,255,255,0.6)' },

  // Section
  section:      { padding: SPACING[4], paddingBottom: SPACING[2] },
  sectionTitle: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold, marginBottom: SPACING[3] },

  // Category bars
  catRow:    { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING[3], gap: SPACING[2] },
  catName:   { fontSize: FONT_SIZE.sm, width: 90 },
  catBarBg:  { flex: 1, height: 8, borderRadius: RADIUS.full, backgroundColor: 'rgba(128,128,128,0.2)' },
  catBarFill:{ height: 8, borderRadius: RADIUS.full },
  catAmt:    { fontSize: FONT_SIZE.sm, width: 70, textAlign: 'right' },

  // Transaction card
  txCard: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: RADIUS.lg, borderWidth: 1,
    padding: SPACING[4], marginBottom: SPACING[2],
    gap: SPACING[3],
  },
  txIcon: {
    width: 44, height: 44, borderRadius: 22,
    justifyContent: 'center', alignItems: 'center',
  },
  txDetails:  { flex: 1 },
  txCategory: { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.medium },
  txDesc:     { fontSize: FONT_SIZE.sm, marginTop: 2 },
  txDate:     { fontSize: FONT_SIZE.xs, marginTop: 2 },
  txAmount:   { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.bold },

  // Modal
  backdrop:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  bottomSheet: {
    borderTopLeftRadius: RADIUS['2xl'], borderTopRightRadius: RADIUS['2xl'],
    padding: SPACING[6], paddingBottom: SPACING[10], elevation: 10,
  },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: SPACING[4] },
  sheetTitle:  { fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.bold, marginBottom: SPACING[4] },

  // Type toggle
  typeToggle: {
    flexDirection: 'row', borderRadius: RADIUS.md,
    padding: 4, marginBottom: SPACING[4],
  },
  typeBtn: {
    flex: 1, paddingVertical: SPACING[3], borderRadius: RADIUS.sm,
    alignItems: 'center',
  },
  typeBtnText: { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.semibold },

  input: {
    borderRadius: RADIUS.md, borderWidth: 1,
    paddingHorizontal: SPACING[4], paddingVertical: SPACING[3],
    fontSize: FONT_SIZE.base, marginBottom: SPACING[3], height: 52,
  },
  fieldLabel: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.medium, marginBottom: SPACING[2] },
  catScroll:  { marginBottom: SPACING[3] },
  catChip: {
    paddingHorizontal: SPACING[4], paddingVertical: SPACING[2],
    borderRadius: RADIUS.full, borderWidth: 1, marginRight: SPACING[2],
  },
  catChipText: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.medium },

  modalBtns: { flexDirection: 'row', gap: SPACING[3], marginTop: SPACING[2] },
  cancelBtn: {
    flex: 1, paddingVertical: SPACING[4],
    borderRadius: RADIUS.md, borderWidth: 1, alignItems: 'center',
  },
  cancelBtnText: { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.medium },
  saveBtn: { flex: 1, paddingVertical: SPACING[4], borderRadius: RADIUS.md, alignItems: 'center' },
  saveBtnText: { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.bold, color: '#FFFFFF' },
});
