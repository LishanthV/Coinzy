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
import { useFinanceStore } from './useFinanceStore';

interface RegisteredUser {
  id: string;
  name: string;
  email: string;
  password: string;
}

interface AuthState {
  hasOnboarded: boolean;
  isAuthenticated: boolean;
  user: UserProfile | null;
  notificationsEnabled: boolean;
  registeredUsers: Record<string, RegisteredUser>;
  completeOnboarding: () => void;
  signUp: (name: string, email: string, password: string) => Promise<{ error: Error | null }>;
  login: (email: string, password: string) => Promise<{ error: Error | null }>;
  logOut: () => Promise<void>;
  updateProfile: (changes: Partial<Omit<UserProfile, 'id' | 'email'>>) => void;
  setNotificationsEnabled: (enabled: boolean) => Promise<boolean>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      hasOnboarded: false,
      isAuthenticated: false,
      user: null,
      notificationsEnabled: false,
      registeredUsers: {
        'demo@coinzy.com': {
          id: 'usr_demo',
          name: 'Demo User',
          email: 'demo@coinzy.com',
          password: 'password123',
        },
      },

      completeOnboarding: () => set({ hasOnboarded: true }),

      // Action: Register a new email/password account
      signUp: async (name, email, password) => {
        try {
          const emailLower = email.trim().toLowerCase();
          const registeredUsers = get().registeredUsers;

          if (emailLower in registeredUsers) {
            throw new Error('An account with this email already exists.');
          }

          const newUserId = 'usr_' + Math.random().toString(36).substring(2, 11);

          const newUser: RegisteredUser = {
            id: newUserId,
            name: name.trim(),
            email: emailLower,
            password: password,
          };

          // Save current user's data and load new user's empty data
          useFinanceStore.getState().clearUserData();
          useFinanceStore.getState().loadUserData(newUserId);

          set((state) => ({
            registeredUsers: {
              ...state.registeredUsers,
              [emailLower]: newUser,
            },
            isAuthenticated: true,
            hasOnboarded: true,
            user: {
              id: newUserId,
              name: newUser.name,
              email: emailLower,
              currency: 'USD',
              avatarColor: colors.primary,
            },
          }));
          return { error: null };
        } catch (error: any) {
          console.error('[Auth Store] signUp Error:', error);
          return { error: error || new Error('Failed to create account.') };
        }
      },

      // Action: Login with email/password credentials
      login: async (email, password) => {
        try {
          const emailLower = email.trim().toLowerCase();
          const registeredUsers = get().registeredUsers;
          const userRecord = registeredUsers[emailLower];

          if (!userRecord) {
            throw new Error('No account found with this email.');
          }

          if (userRecord.password !== password) {
            throw new Error('Incorrect password. Please try again.');
          }

          const userId = userRecord.id || 'usr_' + Math.random().toString(36).substring(2, 11);

          // Save current user's data and load the logging-in user's data
          useFinanceStore.getState().clearUserData();
          useFinanceStore.getState().loadUserData(userId);

          set({
            isAuthenticated: true,
            hasOnboarded: true,
            user: {
              id: userId,
              name: userRecord.name,
              email: emailLower,
              currency: 'USD',
              avatarColor: colors.primary,
            },
          });
          return { error: null };
        } catch (error: any) {
          console.error('[Auth Store] login Error:', error);
          return { error: error || new Error('Failed to log in.') };
        }
      },

      logOut: async () => {
        // Save current user's data first and clear state
        useFinanceStore.getState().clearUserData();
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
      name: 'coinzy-auth-v2',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        hasOnboarded: state.hasOnboarded,
        notificationsEnabled: state.notificationsEnabled,
        registeredUsers: state.registeredUsers,
      }),
    }
  )
);
