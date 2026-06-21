import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { UserProfile } from '../types';
import { colors } from '../theme';
import {
  requestNotificationPermissions,
  scheduleDailyNotification,
  cancelDailyNotification,
} from '../utils/notifications';

interface AuthState {
  hasOnboarded: boolean;
  isAuthenticated: boolean;
  user: UserProfile | null;
  notificationsEnabled: boolean;
  completeOnboarding: () => void;
  sendOtp: (email: string, name?: string) => Promise<{ error: Error | null }>;
  verifyOtp: (email: string, token: string) => Promise<{ error: Error | null }>;
  logOut: () => Promise<void>;
  updateProfile: (changes: Partial<Omit<UserProfile, 'id' | 'email'>>) => void;
  setNotificationsEnabled: (enabled: boolean) => Promise<boolean>;
}

// Retrieve the backend URL from environment variables
const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:5000';

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      hasOnboarded: false,
      isAuthenticated: false,
      user: null,
      notificationsEnabled: false,

      completeOnboarding: () => set({ hasOnboarded: true }),

      // Action: Send OTP via self-hosted Express + Nodemailer server
      sendOtp: async (email, name) => {
        try {
          const response = await fetch(`${backendUrl}/api/auth/send-otp`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email, name }),
          });

          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.error || 'Failed to send OTP code.');
          }

          return { error: null };
        } catch (error: any) {
          console.error('[Auth Store] sendOtp Error:', error);
          return { error: error || new Error('Connection refused by self-hosted server.') };
        }
      },

      // Action: Verify OTP via self-hosted server and log user in
      verifyOtp: async (email, token) => {
        try {
          const response = await fetch(`${backendUrl}/api/auth/verify-otp`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email, token }),
          });

          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.error || 'Invalid verification code.');
          }

          // OTP verified successfully! Update the auth state
          if (data.success && data.user) {
            set({
              isAuthenticated: true,
              hasOnboarded: true,
              user: {
                id: data.user.id,
                name: data.user.name,
                email: data.user.email,
                currency: 'USD',
                avatarColor: colors.primary,
              },
            });
          }

          return { error: null };
        } catch (error: any) {
          console.error('[Auth Store] verifyOtp Error:', error);
          return { error: error || new Error('Verification failed.') };
        }
      },

      logOut: async () => {
        set({ isAuthenticated: false, user: null });
      },

      updateProfile: (changes) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...changes } : state.user,
        })),

      setNotificationsEnabled: async (enabled) => {
        if (enabled) {
          const granted = await requestNotificationPermissions();
          if (granted) {
            await scheduleDailyNotification();
            set({ notificationsEnabled: true });
            return true;
          } else {
            await cancelDailyNotification();
            set({ notificationsEnabled: false });
            return false;
          }
        } else {
          await cancelDailyNotification();
          set({ notificationsEnabled: false });
          return true;
        }
      },
    }),
    {
      name: 'coinzy-auth',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        hasOnboarded: state.hasOnboarded,
        notificationsEnabled: state.notificationsEnabled,
      }),
    }
  )
);
