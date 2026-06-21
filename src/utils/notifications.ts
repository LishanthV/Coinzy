import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Configure how the OS handles notifications when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Request permission for local notifications from the operating system.
 * Returns true if permissions were granted, false otherwise.
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'web') return false;

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  // On Android, setup a channels channel for notification delivery
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('daily-reminders', {
      name: 'Daily Reminders',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#7C3AED', // primary theme color
    });
  }

  return finalStatus === 'granted';
}

/**
 * Check whether the application has permission to trigger notifications.
 */
export async function hasNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted';
}

/**
 * Schedules a daily recurring notification at 8:00 PM (20:00).
 */
export async function scheduleDailyNotification() {
  if (Platform.OS === 'web') return;

  // Clear any existing notifications first to avoid multiples
  await cancelDailyNotification();

  const trigger: Notifications.CalendarTriggerInput = {
    type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
    hour: 20, // 8:00 PM
    minute: 0,
    repeats: true,
  };

  // Schedule a new daily alert at 8:00 PM local time
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Track your spending! 🪙',
      body: 'Take a quick moment to log today\'s transactions and stay within your budgets.',
      sound: true,
    },
    trigger,
  });
}

/**
 * Cancels all scheduled local notifications.
 */
export async function cancelDailyNotification() {
  if (Platform.OS === 'web') return;
  await Notifications.cancelAllScheduledNotificationsAsync();
}
