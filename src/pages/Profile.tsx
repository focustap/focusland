// Profile page.
// Lets the user set a username and choose a sprite-based town avatar.
import React, { useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../components/AuthProvider";
import NavBar from "../components/NavBar";
import AvatarSprite from "../components/AvatarSprite";
import {
  DEFAULT_AVATAR_CUSTOMIZATION,
  normalizeAvatarCustomization,
  SKIN_OPTIONS,
  storeAvatarCustomization,
  getStoredAvatarCustomization,
  type AvatarCustomization
} from "../lib/avatarSprites";
import { loadInventoryForCurrentUser } from "../lib/playerInventory";
import { DEFAULT_PROFILE_COLOR, normalizeProfileColor } from "../lib/profileColor";
import { ownsSkin } from "../lib/shop";
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
  const [avatarCustomization, setAvatarCustomization] = useState<AvatarCustomization>(DEFAULT_AVATAR_CUSTOMIZATION);
  const [gold, setGold] = useState(0);
  const [ownedSkinIds, setOwnedSkinIds] = useState<number[]>([0]);
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
          .select("*")
          .eq("id", session.user.id)
          .maybeSingle();

        if (error) {
          console.error(error);
          return;
        }

        if (data) {
          const nextCustomization = normalizeAvatarCustomization(
            (data as { avatar_customization?: Partial<AvatarCustomization> | null }).avatar_customization
            ?? getStoredAvatarCustomization()
          );
          const inventoryResult = await loadInventoryForCurrentUser(nextCustomization.skinId);
          setUsername(data.username ?? "");
          setRectangleColor(normalizeProfileColor(data.color));
          setAvatarCustomization(nextCustomization);
          setOwnedSkinIds(inventoryResult.inventory.ownedSkinIds);
          setGold(Number((data as { gold?: number | null }).gold ?? 0));
          if (typeof data.dark_mode === "boolean") {
            setDarkMode(data.dark_mode);
          }
        } else {
          const nextCustomization = getStoredAvatarCustomization();
          const inventoryResult = await loadInventoryForCurrentUser(nextCustomization.skinId);
          setAvatarCustomization(nextCustomization);
          setOwnedSkinIds(inventoryResult.inventory.ownedSkinIds);
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
        avatar_customization: normalizeAvatarCustomization(avatarCustomization)
      };

      let { error } = await supabase.from("profiles").upsert(payload, { onConflict: "id" });

      if (error?.message?.toLowerCase().includes("avatar_customization")) {
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

      storeAvatarCustomization(avatarCustomization);
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
                <AvatarSprite customization={avatarCustomization} size={96} className="profile-avatar-preview" />
                <input
                  type="color"
                  value={normalizeProfileColor(rectangleColor)}
                  onChange={(e) => setRectangleColor(e.target.value)}
                  aria-label="Choose accent color"
                />
              </div>
              <div className="info">Choose a full town skin. More unlockable skins can be added later without changing the avatar system again.</div>
              <div className="avatar-style-grid">
                {SKIN_OPTIONS.map((skin) => {
                  const unlocked = ownsSkin({ ownedSkinIds, cardPacks: {} }, skin.id);
                  return (
                  <button
                    type="button"
                    key={skin.id}
                    className={
                      avatarCustomization.skinId === skin.id
                        ? "avatar-style-button avatar-style-button--selected"
                        : "avatar-style-button"
                    }
                    onClick={() => setAvatarCustomization({ skinId: skin.id })}
                    aria-label={`Use ${skin.label}`}
                    disabled={!unlocked}
                  >
                    <AvatarSprite customization={{ skinId: skin.id }} size={72} />
                    <span>{skin.label}{unlocked ? "" : " (Shop)"}</span>
                  </button>
                  );
                })}
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

