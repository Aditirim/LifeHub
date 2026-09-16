/**
 * LoginScreen — Firebase Email/Password Login.
 *
 * Features:
 *  - Email + Password form with validation
 *  - Error messages from Firebase (wrong password, user not found, etc.)
 *  - Links to Register and Forgot Password screens
 *  - Premium gradient background with glass-morphism card
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
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';

import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { AuthStackParamList } from '../../navigation/types';
import { isValidEmail, isValidPassword } from '../../utils/validators';
import { SPACING, RADIUS } from '../../constants/spacing';
import { FONT_SIZE, FONT_WEIGHT } from '../../constants/typography';
import { GRADIENTS } from '../../constants/colors';

type NavProp = NativeStackNavigationProp<AuthStackParamList, 'Login'>;

export default function LoginScreen() {
  const navigation = useNavigation<NavProp>();
  const { signIn } = useAuth();
  const { colors } = useTheme();

  // Form state
  const [email,        setEmail]        = useState('');
  const [password,     setPassword]     = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [errors,       setErrors]       = useState<{ email?: string; password?: string }>({});

  // ─── Validation ─────────────────────────────────────────────────────────────

  function validate(): boolean {
    const newErrors: typeof errors = {};
    if (!isValidEmail(email))    newErrors.email    = 'Please enter a valid email address';
    if (!isValidPassword(password)) newErrors.password = 'Password must be at least 6 characters';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  // ─── Submit ──────────────────────────────────────────────────────────────────

  async function handleLogin() {
    if (!validate()) return;
    setLoading(true);
    try {
      await signIn(email, password);
      // Navigation is handled automatically by AppNavigator when auth state changes
    } catch (error: any) {
      // Firebase error codes: https://firebase.google.com/docs/reference/js/auth#autherrorcodes
      let message = 'Login failed. Please try again.';
      if (error.code === 'auth/user-not-found')    message = 'No account found with this email.';
      if (error.code === 'auth/wrong-password')    message = 'Incorrect password. Please try again.';
      if (error.code === 'auth/invalid-email')     message = 'Please enter a valid email address.';
      if (error.code === 'auth/too-many-requests') message = 'Too many attempts. Please try again later.';
      if (error.code === 'auth/invalid-credential') message = 'Invalid email or password.';
      Alert.alert('Login Failed', message);
    } finally {
      setLoading(false);
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <LinearGradient
      colors={['#0D0D1A', '#1A1A2E', '#16213E']}
      style={styles.gradient}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.kav}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>

          {/* ── Logo / Brand ─────────────────────────────────────────────── */}
          <View style={styles.brandSection}>
            <LinearGradient
              colors={GRADIENTS.primary}
              style={styles.logoIcon}>
              <Icon name="lightning-bolt" size={36} color="#FFFFFF" />
            </LinearGradient>
            <Text style={styles.appName}>LifeHub</Text>
            <Text style={styles.tagline}>Your personal daily dashboard</Text>
          </View>

          {/* ── Card ─────────────────────────────────────────────────────── */}
          <View style={[styles.card, { backgroundColor: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.12)' }]}>
            <Text style={styles.cardTitle}>Welcome back</Text>
            <Text style={[styles.cardSubtitle, { color: 'rgba(255,255,255,0.55)' }]}>
              Sign in to continue
            </Text>

            {/* Email input */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email</Text>
              <View style={[
                styles.inputWrap,
                { backgroundColor: 'rgba(255,255,255,0.08)', borderColor: errors.email ? '#EF4444' : 'rgba(255,255,255,0.15)' },
              ]}>
                <Icon name="email-outline" size={20} color="rgba(255,255,255,0.5)" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={t => { setEmail(t); setErrors(e => ({ ...e, email: undefined })); }}
                  placeholder="you@example.com"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="next"
                />
              </View>
              {errors.email ? <Text style={styles.errorText}>{errors.email}</Text> : null}
            </View>

            {/* Password input */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Password</Text>
              <View style={[
                styles.inputWrap,
                { backgroundColor: 'rgba(255,255,255,0.08)', borderColor: errors.password ? '#EF4444' : 'rgba(255,255,255,0.15)' },
              ]}>
                <Icon name="lock-outline" size={20} color="rgba(255,255,255,0.5)" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  value={password}
                  onChangeText={t => { setPassword(t); setErrors(e => ({ ...e, password: undefined })); }}
                  placeholder="••••••••"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  secureTextEntry={!showPassword}
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(v => !v)}
                  style={styles.eyeBtn}>
                  <Icon
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color="rgba(255,255,255,0.5)"
                  />
                </TouchableOpacity>
              </View>
              {errors.password ? <Text style={styles.errorText}>{errors.password}</Text> : null}
            </View>

            {/* Forgot password */}
            <TouchableOpacity
              onPress={() => navigation.navigate('ForgotPassword')}
              style={styles.forgotBtn}>
              <Text style={styles.forgotText}>Forgot password?</Text>
            </TouchableOpacity>

            {/* Login button */}
            <TouchableOpacity
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.85}>
              <LinearGradient
                colors={GRADIENTS.primary}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.loginBtn}>
                {loading
                  ? <ActivityIndicator color="#FFFFFF" />
                  : <Text style={styles.loginBtnText}>Sign In</Text>}
              </LinearGradient>
            </TouchableOpacity>
          </View>

          {/* ── Register link ─────────────────────────────────────────────── */}
          <View style={styles.registerRow}>
            <Text style={styles.registerPrompt}>Don't have an account? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Register')}>
              <Text style={styles.registerLink}>Sign Up</Text>
            </TouchableOpacity>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  gradient:    { flex: 1 },
  kav:         { flex: 1 },
  scroll: {
    flexGrow:       1,
    justifyContent: 'center',
    padding:        SPACING[5],
    paddingTop:     SPACING[12],
  },

  // Brand section
  brandSection: {
    alignItems:    'center',
    marginBottom:  SPACING[8],
  },
  logoIcon: {
    width:          72,
    height:         72,
    borderRadius:   RADIUS.xl,
    justifyContent: 'center',
    alignItems:     'center',
    marginBottom:   SPACING[3],
  },
  appName: {
    fontSize:     FONT_SIZE['4xl'],
    fontWeight:   FONT_WEIGHT.black,
    color:        '#FFFFFF',
    letterSpacing: -1,
  },
  tagline: {
    fontSize:   FONT_SIZE.base,
    color:      'rgba(255,255,255,0.5)',
    marginTop:  SPACING[1],
  },

  // Glass card
  card: {
    borderRadius: RADIUS['2xl'],
    borderWidth:  1,
    padding:      SPACING[6],
    marginBottom: SPACING[6],
  },
  cardTitle: {
    fontSize:     FONT_SIZE['2xl'],
    fontWeight:   FONT_WEIGHT.bold,
    color:        '#FFFFFF',
    marginBottom: SPACING[1],
  },
  cardSubtitle: {
    fontSize:     FONT_SIZE.base,
    marginBottom: SPACING[6],
  },

  // Input
  inputGroup: {
    marginBottom: SPACING[4],
  },
  label: {
    fontSize:     FONT_SIZE.sm,
    fontWeight:   FONT_WEIGHT.semibold,
    color:        'rgba(255,255,255,0.7)',
    marginBottom: SPACING[2],
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  inputWrap: {
    flexDirection:  'row',
    alignItems:     'center',
    borderRadius:   RADIUS.md,
    borderWidth:    1,
    paddingHorizontal: SPACING[3],
    height:         52,
  },
  inputIcon: {
    marginRight: SPACING[2],
  },
  input: {
    flex:      1,
    fontSize:  FONT_SIZE.base,
    color:     '#FFFFFF',
    height:    52,
  },
  eyeBtn: {
    padding: SPACING[1],
  },
  errorText: {
    color:     '#EF4444',
    fontSize:  FONT_SIZE.sm,
    marginTop: SPACING[1],
  },

  // Forgot
  forgotBtn: {
    alignSelf:     'flex-end',
    marginBottom:  SPACING[5],
    marginTop:     -SPACING[2],
  },
  forgotText: {
    color:      '#A78BFA',
    fontSize:   FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.medium,
  },

  // Login button
  loginBtn: {
    height:         54,
    borderRadius:   RADIUS.md,
    justifyContent: 'center',
    alignItems:     'center',
  },
  loginBtnText: {
    fontSize:   FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.bold,
    color:      '#FFFFFF',
    letterSpacing: 0.5,
  },

  // Register row
  registerRow: {
    flexDirection:  'row',
    justifyContent: 'center',
    alignItems:     'center',
  },
  registerPrompt: {
    color:    'rgba(255,255,255,0.5)',
    fontSize: FONT_SIZE.base,
  },
  registerLink: {
    color:      '#A78BFA',
    fontSize:   FONT_SIZE.base,
    fontWeight: FONT_WEIGHT.bold,
  },
});
