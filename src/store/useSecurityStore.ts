import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';

// Per-user key helpers
const pinKey = (userId: string) => `coinzy_pin_${userId}`;
const biometricKey = (userId: string) => `coinzy_biometric_${userId}`;
const lockKey = (userId: string) => `coinzy_lock_${userId}`;

// Simple hash — not cryptographic, just obfuscation for local PIN storage
function hashPin(pin: string): string {
  let hash = 0;
  for (let i = 0; i < pin.length; i++) {
    const char = pin.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return hash.toString();
}

interface SecurityState {
  isLocked: boolean;
  isLockEnabled: boolean;
  isBiometricEnabled: boolean;
  isBiometricAvailable: boolean;
  hasPin: boolean;
  isLoading: boolean;
  activeUserId: string | null;

  // Init — call once on app start with the logged-in userId
  initSecurity: (userId: string) => Promise<void>;

  // PIN management
  setupPin: (pin: string) => Promise<void>;
  verifyPin: (pin: string) => Promise<boolean>;
  removePin: () => Promise<void>;

  // Biometric
  checkBiometricAvailability: () => Promise<boolean>;
  authenticateWithBiometric: () => Promise<boolean>;
  toggleBiometric: (enabled: boolean) => Promise<void>;

  // Lock control
  lock: () => void;
  unlock: () => void;
  toggleLock: (enabled: boolean) => Promise<void>;
}

export const useSecurityStore = create<SecurityState>((set, get) => ({
  isLocked: false,
  isLockEnabled: false,
  isBiometricEnabled: false,
  isBiometricAvailable: false,
  hasPin: false,
  isLoading: true,
  activeUserId: null,

  initSecurity: async (userId: string) => {
    set({ isLoading: true, activeUserId: userId });
    try {
      const [storedPin, biometricEnabled, lockEnabled] = await Promise.all([
        AsyncStorage.getItem(pinKey(userId)),
        AsyncStorage.getItem(biometricKey(userId)),
        AsyncStorage.getItem(lockKey(userId)),
      ]);

      const biometricAvailable = await get().checkBiometricAvailability();
      const isLockEnabled = lockEnabled === 'true';

      set({
        hasPin: !!storedPin,
        isBiometricEnabled: biometricEnabled === 'true' && biometricAvailable,
        isBiometricAvailable: biometricAvailable,
        isLockEnabled,
        isLocked: isLockEnabled && !!storedPin,
        isLoading: false,
      });
    } catch {
      set({ isLoading: false });
    }
  },

  setupPin: async (pin: string) => {
    const userId = get().activeUserId;
    if (!userId) return;
    const hashed = hashPin(pin);
    await AsyncStorage.setItem(pinKey(userId), hashed);
    set({ hasPin: true });
  },

  verifyPin: async (pin: string) => {
    const userId = get().activeUserId;
    if (!userId) return false;
    const stored = await AsyncStorage.getItem(pinKey(userId));
    if (!stored) return false;
    return stored === hashPin(pin);
  },

  removePin: async () => {
    const userId = get().activeUserId;
    if (!userId) return;
    await Promise.all([
      AsyncStorage.removeItem(pinKey(userId)),
      AsyncStorage.removeItem(biometricKey(userId)),
      AsyncStorage.setItem(lockKey(userId), 'false'),
    ]);
    set({ hasPin: false, isBiometricEnabled: false, isLockEnabled: false, isLocked: false });
  },

  checkBiometricAvailability: async () => {
    const compatible = await LocalAuthentication.hasHardwareAsync();
    if (!compatible) return false;
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    return enrolled;
  },

  authenticateWithBiometric: async () => {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock Coinzy',
        fallbackLabel: 'Use PIN',
        cancelLabel: 'Cancel',
        disableDeviceFallback: false,
      });
      return result.success;
    } catch {
      return false;
    }
  },

  toggleBiometric: async (enabled: boolean) => {
    const userId = get().activeUserId;
    if (!userId) return;
    await AsyncStorage.setItem(biometricKey(userId), enabled.toString());
    set({ isBiometricEnabled: enabled });
  },

  toggleLock: async (enabled: boolean) => {
    const userId = get().activeUserId;
    if (!userId) return;
    await AsyncStorage.setItem(lockKey(userId), enabled.toString());
    set({ isLockEnabled: enabled });
  },

  lock: () => set({ isLocked: true }),
  unlock: () => set({ isLocked: false }),
}));
