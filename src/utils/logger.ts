import Constants from 'expo-constants';
import { Platform } from 'react-native';

const LOG_SERVER = __DEV__
  ? 'http://10.224.237.42:5000/api/logs'
  : 'https://coinzy-badr.onrender.com/api/logs';

async function sendLog(level: string, message: string, extra?: Record<string, any>) {
  if (!LOG_SERVER) return;
  try {
    await fetch(LOG_SERVER, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        level,
        message,
        platform: Platform.OS,
        appVersion: Constants.expoConfig?.version || '1.0.0',
        timestamp: new Date().toISOString(),
        ...extra,
      }),
    });
  } catch (_) {}
}

export const logger = {
  error: (message: string, error?: any, screen?: string, userId?: number) =>
    sendLog('ERROR', message, { stack: error?.stack, screen, userId }),
  warn: (message: string, screen?: string) =>
    sendLog('WARN', message, { screen }),
  info: (message: string) =>
    sendLog('INFO', message),
};