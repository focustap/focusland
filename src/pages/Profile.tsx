// Profile page.
// Lets the user set a username and choose a sprite-based town avatar.
import React, { useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../components/AuthProvider";
import NavBar from "../components/NavBar";
import AvatarSprite from "../components/AvatarSprite";
import {
  AVATAR_STYLES,
  DEFAULT_AVATAR_STYLE,
  clampAvatarStyle,
  getStoredAvatarStyle,
  storeAvatarStyle
} from "../lib/avatarSprites";
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
  const [avatarStyle, setAvatarStyle] = useState(DEFAULT_AVATAR_STYLE);
  const [gold, setGold] = useState(0);
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
          .select("username, color, dark_mode, gold")
          .eq("id", session.user.id)
          .maybeSingle();

        if (error) {
          console.error(error);
          return;
        }

        if (data) {
          setUsername(data.username ?? "");
          setRectangleColor(normalizeProfileColor(data.color));
          setAvatarStyle(
            clampAvatarStyle(
              Number((data as { avatar_style?: number | null }).avatar_style ?? getStoredAvatarStyle())
            )
          );
          setGold(Number((data as { gold?: number | null }).gold ?? 0));
          if (typeof data.dark_mode === "boolean") {
            setDarkMode(data.dark_mode);
          }
        } else {
          setAvatarStyle(getStoredAvatarStyle());
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

      const payload = {
        id: session.user.id,
        username,
        color: normalizeProfileColor(rectangleColor),
        dark_mode: darkMode,
        avatar_style: clampAvatarStyle(avatarStyle)
      };

      let { error } = await supabase.from("profiles").upsert(payload, { onConflict: "id" });

      if (error?.message?.toLowerCase().includes("avatar_style")) {
        ({ error } = await supabase.from("profiles").upsert(
          {
            id: session.user.id,
            username,
            color: normalizeProfileColor(rectangleColor),
            dark_mode: darkMode
          },
          { onConflict: "id" }
        ));
      }

      if (error) {
        setMessage(error.message);
        return;
      }

      storeAvatarStyle(avatarStyle);
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
              <span>Town avatar</span>
              <div className="color-preview-row">
                <AvatarSprite styleIndex={avatarStyle} size={96} className="profile-avatar-preview" />
                <input
                  type="color"
                  value={normalizeProfileColor(rectangleColor)}
                  onChange={(e) => setRectangleColor(e.target.value)}
                  aria-label="Choose accent color"
                />
              </div>
              <div className="info">The accent color still powers simple UI avatars and legacy tables. Your town look comes from the sprite selection below.</div>
              <div className="avatar-style-grid">
                {AVATAR_STYLES.map((style) => (
                  <button
                    type="button"
                    key={style.id}
                    className={
                      avatarStyle === style.id
                        ? "avatar-style-button avatar-style-button--selected"
                        : "avatar-style-button"
                    }
                    onClick={() => setAvatarStyle(style.id)}
                    aria-label={`Use ${style.label}`}
                  >
                    <AvatarSprite styleIndex={style.id} size={72} />
                    <span>{style.label}</span>
                  </button>
                ))}
              </div>
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
                    aria-label={`Use ${color} for accent color`}
                  />
                ))}
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
            <div className="info">Gold: {gold}</div>
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

