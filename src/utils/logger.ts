const LOG_SERVER = __DEV__
  ? 'http://10.224.237.42:3001/log'  // Pre-configured with your PC's local IP address
  : null;

async function sendLog(level: string, message: string, extra?: Record<string, any>) {
  if (!LOG_SERVER) return;
  try {
    await fetch(LOG_SERVER, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        level,
        message,
        timestamp: new Date().toISOString(),
        ...extra,
      }),
    });
  } catch (_) {}
}

export const logger = {
  error: (message: string, error?: any, screen?: string) =>
    sendLog('ERROR', message, { stack: error?.stack, screen }),
  warn: (message: string, screen?: string) =>
    sendLog('WARN', message, { screen }),
  info: (message: string) =>
    sendLog('INFO', message),
};
