// NavBar component.
// Displays navigation links for logged-in users.
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";

const NavBar: React.FC = () => {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const checkForUpdate = async () => {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}version.json?ts=${Date.now()}`, {
          cache: "no-store"
        });
        if (!response.ok) return;
        const data = (await response.json()) as { buildId?: string; version?: string };
        if (!cancelled && data.buildId && data.buildId !== __APP_BUILD_ID__) {
          setUpdateAvailable(true);
        }
      } catch {
        // Ignore transient version polling failures.
      }
    };

    void checkForUpdate();
    const intervalId = window.setInterval(() => {
      void checkForUpdate();
    }, 60000);
    window.addEventListener("focus", checkForUpdate);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", checkForUpdate);
    };
  }, []);

  return (
    <nav className="navbar">
      <h1 className="navbar-title">Focusland</h1>
      <div className="navbar-links">
        <Link to="/lobby">Lobby</Link>
        <Link to="/casino">Casino</Link>
        <Link to="/arcade">Arcade</Link>
        <Link to="/house">House</Link>
        <Link to="/story">Story</Link>
        <Link to="/shop">Shop</Link>
        <Link to="/leaderboard">Leaderboard</Link>
        <Link to="/profile">Profile</Link>
        {updateAvailable ? (
          <button
            className="navbar-update-button"
            type="button"
            onClick={() => window.location.reload()}
          >
            Site updated, reload for latest
          </button>
        ) : null}
      </div>
    </nav>
  );
};

export default NavBar;

