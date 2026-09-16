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
 *
 * The auth state is kept in sync with Firebase via onAuthStateChanged().
 * When the auth state changes, AppNavigator reads this context and
 * automatically navigates between the Auth stack and Main stack.
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
  User,
} from '@react-native-firebase/auth';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuthContextValue {
  user:          User | null;
  loading:       boolean;
  signIn:        (email: string, password: string) => Promise<void>;
  register:      (email: string, password: string, displayName: string) => Promise<void>;
  signOut:       () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
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

  return (
    <AuthContext.Provider value={{ user, loading, signIn, register, signOut, resetPassword }}>
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
