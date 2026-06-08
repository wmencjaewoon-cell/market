import { Session, User } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

type AuthContextType = {
  session: Session | null;
  user: User | null;
  isReady: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
      setIsReady(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session ?? null);
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      isReady,
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [session, isReady]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}