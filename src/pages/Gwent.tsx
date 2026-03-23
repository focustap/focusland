import React from "react";
import NavBar from "../components/NavBar";

const Gwent: React.FC = () => {
  const gwentUrl = `${import.meta.env.BASE_URL}gwent-classic/index.html`;

  return (
    <div className="page">
      <NavBar />
      <div className="content card" style={{ maxWidth: 1320 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <h2>GWENT</h2>
            <p>Original Witcher 3 style GWENT as a separate playable table.</p>
          </div>
          <a className="secondary-button" href={gwentUrl} target="_blank" rel="noreferrer">
            Open Standalone
          </a>
        </div>
        <iframe
          title="GWENT Classic"
          src={gwentUrl}
          style={{
            width: "100%",
            minHeight: "86vh",
            border: "1px solid rgba(148, 163, 184, 0.18)",
            borderRadius: 18,
            background: "#0b1020"
          }}
          allowFullScreen
        />
      </div>
    </div>
  );
};

export default Gwent;
