import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function requestNotificationPermissions(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;

  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function hasNotificationPermissions(): Promise<boolean> {
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted';
}

export async function scheduleDailyNotification() {
  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) return;

  // Cancel existing to avoid duplicates
  await cancelDailyNotification();

  const messages = [
    { title: '💰 Track Your Spending', body: "Have you logged today's expenses? Stay on top of your finances!" },
    { title: '📊 Daily Finance Check', body: 'Take 2 minutes to review your budget today with Coinzy.' },
    { title: '🎯 Budget Reminder', body: 'Check your spending limits and savings goals in Coinzy.' },
    { title: '💡 Money Tip', body: 'Small daily savings add up! Log your transactions in Coinzy today.' },
    { title: '🏦 Coinzy Daily', body: "Your finances need attention! Open Coinzy to review today's summary." },
  ];

  const random = messages[Math.floor(Math.random() * messages.length)];

  await Notifications.scheduleNotificationAsync({
    content: {
      title: random.title,
      body: random.body,
      sound: true,
      data: { screen: 'Dashboard' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: 20, // 8 PM every day
      minute: 0,
    } as any, // Cast to any because the typings in expo-notifications daily trigger can be strict depending on version
  });

  // Also schedule a morning reminder
  await Notifications.scheduleNotificationAsync({
    content: {
      title: '☀️ Good Morning!',
      body: 'Start your day right — check your Coinzy budget and plan your spending.',
      sound: true,
      data: { screen: 'Dashboard' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: 9, // 9 AM every day
      minute: 0,
    } as any,
  });
}

export async function cancelDailyNotification() {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

export async function scheduleUpdateNotification(version: string) {
  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: '🚀 Coinzy Update Available!',
      body: `Version ${version} is ready with new features and fixes. Open the app to update now.`,
      sound: true,
    },
    trigger: null, // Send immediately
  });
}
