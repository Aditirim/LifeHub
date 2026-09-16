/**
 * ThemeContext — Light/Dark theme management.
 *
 * Persists the user's theme preference to AsyncStorage so it survives app restarts.
 * Provides:
 *  - isDark: boolean
 *  - colors: the current ColorTheme object
 *  - toggleTheme(): switches between light and dark
 *
 * Usage:
 *   const { colors, isDark, toggleTheme } = useTheme();
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DARK_COLORS, LIGHT_COLORS, ColorTheme } from '../constants/colors';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ThemeContextType {
  isDark: boolean;
  colors: ColorTheme;
  toggleTheme: () => void;
}

// Storage key for persisting theme preference
const THEME_KEY = '@lifehub_theme';

// ─── Context ─────────────────────────────────────────────────────────────────

const ThemeContext = createContext<ThemeContextType>({
  isDark: true,
  colors: DARK_COLORS,
  toggleTheme: () => {},
});

// ─── Provider ────────────────────────────────────────────────────────────────

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Default to dark theme
  const [isDark, setIsDark] = useState(true);

  // Load saved theme preference on mount
  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY)
      .then(value => {
        if (value !== null) {
          setIsDark(value === 'dark');
        }
      })
      .catch(() => {
        // If storage fails, keep the default dark theme
      });
  }, []);

  // Toggle and persist the theme
  const toggleTheme = () => {
    setIsDark(prev => {
      const next = !prev;
      // Save to AsyncStorage (fire and forget — no need to await)
      AsyncStorage.setItem(THEME_KEY, next ? 'dark' : 'light').catch(() => {});
      return next;
    });
  };

  const colors = isDark ? DARK_COLORS : LIGHT_COLORS;

  return (
    <ThemeContext.Provider value={{ isDark, colors, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

// ─── Hook ────────────────────────────────────────────────────────────────────

/** Convenience hook — use inside any component to access the current theme. */
export function useTheme(): ThemeContextType {
  return useContext(ThemeContext);
}
