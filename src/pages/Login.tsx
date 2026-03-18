// Login page.
// Allows users to sign up and log in using Supabase email/password auth.
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

const Login: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);

  useEffect(() => {
    const checkExistingSession = async () => {
      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (!session) {
        return;
      }

      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", session.user.id)
        .maybeSingle();

      navigate(existingProfile ? "/lobby" : "/profile", { replace: true });
    };

    void checkExistingSession();
  }, [navigate]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    try {
      // First sign the user in or sign them up.
      if (isSignUp) {
        const emailRedirectTo = `${window.location.origin}${import.meta.env.BASE_URL}`;

        const {
          data: signUpData,
          error: signUpError
        } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo
          }
        });
        if (signUpError) {
          setError(signUpError.message);
          return;
        }

        if (!signUpData.session) {
          setMessage("Account created. Check your email to confirm, then come back and log in.");
          return;
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password
        });
        if (signInError) {
          setError(signInError.message);
          return;
        }
      }

      // After auth, check if the user already has a profile.
      const {
        data: { session }
      } = await supabase.auth.getSession();

      const userId = session?.user.id;

      if (!userId) {
        setError("Could not load your session. Please try again.");
        return;
      }

      const { data: existingProfile, error: profileError } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", userId)
        .maybeSingle();

      if (profileError) {
        // If something goes wrong, fall back to profile setup so the user can try again.
        navigate("/profile");
        return;
      }

      // If profile exists, go straight to lobby; otherwise go to profile setup.
      if (existingProfile) {
        navigate("/lobby");
      } else {
        navigate("/profile");
      }
    } catch (err) {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordKeyState = (event: React.KeyboardEvent<HTMLInputElement>) => {
    setCapsLockOn(event.getModifierState("CapsLock"));
  };

  return (
    <div className="page auth-page">
      <h2>{isSignUp ? "Sign up" : "Log in"}</h2>
      <form onSubmit={handleSubmit} className="card">
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={handlePasswordKeyState}
            onKeyUp={handlePasswordKeyState}
            onBlur={() => setCapsLockOn(false)}
            required
          />
        </label>
        {capsLockOn && <div className="warning">Caps Lock is on.</div>}
        {error && <div className="error">{error}</div>}
        {message && <div className="info">{message}</div>}
        <button className="primary-button" type="submit" disabled={loading}>
          {loading ? "Please wait..." : isSignUp ? "Create account" : "Log in"}
        </button>
      </form>
      <button
        type="button"
        className="link-button"
        onClick={() => setIsSignUp((prev) => !prev)}
      >
        {isSignUp
          ? "Already have an account? Log in"
          : "Need an account? Sign up"}
      </button>
    </div>
  );
};

export default Login;

