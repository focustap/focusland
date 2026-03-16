// NavBar component.
// Displays navigation links for logged-in users.
import React from "react";
import { Link } from "react-router-dom";

const NavBar: React.FC = () => {
  return (
    <nav className="navbar">
      <h1 className="navbar-title">Focusland</h1>
      <div className="navbar-links">
        <Link to="/lobby">Lobby</Link>
        <Link to="/profile">Profile</Link>
        <Link to="/game">Dodge</Link>
        <Link to="/catch">Catch</Link>
        <Link to="/casino">Casino</Link>
      </div>
    </nav>
  );
};

export default NavBar;

