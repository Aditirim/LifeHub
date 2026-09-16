/**
 * RegisterScreen — Create a new Firebase account.
 *
 * Features:
 *  - Display name + Email + Password + Confirm Password
 *  - Client-side validation before Firebase call
 *  - Firebase error handling (email already in use, etc.)
 *  - Same premium glass-morphism design as Login
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useAuth } from '../../context/AuthContext';
import { AuthStackParamList } from '../../navigation/types';
import { isValidEmail, isValidPassword, isNotEmpty } from '../../utils/validators';
import { SPACING, RADIUS } from '../../constants/spacing';
import { FONT_SIZE, FONT_WEIGHT } from '../../constants/typography';
import { GRADIENTS } from '../../constants/colors';

type NavProp = NativeStackNavigationProp<AuthStackParamList, 'Register'>;

export default function RegisterScreen() {
  const navigation = useNavigation<NavProp>();
  const { register } = useAuth();

  const [name,           setName]           = useState('');
  const [email,          setEmail]          = useState('');
  const [password,       setPassword]       = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword,   setShowPassword]   = useState(false);
  const [loading,        setLoading]        = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // ─── Validation ─────────────────────────────────────────────────────────────

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!isNotEmpty(name))             e.name    = 'Please enter your name';
    if (!isValidEmail(email))          e.email   = 'Please enter a valid email';
    if (!isValidPassword(password))    e.password = 'Password must be at least 6 characters';
    if (password !== confirmPassword)  e.confirm = 'Passwords do not match';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  // ─── Submit ──────────────────────────────────────────────────────────────────

  async function handleRegister() {
    if (!validate()) return;
    setLoading(true);
    try {
      await register(email, password, name);
      // AppNavigator will automatically navigate to the main app
    } catch (error: any) {
      let message = 'Registration failed. Please try again.';
      if (error.code === 'auth/email-already-in-use') message = 'This email is already registered.';
      if (error.code === 'auth/invalid-email')        message = 'Invalid email address.';
      if (error.code === 'auth/weak-password')        message = 'Password is too weak. Use at least 6 characters.';
      Alert.alert('Registration Failed', message);
    } finally {
      setLoading(false);
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <LinearGradient colors={['#0D0D1A', '#1A1A2E', '#16213E']} style={styles.gradient}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.kav}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>

          {/* ── Back button ───────────────────────────────────────────────── */}
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Icon name="arrow-left" size={24} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>

          {/* ── Header ───────────────────────────────────────────────────── */}
          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>Join LifeHub and organize your life</Text>

          {/* ── Form card ─────────────────────────────────────────────────── */}
          <View style={styles.card}>
            {/* Name */}
            {renderInput({
              label: 'Full Name', icon: 'account-outline', value: name,
              onChangeText: (t: string) => { setName(t); clearError('name'); },
              placeholder: 'John Doe', error: errors.name,
            })}

            {/* Email */}
            {renderInput({
              label: 'Email', icon: 'email-outline', value: email,
              onChangeText: (t: string) => { setEmail(t); clearError('email'); },
              placeholder: 'you@example.com', error: errors.email,
              keyboardType: 'email-address', autoCapitalize: 'none',
            })}

            {/* Password */}
            {renderInput({
              label: 'Password', icon: 'lock-outline', value: password,
              onChangeText: (t: string) => { setPassword(t); clearError('password'); },
              placeholder: '••••••••', error: errors.password,
              secureTextEntry: !showPassword,
              rightIcon: showPassword ? 'eye-off-outline' : 'eye-outline',
              onRightIcon: () => setShowPassword(v => !v),
            })}

            {/* Confirm Password */}
            {renderInput({
              label: 'Confirm Password', icon: 'lock-check-outline', value: confirmPassword,
              onChangeText: (t: string) => { setConfirmPassword(t); clearError('confirm'); },
              placeholder: '••••••••', error: errors.confirm,
              secureTextEntry: !showPassword,
            })}

            {/* Register button */}
            <TouchableOpacity onPress={handleRegister} disabled={loading} activeOpacity={0.85}>
              <LinearGradient
                colors={GRADIENTS.primary}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.btn}>
                {loading
                  ? <ActivityIndicator color="#FFFFFF" />
                  : <Text style={styles.btnText}>Create Account</Text>}
              </LinearGradient>
            </TouchableOpacity>
          </View>

          {/* ── Login link ────────────────────────────────────────────────── */}
          <View style={styles.loginRow}>
            <Text style={styles.loginPrompt}>Already have an account? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Login')}>
              <Text style={styles.loginLink}>Sign In</Text>
            </TouchableOpacity>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );

  function clearError(field: string) {
    setErrors(prev => { const next = { ...prev }; delete next[field]; return next; });
  }

  function renderInput(opts: {
    label: string; icon: string; value: string;
    onChangeText: (t: string) => void; placeholder: string; error?: string;
    secureTextEntry?: boolean; keyboardType?: any; autoCapitalize?: any;
    rightIcon?: string; onRightIcon?: () => void;
  }) {
    return (
      <View style={styles.inputGroup}>
        <Text style={styles.label}>{opts.label}</Text>
        <View style={[
          styles.inputWrap,
          { borderColor: opts.error ? '#EF4444' : 'rgba(255,255,255,0.15)' },
        ]}>
          <Icon name={opts.icon} size={20} color="rgba(255,255,255,0.5)" style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            value={opts.value}
            onChangeText={opts.onChangeText}
            placeholder={opts.placeholder}
            placeholderTextColor="rgba(255,255,255,0.3)"
            secureTextEntry={opts.secureTextEntry}
            keyboardType={opts.keyboardType}
            autoCapitalize={opts.autoCapitalize ?? 'words'}
            autoCorrect={false}
          />
          {opts.rightIcon && opts.onRightIcon ? (
            <TouchableOpacity onPress={opts.onRightIcon} style={styles.eyeBtn}>
              <Icon name={opts.rightIcon} size={20} color="rgba(255,255,255,0.5)" />
            </TouchableOpacity>
          ) : null}
        </View>
        {opts.error ? <Text style={styles.errorText}>{opts.error}</Text> : null}
      </View>
    );
  }
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  kav:      { flex: 1 },
  scroll: {
    flexGrow: 1,
    padding:  SPACING[5],
    paddingTop: SPACING[12],
  },
  backBtn: {
    width:          44,
    height:         44,
    borderRadius:   22,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems:     'center',
    marginBottom:   SPACING[6],
  },
  title: {
    fontSize:     FONT_SIZE['3xl'],
    fontWeight:   FONT_WEIGHT.black,
    color:        '#FFFFFF',
    marginBottom: SPACING[1],
  },
  subtitle: {
    fontSize:     FONT_SIZE.base,
    color:        'rgba(255,255,255,0.5)',
    marginBottom: SPACING[6],
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius:    RADIUS['2xl'],
    borderWidth:     1,
    borderColor:     'rgba(255,255,255,0.12)',
    padding:         SPACING[6],
    marginBottom:    SPACING[6],
  },
  inputGroup: { marginBottom: SPACING[4] },
  label: {
    fontSize:     FONT_SIZE.sm,
    fontWeight:   FONT_WEIGHT.semibold,
    color:        'rgba(255,255,255,0.7)',
    marginBottom: SPACING[2],
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  inputWrap: {
    flexDirection:     'row',
    alignItems:        'center',
    borderRadius:      RADIUS.md,
    borderWidth:       1,
    paddingHorizontal: SPACING[3],
    height:            52,
    backgroundColor:   'rgba(255,255,255,0.08)',
  },
  inputIcon: { marginRight: SPACING[2] },
  input: {
    flex:     1,
    fontSize: FONT_SIZE.base,
    color:    '#FFFFFF',
    height:   52,
  },
  eyeBtn:    { padding: SPACING[1] },
  errorText: { color: '#EF4444', fontSize: FONT_SIZE.sm, marginTop: SPACING[1] },
  btn: {
    height:         54,
    borderRadius:   RADIUS.md,
    justifyContent: 'center',
    alignItems:     'center',
    marginTop:      SPACING[2],
  },
  btnText: {
    fontSize:     FONT_SIZE.lg,
    fontWeight:   FONT_WEIGHT.bold,
    color:        '#FFFFFF',
    letterSpacing: 0.5,
  },
  loginRow: {
    flexDirection:  'row',
    justifyContent: 'center',
    alignItems:     'center',
    paddingBottom:  SPACING[8],
  },
  loginPrompt: { color: 'rgba(255,255,255,0.5)', fontSize: FONT_SIZE.base },
  loginLink:   { color: '#A78BFA', fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.bold },
});
