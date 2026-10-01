/**
 * Design System - Color Tokens
 *
 * Palette inspired by old-growth forests and botanical notebooks.
 *   #EDF4F2  — sage mist   (lightest, backgrounds & surfaces)
 *   #7C8363  — lichen      (mid-tone, icons & secondary text)
 *   #31473A  — deep canopy (darkest, primary actions & headers)
 *
 * Both themes stay entirely within this family; dark mode uses
 * deep soil tones, light mode uses parchment & sage.
 */

// ─── Gradient Color Arrays ──────────────────────────────────────────────────
export const GRADIENTS = {
  // Core brand
  primary: ['#31473A', '#1E2D24'] as string[],  // deep forest → near-black
  secondary: ['#7C8363', '#5A6148'] as string[],  // lichen → dark olive

  // Module cards — each still distinct but harmonious with the palette
  blue: ['#3D6B6B', '#2B4F4F'] as string[],  // slate teal
  teal: ['#4A7C6F', '#2E5446'] as string[],  // sage teal
  amber: ['#7A6040', '#5A4530'] as string[],  // warm earth
  rose: ['#7A4A50', '#5A3038'] as string[],  // muted rose-earth
  green: ['#31473A', '#243528'] as string[],  // deep canopy
  dark: ['#1E2D24', '#111A15'] as string[],  // dark bg gradient
  darkCard: ['#243528', '#1A2820'] as string[],  // dark card gradient
  lightCard: ['#EDF4F2', '#D8EDE8'] as string[],  // light card gradient
};

// ─── Theme Types ─────────────────────────────────────────────────────────────
export interface ColorTheme {
  // Backgrounds
  background: string;
  surface: string;
  card: string;
  cardElevated: string;

  // Brand
  primary: string;
  primaryLight: string;
  primaryDark: string;
  accent: string;

  // Semantic
  success: string;
  error: string;
  warning: string;
  info: string;

  // Text
  text: string;
  textSecondary: string;
  textMuted: string;
  textOnPrimary: string;

  // UI
  border: string;
  divider: string;
  overlay: string;
  shadow: string;

  // Tab bar
  tabActive: string;
  tabInactive: string;
  tabBackground: string;
}

// ─── Dark Theme ──────────────────────────────────────────────────────────────
// Like standing in an old-growth forest at dusk — deep greens, mossy shadows
export const DARK_COLORS: ColorTheme = {
  // Backgrounds — forest floor, almost black-green
  background: '#111A15',
  surface: '#1A2820',
  card: '#1E3028',
  cardElevated: '#263D30',

  // Brand
  primary: '#7C8363',   // lichen — warm mid-green, readable on dark
  primaryLight: '#A8B090',   // lighter lichen for highlights
  primaryDark: '#31473A',   // deep canopy for pressed states
  accent: '#C8B87A',   // warm ochre — pops against green

  // Semantic — desaturated to feel earthy, not neon
  success: '#5A9E72',   // fern green
  error: '#C26B5C',   // terracotta
  warning: '#C8993C',   // golden moss
  info: '#5A8A9E',   // slate blue

  // Text
  text: '#EDF4F2',   // sage mist — the lightest palette colour
  textSecondary: '#A8B090',   // lighter lichen
  textMuted: '#6A7A60',   // muted moss
  textOnPrimary: '#EDF4F2',

  // UI
  border: '#2E4035',
  divider: '#1E3028',
  overlay: 'rgba(17,26,21,0.8)',
  shadow: 'rgba(0,0,0,0.6)',

  // Tab bar
  tabActive: '#A8B090',   // lighter lichen
  tabInactive: '#4A5A40',   // dark moss
  tabBackground: '#111A15',   // matches background
};

// ─── Light Theme ─────────────────────────────────────────────────────────────
// Like a botanical sketchbook — pale sage, warm parchment, ink-green accents
export const LIGHT_COLORS: ColorTheme = {
  // Backgrounds — sage mist & near-white
  background: '#EDF4F2',
  surface: '#F7FAF9',
  card: '#FFFFFF',
  cardElevated: '#D8EDE8',

  // Brand
  primary: '#31473A',   // deep canopy
  primaryLight: '#7C8363',   // lichen
  primaryDark: '#1E2D24',   // near-black forest
  accent: '#8A6E2A',   // warm amber-earth

  // Semantic
  success: '#3A7A58',   // forest green
  error: '#A84040',   // deep terracotta
  warning: '#8A6E2A',   // amber-earth
  info: '#3A6080',   // deep slate

  // Text
  text: '#1E2D24',   // near-black forest
  textSecondary: '#4A5A40',   // dark moss
  textMuted: '#7C8363',   // lichen
  textOnPrimary: '#EDF4F2',   // sage mist

  // UI
  border: '#C8DDD8',
  divider: '#D8EDE8',
  overlay: 'rgba(30,45,36,0.5)',
  shadow: 'rgba(49,71,58,0.12)',

  // Tab bar
  tabActive: '#31473A',
  tabInactive: '#7C8363',
  tabBackground: '#FFFFFF',
};

// ─── Category Colors ─────────────────────────────────────────────────────────
// Muted, earthy tones that feel hand-curated, not algorithmic
export const CATEGORY_COLORS = [
  '#31473A', // deep canopy
  '#7C8363', // lichen
  '#5A8A72', // fern
  '#3D6B6B', // slate teal
  '#7A6040', // warm earth
  '#7A4A50', // muted rose
  '#5A6890', // slate blue
  '#9A7A50', // sandstone
  '#4A7C6F', // sage teal
  '#6A5A80', // dusty violet
];

// Habit color palette
export const HABIT_COLORS = [
  { color: '#7C8363', label: 'Forest' },
  { color: '#7C8363', label: 'Lichen' },
  { color: '#7C8363', label: 'Fern' },
  { color: '#7C8363', label: 'Slate' },
  { color: '#7C8363', label: 'Earth' },
  { color: '#7C8363', label: 'Rosewood' },
  { color: '#7C8363', label: 'Dusk' },
  { color: '#9A7A50', label: 'Sand' },
];

// Expense categories (unchanged — display strings, not colors)
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
