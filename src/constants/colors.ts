/**
 * Design System - Color Tokens
 *
 * All colors used throughout LifeHub are defined here.
 * We support both DARK (default) and LIGHT themes.
 * Using purple/indigo as primary color for a premium feel.
 */

// ─── Gradient Color Arrays ──────────────────────────────────────────────────
// These are used with react-native-linear-gradient
export const GRADIENTS = {
  primary:   ['#7C3AED', '#5B21B6'] as string[],  // violet
  blue:      ['#2563EB', '#1D4ED8'] as string[],  // blue
  teal:      ['#0D9488', '#0F766E'] as string[],  // teal
  amber:     ['#D97706', '#B45309'] as string[],  // amber
  rose:      ['#E11D48', '#BE123C'] as string[],  // rose
  green:     ['#059669', '#047857'] as string[],  // green
  dark:      ['#1A1A2E', '#0D0D1A'] as string[],  // dark bg gradient
  darkCard:  ['#1E1E3F', '#16213E'] as string[],  // dark card gradient
  lightCard: ['#F0F0FF', '#FFFFFF'] as string[],  // light card gradient
};

// ─── Theme Types ─────────────────────────────────────────────────────────────
export interface ColorTheme {
  // Backgrounds
  background:    string;
  surface:       string;
  card:          string;
  cardElevated:  string;

  // Brand
  primary:       string;
  primaryLight:  string;
  primaryDark:   string;
  accent:        string;

  // Semantic
  success:       string;
  error:         string;
  warning:       string;
  info:          string;

  // Text
  text:          string;
  textSecondary: string;
  textMuted:     string;
  textOnPrimary: string;

  // UI
  border:        string;
  divider:       string;
  overlay:       string;
  shadow:        string;

  // Tab bar
  tabActive:     string;
  tabInactive:   string;
  tabBackground: string;
}

// ─── Dark Theme ──────────────────────────────────────────────────────────────
export const DARK_COLORS: ColorTheme = {
  // Backgrounds — deep navy/indigo for immersive dark UI
  background:    '#0D0D1A',
  surface:       '#1A1A2E',
  card:          '#16213E',
  cardElevated:  '#1E2A48',

  // Brand — vibrant violet
  primary:       '#7C3AED',
  primaryLight:  '#A78BFA',
  primaryDark:   '#5B21B6',
  accent:        '#F59E0B',

  // Semantic
  success:       '#10B981',
  error:         '#EF4444',
  warning:       '#F97316',
  info:          '#3B82F6',

  // Text
  text:          '#F9FAFB',
  textSecondary: '#9CA3AF',
  textMuted:     '#6B7280',
  textOnPrimary: '#FFFFFF',

  // UI
  border:        '#2D3748',
  divider:       '#1F2937',
  overlay:       'rgba(0,0,0,0.7)',
  shadow:        'rgba(0,0,0,0.5)',

  // Tab bar
  tabActive:     '#A78BFA',
  tabInactive:   '#4B5563',
  tabBackground: '#111127',
};

// ─── Light Theme ─────────────────────────────────────────────────────────────
export const LIGHT_COLORS: ColorTheme = {
  // Backgrounds — clean white/lavender
  background:    '#F8F9FF',
  surface:       '#FFFFFF',
  card:          '#FFFFFF',
  cardElevated:  '#F3F4FF',

  // Brand — same violet as dark
  primary:       '#7C3AED',
  primaryLight:  '#A78BFA',
  primaryDark:   '#5B21B6',
  accent:        '#F59E0B',

  // Semantic
  success:       '#059669',
  error:         '#DC2626',
  warning:       '#D97706',
  info:          '#2563EB',

  // Text
  text:          '#1F2937',
  textSecondary: '#6B7280',
  textMuted:     '#9CA3AF',
  textOnPrimary: '#FFFFFF',

  // UI
  border:        '#E5E7EB',
  divider:       '#F3F4F6',
  overlay:       'rgba(0,0,0,0.5)',
  shadow:        'rgba(0,0,0,0.1)',

  // Tab bar
  tabActive:     '#7C3AED',
  tabInactive:   '#9CA3AF',
  tabBackground: '#FFFFFF',
};

// ─── Category Colors ─────────────────────────────────────────────────────────
// Used for habit colors and money categories
export const CATEGORY_COLORS = [
  '#7C3AED', // violet
  '#2563EB', // blue
  '#0D9488', // teal
  '#059669', // green
  '#D97706', // amber
  '#E11D48', // rose
  '#F97316', // orange
  '#8B5CF6', // purple
  '#06B6D4', // cyan
  '#EC4899', // pink
];

// Habit color palette (with labels for UI)
export const HABIT_COLORS = [
  { color: '#7C3AED', label: 'Violet'  },
  { color: '#2563EB', label: 'Blue'    },
  { color: '#0D9488', label: 'Teal'    },
  { color: '#059669', label: 'Green'   },
  { color: '#D97706', label: 'Amber'   },
  { color: '#E11D48', label: 'Rose'    },
  { color: '#F97316', label: 'Orange'  },
  { color: '#EC4899', label: 'Pink'    },
];

// Expense categories
export const EXPENSE_CATEGORIES = [
  'Food & Dining',
  'Transport',
  'Shopping',
  'Entertainment',
  'Health',
  'Bills',
  'Housing',
  'Education',
  'Other',
];

// Income categories
export const INCOME_CATEGORIES = [
  'Salary',
  'Freelance',
  'Investment',
  'Gift',
  'Other',
];
