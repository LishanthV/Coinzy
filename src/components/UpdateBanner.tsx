import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Platform,
  ActivityIndicator,
} from 'react-native';
import * as Updates from 'expo-updates';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../theme';

export default function UpdateBanner() {
  const { colors, fonts } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const slideAnim = useRef(new Animated.Value(120)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (__DEV__) return;

    async function check() {
      try {
        const update = await Updates.checkForUpdateAsync();
        if (update.isAvailable) {
          setUpdateAvailable(true);
          Animated.parallel([
            Animated.spring(slideAnim, {
              toValue: 0,
              useNativeDriver: true,
              tension: 50,
              friction: 9,
            }),
            Animated.timing(opacityAnim, {
              toValue: 1,
              duration: 300,
              useNativeDriver: true,
            }),
          ]).start();
        }
      } catch (_) {}
    }

    // Check immediately, then re-check every 15 minutes
    check();
    const interval = setInterval(check, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, [slideAnim, opacityAnim]);

  const dismiss = () => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 120,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => setDismissed(true));
  };

  const handleUpdate = async () => {
    setLoading(true);
    try {
      await Updates.fetchUpdateAsync();
      await Updates.reloadAsync();
    } catch (_) {
      setLoading(false);
    }
  };

  if (!updateAvailable || dismissed) return null;

  return (
    <Animated.View
      style={[
        styles.wrapper,
        {
          bottom: insets.bottom + 16,
          transform: [{ translateY: slideAnim }],
          opacity: opacityAnim,
        },
      ]}
    >
      <View style={[styles.banner, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {/* Icon + Text */}
        <View style={styles.left}>
          <View style={[styles.iconBadge, { backgroundColor: colors.primary + '22' }]}>
            <Text style={styles.icon}>🚀</Text>
          </View>
          <View style={styles.textBlock}>
            <Text style={[styles.title, { color: colors.text, fontFamily: fonts.bodySemiBold }]}>
              Update Available
            </Text>
            <Text style={[styles.subtitle, { color: colors.textMuted, fontFamily: fonts.body }]}>
              A new version of Coinzy is ready
            </Text>
          </View>
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity onPress={dismiss} style={styles.dismissBtn} disabled={loading}>
            <Text style={[styles.dismissText, { color: colors.textMuted, fontFamily: fonts.body }]}>
              Later
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleUpdate}
            disabled={loading}
            style={[styles.updateBtn, { backgroundColor: colors.primary }]}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={[styles.updateText, { fontFamily: fonts.bodySemiBold }]}>
                Update
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 9999,
  },
  banner: {
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  iconBadge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: 20,
  },
  textBlock: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 12,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 8,
  },
  dismissBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  dismissText: {
    fontSize: 13,
  },
  updateBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    minWidth: 68,
    alignItems: 'center',
    justifyContent: 'center',
  },
  updateText: {
    color: '#FFFFFF',
    fontSize: 13,
  },
});
