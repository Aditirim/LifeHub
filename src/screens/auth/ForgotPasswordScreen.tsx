/**
 * ForgotPasswordScreen — Send a Firebase password reset email.
 */

import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';

import { useAuth } from '../../context/AuthContext';
import { isValidEmail } from '../../utils/validators';
import { SPACING, RADIUS } from '../../constants/spacing';
import { FONT_SIZE, FONT_WEIGHT } from '../../constants/typography';
import { GRADIENTS } from '../../constants/colors';

export default function ForgotPasswordScreen() {
  const navigation = useNavigation();
  const { resetPassword } = useAuth();

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
    <LinearGradient colors={['#0D0D1A', '#1A1A2E', '#16213E']} style={styles.gradient}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.kav}>
        <View style={styles.container}>

          {/* Back */}
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Icon name="arrow-left" size={24} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>

          {/* Icon */}
          <LinearGradient colors={GRADIENTS.primary} style={styles.iconBg}>
            <Icon name="lock-reset" size={32} color="#FFFFFF" />
          </LinearGradient>

          <Text style={styles.title}>Forgot Password?</Text>
          <Text style={styles.subtitle}>
            Enter your email and we'll send you a reset link.
          </Text>

          {sent ? (
            /* ── Success state ─────────────────────────────────────────── */
            <View style={styles.successCard}>
              <Icon name="check-circle-outline" size={48} color="#10B981" />
              <Text style={styles.successTitle}>Email Sent!</Text>
              <Text style={styles.successMsg}>
                Check your inbox for a password reset link. It may take a few minutes.
              </Text>
              <TouchableOpacity
                style={styles.backToLoginBtn}
                onPress={() => navigation.goBack()}>
                <Text style={styles.backToLoginText}>Back to Login</Text>
              </TouchableOpacity>
            </View>
          ) : (
            /* ── Form ────────────────────────────────────────────────────── */
            <View style={styles.card}>
              <View style={[
                styles.inputWrap,
                { borderColor: error ? '#EF4444' : 'rgba(255,255,255,0.15)' },
              ]}>
                <Icon name="email-outline" size={20} color="rgba(255,255,255,0.5)" style={{ marginRight: SPACING[2] }} />
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={t => { setEmail(t); setError(''); }}
                  placeholder="you@example.com"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="send"
                  onSubmitEditing={handleReset}
                />
              </View>
              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <TouchableOpacity onPress={handleReset} disabled={loading} activeOpacity={0.85}>
                <LinearGradient
                  colors={GRADIENTS.primary}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.btn}>
                  {loading
                    ? <ActivityIndicator color="#FFFFFF" />
                    : <Text style={styles.btnText}>Send Reset Email</Text>}
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
    backgroundColor: 'rgba(255,255,255,0.1)',
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
    color: '#FFFFFF', marginBottom: SPACING[2], textAlign: 'center',
  },
  subtitle: {
    fontSize: FONT_SIZE.base, color: 'rgba(255,255,255,0.5)',
    textAlign: 'center', marginBottom: SPACING[8], paddingHorizontal: SPACING[4],
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: RADIUS['2xl'], borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)', padding: SPACING[6],
  },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: RADIUS.md, borderWidth: 1,
    paddingHorizontal: SPACING[3], height: 52,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginBottom: SPACING[4],
  },
  input: { flex: 1, fontSize: FONT_SIZE.base, color: '#FFFFFF', height: 52 },
  errorText: { color: '#EF4444', fontSize: FONT_SIZE.sm, marginBottom: SPACING[3] },
  btn: {
    height: 54, borderRadius: RADIUS.md,
    justifyContent: 'center', alignItems: 'center',
  },
  btnText: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold, color: '#FFFFFF' },
  // Success
  successCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: RADIUS['2xl'], borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)', padding: SPACING[8],
  },
  successTitle: {
    fontSize: FONT_SIZE['2xl'], fontWeight: FONT_WEIGHT.bold,
    color: '#FFFFFF', marginTop: SPACING[4], marginBottom: SPACING[2],
  },
  successMsg: {
    fontSize: FONT_SIZE.base, color: 'rgba(255,255,255,0.6)',
    textAlign: 'center', lineHeight: 22, marginBottom: SPACING[6],
  },
  backToLoginBtn: {
    backgroundColor: 'rgba(124,58,237,0.3)', borderWidth: 1,
    borderColor: '#7C3AED', borderRadius: RADIUS.full,
    paddingHorizontal: SPACING[6], paddingVertical: SPACING[3],
  },
  backToLoginText: { color: '#A78BFA', fontWeight: FONT_WEIGHT.semibold, fontSize: FONT_SIZE.base },
});
