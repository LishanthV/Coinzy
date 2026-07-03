import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { UserProfile } from '../types';
import { colors } from '../theme';

const BASE_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:5000';
const ACCESS_TOKEN_KEY = 'coinzy_access_token';
const REFRESH_TOKEN_KEY = 'coinzy_refresh_token';
const USER_KEY = 'coinzy_user';

interface AuthState {
  user: UserProfile | null;
  accessToken: string | null;
  refreshToken: string | null;
  isLoading: boolean;
  notificationsEnabled: boolean;

  initAuth: () => Promise<void>;
  login: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (name: string, email: string, password: string) => Promise<{ error: Error | null }>;
  logOut: () => Promise<void>;
  updateProfile: (changes: Partial<Omit<UserProfile, 'id' | 'email'>>) => void;
  setNotificationsEnabled: (enabled: boolean) => Promise<boolean>;
  completeOnboarding: () => Promise<void>;
  refreshAccessToken: () => Promise<string | null>;
  setTokens: (accessToken: string, refreshToken: string) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  completeOnboarding: async () => {},
  accessToken: null,
  refreshToken: null,
  isLoading: true,
  notificationsEnabled: false,

  initAuth: async () => {
    set({ isLoading: true });
    try {
      const [accessToken, refreshToken, userJson] = await Promise.all([
        AsyncStorage.getItem(ACCESS_TOKEN_KEY),
        AsyncStorage.getItem(REFRESH_TOKEN_KEY),
        AsyncStorage.getItem(USER_KEY),
      ]);

      if (accessToken && refreshToken && userJson) {
        const user = JSON.parse(userJson);
        set({ accessToken, refreshToken, user, isLoading: false });
      } else {
        set({ isLoading: false });
      }
    } catch {
      set({ isLoading: false });
    }
  },

  setTokens: async (accessToken, refreshToken) => {
    await Promise.all([
      AsyncStorage.setItem(ACCESS_TOKEN_KEY, accessToken),
      AsyncStorage.setItem(REFRESH_TOKEN_KEY, refreshToken),
    ]);
    set({ accessToken, refreshToken });
  },

  refreshAccessToken: async () => {
    const { refreshToken } = get();
    if (!refreshToken) return null;

    try {
      const res = await fetch(`${BASE_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (!res.ok) {
        await get().logOut();
        return null;
      }

      const data = await res.json();
      await get().setTokens(data.accessToken, data.refreshToken);
      return data.accessToken;
    } catch {
      return null;
    }
  },

  login: async (email, password) => {
    try {
      const res = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const err = await res.json();
        return { error: new Error(err.error || 'Login failed') };
      }

      const data = await res.json();
      const user: UserProfile = {
        id: data.userId,
        name: data.name,
        email: data.email,
        currency: 'USD',
        avatarColor: colors.primary,
      };

      await Promise.all([
        AsyncStorage.setItem(ACCESS_TOKEN_KEY, data.accessToken),
        AsyncStorage.setItem(REFRESH_TOKEN_KEY, data.refreshToken),
        AsyncStorage.setItem(USER_KEY, JSON.stringify(user)),
      ]);

      set({ user, accessToken: data.accessToken, refreshToken: data.refreshToken });
      return { error: null };
    } catch (e: any) {
      return { error: e || new Error('Connection failed') };
    }
  },

  signUp: async (name, email, password) => {
    try {
      const res = await fetch(`${BASE_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });

      if (!res.ok) {
        const err = await res.json();
        return { error: new Error(err.error || 'Registration failed') };
      }

      return { error: null };
    } catch (e: any) {
      return { error: e || new Error('Connection failed') };
    }
  },

  logOut: async () => {
    const { accessToken, refreshToken } = get();

    try {
      if (accessToken && refreshToken) {
        await fetch(`${BASE_URL}/api/auth/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ refreshToken }),
        });
      }
    } catch {
      // Don't block logout on network failure
    }

    await Promise.all([
      AsyncStorage.removeItem(ACCESS_TOKEN_KEY),
      AsyncStorage.removeItem(REFRESH_TOKEN_KEY),
      AsyncStorage.removeItem(USER_KEY),
    ]);

    set({ user: null, accessToken: null, refreshToken: null });
  },

  updateProfile: (changes) => {
    const { user } = get();
    if (!user) return;
    const updatedUser = { ...user, ...changes };
    AsyncStorage.setItem(USER_KEY, JSON.stringify(updatedUser));
    set({ user: updatedUser });
  },

  setNotificationsEnabled: async (enabled) => {
    set({ notificationsEnabled: enabled });
    return true;
  },
}));

export async function api(path: string, options: RequestInit = {}): Promise<Response> {
  const { accessToken, refreshAccessToken } = useAuthStore.getState();

  const makeRequest = (token: string | null) =>
    fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });

  let res = await makeRequest(accessToken);

  if (res.status === 401) {
    const body = await res.clone().json().catch(() => ({}));
    if (body.code === 'TOKEN_EXPIRED') {
      const newToken = await refreshAccessToken();
      if (newToken) {
        res = await makeRequest(newToken);
      }
    }
  }

  return res;
}