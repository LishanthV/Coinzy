import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Svg, { Circle, G } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../components/ui';
import { colors, fonts, fontSizes, spacing } from '../../theme';
import { RootStackParamList } from '../../navigation/types';
import { useAuthStore } from '../../store/useAuthStore';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Onboarding'>;

export default function OnboardingScreen() {
  const navigation = useNavigation<Nav>();
  const completeOnboarding = useAuthStore((s) => s.completeOnboarding);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.hero}>
        <OrbitMark />
        <Text style={styles.brand}>Coinzy</Text>
        <Text style={styles.tagline}>Every dollar, accounted for.</Text>
        <Text style={styles.subtitle}>
          Track spending, set budgets, and see where your money goes — all in one calm,
          uncluttered place.
        </Text>
      </View>

      <View style={styles.actions}>
        <Button
          label="Create an account"
          onPress={() => {
            completeOnboarding();
            navigation.navigate('SignUp');
          }}
        />
        <Button
          label="I already have an account"
          variant="secondary"
          onPress={() => {
            completeOnboarding();
            navigation.navigate('Login');
          }}
          style={{ marginTop: spacing.md }}
        />
      </View>
    </SafeAreaView>
  );
}

// A small concentric-rings mark — echoes the dashboard's flow gauge.
function OrbitMark() {
  const size = 120;
  return (
    <Svg width={size} height={size} style={{ marginBottom: spacing.xl }}>
      <G origin={`${size / 2}, ${size / 2}`}>
        <Circle cx={size / 2} cy={size / 2} r={54} stroke={colors.surfaceRaised} strokeWidth={2} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={42}
          stroke={colors.primary}
          strokeWidth={10}
          strokeDasharray="180 264"
          strokeLinecap="round"
          fill="none"
          rotation="-90"
          originX={size / 2}
          originY={size / 2}
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={26}
          stroke={colors.income}
          strokeWidth={8}
          strokeDasharray="110 164"
          strokeLinecap="round"
          fill="none"
          rotation="40"
          originX={size / 2}
          originY={size / 2}
        />
      </G>
    </Svg>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.xl,
    justifyContent: 'space-between',
  },
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: {
    color: colors.text,
    fontFamily: fonts.displayBold,
    fontSize: fontSizes.display,
    marginBottom: spacing.sm,
  },
  tagline: {
    color: colors.text,
    fontFamily: fonts.bodyMedium,
    fontSize: fontSizes.lg,
    marginBottom: spacing.md,
  },
  subtitle: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: fontSizes.md,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: spacing.lg,
  },
  actions: {
    paddingBottom: spacing.xl,
  },
});
