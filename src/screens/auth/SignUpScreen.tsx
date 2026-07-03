import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, FormInput } from '../../components/ui';
import { colors, fonts, fontSizes, spacing, radii } from '../../theme';
import { RootStackParamList } from '../../navigation/types';
import { useAuthStore } from '../../store/useAuthStore';

type Nav = NativeStackNavigationProp<RootStackParamList, 'SignUp'>;

export default function SignUpScreen() {
  const navigation = useNavigation<Nav>();
  const signUp = useAuthStore((s) => s.signUp);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const onSubmit = async () => {
    if (!name.trim() || !email.trim() || !password.trim()) {
      setError('Fill in every field to continue.');
      return;
    }
    if (!email.includes('@')) {
      setError('Enter a valid email address.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (!/[A-Z]/.test(password)) {
      setError('Password must contain at least one uppercase letter.');
      return;
    }
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      setError('Password must contain at least one special character.');
      return;
    }
    setError('');
    setIsLoading(true);

    try {
      const BASE_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:5000';
      const res = await fetch(`${BASE_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), password: password.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409) {
          Alert.alert(
            'User Already Created',
            'An account with this email already exists. Please log in instead.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Log In', onPress: () => navigation.navigate('Login') }
            ]
          );
        } else {
          setError(data.error || 'Failed to create account.');
        }
        return;
      }
      navigation.navigate('OTPVerification', { email: email.trim(), name: name.trim() });
    } catch (err: any) {
      setError(err?.message || 'Connection failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1, width: '100%' }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.content}>
          <View>
            <Text style={styles.title}>Create your account</Text>
            <Text style={styles.subtitle}>
              Set up Coinzy in under a minute. Your data stays on this device.
            </Text>

            <FormInput
              label="Name"
              placeholder="Jordan Lee"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
            />
            <FormInput
              label="Email"
              placeholder="you@example.com"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <FormInput
              label="Password"
              placeholder="Min. 8 chars, 1 uppercase, 1 special"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </View>

          <View style={{ marginBottom: spacing.xl }}>
            <Button label="Create account" onPress={onSubmit} loading={isLoading} />
            <Button
              label="Already have an account? Log in"
              variant="ghost"
              onPress={() => navigation.navigate('Login')}
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
    flex: 1,
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
  },
  title: {
    color: colors.text,
    fontFamily: fonts.displayBold,
    fontSize: fontSizes.xxl,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  subtitle: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: fontSizes.md,
    marginBottom: spacing.xl,
    lineHeight: 20,
  },
  error: {
    color: colors.expense,
    fontFamily: fonts.bodyMedium,
    fontSize: fontSizes.sm,
    marginTop: spacing.md,
    textAlign: 'center',
  },
});