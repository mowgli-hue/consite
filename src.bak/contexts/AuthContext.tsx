/**
 * AuthContext.
 *
 * Subscribes to Firebase Auth state, fetches the user profile, exposes it
 * to the tree. Root layout uses `useAuth()` to decide which route group to
 * mount: (auth), (worker), or (admin).
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { onAuthChange, fetchUserProfile, signIn as libSignIn, signOut as libSignOut } from '../lib/auth';
import type { User } from '../types';

interface AuthState {
  loading: boolean;
  user: User | null;
  /** True after the first auth check has settled. */
  ready: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Live-subscribe to the profile doc so changes made by the office
    // (project assignments, deactivation, role changes) reach a logged-in
    // app within seconds — no re-login needed.
    let profileUnsub: (() => void) | null = null;

    const unsub = onAuthChange((fbUser) => {
      if (profileUnsub) {
        profileUnsub();
        profileUnsub = null;
      }
      if (!fbUser) {
        setUser(null);
        setReady(true);
        setLoading(false);
        return;
      }
      profileUnsub = onSnapshot(
        doc(db, 'users', fbUser.uid),
        (snap) => {
          setUser(snap.exists() ? ({ uid: snap.id, ...(snap.data() as Omit<User, 'uid'>) } as User) : null);
          setReady(true);
          setLoading(false);
        },
        (err) => {
          console.warn('Failed to load user profile', err);
          setUser(null);
          setReady(true);
          setLoading(false);
        },
      );
    });

    return () => {
      unsub();
      if (profileUnsub) profileUnsub();
    };
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      loading,
      ready,
      user,
      signIn: async (email, password) => {
        setLoading(true);
        try {
          const profile = await libSignIn(email, password);
          setUser(profile);
        } finally {
          setLoading(false);
        }
      },
      signOut: async () => {
        await libSignOut();
        setUser(null);
      },
      refresh: async () => {
        if (!user) return;
        const fresh = await fetchUserProfile(user.uid);
        setUser(fresh);
      },
    }),
    [user, loading, ready]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
