import React, { useEffect, useRef, useState } from "react";
import Phaser from "phaser";
import NavBar from "../components/NavBar";
import { recordArcadeResult } from "../lib/progression";
import { ELEVATOR_GAME_HEIGHT, ELEVATOR_GAME_WIDTH } from "../game/elevator-shaft/run";
import { createElevatorShaftScene } from "../game/elevator-shaft/phaser/createElevatorShaftScene";

type HudState = {
  height: number;
  score: number;
  combo: number;
  bestCombo: number;
  collapseGap: number;
  sectionLabel: string;
  grappleReady: boolean;
};

type RunSummary = {
  score: number;
  height: number;
  bestCombo: number;
  goldEarned: number;
  reason: string;
};

const DEFAULT_HUD: HudState = {
  height: 0,
  score: 0,
  combo: 0,
  bestCombo: 0,
  collapseGap: 0,
  sectionLabel: "Service Shaft",
  grappleReady: true
};

const ElevatorShaftEscape: React.FC = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const [hud, setHud] = useState<HudState>(DEFAULT_HUD);
  const [status, setStatus] = useState("Climb before the collapse turns the shaft into a furnace.");
  const [runSummary, setRunSummary] = useState<RunSummary | null>(null);
  const [runNonce, setRunNonce] = useState(0);

  useEffect(() => {
    if (!containerRef.current || gameRef.current) {
      return;
    }

    let destroyed = false;
    const SceneClass = createElevatorShaftScene({
      onHudChange: (nextHud, nextStatus) => {
        if (destroyed) {
          return;
        }
        setHud(nextHud);
        setStatus(nextStatus);
      },
      onRunOver: (summary) => {
        if (destroyed) {
          return;
        }
        setRunSummary(summary);
        setStatus(`${summary.reason} Score saved. +${summary.goldEarned} gold if sync succeeds.`);
        void recordArcadeResult({
          scoreGameName: "elevator_shaft_escape",
          score: summary.score,
          goldEarned: summary.goldEarned
        }).catch(() => {
          setStatus(`${summary.reason} Local run complete, but score sync failed.`);
        });
      }
    });

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      width: ELEVATOR_GAME_WIDTH,
      height: ELEVATOR_GAME_HEIGHT,
      parent: containerRef.current,
      backgroundColor: "#06070d",
      scene: SceneClass
    });

    gameRef.current = game;

    return () => {
      destroyed = true;
      game.destroy(true);
      gameRef.current = null;
    };
  }, [runNonce]);

  const restartRun = () => {
    setRunSummary(null);
    setHud(DEFAULT_HUD);
    setStatus("Fresh run. The building is already moving under your feet.");
    if (gameRef.current) {
      gameRef.current.destroy(true);
      gameRef.current = null;
    }
    setRunNonce((value) => value + 1);
  };

  return (
    <div className="page">
      <NavBar />
      <main className="content card elevator-shell">
        <section className="elevator-hero">
          <div className="elevator-hero__copy">
            <span className="elevator-kicker">Arcade Vertical Climber</span>
            <h1>Elevator Shaft Escape</h1>
            <p>
              Climb a collapsing high-rise with jumps, wall kicks, and anchor grapples. It is built as a fast,
              restart-friendly endless run with a strong Phase 1 movement core and enough section identity to feel like a real game already.
            </p>
          </div>
          <div className="elevator-summary-card">
            <span className="elevator-summary-card__label">Current Section</span>
            <strong>{hud.sectionLabel}</strong>
            <span className="elevator-summary-card__meta">
              Grapple {hud.grappleReady ? "ready" : "cooling"} | Collapse gap {hud.collapseGap}m
            </span>
          </div>
        </section>

        <section className="elevator-layout">
          <div className="elevator-stage">
            <div className="elevator-stage__hud elevator-stage__hud--top">
              <span>Height {hud.height}m</span>
              <span>Score {hud.score}</span>
              <span>Combo {hud.combo}</span>
              <span>Best {hud.bestCombo}</span>
            </div>
            <div className="elevator-stage__frame">
              <div ref={containerRef} style={{ width: ELEVATOR_GAME_WIDTH, height: ELEVATOR_GAME_HEIGHT }} />
              {runSummary ? (
                <div className="elevator-overlay">
                  <div className="elevator-overlay__card">
                    <span className="elevator-kicker">Run Over</span>
                    <h2>{runSummary.height}m climbed</h2>
                    <p>{runSummary.reason}</p>
                    <p>
                      Score {runSummary.score} | Best combo {runSummary.bestCombo} | Reward {runSummary.goldEarned} gold
                    </p>
                    <button className="primary-button" type="button" onClick={restartRun}>
                      Run It Back
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
            <div className="elevator-stage__hud elevator-stage__hud--bottom">
              <span>Move `A` / `D`</span>
              <span>Jump `W` / `Up` / `Space`</span>
              <span>Grapple click or `E`</span>
              <span>Restart `R` after a crash</span>
            </div>
          </div>

          <aside className="elevator-sidepanel">
            <div className="elevator-panel">
              <span className="elevator-panel__title">Core Loop</span>
              <p>Climb up, chain landings, and let the collapse pressure decide the pace. The grapple is a rescue tool first and a stylish route extender second.</p>
            </div>
            <div className="elevator-panel">
              <span className="elevator-panel__title">Phase 1 Systems</span>
              <p>Responsive jump with jump cut, wall jump recovery, anchor grapple, upward camera, rising failure line, and score from height plus run quality.</p>
            </div>
            <div className="elevator-panel">
              <span className="elevator-panel__title">Run Status</span>
              <p>{status}</p>
              {runSummary ? (
                <p>
                  Last run: {runSummary.height}m, score {runSummary.score}, combo {runSummary.bestCombo}.
                </p>
              ) : (
                <p>No completed run yet. The cleanest plays come from using walls to stay calm when the shaft narrows.</p>
              )}
              <button className="primary-button" type="button" onClick={restartRun}>
                Restart Run
              </button>
            </div>
          </aside>
        </section>
      </main>
    </div>
  );
};

export default ElevatorShaftEscape;
