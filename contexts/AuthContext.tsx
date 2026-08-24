import { Session, User } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { logAuthActivity, type AuthActivityEventType } from '../lib/authActivity';
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
  const lastActivityKeyRef = useRef<string | null>(null);

  const logActivityOnce = useCallback((eventType: AuthActivityEventType, activeSession: Session | null) => {
    if (!activeSession?.user?.id) return;

    const tokenKey = activeSession.access_token?.slice(-16) || '';
    const activityKey = `${eventType}:${activeSession.user.id}:${tokenKey}`;
    if (lastActivityKeyRef.current === activityKey) return;

    lastActivityKeyRef.current = activityKey;
    void logAuthActivity(eventType);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const nextSession = data.session ?? null;
      setSession(nextSession);
      setIsReady(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      const nextSession = session ?? null;
      setSession(nextSession);

      if (event === 'SIGNED_IN') {
        logActivityOnce('login', nextSession);
      }
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, [logActivityOnce]);

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      isReady,
      signOut: async () => {
        if (session) {
          await logAuthActivity('logout');
        }

        try {
          const { unregisterPushToken } = await import('../lib/notifications');
          await unregisterPushToken();
        } catch (error) {
          console.log('로그아웃 푸시 토큰 정리 실패:', error);
        }

        setSession(null);

        try {
          await supabase.auth.signOut({ scope: 'local' });
        } finally {
          setSession(null);
        }
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
