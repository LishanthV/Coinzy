import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, Text, Platform, Alert } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useFonts, Sora_400Regular, Sora_600SemiBold, Sora_700Bold } from '@expo-google-fonts/sora';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { RootNavigator } from './src/navigation/RootNavigator';
import { colors, useThemeStore } from './src/theme';
import { useAuthStore } from './src/store/useAuthStore';
import { scheduleDailyNotification, cancelDailyNotification } from './src/utils/notifications';
import { useFinanceStore } from './src/store/useFinanceStore';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import UpdateBanner from './src/components/UpdateBanner';

import { logger } from './src/utils/logger';

export default function App() {
  const notificationsEnabled = useAuthStore((s) => s.notificationsEnabled);
  const user = useAuthStore((s) => s.user);
  const currentUserId = useFinanceStore((s) => s.currentUserId);
  const themeMode = useThemeStore((s) => s.themeMode);

  useEffect(() => {
    // 1. Hook global error handlers to intercept fatal app crashes
    if (typeof ErrorUtils !== 'undefined') {
      const defaultErrorHandler = ErrorUtils.getGlobalHandler();
      ErrorUtils.setGlobalHandler((error, isFatal) => {
        console.error('[Global JS Error]', error, 'Fatal:', isFatal);
        logger.error(isFatal ? '[FATAL] ' + error.message : error.message, error, 'AppGlobal');
        if (isFatal) {
          Alert.alert(
            'Application Error',
            'An unexpected error occurred. The app has paused rendering to protect your database transactions. Please restart or reload.',
            [{ text: 'Dismiss' }]
          );
        }
        if (defaultErrorHandler) {
          defaultErrorHandler(error, isFatal);
        }
      });
    }

    // 2. Hook global unhandled promise rejection tracking
    if (Platform.OS !== 'web') {
      try {
        const tracking = require('promise/setimmediate/rejection-tracking');
        tracking.enable({
          all: true,
          onUnhandled: (id: any, error: any) => {
            console.warn('[Global Unhandled Rejection] Rejection ID:', id, 'Details:', error);
            logger.error('[Unhandled Rejection] ID: ' + id, error, 'AppGlobalPromise');
          },
        });
      } catch (e) {
        console.warn('Could not load promise rejection tracking utility:', e);
      }
    }
  }, []);

  useEffect(() => {
    if (user?.id && currentUserId !== user.id) {
      useFinanceStore.getState().loadUserData(user.id);
    }
  }, [user, currentUserId]);

  useEffect(() => {
    if (notificationsEnabled) {
      scheduleDailyNotification().catch(console.error);
    } else {
      cancelDailyNotification().catch(console.error);
    }
  }, [notificationsEnabled]);

  const [fontsLoaded] = useFonts({
    Sora_400Regular,
    Sora_600SemiBold,
    Sora_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });

  if (!fontsLoaded) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>Coinzy</Text>
        </View>
      </GestureHandlerRootView>
    );
  }

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <NavigationContainer>
            <StatusBar style={themeMode === 'dark' ? 'light' : 'dark'} />
            <RootNavigator />
          </NavigationContainer>
          <UpdateBanner />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
