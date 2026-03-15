// Profile page.
// Lets the user set a username and choose an avatar image.
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import NavBar from "../components/NavBar";
import { supabase } from "../lib/supabase";

const AVATARS = ["/avatars/avatar1.png", "/avatars/avatar2.png", "/avatars/avatar3.png"];

const Profile: React.FC = () => {
  const [username, setUsername] = useState("");
  const [avatarUrl, setAvatarUrl] = useState(AVATARS[0]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const navigate = useNavigate();

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
          .select("username, avatar_url")
          .eq("id", session.user.id)
          .maybeSingle();

        if (error) {
          console.error(error);
          return;
        }

        if (data) {
          setUsername(data.username ?? "");
          setAvatarUrl(data.avatar_url ?? AVATARS[0]);
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
          avatar_url: avatarUrl
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
              <span>Choose an avatar</span>
              <div className="avatar-grid">
                {AVATARS.map((url) => (
                  <button
                    type="button"
                    key={url}
                    className={
                      url === avatarUrl
                        ? "avatar-choice avatar-choice--selected"
                        : "avatar-choice"
                    }
                    onClick={() => setAvatarUrl(url)}
                  >
                    <img src={url} alt="Avatar choice" />
                  </button>
                ))}
              </div>
            </div>
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

