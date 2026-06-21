/**
 * Mock notifications implementation to bypass expo-notifications in Expo Go.
 * This removes all native push notification warnings/errors while keeping UI toggles functional.
 */

export async function requestNotificationPermissions(): Promise<boolean> {
  // Mock success so settings switches can be toggled in UI
  return true;
}

export async function hasNotificationPermissions(): Promise<boolean> {
  return true;
}

export async function scheduleDailyNotification() {
  // No-op: Local notifications are disabled
}

export async function cancelDailyNotification() {
  // No-op: Local notifications are disabled
}
