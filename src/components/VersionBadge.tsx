import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import * as Updates from 'expo-updates';
import Constants from 'expo-constants';
import { useAppTheme } from '../theme';

export default function VersionBadge() {
  const { colors, fonts, fontSizes } = useAppTheme();
  const version = Constants.expoConfig?.version || '1.0.0';
  const updateId = Updates.updateId;
  const isEmbedded = !updateId;

  return (
    <View style={styles.container}>
      <Text style={[styles.version, { color: colors.primary, fontFamily: fonts.displayBold, fontSize: fontSizes.md }]}>
        Coinzy v{version}
      </Text>
      <Text style={[styles.build, { color: colors.textMuted, fontFamily: fonts.body, fontSize: fontSizes.xs }]}>
        {isEmbedded ? 'Original build' : `Update: ${updateId?.slice(0, 8)}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  version: {
    fontWeight: '700',
  },
  build: {
    marginTop: 4,
  },
});
