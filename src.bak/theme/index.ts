/**
 * Theme tokens.
 *
 * Inspired by Autodesk Construction Cloud: clean white surfaces, subtle borders,
 * single brand accent. Easy to rebrand — change `colors.primary` and you're done.
 */

export const colors = {
  // Surface
  background: '#F7F8FA',
  surface: '#FFFFFF',
  surfaceAlt: '#F1F3F6',

  // Text
  text: '#111827',
  textSecondary: '#6B7280',
  textTertiary: '#9CA3AF',
  textInverse: '#FFFFFF',

  // Borders / dividers
  border: '#E5E7EB',
  borderStrong: '#D1D5DB',

  // Brand — swap this for Jungle Labs green or a project-specific brand color
  primary: '#2563EB',
  primaryDark: '#1D4ED8',
  primarySoft: '#DBEAFE',

  // Semantic
  success: '#10B981',
  successSoft: '#D1FAE5',
  warning: '#F59E0B',
  warningSoft: '#FEF3C7',
  danger: '#EF4444',
  dangerSoft: '#FEE2E2',

  // Misc
  overlay: 'rgba(17, 24, 39, 0.5)',
  shadow: 'rgba(17, 24, 39, 0.08)',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  '2xl': 32,
  '3xl': 48,
} as const;

export const radii = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  pill: 999,
} as const;

export const typography = {
  // Native font stack — uses SF Pro on iOS, Roboto on Android.
  family: undefined,
  sizes: {
    xs: 11,
    sm: 13,
    md: 15,
    lg: 17,
    xl: 20,
    '2xl': 24,
    '3xl': 30,
  },
  weights: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },
} as const;

export const shadows = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  modal: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
  },
} as const;
