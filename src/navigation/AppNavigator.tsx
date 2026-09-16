/**
 * AppNavigator — Root navigation controller.
 *
 * Decides which navigation stack to show based on authentication state:
 *  - Loading:           Shows a full-screen loading indicator
 *  - Not authenticated: Shows the Auth stack (Login/Register/ForgotPassword)
 *  - Authenticated:     Shows the Main stack (Bottom tabs + Weather/Notes/Clock)
 *
 * The NavigationContainer lives here, wrapping everything.
 */

import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { AuthStackParamList, MainStackParamList } from './types';

// Auth screens
import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';
import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen';

// Main app screens (non-tab screens pushed onto the stack)
import WeatherScreen from '../screens/weather/WeatherScreen';
import NotesScreen from '../screens/notes/NotesScreen';
import ClockScreen from '../screens/clock/ClockScreen';
import CreateEditAlarmScreen from '../screens/clock/CreateEditAlarmScreen';
import AlarmSettingsScreen from '../screens/clock/AlarmSettingsScreen';

// The bottom tab navigator
import BottomTabNavigator from './BottomTabNavigator';

// ─── Stack Navigators ────────────────────────────────────────────────────────

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const MainStack = createNativeStackNavigator<MainStackParamList>();

// ─── Auth Stack ───────────────────────────────────────────────────────────────

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login"          component={LoginScreen} />
      <AuthStack.Screen name="Register"       component={RegisterScreen} />
      <AuthStack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
    </AuthStack.Navigator>
  );
}

// ─── Main Stack ───────────────────────────────────────────────────────────────

function MainNavigator() {
  const { colors } = useTheme();

  return (
    <MainStack.Navigator
      screenOptions={{
        // Common header style for non-tab screens
        headerStyle:      { backgroundColor: colors.surface },
        headerTintColor:  colors.text,
        headerTitleStyle: { fontWeight: '700', fontSize: 18 },
        headerBackTitle:  'Back',
        // Use native animation for smooth transitions
        animation:        'slide_from_right',
      }}>
      {/* The bottom tabs are the "home" of the main stack */}
      <MainStack.Screen
        name="MainTabs"
        component={BottomTabNavigator}
        options={{ headerShown: false }}
      />
      {/* Screens accessible from the Home dashboard cards */}
      <MainStack.Screen
        name="Weather"
        component={WeatherScreen}
        options={{ title: 'Weather' }}
      />
      <MainStack.Screen
        name="Notes"
        component={NotesScreen}
        options={{ title: 'Notes' }}
      />
      <MainStack.Screen
        name="Clock"
        component={ClockScreen}
        options={{ title: 'Clock & Alarms' }}
      />
      <MainStack.Screen
        name="AlarmEdit"
        component={CreateEditAlarmScreen}
        options={({ route }) => ({
          title: route.params?.alarm ? 'Edit Alarm' : 'New Alarm',
          presentation: 'modal',
        })}
      />
      <MainStack.Screen
        name="AlarmSettings"
        component={AlarmSettingsScreen}
        options={{ title: 'Alarm Settings' }}
      />
    </MainStack.Navigator>
  );
}

// ─── Root Navigator ───────────────────────────────────────────────────────────

export default function AppNavigator() {
  const { user, loading } = useAuth();
  const { colors, isDark } = useTheme();

  // Show a full-screen loading spinner while Firebase checks auth state.
  // This prevents a flash of the login screen on app start.
  if (loading) {
    return (
      <View style={[styles.loader, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer
      theme={{
        dark: isDark,
        colors: {
          primary:      colors.primary,
          background:   colors.background,
          card:         colors.surface,
          text:         colors.text,
          border:       colors.border,
          notification: colors.primary,
        },
        // fonts field is required by React Navigation Theme type
        fonts: {
          regular: { fontFamily: 'System', fontWeight: '400' },
          medium:  { fontFamily: 'System', fontWeight: '500' },
          bold:    { fontFamily: 'System', fontWeight: '700' },
          heavy:   { fontFamily: 'System', fontWeight: '900' },
        },
      }}>
      {/* Render auth or main stack based on user state */}
      {user ? <MainNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loader: {
    flex:            1,
    justifyContent:  'center',
    alignItems:      'center',
  },
});
