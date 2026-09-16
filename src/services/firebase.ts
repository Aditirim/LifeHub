/**
 * Firebase Service — Firestore helpers (v26 Modular API).
 *
 * @react-native-firebase v26 uses the same modular function-based API
 * as the Firebase Web SDK v9+. There are no default exports — only
 * named functions like getFirestore(), collection(), doc(), etc.
 *
 * Firestore data structure:
 *   users/{uid}/notes
 *   users/{uid}/habits
 *   users/{uid}/events
 *   users/{uid}/transactions
 */

import {
  getFirestore,
  collection,
  doc,
  serverTimestamp as firestoreServerTimestamp,
  Timestamp,
} from '@react-native-firebase/firestore';

import { getApp } from '@react-native-firebase/app';

// ─── Firestore instance ──────────────────────────────────────────────────────

/** The Firestore database instance. */
export const db = getFirestore();

// ─── Collection references ────────────────────────────────────────────────────

/** Reference to users/{uid} */
export function userDoc(uid: string) {
  return doc(db, 'users', uid);
}

/** Reference to users/{uid}/notes */
export function notesCollection(uid: string) {
  return collection(db, 'users', uid, 'notes');
}

/** Reference to users/{uid}/habits */
export function habitsCollection(uid: string) {
  return collection(db, 'users', uid, 'habits');
}

/** Reference to users/{uid}/events */
export function eventsCollection(uid: string) {
  return collection(db, 'users', uid, 'events');
}

/** Reference to users/{uid}/transactions */
export function transactionsCollection(uid: string) {
  return collection(db, 'users', uid, 'transactions');
}

// ─── Timestamp helpers ────────────────────────────────────────────────────────

/**
 * Returns a Firestore server timestamp sentinel.
 * Use this for createdAt / updatedAt fields so the value is set
 * server-side, ensuring consistency regardless of device clock.
 */
export function serverTimestamp() {
  return firestoreServerTimestamp();
}

/**
 * Converts any Firestore timestamp-like value to a JS Date.
 * Handles: Firestore Timestamp, Date objects, ISO strings, null.
 */
export function toDate(value: any): Date {
  if (!value) return new Date();
  if (value instanceof Timestamp) return value.toDate();
  if (typeof value?.toDate === 'function') return value.toDate();
  if (value instanceof Date) return value;
  return new Date(value);
}
