import React, { useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../components/AuthProvider";
import NavBar from "../components/NavBar";
import { type BrawlPveProgress, loadBrawlPveProgress } from "../lib/brawlPveProgress";

type BossNode = {
  id: string;
  name: string;
  subtitle: string;
  difficulty: string;
  x: number;
  y: number;
  accent: string;
};

const BOSSES: BossNode[] = [
  {
    id: "boss-1",
    name: "Ashen Juggernaut",
    subtitle: "A brutal gatekeeper with slams, rushes, and orb bursts.",
    difficulty: "Hard",
    x: 120,
    y: 260,
    accent: "#f97316"
  },
  {
    id: "boss-2",
    name: "Stonebreak Giant",
    subtitle: "A colossal brute with a full-arena collapse at half health.",
    difficulty: "Very Hard",
    x: 340,
    y: 196,
    accent: "#cbd5e1"
  },
  {
    id: "boss-3",
    name: "Thorn Saint",
    subtitle: "Locked",
    difficulty: "Coming Soon",
    x: 570,
    y: 248,
    accent: "#86efac"
  }
];

const BrawlPvEWorld: React.FC = () => {
  const navigate = useNavigate();
  const { session } = useContext(AuthContext);
  const [progress, setProgress] = useState<BrawlPveProgress>({ unlockedBosses: ["boss-1"], clearedBosses: [] });

  useEffect(() => {
    void loadBrawlPveProgress(session?.user.id).then(setProgress);
  }, [session?.user.id]);

  return (
    <div className="page">
      <NavBar />
      <div className="content card" style={{ maxWidth: 980 }}>
        <h2>Brawl PvE World</h2>
        <p>Early world-map structure for the future co-op boss crawl. Beat a boss to unlock the next fight.</p>

        <div
          style={{
            position: "relative",
            minHeight: 460,
            margin: "1rem auto",
            borderRadius: "1.25rem",
            overflow: "hidden",
            border: "1px solid rgba(148,163,184,0.3)",
            background:
              "linear-gradient(180deg, rgba(191,219,254,0.9) 0%, rgba(224,231,255,0.92) 28%, rgba(254,240,138,0.9) 100%)"
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "radial-gradient(circle at 14% 18%, rgba(255,255,255,0.72) 0%, transparent 16%), radial-gradient(circle at 86% 22%, rgba(255,255,255,0.58) 0%, transparent 18%)"
            }}
          />
          <svg
            viewBox="0 0 760 460"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
            aria-hidden="true"
          >
            <path
              d="M85 310 C 180 320, 210 210, 320 222 S 470 300, 610 265"
              fill="none"
              stroke="#7c5f2c"
              strokeWidth="24"
              strokeLinecap="round"
            />
            <path
              d="M85 310 C 180 320, 210 210, 320 222 S 470 300, 610 265"
              fill="none"
              stroke="#fef3c7"
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray="2 18"
            />
          </svg>

          {BOSSES.map((boss) => {
            const unlocked = progress.unlockedBosses.includes(boss.id);
            const cleared = progress.clearedBosses.includes(boss.id);
            return (
              <button
                key={boss.id}
                type="button"
                disabled={!unlocked}
                onClick={() => navigate(`/arena/pve/${boss.id}`)}
                style={{
                  position: "absolute",
                  left: boss.x,
                  top: boss.y,
                  width: 170,
                  transform: "translate(-50%, -50%)",
                  borderRadius: "1rem",
                  border: unlocked ? `2px solid ${boss.accent}` : "2px solid rgba(148,163,184,0.4)",
                  background: unlocked ? "rgba(15,23,42,0.9)" : "rgba(71,85,105,0.6)",
                  color: "#f8fafc",
                  textAlign: "left",
                  padding: "0.8rem 0.95rem",
                  boxShadow: unlocked ? "0 16px 30px rgba(15,23,42,0.2)" : "none",
                  cursor: unlocked ? "pointer" : "not-allowed"
                }}
              >
                <div style={{ fontSize: "1rem", fontWeight: 700 }}>
                  {boss.name} {cleared ? "CLEARED" : ""}
                </div>
                <div style={{ marginTop: "0.35rem", fontSize: "0.82rem", color: unlocked ? "#cbd5e1" : "#e2e8f0" }}>
                  {boss.subtitle}
                </div>
                <div style={{ marginTop: "0.45rem", fontSize: "0.75rem", color: boss.accent }}>
                  {unlocked ? boss.difficulty : "Locked"}
                </div>
              </button>
            );
          })}
        </div>

        <p className="info">
          First slice: one hard boss fight, world-map progression, and local unlock persistence. Next bosses are stubbed so the path already exists.
        </p>
      </div>
    </div>
  );
};

export default BrawlPvEWorld;
