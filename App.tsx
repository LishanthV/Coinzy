import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, Text } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts, Sora_400Regular, Sora_600SemiBold, Sora_700Bold } from '@expo-google-fonts/sora';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { RootNavigator } from './src/navigation/RootNavigator';
import { colors } from './src/theme';
import { useAuthStore } from './src/store/useAuthStore';
import { scheduleDailyNotification, cancelDailyNotification } from './src/utils/notifications';
import { useFinanceStore } from './src/store/useFinanceStore';

export default function App() {
  const notificationsEnabled = useAuthStore((s) => s.notificationsEnabled);
  const user = useAuthStore((s) => s.user);
  const currentUserId = useFinanceStore((s) => s.currentUserId);

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
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: colors.textMuted, fontSize: 14 }}>Coinzy</Text>
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <StatusBar style="light" />
        <RootNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
