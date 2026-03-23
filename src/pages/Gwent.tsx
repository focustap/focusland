import React, { useEffect, useMemo, useState } from "react";
import NavBar from "../components/NavBar";
import { DEFAULT_PROFILE_COLOR, normalizeProfileColor } from "../lib/profileColor";
import { supabase } from "../lib/supabase";

const Gwent: React.FC = () => {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUsername, setCurrentUsername] = useState("Player");
  const [currentColor, setCurrentColor] = useState(DEFAULT_PROFILE_COLOR);

  useEffect(() => {
    let disposed = false;

    const loadIdentity = async () => {
      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (!session || disposed) {
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("username, color")
        .eq("id", session.user.id)
        .maybeSingle();

      setCurrentUserId(session.user.id);
      setCurrentUsername((profile?.username as string | null) ?? session.user.email ?? "Player");
      setCurrentColor(normalizeProfileColor((profile?.color as string | null) ?? DEFAULT_PROFILE_COLOR));
    };

    void loadIdentity();

    return () => {
      disposed = true;
    };
  }, []);

  const gwentUrl = useMemo(() => {
    const params = new URLSearchParams();
    params.set("mode", "online");
    if (currentUserId) {
      params.set("uid", currentUserId);
    }
    params.set("username", currentUsername);
    params.set("color", currentColor);
    params.set("supabaseUrl", import.meta.env.VITE_SUPABASE_URL as string);
    params.set("supabaseKey", import.meta.env.VITE_SUPABASE_ANON_KEY as string);
    return `${import.meta.env.BASE_URL}gwent-classic/index.html?${params.toString()}`;
  }, [currentColor, currentUserId, currentUsername]);

  return (
    <div className="page">
      <NavBar />
      <div className="content card" style={{ maxWidth: 1540, padding: 8, background: "#040404" }}>
        <iframe
          key={gwentUrl}
          title="GWENT"
          src={gwentUrl}
          style={{
            width: "100%",
            minHeight: "88vh",
            border: "1px solid rgba(218, 165, 32, 0.22)",
            borderRadius: 18,
            background: "#000"
          }}
          allowFullScreen
        />
      </div>
    </div>
  );
};

export default Gwent;
