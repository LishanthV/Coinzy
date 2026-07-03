import React, { useEffect } from 'react';
import { AppState, AppStateStatus, View, ActivityIndicator } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSecurityStore } from '../store/useSecurityStore';
import LoginScreen from '../screens/auth/LoginScreen';
import SignUpScreen from '../screens/auth/SignUpScreen';
import OTPVerificationScreen from '../screens/auth/OTPVerificationScreen';
import OnboardingScreen from '../screens/onboarding/OnboardingScreen';
import { MainNavigator } from './MainNavigator';
import LockScreen from '../screens/LockScreen';
import PinSetupScreen from '../screens/PinSetupScreen';
import TxnDetailScreen from '../screens/history/TxnDetailScreen';
import AddTransactionScreen from '../screens/transactions/AddTransactionScreen';
import SavingsGoalsScreen from '../screens/goals/SavingsGoalsScreen';
import SpendingForecastScreen from '../screens/SpendingForecastScreen';
import LoanPlannerScreen from '../screens/LoanPlannerScreen';
import { useAuthStore } from '../store/useAuthStore';
import { RootStackParamList } from './types';
import { colors } from '../theme';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const { user, isLoading, initAuth } = useAuthStore();
  const { isLocked, isLockEnabled, hasPin, initSecurity, lock } = useSecurityStore();

  useEffect(() => {
    initAuth();
  }, []);

  useEffect(() => {
    if (user?.id) {
      initSecurity(user.id);
    }
  }, [user?.id]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'background' && isLockEnabled && hasPin) {
        lock();
      }
    });
    return () => subscription.remove();
  }, [isLockEnabled, hasPin, lock]);

  // Show loading spinner while restoring session
  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (isLocked) {
    return <LockScreen />;
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!user ? (
        <>
          <Stack.Screen name="Onboarding" component={OnboardingScreen} />
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="SignUp" component={SignUpScreen} />
          <Stack.Screen name="OTPVerification" component={OTPVerificationScreen} />
        </>
      ) : (
        <>
          <Stack.Screen name="Main" component={MainNavigator} />
          <Stack.Screen name="TxnDetail" component={TxnDetailScreen} />
          <Stack.Screen name="AddTransaction" component={AddTransactionScreen} />
          <Stack.Screen
            name="PinSetup"
            component={PinSetupScreen}
            options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
          />
          <Stack.Screen
            name="SavingsGoals"
            component={SavingsGoalsScreen}
            options={{ animation: 'slide_from_right' }}
          />
          <Stack.Screen
            name="SpendingForecast"
            component={SpendingForecastScreen}
            options={{ animation: 'slide_from_right' }}
          />
          <Stack.Screen
            name="LoanPlanner"
            component={LoanPlannerScreen}
            options={{ animation: 'slide_from_right' }}
          />
        </>
      )}
    </Stack.Navigator>
  );
}