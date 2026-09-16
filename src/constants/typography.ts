/**
 * Design System - Typography
 * Font sizes, weights, and line heights.
 * Uses the system default font (Roboto on Android).
 */

export const FONT_SIZE = {
  xs:   10,
  sm:   12,
  md:   14,
  base: 16,
  lg:   18,
  xl:   20,
  '2xl': 24,
  '3xl': 30,
  '4xl': 36,
  '5xl': 48,
};

export const FONT_WEIGHT = {
  thin:       '100' as const,
  light:      '300' as const,
  regular:    '400' as const,
  medium:     '500' as const,
  semibold:   '600' as const,
  bold:       '700' as const,
  extrabold:  '800' as const,
  black:      '900' as const,
};

export const LINE_HEIGHT = {
  tight:   1.2,
  snug:    1.375,
  normal:  1.5,
  relaxed: 1.625,
  loose:   2.0,
};

export const LETTER_SPACING = {
  tight:  -0.5,
  normal:  0,
  wide:    0.5,
  wider:   1.0,
  widest:  2.0,
};
