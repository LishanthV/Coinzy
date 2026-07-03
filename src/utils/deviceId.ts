import AsyncStorage from '@react-native-async-storage/async-storage';
import 'react-native-get-random-values';

const DEVICE_ID_KEY = 'coinzy_device_id';

let _cachedDeviceId: string | null = null;

/**
 * Returns a stable unique device ID for this installation.
 * Generated once and persisted to AsyncStorage.
 */
export async function getDeviceId(): Promise<string> {
  if (_cachedDeviceId) return _cachedDeviceId;

  try {
    const stored = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (stored) {
      _cachedDeviceId = stored;
      return stored;
    }
    // Generate a new UUID for this device
    const newId = generateUUID();
    await AsyncStorage.setItem(DEVICE_ID_KEY, newId);
    _cachedDeviceId = newId;
    return newId;
  } catch {
    // Fallback — generate per session if storage fails
    if (!_cachedDeviceId) _cachedDeviceId = generateUUID();
    return _cachedDeviceId;
  }
}

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
