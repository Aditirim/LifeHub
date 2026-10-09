/**
 * ForgotPasswordScreen — Send a Firebase password reset email.
 */

import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';

import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { isValidEmail } from '../../utils/validators';
import { SPACING, RADIUS } from '../../constants/spacing';
import { FONT_SIZE, FONT_WEIGHT } from '../../constants/typography';
import { GRADIENTS } from '../../constants/colors';

export default function ForgotPasswordScreen() {
  const navigation = useNavigation();
  const { resetPassword } = useAuth();
  const { colors, isDark } = useTheme();

  const [email,   setEmail]   = useState('');
  const [loading, setLoading] = useState(false);
  const [sent,    setSent]    = useState(false);
  const [error,   setError]   = useState('');

  async function handleReset() {
    if (!isValidEmail(email)) {
      setError('Please enter a valid email address');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await resetPassword(email);
      setSent(true);
    } catch (err: any) {
      let msg = 'Failed to send reset email. Please try again.';
      if (err.code === 'auth/user-not-found') msg = 'No account found with this email.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <LinearGradient colors={isDark ? GRADIENTS.authDark : GRADIENTS.authLight} style={styles.gradient}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.kav}>
        <View style={styles.container}>

          {/* Back */}
          <TouchableOpacity
            style={[styles.backBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}
            onPress={() => navigation.goBack()}>
            <Icon name="arrow-left" size={24} color={colors.text} />
          </TouchableOpacity>

          {/* Icon */}
          <LinearGradient colors={GRADIENTS.primary} style={styles.iconBg}>
            <Icon name="lock-reset" size={32} color={colors.textOnPrimary} />
          </LinearGradient>

          <Text style={[styles.title, { color: colors.text }]}>Forgot Password?</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Enter your email and we'll send you a reset link.
          </Text>

          {sent ? (
            /* ── Success state ─────────────────────────────────────────── */
            <View style={[styles.successCard, { backgroundColor: isDark ? 'rgba(30,48,40,0.7)' : 'rgba(255,255,255,0.9)', borderColor: colors.border }]}>
              <Icon name="check-circle-outline" size={48} color={colors.success} />
              <Text style={[styles.successTitle, { color: colors.text }]}>Email Sent!</Text>
              <Text style={[styles.successMsg, { color: colors.textSecondary }]}>
                Check your inbox for a password reset link. It may take a few minutes.
              </Text>
              <TouchableOpacity
                style={[styles.backToLoginBtn, { backgroundColor: colors.primary + '20', borderColor: colors.primary }]}
                onPress={() => navigation.goBack()}>
                <Text style={[styles.backToLoginText, { color: colors.primary }]}>Back to Login</Text>
              </TouchableOpacity>
            </View>
          ) : (
            /* ── Form ────────────────────────────────────────────────────── */
            <View style={[styles.card, { backgroundColor: isDark ? 'rgba(30,48,40,0.7)' : 'rgba(255,255,255,0.9)', borderColor: colors.border }]}>
              <View style={[
                styles.inputWrap,
                {
                  backgroundColor: isDark ? 'rgba(17,26,21,0.65)' : 'rgba(237,244,242,0.8)',
                  borderColor: error ? colors.error : colors.border,
                },
              ]}>
                <Icon name="email-outline" size={20} color={colors.textMuted} style={{ marginRight: SPACING[2] }} />
                <TextInput
                  style={[styles.input, { color: colors.text }]}
                  value={email}
                  onChangeText={t => { setEmail(t); setError(''); }}
                  placeholder="you@example.com"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="send"
                  onSubmitEditing={handleReset}
                />
              </View>
              {error ? <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text> : null}

              <TouchableOpacity onPress={handleReset} disabled={loading} activeOpacity={0.85}>
                <LinearGradient
                  colors={GRADIENTS.primary}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.btn}>
                  {loading
                    ? <ActivityIndicator color={colors.textOnPrimary} />
                    : <Text style={[styles.btnText, { color: colors.textOnPrimary }]}>Send Reset Email</Text>}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}

        </View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient:  { flex: 1 },
  kav:       { flex: 1 },
  container: { flex: 1, padding: SPACING[5], paddingTop: SPACING[12] },
  backBtn: {
    width: 44, height: 44, borderRadius: 22,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: SPACING[6],
  },
  iconBg: {
    width: 72, height: 72, borderRadius: RADIUS.xl,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: SPACING[4], alignSelf: 'center',
  },
  title: {
    fontSize: FONT_SIZE['3xl'], fontWeight: FONT_WEIGHT.black,
    marginBottom: SPACING[2], textAlign: 'center',
  },
  subtitle: {
    fontSize: FONT_SIZE.base,
    textAlign: 'center', marginBottom: SPACING[8], paddingHorizontal: SPACING[4],
  },
  card: {
    borderRadius: RADIUS['2xl'], borderWidth: 1,
    padding: SPACING[6],
  },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: RADIUS.md, borderWidth: 1,
    paddingHorizontal: SPACING[3], height: 52,
    marginBottom: SPACING[4],
  },
  input: { flex: 1, fontSize: FONT_SIZE.base, height: 52 },
  errorText: { fontSize: FONT_SIZE.sm, marginBottom: SPACING[3] },
  btn: {
    height: 54, borderRadius: RADIUS.md,
    justifyContent: 'center', alignItems: 'center',
  },
  btnText: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold },
  // Success
  successCard: {
    alignItems: 'center',
    borderRadius: RADIUS['2xl'], borderWidth: 1,
    padding: SPACING[8],
  },
  successTitle: {
    fontSize: FONT_SIZE['2xl'], fontWeight: FONT_WEIGHT.bold,
    marginTop: SPACING[4], marginBottom: SPACING[2],
  },
  successMsg: {
    fontSize: FONT_SIZE.base,
    textAlign: 'center', lineHeight: 22, marginBottom: SPACING[6],
  },
  backToLoginBtn: {
    borderWidth: 1, borderRadius: RADIUS.full,
    paddingHorizontal: SPACING[6], paddingVertical: SPACING[3],
  },
  backToLoginText: { fontWeight: FONT_WEIGHT.semibold, fontSize: FONT_SIZE.base },
});
