/**
 * Utility functions for formatting data throughout the app.
 */

import { format, isToday, isYesterday, formatDistanceToNow } from 'date-fns';

// ─── Currency ────────────────────────────────────────────────────────────────

/**
 * Formats a number as a currency string (Indian Rupee by default).
 * Example: formatCurrency(1234.5) → "₹1,234.50"
 */
export function formatCurrency(
  amount: number,
  currency: string = 'INR',
  locale: string = 'en-IN',
): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    // Fallback if Intl is not available
    return `₹${amount.toFixed(0)}`;
  }
}

// ─── Date / Time ─────────────────────────────────────────────────────────────

/**
 * Returns a greeting based on the current hour.
 * "Good morning" / "Good afternoon" / "Good evening"
 */
export function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12)  return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  if (hour >= 17 && hour < 21) return 'Good evening';
  return 'Good night';
}

/**
 * Formats a date into a human-friendly "smart" string.
 * - Today → "Today, 3:45 PM"
 * - Yesterday → "Yesterday, 3:45 PM"
 * - Older → "Sep 10, 3:45 PM"
 */
export function formatSmartDate(date: Date): string {
  if (isToday(date))     return `Today, ${format(date, 'h:mm a')}`;
  if (isYesterday(date)) return `Yesterday, ${format(date, 'h:mm a')}`;
  return format(date, 'MMM d, h:mm a');
}

/**
 * Formats a date as "Monday, September 12" for the dashboard.
 */
export function formatFullDate(date: Date = new Date()): string {
  return format(date, 'EEEE, MMMM d');
}

/**
 * Formats a date as "Sep 12" (short form for cards).
 */
export function formatShortDate(date: Date): string {
  return format(date, 'MMM d');
}

/**
 * Formats a date string (YYYY-MM-DD) for display.
 */
export function formatDateStr(dateStr: string): string {
  try {
    return format(new Date(dateStr), 'MMM d, yyyy');
  } catch {
    return dateStr;
  }
}

/**
 * Formats time as "h:mm a" (e.g., "3:45 PM").
 */
export function formatTime(date: Date): string {
  return format(date, 'h:mm a');
}

/**
 * Formats time from a "HH:MM" string to "h:mm a".
 * Example: "14:30" → "2:30 PM"
 */
export function formatTimeString(timeStr: string): string {
  try {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    return format(date, 'h:mm a');
  } catch {
    return timeStr;
  }
}

/**
 * Returns relative time string.
 * Example: "2 hours ago", "3 days ago"
 */
export function formatRelativeTime(date: Date): string {
  try {
    return formatDistanceToNow(date, { addSuffix: true });
  } catch {
    return formatSmartDate(date);
  }
}

// ─── Stopwatch / Timer ───────────────────────────────────────────────────────

/**
 * Formats milliseconds into a "MM:SS.ms" stopwatch string.
 * Example: formatStopwatch(65432) → "01:05.43"
 */
export function formatStopwatch(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const centiseconds = Math.floor((ms % 1000) / 10);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`;
}

/**
 * Formats seconds into "MM:SS" for countdown timer display.
 * Example: formatCountdown(125) → "02:05"
 */
export function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// ─── Habit ───────────────────────────────────────────────────────────────────

/**
 * Formats a streak number with the right label.
 * Example: formatStreak(5) → "5 day streak 🔥"
 */
export function formatStreak(streak: number): string {
  if (streak === 0) return 'No streak yet';
  if (streak === 1) return '1 day streak 🔥';
  return `${streak} day streak 🔥`;
}

// ─── Numbers ─────────────────────────────────────────────────────────────────

/**
 * Abbreviates large numbers.
 * Example: formatCompact(12500) → "12.5K"
 */
export function formatCompact(num: number): string {
  if (Math.abs(num) >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (Math.abs(num) >= 1_000)     return `${(num / 1_000).toFixed(1)}K`;
  return String(num);
}
