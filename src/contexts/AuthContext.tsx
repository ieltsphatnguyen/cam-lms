import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { Profile } from '@/types/database';

type AuthView =
  | 'login'
  | 'register'
  | 'forgot-password'
  | 'reset-password';

interface AuthContextValue {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  loading: boolean;
  authView: AuthView;
  sessionExpired: boolean;
  accountDisabled: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  setAuthView: (view: AuthView) => void;
  clearSessionExpired: () => void;
  clearAccountDisabled: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [authView, setAuthView] = useState<AuthView>('login');
  const [sessionExpired, setSessionExpired] = useState(false);
  const [accountDisabled, setAccountDisabled] = useState(false);

  async function fetchProfile(userId: string): Promise<void> {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    setProfile(data ?? null);

    // If we have a session user but no profile is returned, the user is likely
    // banned — RLS policies now deny access for banned users. Sign them out
    // and flag the account as disabled so the UI can show a clear message.
    if (!data) {
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData.session?.user) {
        setAccountDisabled(true);
        await supabase.auth.signOut();
      }
    }
  }

  async function refreshProfile(): Promise<void> {
    if (user) await fetchProfile(user.id);
  }

  function clearSessionExpired() {
    setSessionExpired(false);
  }

  function clearAccountDisabled() {
    setAccountDisabled(false);
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        fetchProfile(s.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      setUser(s?.user ?? null);

      if (event === 'PASSWORD_RECOVERY') {
        setAuthView('reset-password');
      }

      if (event === 'SIGNED_OUT' && !s) {
        // Only flag as expired if we previously had a session
        setSessionExpired((prev) => prev || session !== null);
        setProfile(null);
      }

      if (event === 'TOKEN_REFRESHED' && s) {
        setSessionExpired(false);
      }

      if (s?.user) {
        (async () => {
          await fetchProfile(s.user.id);
        })();
      } else if (event !== 'SIGNED_OUT') {
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function signOut(): Promise<void> {
    setSessionExpired(false);
    await supabase.auth.signOut();
    setAuthView('login');
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        session,
        loading,
        authView,
        sessionExpired,
        signOut,
        refreshProfile,
        setAuthView,
        clearSessionExpired,
        clearAccountDisabled,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
