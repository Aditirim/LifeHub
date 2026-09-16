/**
 * index.js — App entry point.
 *
 * The FCM background message handler MUST be registered here (not in App.tsx),
 * because it needs to run even before React mounts any components.
 * This is a Firebase/React Native requirement for @react-native-firebase v26.
 *
 * Uses the modular API: getMessaging() + setBackgroundMessageHandler()
 */

import 'react-native-gesture-handler'; // Must be the first import
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import {
  getMessaging,
  setBackgroundMessageHandler,
} from '@react-native-firebase/messaging';

/**
 * FCM background message handler.
 * Runs when a push notification arrives while the app is in the background
 * or completely closed. Must be a plain async function (no React hooks).
 *
 * For data-only FCM messages (no "notification" key), you can use
 * notifee.displayNotification() here to show a local notification.
 * For messages with a "notification" key, Android shows the notification
 * automatically even without this handler.
 */
const messaging = getMessaging();
setBackgroundMessageHandler(messaging, async remoteMessage => {
  // Optional: log or handle background data messages here
  // Example: schedule a local notification using notifee
  console.log('Background FCM message received:', remoteMessage.notification?.title);
});

AppRegistry.registerComponent(appName, () => App);
