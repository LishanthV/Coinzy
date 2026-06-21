import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  KeyboardAvoidingView,
  Platform,
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

  // Form Details
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Submit initial sign-up credentials
  const onSubmit = async () => {
    if (!name.trim() || !email.trim() || !password.trim()) {
      setError('Fill in every field to continue.');
      return;
    }
    if (!email.includes('@')) {
      setError('Enter a valid email address.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setError('');
    setIsLoading(true);

    try {
      const { error: err } = await signUp(name.trim(), email.trim(), password.trim());
      if (err) {
        setError(err.message || 'Failed to create account.');
      }
    } catch (err: any) {
      setError(err?.message || 'An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
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
              placeholder="Min. 6 characters"
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
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
    marginTop: spacing.md,
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
  emailHighlight: {
    color: colors.text,
    fontFamily: fonts.bodySemiBold,
  },
  error: {
    color: colors.expense,
    fontFamily: fonts.bodyMedium,
    fontSize: fontSizes.sm,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  // Split OTP Fields (adapted for 6 digits)
  otpContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: spacing.xs,
    marginTop: spacing.lg,
    marginBottom: spacing.xl,
  },
  otpBox: {
    width: 46,
    height: 48,
    borderRadius: radii.sm,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  otpBoxFocused: {
    borderColor: colors.primary,
    backgroundColor: colors.surfaceRaised,
  },
  otpBoxFilled: {
    borderColor: colors.primarySoft,
  },
  otpChar: {
    fontSize: fontSizes.lg,
    fontFamily: fonts.displayBold,
    color: colors.text,
  },
  otpCursor: {
    position: 'absolute',
    height: 20,
    width: 2,
    backgroundColor: colors.primary,
  },
  hiddenInput: {
    position: 'absolute',
    width: 0,
    height: 0,
    opacity: 0,
  },
  // Resend code styling
  resendContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
  },
  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  resendTimerText: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: fontSizes.sm,
  },
  resendPressable: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.sm,
  },
  resendButtonText: {
    color: colors.primary,
    fontFamily: fonts.bodyMedium,
    fontSize: fontSizes.sm,
  },
});
