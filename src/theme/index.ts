// ── Coinzy design tokens ──────────────────────────────────────────────
// A calm, "after-hours ledger" palette: deep ink background, warm paper
// accents for money-in, and a clay accent for money-out — echoing the
// architecture & timeline palette from the product plan.

export const colors = {
  // Surfaces
  bg: '#0B0E14',
  surface: '#141923',
  surfaceAlt: '#1C2330',
  surfaceRaised: '#232B3B',
  border: '#2A3340',
  borderSoft: '#1E2530',

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

  // Accents (mirrors the timeline legend)
  amber: '#E3A23C',
  amberSoft: 'rgba(227, 162, 60, 0.14)',
  magenta: '#C2447A',
  magentaSoft: 'rgba(194, 68, 122, 0.14)',
  green: '#7CB35C',

  // Text
  text: '#F4F6F9',
  textMuted: '#9AA3B5',
  textFaint: '#5C6678',

  // Utility
  danger: '#E2784E',
  success: '#33C2A1',
  white: '#FFFFFF',
  overlay: 'rgba(8, 10, 16, 0.7)',
};

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
