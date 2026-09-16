/**
 * Design System - Spacing
 * Consistent spacing scale (4px base unit).
 * Also includes border radii and shadow presets.
 */

// Spacing scale (multiples of 4)
export const SPACING = {
  0:   0,
  1:   4,
  2:   8,
  3:  12,
  4:  16,
  5:  20,
  6:  24,
  7:  28,
  8:  32,
  10: 40,
  12: 48,
  16: 64,
  20: 80,
};

// Border radius scale
export const RADIUS = {
  sm:   8,
  md:  12,
  lg:  16,
  xl:  20,
  '2xl': 24,
  full: 9999,
};

// Shadow presets (Android elevation is more reliable, but we keep these for reference)
export const SHADOWS = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
};
