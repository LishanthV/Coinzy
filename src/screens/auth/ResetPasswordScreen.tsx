import React, { useState } from 'react';
import { StyleSheet, Text, View, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, FormInput } from '../../components/ui';
import { colors, fonts, fontSizes, spacing } from '../../theme';
import { RootStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'ResetPassword'>;
type Route = RouteProp<RootStackParamList, 'ResetPassword'>;
const BASE_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:5000';

export default function ResetPasswordScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Route>();
  const email = params?.email ?? '';

  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const onSubmit = async () => {
    if (otp.trim().length !== 6) {
      setError('Enter the 6-digit code.');
      return;
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setError('');
    setIsLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp: otp.trim(), newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Something went wrong.');
        return;
      }
      Alert.alert('Success', 'Password reset successfully. Please log in.', [
        { text: 'OK', onPress: () => navigation.navigate('Login') },
      ]);
    } catch (e: any) {
      setError('Connection failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1, width: '100%' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.content}>
          <View>
            <Text style={styles.title}>Reset password</Text>
            <Text style={styles.subtitle}>
              Enter the code sent to {email} and choose a new password.
            </Text>
            <FormInput
              label="6-digit code"
              placeholder="123456"
              value={otp}
              onChangeText={setOtp}
              keyboardType="number-pad"
              maxLength={6}
            />
            <FormInput
              label="New password"
              placeholder="Min. 8 characters"
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
              autoCapitalize="none"
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </View>
          <View style={{ marginBottom: spacing.xl }}>
            <Button label="Reset password" onPress={onSubmit} loading={isLoading} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: {
    flex: 1, width: '100%', maxWidth: 480, alignSelf: 'center',
    justifyContent: 'space-between', paddingHorizontal: spacing.xl,
  },
  title: { color: colors.text, fontFamily: fonts.displayBold, fontSize: fontSizes.xxl, marginBottom: spacing.sm, marginTop: spacing.md },
  subtitle: { color: colors.textMuted, fontFamily: fonts.body, fontSize: fontSizes.md, marginBottom: spacing.xl, lineHeight: 20 },
  error: { color: colors.expense, fontFamily: fonts.bodyMedium, fontSize: fontSizes.sm, marginTop: spacing.md, textAlign: 'center' },
});