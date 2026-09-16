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
  StyleSheet, Switch, Alert,
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
  const { user, signOut }   = useAuth();
  const { colors, isDark, toggleTheme } = useTheme();

  const [logoutConfirm,    setLogoutConfirm]    = useState(false);
  const [notifEnabled,     setNotifEnabled]     = useState(true);
  const [notifRequesting,  setNotifRequesting]  = useState(false);

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
        <LinearGradient colors={['#16213E', '#0D0D1A']} style={styles.header}>
          <LinearGradient colors={GRADIENTS.primary} style={styles.avatar}>
            <Text style={styles.avatarInitials}>{initials}</Text>
          </LinearGradient>
          <Text style={styles.displayName}>{user?.displayName ?? 'LifeHub User'}</Text>
          <Text style={styles.email}>{user?.email}</Text>

          {/* Account verified badge */}
          {user?.emailVerified && (
            <View style={styles.verifiedBadge}>
              <Icon name="check-circle" size={14} color="#10B981" />
              <Text style={styles.verifiedText}>Verified Account</Text>
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

        {/* ── Logout ──────────────────────────────────────────────── */}
        <View style={[styles.section, { marginTop: SPACING[4] }]}>
          <TouchableOpacity
            style={[styles.logoutBtn, { backgroundColor: 'rgba(239,68,68,0.1)', borderColor: colors.error }]}
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
    backgroundColor: 'rgba(16,185,129,0.15)',
    paddingHorizontal: SPACING[3],
    paddingVertical: SPACING[1],
    borderRadius:   RADIUS.full,
  },
  verifiedText: { fontSize: FONT_SIZE.sm, color: '#10B981', fontWeight: FONT_WEIGHT.medium },

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
});
