import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  Pressable,
  Animated,
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
import { Ionicons } from '@expo/vector-icons';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Login'>;

export default function LoginScreen() {
  const navigation = useNavigation<Nav>();
  const sendOtp = useAuthStore((s) => s.sendOtp);
  const verifyOtp = useAuthStore((s) => s.verifyOtp);

  // Form Details
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Verification State
  const [isVerifying, setIsVerifying] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [timerSeconds, setTimerSeconds] = useState(60);
  const [isInputFocused, setIsInputFocused] = useState(false);

  // Animation and Ref
  const inputRef = useRef<TextInput>(null);
  const cursorOpacity = useRef(new Animated.Value(1)).current;

  // Blinking cursor effect
  useEffect(() => {
    let animation: Animated.CompositeAnimation;
    if (isVerifying && isInputFocused) {
      animation = Animated.loop(
        Animated.sequence([
          Animated.timing(cursorOpacity, {
            toValue: 0,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(cursorOpacity, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      );
      animation.start();
    } else {
      cursorOpacity.setValue(1);
    }
    return () => {
      if (animation) animation.stop();
    };
  }, [isVerifying, isInputFocused]);

  // Resend Timer Effect
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isVerifying && timerSeconds > 0) {
      interval = setInterval(() => {
        setTimerSeconds((prev) => prev - 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isVerifying, timerSeconds]);

  // Submit initial login credentials
  const onSubmit = async () => {
    if (!email.trim()) {
      setError('Enter your email.');
      return;
    }
    setError('');
    setIsLoading(true);

    try {
      const { error: err } = await sendOtp(email.trim());
      if (err) {
        setError(err.message || 'Failed to send OTP code. Please check server connection.');
        return;
      }
      setIsVerifying(true);
      setOtpCode('');
      setTimerSeconds(60);
    } catch (err: any) {
      setError(err?.message || 'An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Triggered when OTP code is resent
  const onResendCode = async () => {
    setError('');
    setOtpCode('');
    setTimerSeconds(60);
    setIsLoading(true);

    try {
      const { error: err } = await sendOtp(email.trim());
      if (err) {
        setError(err.message || 'Failed to resend OTP code.');
        return;
      }
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    } catch (err: any) {
      setError(err?.message || 'An unexpected error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  // Validate code and complete login
  const onVerifyCode = async (codeToVerify: string) => {
    setError('');
    setIsLoading(true);

    try {
      const { error: err } = await verifyOtp(email.trim(), codeToVerify);
      if (err) {
        setError(err.message || 'Invalid code. Please try again.');
      }
    } catch (err: any) {
      setError(err?.message || 'An unexpected error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-verify when 6 digits are completed
  useEffect(() => {
    if (otpCode.length === 6) {
      onVerifyCode(otpCode);
    }
  }, [otpCode]);

  // Format timer
  const formatTimer = () => {
    const minutes = Math.floor(timerSeconds / 60);
    const seconds = timerSeconds % 60;
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  const codeLength = 6;
  const codeDigits = Array(codeLength).fill(0);

  if (isVerifying) {
    return (
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.content}>
            <View>
              {/* Back button */}
              <Pressable
                style={styles.backButton}
                onPress={() => {
                  setIsVerifying(false);
                }}
              >
                <Ionicons name="arrow-back" size={24} color={colors.text} />
              </Pressable>

              <Text style={styles.title}>Verify your identity</Text>
              <Text style={styles.subtitle}>
                We've sent a 6-digit verification code to <Text style={styles.emailHighlight}>{email}</Text>. Please enter it below.
              </Text>

              {/* Split OTP Inputs */}
              <Pressable
                style={styles.otpContainer}
                onPress={() => inputRef.current?.focus()}
              >
                {codeDigits.map((_, idx) => {
                  const char = otpCode[idx] || '';
                  const isFocused = idx === otpCode.length && isInputFocused;
                  return (
                    <View
                      key={idx}
                      style={[
                        styles.otpBox,
                        isFocused && styles.otpBoxFocused,
                        char !== '' && styles.otpBoxFilled,
                      ]}
                    >
                      <Text style={styles.otpChar}>{char}</Text>
                      {isFocused && (
                        <Animated.View
                          style={[styles.otpCursor, { opacity: cursorOpacity }]}
                        />
                      )}
                    </View>
                  );
                })}
              </Pressable>

              {/* Hidden text input to handle inputs */}
              <TextInput
                ref={inputRef}
                value={otpCode}
                onChangeText={(val) => {
                  const cleaned = val.replace(/[^0-9]/g, '');
                  setOtpCode(cleaned);
                }}
                keyboardType="number-pad"
                maxLength={codeLength}
                style={styles.hiddenInput}
                onFocus={() => setIsInputFocused(true)}
                onBlur={() => setIsInputFocused(false)}
                autoFocus
              />

              {error ? <Text style={styles.error}>{error}</Text> : null}

              {/* Resend code text / button */}
              <View style={styles.resendContainer}>
                {timerSeconds > 0 ? (
                  <View style={styles.timerRow}>
                    <Ionicons name="time-outline" size={16} color={colors.textMuted} />
                    <Text style={styles.resendTimerText}>
                      Resend code in {formatTimer()}
                    </Text>
                  </View>
                ) : (
                  <Pressable onPress={onResendCode} style={styles.resendPressable} disabled={isLoading}>
                    <Ionicons name="refresh" size={16} color={colors.primary} />
                    <Text style={styles.resendButtonText}>Resend verification code</Text>
                  </Pressable>
                )}
              </View>
            </View>

            <View style={{ marginBottom: spacing.xl }}>
              <Button
                label="Verify Code"
                onPress={() => onVerifyCode(otpCode)}
                disabled={otpCode.length < 6}
                loading={isLoading}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.content}>
          <View>
            <Text style={styles.title}>Welcome back</Text>
            <Text style={styles.subtitle}>Log in to see your latest balances and budgets.</Text>

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
            <Button label="Log in" onPress={onSubmit} loading={isLoading} />
            <Button
              label="New to Coinzy? Create an account"
              variant="ghost"
              onPress={() => navigation.navigate('SignUp')}
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
