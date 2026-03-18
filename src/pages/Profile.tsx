// Profile page.
// Lets the user set a username and choose a rectangle color.
import React, { useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../components/AuthProvider";
import NavBar from "../components/NavBar";
import { DEFAULT_PROFILE_COLOR, normalizeProfileColor } from "../lib/profileColor";
import { supabase } from "../lib/supabase";

const PROFILE_COLORS = [
  "#38bdf8",
  "#22c55e",
  "#f97316",
  "#eab308",
  "#a855f7",
  "#ef4444"
];

const Profile: React.FC = () => {
  const [username, setUsername] = useState("");
  const [rectangleColor, setRectangleColor] = useState(DEFAULT_PROFILE_COLOR);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const navigate = useNavigate();
  const { darkMode, setDarkMode } = useContext(AuthContext);

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const {
          data: { session }
        } = await supabase.auth.getSession();

        if (!session) {
          return;
        }

        const { data, error } = await supabase
          .from("profiles")
          .select("username, color, dark_mode")
          .eq("id", session.user.id)
          .maybeSingle();

        if (error) {
          console.error(error);
          return;
        }

        if (data) {
          setUsername(data.username ?? "");
          setRectangleColor(normalizeProfileColor(data.color));
          if (typeof data.dark_mode === "boolean") {
            setDarkMode(data.dark_mode);
          }
        }
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, []);

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (!session) {
        setMessage("You must be logged in to save your profile.");
        return;
      }

      const { error } = await supabase.from("profiles").upsert(
        {
          id: session.user.id,
          username,
          color: normalizeProfileColor(rectangleColor),
          dark_mode: darkMode
        },
        { onConflict: "id" }
      );

      if (error) {
        setMessage(error.message);
        return;
      }

      setMessage("Profile saved!");
      // After saving, send the user to the lobby.
      navigate("/lobby");
    } catch (error) {
      setMessage("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <NavBar />
      <div className="content card">
        <h2>Profile</h2>
        {loading ? (
          <p>Loading profile...</p>
        ) : (
          <form onSubmit={handleSave}>
            <label className="field">
              <span>Username</span>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Pick a fun name"
              />
            </label>
            <div className="field">
              <span>Rectangle color</span>
              <div className="color-preview-row">
                <div
                  className="rectangle-preview"
                  style={{ backgroundColor: normalizeProfileColor(rectangleColor) }}
                />
                <input
                  type="color"
                  value={normalizeProfileColor(rectangleColor)}
                  onChange={(e) => setRectangleColor(e.target.value)}
                  aria-label="Choose rectangle color"
                />
              </div>
              <div className="color-swatch-grid">
                {PROFILE_COLORS.map((color) => (
                  <button
                    type="button"
                    key={color}
                    className={
                      normalizeProfileColor(rectangleColor) === color
                        ? "color-swatch color-swatch--selected"
                        : "color-swatch"
                    }
                    style={{ backgroundColor: color }}
                    onClick={() => setRectangleColor(color)}
                    aria-label={`Use ${color} for rectangle color`}
                  />
                ))}
              </div>
            </div>
            <label className="field">
              <span>Theme</span>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setDarkMode((current) => !current)}
              >
                {darkMode ? "Dark mode: on" : "Dark mode: off"}
              </button>
            </label>
            {message && <div className="info">{message}</div>}
            <button
              className="primary-button"
              type="submit"
              disabled={saving}
            >
              {saving ? "Saving..." : "Save profile"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default Profile;

