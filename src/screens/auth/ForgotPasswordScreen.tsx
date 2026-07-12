import React, { useState } from 'react';
import { StyleSheet, Text, View, KeyboardAvoidingView, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, FormInput } from '../../components/ui';
import { colors, fonts, fontSizes, spacing } from '../../theme';
import { RootStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'ForgotPassword'>;
const BASE_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:5000';

export default function ForgotPasswordScreen() {
  const navigation = useNavigation<Nav>();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const onSubmit = async () => {
    if (!email.trim() || !email.includes('@')) {
      setError('Enter a valid email address.');
      return;
    }
    setError('');
    setIsLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Something went wrong.');
        return;
      }
      navigation.navigate('ResetPassword', { email: email.trim() });
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
            <Text style={styles.title}>Forgot password?</Text>
            <Text style={styles.subtitle}>
              Enter your email and we'll send you a code to reset your password.
            </Text>
            <FormInput
              label="Email"
              placeholder="you@example.com"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </View>
          <View style={{ marginBottom: spacing.xl }}>
            <Button label="Send reset code" onPress={onSubmit} loading={isLoading} />
            <Button
              label="Back to login"
              variant="ghost"
              onPress={() => navigation.goBack()}
              style={{ marginTop: spacing.sm }}
            />
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