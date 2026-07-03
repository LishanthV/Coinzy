import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Coinzy design tokens ──────────────────────────────────────────────
// Deep ink background for dark mode, clean slate/paper for light mode.

export const darkColors = {
  // Surfaces
  bg: '#0F172A',
  surface: '#1E293B',
  surfaceAlt: '#263348',
  surfaceRaised: '#2D3D54',
  border: '#334155',
  borderSoft: '#1E293B',

  // Brand
  primary: '#6C6FE0',
  primarySoft: 'rgba(108, 111, 224, 0.16)',

  // Semantic money colors
  income: '#33C2A1',
  incomeSoft: 'rgba(51, 194, 161, 0.14)',
  expense: '#E2784E',
  expenseSoft: 'rgba(226, 120, 78, 0.14)',
  transfer: '#5AA8E0',
  transferSoft: 'rgba(90, 168, 224, 0.14)',

  // Accents
  amber: '#E3A23C',
  amberSoft: 'rgba(227, 162, 60, 0.14)',
  magenta: '#C2447A',
  magentaSoft: 'rgba(194, 68, 122, 0.14)',
  green: '#7CB35C',

  // Text
  text: '#F1F5F9',
  textMuted: '#94A3B8',
  textFaint: '#64748B',

  // Utility
  danger: '#E2784E',
  success: '#33C2A1',
  white: '#FFFFFF',
  overlay: 'rgba(8, 10, 16, 0.7)',
};

export const lightColors = {
  // Surfaces
  bg: '#F8FAFC',
  surface: '#FFFFFF',
  surfaceAlt: '#F1F5F9',
  surfaceRaised: '#E2E8F0',
  border: '#CBD5E1',
  borderSoft: '#E2E8F0',

  // Brand
  primary: '#5052C0',
  primarySoft: 'rgba(80, 82, 192, 0.16)',

  // Semantic money colors
  income: '#22B8CF',
  incomeSoft: 'rgba(34, 184, 207, 0.14)',
  expense: '#FA5252',
  expenseSoft: 'rgba(250, 82, 82, 0.14)',
  transfer: '#339AF0',
  transferSoft: 'rgba(51, 154, 240, 0.14)',

  // Accents
  amber: '#F59F00',
  amberSoft: 'rgba(245, 159, 0, 0.14)',
  magenta: '#E64980',
  magentaSoft: 'rgba(230, 73, 128, 0.14)',
  green: '#51CF66',

  // Text
  text: '#0F172A',
  textMuted: '#475569',
  textFaint: '#94A3B8',

  // Utility
  danger: '#FA5252',
  success: '#22B8CF',
  white: '#FFFFFF',
  overlay: 'rgba(33, 37, 41, 0.5)',
};

// Theme Zustand Store
interface ThemeState {
  themeMode: 'dark' | 'light';
  toggleTheme: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      themeMode: 'dark',
      toggleTheme: () => set((state) => ({ themeMode: state.themeMode === 'dark' ? 'light' : 'dark' })),
    }),
    {
      name: 'coinzy-theme-v1',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

// Dynamic Colors ES6 Proxy for static compatibility
export const colors = new Proxy({}, {
  get(target, prop: keyof typeof darkColors) {
    const mode = useThemeStore.getState().themeMode;
    const activeColors = mode === 'dark' ? darkColors : lightColors;
    return activeColors[prop];
  }
}) as typeof darkColors;

export const fonts = {
  display: 'Sora_600SemiBold',
  displayBold: 'Sora_700Bold',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemiBold: 'Inter_600SemiBold',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const radii = {
  sm: 8,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 999,
};

export const fontSizes = {
  xs: 12,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 28,
  display: 36,
};

export const shadow = {
  card: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 6,
  },
};

// Custom React hook for dynamic access
export function useAppTheme() {
  const themeMode = useThemeStore((s) => s.themeMode);
  const activeColors = themeMode === 'dark' ? darkColors : lightColors;
  return {
    themeMode,
    colors: activeColors,
    fonts,
    spacing,
    radii,
    fontSizes,
    shadow,
  };
}
