/**
 * Theme tokens.
 *
 * Inspired by Autodesk Construction Cloud: clean white surfaces, subtle borders,
 * single brand accent. Easy to rebrand — change `colors.primary` and you're done.
 */

export const colors = {
  // Surface — warm neutrals (job-site dust, not office gray)
  background: '#FAF9F7',
  surface: '#FFFFFF',
  surfaceAlt: '#F4F2EF',

  // Text — warm charcoal
  text: '#1C1917',
  textSecondary: '#78716C',
  textTertiary: '#A8A29E',
  textInverse: '#FFFFFF',

  // Borders / dividers
  border: '#E7E5E4',
  borderStrong: '#D6D3D1',

  // Brand — Consite high-vis safety orange
  primary: '#EA580C',
  primaryDark: '#C2410C',
  primarySoft: '#FFEDD5',

  // Semantic — caution-tape yellow for warnings (distinct from brand orange)
  success: '#16A34A',
  successSoft: '#DCFCE7',
  warning: '#CA8A04',
  warningSoft: '#FEF9C3',
  danger: '#DC2626',
  dangerSoft: '#FEE2E2',

  // Misc
  overlay: 'rgba(28, 25, 23, 0.5)',
  shadow: 'rgba(28, 25, 23, 0.08)',
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
