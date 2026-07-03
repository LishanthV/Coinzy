import * as Updates from 'expo-updates';
import { Alert } from 'react-native';

export async function checkForUpdates() {
  if (__DEV__) return; // Skip in development

  try {
    const update = await Updates.checkForUpdateAsync();

    if (update.isAvailable) {
      Alert.alert(
        '🚀 Update Available',
        'A new version of Coinzy is available. Update now for the latest features and fixes.',
        [
          { text: 'Later', style: 'cancel' },
          {
            text: 'Update Now',
            onPress: async () => {
              await Updates.fetchUpdateAsync();
              await Updates.reloadAsync();
            },
          },
        ]
      );
    }
  } catch (err) {
    // Silently fail — don't block the app
  }
}

export function getCurrentVersion(): string {
  return Updates.runtimeVersion || '1.0.0';
}

export function getUpdateId(): string {
  return Updates.updateId || 'Development Build';
}
