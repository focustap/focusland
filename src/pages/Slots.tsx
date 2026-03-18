import React, { useEffect, useState } from "react";
import NavBar from "../components/NavBar";
import { applyGoldDelta, getCurrentUserGold } from "../lib/progression";

const SYMBOLS = ["7", "BAR", "GEM", "STAR", "CHERRY"];
const SPIN_COST = 10;

function getPayout(reels: string[]) {
  if (reels.every((symbol) => symbol === "7")) return 120;
  if (reels.every((symbol) => symbol === "BAR")) return 70;
  if (reels.every((symbol) => symbol === "GEM")) return 55;
  if (reels.every((symbol) => symbol === "STAR")) return 40;
  if (reels.every((symbol) => symbol === "CHERRY")) return 30;
  if (new Set(reels).size === 1) return 24;
  if (reels.filter((symbol) => symbol === "CHERRY").length >= 2) return 16;
  return 0;
}

const Slots: React.FC = () => {
  const [gold, setGold] = useState(0);
  const [reels, setReels] = useState(["7", "BAR", "GEM"]);
  const [status, setStatus] = useState("Pull the lever. Triple symbols pay big.");
  const [spinning, setSpinning] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        setGold(await getCurrentUserGold());
      } catch {
        setStatus("Could not load your gold.");
      }
    })();
  }, []);

  const spin = async () => {
    if (spinning) {
      return;
    }
    if (gold < SPIN_COST) {
      setStatus("Not enough gold to spin.");
      return;
    }

    setSpinning(true);
    setStatus("Spinning...");

    const nextReels = Array.from({ length: 3 }, () => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]);
    setTimeout(async () => {
      setReels(nextReels);
      const payout = getPayout(nextReels);
      const delta = payout - SPIN_COST;

      try {
        const nextGold = await applyGoldDelta(delta);
        setGold(nextGold);
        setStatus(
          payout > 0
            ? `You hit ${nextReels.join(" / ")} and won ${payout} gold.`
            : `No line hit. You lost ${SPIN_COST} gold.`
        );
      } catch {
        setStatus("Could not update your gold.");
      } finally {
        setSpinning(false);
      }
    }, 850);
  };

  return (
    <div className="page">
      <NavBar />
      <div className="content card" style={{ maxWidth: 760 }}>
        <h2>Slots</h2>
        <p>Simple three-reel slot machine. Each spin costs {SPIN_COST} gold.</p>
        <div className="casino-slot-shell">
          <div className="casino-slot-header">
            <strong>Gold: {gold}</strong>
            <span>777 pays 120</span>
          </div>
          <div className="casino-slot-reels">
            {reels.map((reel, index) => (
              <div key={`${reel}-${index}`} className="casino-slot-reel">
                {reel}
              </div>
            ))}
          </div>
          <div className="button-row">
            <button className="primary-button" type="button" onClick={() => void spin()} disabled={spinning}>
              {spinning ? "Spinning..." : `Spin (${SPIN_COST}g)`}
            </button>
          </div>
        </div>
        <p className="info">{status}</p>
      </div>
    </div>
  );
};

export default Slots;
