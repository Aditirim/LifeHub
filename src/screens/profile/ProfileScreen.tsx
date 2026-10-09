/**
 * ProfileScreen — User profile, settings, and logout.
 *
 * Shows:
 *  - Avatar with user initials (gradient background)
 *  - Display name + email
 *  - Theme toggle (light/dark)
 *  - Notification settings toggle
 *  - Logout button (with confirmation dialog)
 */

import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Switch, Alert, TextInput, ActivityIndicator, Modal,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { SPACING, RADIUS } from '../../constants/spacing';
import { FONT_SIZE, FONT_WEIGHT } from '../../constants/typography';
import { GRADIENTS } from '../../constants/colors';
import { ConfirmDialog } from '../../components';
import { requestNotificationPermission } from '../../services/notificationService';

export default function ProfileScreen() {
  const { user, signOut, deleteAccount, reauthenticate } = useAuth();
  const { colors, isDark, toggleTheme } = useTheme();

  const [logoutConfirm,      setLogoutConfirm]      = useState(false);
  const [notifEnabled,       setNotifEnabled]       = useState(true);
  const [notifRequesting,    setNotifRequesting]    = useState(false);

  // Delete account state
  const [deleteConfirm,      setDeleteConfirm]      = useState(false);
  const [deleting,           setDeleting]           = useState(false);
  // Re-authentication state (for stale sessions)
  const [reauthVisible,      setReauthVisible]      = useState(false);
  const [reauthPassword,     setReauthPassword]     = useState('');
  const [reauthLoading,      setReauthLoading]      = useState(false);
  const [reauthError,        setReauthError]        = useState<string | null>(null);
  const [showReauthPassword, setShowReauthPassword] = useState(false);

  // Build user initials for the avatar (e.g. "John Doe" → "JD")
  const initials = (user?.displayName ?? user?.email ?? 'U')
    .split(' ')
    .map(s => s[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('');

  // ── Logout ────────────────────────────────────────────────────────────────

  async function handleLogout() {
    try {
      await signOut();
      // AppNavigator will automatically show the Auth stack
    } catch {
      Alert.alert('Error', 'Failed to sign out. Please try again.');
    }
  }

  // ── Delete Account ─────────────────────────────────────────────────

  /** Attempts account deletion. Shows re-auth modal if Firebase requires it. */
  async function handleDeleteAccount() {
    setDeleteConfirm(false);
    setDeleting(true);
    try {
      await deleteAccount();
      // AppNavigator detects user→null and redirects to Login automatically.
    } catch (error: any) {
      setDeleting(false);
      if (error?.code === 'auth/requires-recent-login') {
        // Session is stale — prompt re-authentication before retrying.
        setReauthPassword('');
        setReauthError(null);
        setReauthVisible(true);
      } else if (error?.code === 'auth/no-current-user') {
        Alert.alert('Not Signed In', 'No authenticated user was found. Please sign in and try again.');
      } else if (error?.code === 'auth/network-request-failed') {
        Alert.alert('No Connection', 'Account deletion requires an internet connection. Please check your network and try again.');
      } else if (
        error?.code === 'firestore/permission-denied' ||
        error?.code === 'permission-denied'
      ) {
        Alert.alert(
          'Permission Denied',
          'Could not delete your data. Please contact support if this persists.',
        );
      } else {
        Alert.alert(
          'Deletion Failed',
          'Something went wrong while deleting your account. Please try again.',
        );
      }
    }
  }

  /**
   * Called when the user submits the re-authentication modal.
   * Reauthenticates, then immediately retries deleteAccount().
   */
  async function handleReauth() {
    if (!reauthPassword.trim()) {
      setReauthError('Please enter your password.');
      return;
    }
    const email = user?.email ?? '';
    if (!email) {
      setReauthError('Could not determine your account email. Please sign out and sign in again.');
      return;
    }

    setReauthLoading(true);
    setReauthError(null);
    try {
      await reauthenticate(email, reauthPassword);
      // Clear password from memory immediately.
      setReauthPassword('');
      setReauthVisible(false);
    } catch (error: any) {
      setReauthLoading(false);
      if (
        error?.code === 'auth/wrong-password' ||
        error?.code === 'auth/invalid-credential'
      ) {
        setReauthError('Incorrect password. Please try again.');
      } else if (error?.code === 'auth/too-many-requests') {
        setReauthError('Too many attempts. Please wait a moment and try again.');
      } else if (error?.code === 'auth/network-request-failed') {
        setReauthError('No internet connection. Please check your network.');
      } else {
        setReauthError('Authentication failed. Please try again.');
      }
      return;
    }

    // Re-auth succeeded — retry deletion.
    setReauthLoading(false);
    setDeleting(true);
    try {
      await deleteAccount();
    } catch (retryError: any) {
      setDeleting(false);
      Alert.alert(
        'Deletion Failed',
        retryError?.message ?? 'Account deletion failed after re-authentication. Please contact support.',
      );
    }
  }

  // ── Notification toggle ───────────────────────────────────────────────────

  async function handleNotifToggle(value: boolean) {
    if (value) {
      setNotifRequesting(true);
      const granted = await requestNotificationPermission();
      setNotifEnabled(granted);
      setNotifRequesting(false);
      if (!granted) Alert.alert('Permission Denied', 'Please enable notifications in Android settings.');
    } else {
      setNotifEnabled(false);
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView showsVerticalScrollIndicator={false}>

        {/* ── Header / Avatar ──────────────────────────────────────── */}
        <LinearGradient colors={isDark ? GRADIENTS.headerDark : GRADIENTS.headerLight} style={styles.header}>
          <LinearGradient colors={GRADIENTS.primary} style={styles.avatar}>
            <Text style={styles.avatarInitials}>{initials}</Text>
          </LinearGradient>
          <Text style={styles.displayName}>{user?.displayName ?? 'LifeHub User'}</Text>
          <Text style={styles.email}>{user?.email}</Text>

          {/* Account verified badge */}
          {user?.emailVerified && (
            <View style={[styles.verifiedBadge, { backgroundColor: isDark ? 'rgba(90,158,114,0.18)' : 'rgba(255,255,255,0.15)' }]}>
              <Icon name="check-circle" size={14} color={colors.success} />
              <Text style={[styles.verifiedText, { color: colors.success }]}>Verified Account</Text>
            </View>
          )}
        </LinearGradient>

        {/* ── Settings section ─────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>APPEARANCE</Text>

          <SettingsRow
            icon="theme-light-dark"
            label="Dark Mode"
            colors={colors}
            right={
              <Switch
                value={isDark}
                onValueChange={toggleTheme}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#FFFFFF"
              />
            }
          />
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>NOTIFICATIONS</Text>

          <SettingsRow
            icon="bell-outline"
            label="Push Notifications"
            colors={colors}
            right={
              <Switch
                value={notifEnabled}
                onValueChange={handleNotifToggle}
                disabled={notifRequesting}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#FFFFFF"
              />
            }
          />

          <SettingsRow
            icon="bell-ring-outline"
            label="Habit Reminders"
            subtitle="Daily reminder at 8:00 AM"
            colors={colors}
            right={<Icon name="chevron-right" size={20} color={colors.textMuted} />}
          />

          <SettingsRow
            icon="calendar-clock"
            label="Event Reminders"
            subtitle="30 minutes before events"
            colors={colors}
            right={<Icon name="chevron-right" size={20} color={colors.textMuted} />}
          />
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>ACCOUNT</Text>

          <SettingsRow
            icon="email-outline"
            label="Email"
            subtitle={user?.email ?? ''}
            colors={colors}
            right={null}
          />

          <SettingsRow
            icon="information-outline"
            label="App Version"
            subtitle="LifeHub v1.0.0"
            colors={colors}
            right={null}
          />
        </View>

        {/* ── Danger Zone ────────────────────────────────────── */}
        <View style={[styles.section, styles.dangerSection]}>
          <Text style={[styles.sectionLabel, { color: colors.error }]}>DANGER ZONE</Text>
          <TouchableOpacity
            style={[
              styles.deleteAccountBtn,
              {
                borderColor: colors.error,
                backgroundColor: isDark ? 'rgba(194,107,92,0.08)' : 'rgba(168,64,64,0.06)',
              },
            ]}
            onPress={() => setDeleteConfirm(true)}
            disabled={deleting}
            accessibilityLabel="Delete Account"
            accessibilityRole="button">
            {deleting ? (
              <ActivityIndicator size="small" color={colors.error} />
            ) : (
              <>
                <View style={[styles.deleteAccountIconWrap, { backgroundColor: isDark ? 'rgba(194,107,92,0.15)' : 'rgba(168,64,64,0.12)' }]}>
                  <Text style={styles.deleteAccountIcon}>⚠️</Text>
                </View>
                <View style={styles.deleteAccountTextWrap}>
                  <Text style={[styles.deleteAccountLabel, { color: colors.error }]}>Delete Account</Text>
                  <Text style={[styles.deleteAccountSub, { color: colors.error }]}>
                    Permanently delete your account and all data
                  </Text>
                </View>
                <Text style={[styles.deleteAccountChevron, { color: colors.error }]}>›</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* ── Logout ──────────────────────────────────────────────── */}
        <View style={[styles.section, { marginTop: SPACING[4] }]}>
          <TouchableOpacity
            style={[
              styles.logoutBtn,
              {
                backgroundColor: isDark ? 'rgba(194,107,92,0.08)' : 'rgba(168,64,64,0.06)',
                borderColor: colors.error,
              },
            ]}
            onPress={() => setLogoutConfirm(true)}>
            <Icon name="logout" size={20} color={colors.error} />
            <Text style={[styles.logoutText, { color: colors.error }]}>Sign Out</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: SPACING[16] }} />
      </ScrollView>

      {/* ── Logout Confirmation ─────────────────────────────────────── */}
      <ConfirmDialog
        visible={logoutConfirm}
        title="Sign Out"
        message="Are you sure you want to sign out of LifeHub?"
        confirmLabel="Sign Out"
        destructive
        onConfirm={handleLogout}
        onCancel={() => setLogoutConfirm(false)}
      />

      {/* ── Delete Account Confirmation ─────────────────────────────── */}
      <ConfirmDialog
        visible={deleteConfirm}
        title="Delete Your LifeHub Account?"
        message={
          'This permanently deletes your account and all associated LifeHub data '
          + '(notes, habits, events, and transactions). This action cannot be undone.'
        }
        confirmLabel="Delete Account"
        cancelLabel="Cancel"
        destructive
        onConfirm={handleDeleteAccount}
        onCancel={() => setDeleteConfirm(false)}
      />

      {/* ── Re-authentication Modal ──────────────────────────────────── */}
      {/*
        Shown when Firebase rejects deletion with 'requires-recent-login'.
        The user must re-enter their password before we can permanently delete
        their account. Passwords are never logged or stored.
      */}
      <Modal
        visible={reauthVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!reauthLoading) {
            setReauthVisible(false);
            setReauthPassword('');
            setReauthError(null);
          }
        }}>
        <View style={[styles.reauthOverlay, { backgroundColor: colors.overlay }]}>
          <View style={[styles.reauthBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>

            {/* Header */}
            <View style={styles.reauthHeader}>
              <Text style={styles.reauthWarningIcon}>🔒</Text>
              <Text style={[styles.reauthTitle, { color: colors.text }]}>
                Confirm Your Identity
              </Text>
            </View>

            <Text style={[styles.reauthBody, { color: colors.textSecondary }]}>
              For your security, please re-enter your password to confirm permanent account deletion.
            </Text>

            {/* Email (display-only) */}
            <Text style={[styles.reauthEmail, { color: colors.textMuted }]}>
              {user?.email}
            </Text>

            {/* Password field */}
            <View style={[
              styles.reauthInputWrap,
              {
                backgroundColor: colors.card,
                borderColor: reauthError ? colors.error : colors.border,
              },
            ]}>
              <TextInput
                style={[styles.reauthInput, { color: colors.text }]}
                value={reauthPassword}
                onChangeText={t => { setReauthPassword(t); setReauthError(null); }}
                placeholder="Your password"
                placeholderTextColor={colors.textMuted}
                secureTextEntry={!showReauthPassword}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!reauthLoading}
                returnKeyType="done"
                onSubmitEditing={handleReauth}
              />
              <TouchableOpacity
                onPress={() => setShowReauthPassword(v => !v)}
                style={styles.reauthEyeBtn}>
                <Icon
                  name={showReauthPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={colors.textMuted}
                />
              </TouchableOpacity>
            </View>

            {/* Inline error */}
            {reauthError ? (
              <Text style={[styles.reauthErrorText, { color: colors.error }]}>{reauthError}</Text>
            ) : null}

            {/* Buttons */}
            <View style={styles.reauthButtons}>
              <TouchableOpacity
                style={[
                  styles.reauthBtn,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
                onPress={() => {
                  setReauthVisible(false);
                  setReauthPassword('');
                  setReauthError(null);
                }}
                disabled={reauthLoading}>
                <Text style={[styles.reauthBtnText, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.reauthBtn, { backgroundColor: colors.error, borderColor: colors.error }]}
                onPress={handleReauth}
                disabled={reauthLoading}>
                {reauthLoading
                  ? <ActivityIndicator size="small" color="#FFFFFF" />
                  : <Text style={[styles.reauthBtnText, styles.reauthBtnTextWhite]}>Delete Account</Text>}
              </TouchableOpacity>
            </View>

          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── SettingsRow sub-component ────────────────────────────────────────────────

function SettingsRow({
  icon, label, subtitle, colors, right,
}: {
  icon: string; label: string; subtitle?: string;
  colors: any; right: React.ReactNode;
}) {
  return (
    <View style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.rowIconBg, { backgroundColor: colors.surface }]}>
        <Icon name={icon} size={20} color={colors.primary} />
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, { color: colors.text }]}>{label}</Text>
        {subtitle ? (
          <Text style={[styles.rowSubtitle, { color: colors.textSecondary }]}>{subtitle}</Text>
        ) : null}
      </View>
      {right}
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
    borderBottomLeftRadius: RADIUS.xl,
    borderBottomRightRadius: RADIUS.xl,
  },
  avatar: {
    width:          96,
    height:         96,
    borderRadius:   48,
    justifyContent: 'center',
    alignItems:     'center',
    marginBottom:   SPACING[4],
  },
  avatarInitials: {
    fontSize:   FONT_SIZE['3xl'],
    fontWeight: FONT_WEIGHT.black,
    color:      '#FFFFFF',
  },
  displayName: {
    fontSize:   FONT_SIZE['2xl'],
    fontWeight: FONT_WEIGHT.bold,
    color:      '#FFFFFF',
    marginBottom: SPACING[1],
  },
  email: {
    fontSize: FONT_SIZE.base,
    color:    'rgba(255,255,255,0.6)',
  },
  verifiedBadge: {
    flexDirection:  'row',
    alignItems:     'center',
    marginTop:      SPACING[2],
    gap:            SPACING[1],
    paddingHorizontal: SPACING[3],
    paddingVertical: SPACING[1],
    borderRadius:   RADIUS.full,
  },
  verifiedText: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.medium },

  // Section
  section:      { paddingHorizontal: SPACING[4], marginTop: SPACING[5] },
  sectionLabel: {
    fontSize:     FONT_SIZE.xs,
    fontWeight:   FONT_WEIGHT.semibold,
    letterSpacing: 1,
    marginBottom: SPACING[2],
  },

  // Settings row
  row: {
    flexDirection:  'row',
    alignItems:     'center',
    padding:        SPACING[4],
    borderRadius:   RADIUS.lg,
    borderWidth:    1,
    marginBottom:   SPACING[2],
    gap:            SPACING[3],
  },
  rowIconBg: {
    width:          40,
    height:         40,
    borderRadius:   20,
    justifyContent: 'center',
    alignItems:     'center',
  },
  rowText:     { flex: 1 },
  rowLabel:    { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.medium },
  rowSubtitle: { fontSize: FONT_SIZE.sm, marginTop: 2 },

  // Logout
  logoutBtn: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            SPACING[2],
    padding:        SPACING[4],
    borderRadius:   RADIUS.lg,
    borderWidth:    1,
  },
  logoutText: { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.bold },

  // Danger zone
  dangerSection: {
    marginTop: SPACING[2],
    marginBottom: SPACING[2],
  },
  deleteAccountBtn: {
    flexDirection:   'row',
    alignItems:      'center',
    padding:         SPACING[4],
    borderRadius:    RADIUS.lg,
    borderWidth:     1.5,
    borderColor:     '#C26B5C',
    backgroundColor: 'rgba(194,107,92,0.08)',
    gap:             SPACING[3],
    minHeight:       64,
  },
  deleteAccountIconWrap: {
    width:           40,
    height:          40,
    borderRadius:    20,
    backgroundColor: 'rgba(194,107,92,0.15)',
    justifyContent:  'center',
    alignItems:      'center',
  },
  deleteAccountIcon: { fontSize: 18 },
  deleteAccountTextWrap: { flex: 1 },
  deleteAccountLabel: {
    fontSize:   FONT_SIZE.base,
    fontWeight: FONT_WEIGHT.semibold,
    color:      '#C26B5C',
  },
  deleteAccountSub: {
    fontSize:  FONT_SIZE.sm,
    color:     '#C26B5C',
    opacity:   0.75,
    marginTop: 2,
  },
  deleteAccountChevron: {
    fontSize: 22,
    color:    '#C26B5C',
    opacity:  0.6,
  },

  // Re-authentication modal
  reauthOverlay: {
    flex:            1,
    justifyContent:  'center',
    alignItems:      'center',
    paddingHorizontal: SPACING[6],
  },
  reauthBox: {
    width:        '100%',
    borderRadius: RADIUS.xl,
    padding:      SPACING[6],
    borderWidth:  1,
    elevation:    12,
  },
  reauthHeader: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            SPACING[2],
    marginBottom:   SPACING[3],
  },
  reauthWarningIcon: { fontSize: 22 },
  reauthTitle: {
    fontSize:   FONT_SIZE.xl,
    fontWeight: FONT_WEIGHT.bold,
  },
  reauthBody: {
    fontSize:     FONT_SIZE.base,
    lineHeight:   22,
    marginBottom: SPACING[3],
  },
  reauthEmail: {
    fontSize:     FONT_SIZE.sm,
    marginBottom: SPACING[4],
    fontStyle:    'italic',
  },
  reauthInputWrap: {
    flexDirection:     'row',
    alignItems:        'center',
    borderRadius:      RADIUS.md,
    borderWidth:       1,
    paddingHorizontal: SPACING[3],
    height:            52,
    marginBottom:      SPACING[2],
  },
  reauthInput: {
    flex:     1,
    fontSize: FONT_SIZE.base,
    height:   52,
  },
  reauthEyeBtn: { padding: SPACING[1] },
  reauthErrorText: {
    color:        '#C26B5C',
    fontSize:     FONT_SIZE.sm,
    marginBottom: SPACING[3],
  },
  reauthButtons: {
    flexDirection: 'row',
    gap:           SPACING[3],
    marginTop:     SPACING[4],
  },
  reauthBtn: {
    flex:            1,
    paddingVertical: SPACING[3],
    borderRadius:    RADIUS.md,
    alignItems:      'center',
    borderWidth:     1,
  },
  reauthDeleteBtn: {
    backgroundColor: '#C26B5C',
    borderColor:     '#C26B5C',
  },
  reauthBtnText: {
    fontSize:   FONT_SIZE.base,
    fontWeight: FONT_WEIGHT.semibold,
  },
  reauthBtnTextWhite: { color: '#FFFFFF' },
  dangerSectionLabel: { color: '#C26B5C' },
});
