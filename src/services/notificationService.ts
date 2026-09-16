/**
 * NotificationService — Local and push notifications (v26 Modular API).
 *
 * Uses:
 *  - @notifee/react-native  — for local notifications and triggers (alarms, timers)
 *  - @react-native-firebase/messaging (v26 modular) — for FCM push notifications
 *
 * Exports:
 *  - initNotifications()            — call once on app start
 *  - requestNotificationPermission() — request Android 13+ POST_NOTIFICATIONS
 *  - sendImmediateNotification()    — display a local notification now
 *  - scheduleAlarm()               — schedule a trigger notification at a future time
 *  - cancelAlarm()                 — cancel a scheduled notification
 *  - CHANNELS                      — channel IDs for use when creating notifications
 */

import notifee, {
  AndroidImportance,
  TriggerType,
  TimestampTrigger,
  AndroidChannel,
  AuthorizationStatus,
} from '@notifee/react-native';
import {
  getMessaging,
  onMessage,
  getToken,
  onNotificationOpenedApp,
  getInitialNotification,
  setBackgroundMessageHandler,
  RemoteMessage,
} from '@react-native-firebase/messaging';

// ─── Channel definitions ──────────────────────────────────────────────────────

/**
 * Android notification channel IDs.
 * Each channel groups notifications by category and lets the user control
 * sound/vibration settings per group in the system settings.
 */
export const CHANNELS = {
  ALARMS:    'lifehub_alarms',
  REMINDERS: 'lifehub_reminders',
  GENERAL:   'lifehub_general',
} as const;

// ─── Initialization ──────────────────────────────────────────────────────────

/**
 * Initialize notifications.
 * Must be called once when the app starts (in App.tsx useEffect).
 *
 * Steps:
 *  1. Create Android notification channels
 *  2. Set up FCM foreground message listener
 *  3. Handle notification-open events (when user taps a notification)
 */
export async function initNotifications(): Promise<void> {
  // 1. Create Android notification channels
  await createChannels();

  const messaging = getMessaging();

  // 2. FCM foreground message listener
  //    When the app is in the foreground, FCM doesn't show a notification automatically.
  //    We use Notifee to display a local notification ourselves.
  onMessage(messaging, async (remoteMessage: RemoteMessage) => {
    const title = remoteMessage.notification?.title ?? 'LifeHub';
    const body  = remoteMessage.notification?.body  ?? '';
    if (body) {
      await sendImmediateNotification(title, body, CHANNELS.GENERAL);
    }
  });

  // 3. When a notification is tapped while the app is in background
  onNotificationOpenedApp(messaging, remoteMessage => {
    // You could navigate here using a global navigation ref
    console.log('Notification opened app:', remoteMessage.notification);
  });
}

// ─── Channel creation ─────────────────────────────────────────────────────────

async function createChannels(): Promise<void> {
  const channels: AndroidChannel[] = [
    {
      id:          CHANNELS.ALARMS,
      name:        'Alarms',
      importance:  AndroidImportance.HIGH,
      vibration:   true,
      sound:       'default',
      description: 'Wake up alarms set in the Clock module',
    },
    {
      id:          CHANNELS.REMINDERS,
      name:        'Reminders',
      importance:  AndroidImportance.HIGH,
      vibration:   true,
      sound:       'default',
      description: 'Habit and event reminders',
    },
    {
      id:          CHANNELS.GENERAL,
      name:        'General',
      importance:  AndroidImportance.DEFAULT,
      description: 'General app notifications',
    },
  ];

  // createChannel is idempotent — safe to call multiple times
  await Promise.all(channels.map(ch => notifee.createChannel(ch)));
}

// ─── Permission ───────────────────────────────────────────────────────────────

/**
 * Request notification permission from the user.
 * On Android 13+ (API 33+), this shows a system permission dialog.
 * Returns true if permission was granted.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  const settings = await notifee.requestPermission();
  return settings.authorizationStatus >= AuthorizationStatus.AUTHORIZED;
}

// ─── Local notifications ──────────────────────────────────────────────────────

/**
 * Display a local notification immediately.
 * @param title   — Notification title
 * @param body    — Notification body text
 * @param channel — Android notification channel ID (use CHANNELS.*)
 */
export async function sendImmediateNotification(
  title: string,
  body: string,
  channel: string = CHANNELS.GENERAL,
): Promise<string> {
  return notifee.displayNotification({
    title,
    body,
    android: {
      channelId:  channel,
      smallIcon:  'ic_launcher', // from android/app/src/main/res
      pressAction: { id: 'default' },
    },
  });
}

// ─── Scheduled alarms ─────────────────────────────────────────────────────────

/**
 * Schedule an exact alarm notification at a specific future timestamp.
 *
 * @param id          — Unique ID for this alarm (used for cancellation)
 * @param timestamp   — Unix timestamp in milliseconds (Date.getTime())
 * @param label       — Label shown in the notification
 */
export async function scheduleAlarm(
  id: string,
  timestamp: number,
  label: string,
): Promise<void> {
  const trigger: TimestampTrigger = {
    type:      TriggerType.TIMESTAMP,
    timestamp,
    // EXACT_ALARM_WAKEUP — wakes the device screen for alarm notifications
    alarmManager: {
      allowWhileIdle: true, // fires even in Doze mode
    },
  };

  await notifee.createTriggerNotification(
    {
      id,                          // Using the alarm ID as the notification ID allows cancellation
      title: '⏰ Alarm',
      body: label,
      android: {
        channelId:   CHANNELS.ALARMS,
        smallIcon:   'ic_launcher',
        importance:  AndroidImportance.HIGH,
        pressAction: { id: 'default' },
        vibrationPattern: [0, 250, 250, 250],
      },
    },
    trigger,
  );
}

/**
 * Cancel a previously scheduled alarm notification.
 * @param id — The same ID that was passed to scheduleAlarm()
 */
export async function cancelAlarm(id: string): Promise<void> {
  await notifee.cancelTriggerNotification(id);
}
