/**
 * Validation helpers for forms throughout the app.
 */

/**
 * Returns true if the email address looks valid.
 */
export function isValidEmail(email: string): boolean {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email.trim());
}

/**
 * Returns true if the password meets minimum requirements.
 * Minimum: 6 characters.
 */
export function isValidPassword(password: string): boolean {
  return password.length >= 6;
}

/**
 * Returns true if the string is not empty after trimming.
 */
export function isNotEmpty(value: string): boolean {
  return value.trim().length > 0;
}

/**
 * Returns true if the amount is a positive number.
 */
export function isValidAmount(amount: string): boolean {
  const num = parseFloat(amount);
  return !isNaN(num) && num > 0;
}

/**
 * Returns true if the time string is in "HH:MM" format.
 */
export function isValidTimeString(time: string): boolean {
  return /^\d{2}:\d{2}$/.test(time);
}

/**
 * Capitalizes the first letter of a string.
 */
export function capitalize(str: string): string {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}
