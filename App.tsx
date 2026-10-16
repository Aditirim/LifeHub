/**
 * App.tsx — Root component of LifeHub.
 *
 * Renders providers in the correct order:
 *  1. GestureHandlerRootView — Required by React Navigation (gesture-based nav)
 *  2. SafeAreaProvider       — Handles notch/status bar safe areas
 *  3. ThemeProvider          — Provides light/dark theme context
 *  4. AuthProvider           — Provides Firebase auth state context
 *  5. AppNavigator           — Root navigation (auth vs main)
 *
 * Also initializes notifications on first render.
 */

import 'react-native-gesture-handler'; // MUST be the first import in App.tsx
import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ThemeProvider } from './src/context/ThemeContext';
import { AuthProvider } from './src/context/AuthContext';
import AppNavigator from './src/navigation/AppNavigator';
import { initNotifications } from './src/services/notificationService';
import { requestNotificationPermission } from './src/native/AlarmModule';

function App(): React.JSX.Element {
  // Initialize notification channels and FCM listeners when the app starts.
  // Also proactively request notification permission on Android 13+ (API 33+)
  // so alarms and timers can show full-screen and heads-up notifications.
  useEffect(() => {
    initNotifications().catch(() => {});
    requestNotificationPermission().catch(() => {});
  }, []);

  return (
    // GestureHandlerRootView must wrap everything for React Navigation gestures
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/* SafeAreaProvider provides safe area insets (notch, status bar, etc.) */}
      <SafeAreaProvider>
        {/* StatusBar is managed imperatively to avoid TypeScript prop issues */}
        {/* StatusBar appearance is set via StatusBar.setBarStyle in each screen */}

        {/* ThemeProvider → AuthProvider → Navigator (order matters) */}
        <ThemeProvider>
          <AuthProvider>
            <AppNavigator />
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default App;
