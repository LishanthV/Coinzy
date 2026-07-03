import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Platform } from 'react-native';
import * as Updates from 'expo-updates';
import { useAppTheme } from '../theme';

export default function UpdateBanner() {
  const { colors, fonts } = useAppTheme();
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [slideAnim] = useState(() => new Animated.Value(-100));

  useEffect(() => {
    if (__DEV__) return;

    async function check() {
      try {
        const update = await Updates.checkForUpdateAsync();
        if (update.isAvailable) {
          setUpdateAvailable(true);
          Animated.spring(slideAnim, {
            toValue: 0,
            useNativeDriver: true,
            tension: 40,
            friction: 8,
          }).start();
        }
      } catch (_) {}
    }

    check();
  }, [slideAnim]);

  const handleUpdate = async () => {
    setLoading(true);
    try {
      await Updates.fetchUpdateAsync();
      await Updates.reloadAsync();
    } catch (_) {
      setLoading(false);
    }
  };

  if (!updateAvailable) return null;

  return (
    <Animated.View style={[
      styles.banner,
      {
        backgroundColor: colors.primary,
        transform: [{ translateY: slideAnim }],
        paddingTop: Platform.OS === 'ios' ? 50 : 12,
      }
    ]}>
      <View style={styles.content}>
        <Text style={[styles.text, { fontFamily: fonts.bodySemiBold, color: colors.white }]}>
          🚀 New update available!
        </Text>
        <TouchableOpacity
          onPress={handleUpdate}
          style={[styles.button, { backgroundColor: colors.white }]}
          disabled={loading}
        >
          <Text style={[styles.buttonText, { color: colors.primary, fontFamily: fonts.bodySemiBold }]}>
            {loading ? 'Updating...' : 'Update Now'}
          </Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingVertical: 12,
    zIndex: 9999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 5,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  text: {
    fontSize: 14,
  },
  button: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  buttonText: {
    fontSize: 13,
  },
});
