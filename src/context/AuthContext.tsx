/**
 * AuthContext — Firebase Authentication state management (v26 Modular API).
 *
 * Provides:
 *  - user: Current Firebase User (null if not logged in)
 *  - loading: True while the initial auth state is being determined
 *  - signIn(email, password)
 *  - register(email, password, displayName)
 *  - signOut()
 *  - resetPassword(email)
 *  - deleteAccount()
 *
 * The auth state is kept in sync with Firebase via onAuthStateChanged().
 * When the auth state changes, AppNavigator reads this context and
 * automatically navigates between the Auth stack and Main stack.
 *
 * deleteAccount() deletes all user-owned Firestore data first, then removes
 * the Firebase Authentication account. If Firebase requires recent login it
 * throws an error with code 'auth/requires-recent-login' so callers can
 * present a re-authentication flow before retrying.
 */

import React, {
  createContext, useContext, useState, useEffect, ReactNode,
} from 'react';
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  updateProfile,
  EmailAuthProvider,
  reauthenticateWithCredential,
  User,
} from '@react-native-firebase/auth';
import {
  getFirestore,
  collection,
  getDocs,
  deleteDoc,
  doc,
  writeBatch,
} from '@react-native-firebase/firestore';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuthContextValue {
  user:          User | null;
  loading:       boolean;
  signIn:        (email: string, password: string) => Promise<void>;
  register:      (email: string, password: string, displayName: string) => Promise<void>;
  signOut:       () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  /**
   * Deletes all user-owned Firestore data then permanently removes the
   * Firebase Authentication account. Signs out on success.
   *
   * Throws with error.code === 'auth/requires-recent-login' when Firebase
   * demands re-authentication before deletion can proceed.
   */
  deleteAccount: () => Promise<void>;
  /**
   * Re-authenticates the current user with their email/password credential.
   * Call this before retrying deleteAccount() when requires-recent-login fires.
   * NEVER log the password parameter.
   */
  reauthenticate: (email: string, password: string) => Promise<void>;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const auth = getAuth();

  const [user,    setUser]    = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Subscribe to Firebase auth state changes on mount.
  // This also handles the case where the user was previously signed in
  // and the app restarts — Firebase restores the session automatically.
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, fbUser => {
      setUser(fbUser);
      setLoading(false);
    });
    // Cleanup the listener when the component unmounts
    return unsubscribe;
  }, [auth]);

  // ─── Auth operations ────────────────────────────────────────────────────────

  /** Sign in with email and password. Throws on error (handled by callers). */
  async function signIn(email: string, password: string) {
    await signInWithEmailAndPassword(auth, email, password);
  }

  /**
   * Create a new account with email/password, then set the user's display name.
   * Firebase creates the user first, then we immediately update the profile.
   */
  async function register(email: string, password: string, displayName: string) {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    // Update displayName immediately after registration
    if (credential.user && displayName.trim()) {
      await updateProfile(credential.user, { displayName: displayName.trim() });
      // Force a refresh so the user state reflects the new displayName
      setUser({ ...credential.user, displayName: displayName.trim() } as User);
    }
  }

  /** Sign out the current user. AppNavigator handles navigation on state change. */
  async function signOut() {
    await firebaseSignOut(auth);
  }

  /** Send a password reset email to the given address. */
  async function resetPassword(email: string) {
    await sendPasswordResetEmail(auth, email);
  }

  // ─── Provide context ────────────────────────────────────────────────────────

  // ── Delete account ────────────────────────────────────────────────────────

  /**
   * Deletes all user-owned Firestore documents/subcollections then removes
   * the Firebase Authentication account. Navigation is handled automatically
   * by AppNavigator when the auth state changes to null.
   *
   * Firestore structure deleted:
   *   users/{uid}/notes         (all docs)
   *   users/{uid}/habits        (all docs)
   *   users/{uid}/events        (all docs)
   *   users/{uid}/transactions  (all docs)
   *   users/{uid}               (parent doc, if it exists)
   */
  async function deleteAccount() {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw Object.assign(new Error('No authenticated user found.'), { code: 'auth/no-current-user' });
    }

    const uid = currentUser.uid;
    const firestoreDb = getFirestore();

    // ── Step 1: Delete Firestore subcollections in batches ─────────────────
    // Subcollection names as documented in firebase.ts.
    const subcollectionNames = ['notes', 'habits', 'events', 'transactions'] as const;

    for (const subcol of subcollectionNames) {
      const colRef = collection(firestoreDb, 'users', uid, subcol);
      const snapshot = await getDocs(colRef);

      // Use write batches (max 500 ops each) to efficiently delete all docs.
      const BATCH_SIZE = 450;
      let batch = writeBatch(firestoreDb);
      let opCount = 0;

      for (const docSnap of snapshot.docs) {
        batch.delete(docSnap.ref);
        opCount++;
        if (opCount >= BATCH_SIZE) {
          await batch.commit();
          batch = writeBatch(firestoreDb);
          opCount = 0;
        }
      }

      if (opCount > 0) {
        await batch.commit();
      }
    }

    // ── Step 2: Delete the parent users/{uid} document (if it exists) ──────
    const userDocRef = doc(firestoreDb, 'users', uid);
    await deleteDoc(userDocRef).catch(() => {
      // If the document doesn't exist, deleteDoc throws — ignore safely.
    });

    // ── Step 3: Delete the Firebase Auth account ────────────────────────────
    // This will throw 'auth/requires-recent-login' if the session is stale.
    // The caller (ProfileScreen) handles this by prompting re-authentication.
    await currentUser.delete();

    // ── Step 4: Sign out — clears local auth state ──────────────────────────
    // After delete() the user is technically already signed out in Firebase,
    // but calling signOut() ensures the local auth listener fires cleanly.
    try {
      await firebaseSignOut(auth);
    } catch {
      // Ignore sign-out errors after successful deletion.
    }
  }

  /** Re-authenticates the current user. Never logs the password. */
  async function reauthenticate(email: string, password: string) {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw Object.assign(new Error('No authenticated user.'), { code: 'auth/no-current-user' });
    }
    const credential = EmailAuthProvider.credential(email, password);
    await reauthenticateWithCredential(currentUser, credential);
  }

  // ─── Provide context ────────────────────────────────────────────────────────

  return (
    <AuthContext.Provider value={{ user, loading, signIn, register, signOut, resetPassword, deleteAccount, reauthenticate }}>
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * useAuth — Returns the current auth context.
 * Must be used inside an AuthProvider (i.e., anywhere inside the app).
 */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
