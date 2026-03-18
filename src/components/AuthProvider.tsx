// AuthProvider component.
// This component listens to Supabase auth changes and exposes the current session to the app.
import React, { createContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

type AuthContextValue = {
  session: Session | null;
  loading: boolean;
  darkMode: boolean;
  setDarkMode: React.Dispatch<React.SetStateAction<boolean>>;
};

export const AuthContext = createContext<AuthContextValue>({
  session: null,
  loading: true,
  darkMode: false,
  setDarkMode: () => undefined
});

type Props = {
  children: ReactNode;
};

export const AuthProvider: React.FC<Props> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("focusland-dark-mode") === "true");

  useEffect(() => {
    const getInitialSession = async () => {
      const url = new URL(window.location.href);
      const authCode = url.searchParams.get("code");

      if (authCode) {
        await supabase.auth.exchangeCodeForSession(authCode);
        url.searchParams.delete("code");
        url.searchParams.delete("type");
        url.searchParams.delete("error");
        url.searchParams.delete("error_code");
        url.searchParams.delete("error_description");
        window.history.replaceState({}, document.title, url.toString());
      }

      const { data } = await supabase.auth.getSession();
      setSession(data.session ?? null);
      if (data.session) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("dark_mode")
          .eq("id", data.session.user.id)
          .maybeSingle();

        if (typeof profile?.dark_mode === "boolean") {
          setDarkMode(profile.dark_mode);
        }
      }
      setLoading(false);
    };

    getInitialSession();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (!newSession) {
        return;
      }

      void supabase
        .from("profiles")
        .select("dark_mode")
        .eq("id", newSession.user.id)
        .maybeSingle()
        .then(({ data: profile }) => {
          if (typeof profile?.dark_mode === "boolean") {
            setDarkMode(profile.dark_mode);
          }
        });
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    localStorage.setItem("focusland-dark-mode", String(darkMode));
    document.body.dataset.theme = darkMode ? "dark" : "light";
  }, [darkMode]);

  return (
    <AuthContext.Provider value={{ session, loading, darkMode, setDarkMode }}>
      {children}
    </AuthContext.Provider>
  );
};

