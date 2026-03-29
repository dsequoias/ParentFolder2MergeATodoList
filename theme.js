/**
 * Shared theme for My.Daily.Duty – colors, spacing, and typography.
 */
export const colors = {
  primary: '#5C4D9E',
  primaryLight: '#E8E4F4',
  primaryDark: '#443A75',
  surface: '#FFFFFF',
  background: '#F6F5F8',
  backgroundAlt: '#EEECF2',
  text: '#1C1B1F',
  textSecondary: '#49454F',
  textMuted: '#79747E',
  border: '#E0DDE5',
  borderLight: '#E7E5EC',
  success: '#2E7D32',
  destructive: '#B3261E',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  full: 999,
};

export const typography = {
  title: { fontSize: 22, fontWeight: '700', color: colors.text },
  headline: { fontSize: 18, fontWeight: '600', color: colors.text },
  body: { fontSize: 16, fontWeight: '400', color: colors.textSecondary },
  bodySmall: { fontSize: 14, fontWeight: '400', color: colors.textSecondary },
  caption: { fontSize: 12, fontWeight: '400', color: colors.textMuted },
  label: { fontSize: 14, fontWeight: '600', color: colors.text },
};
