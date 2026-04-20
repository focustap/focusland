import React, { useEffect, useMemo, useRef, useState } from "react";
import NavBar from "../components/NavBar";
import { recordArcadeResult } from "../lib/progression";
import {
  DEFAULT_HUD,
  type RooftopHudSnapshot,
  type RooftopPhase,
  type RooftopRunSummary,
  createRooftopRunnerGame
} from "../game/rooftop-runner/createRooftopRunnerGame";

const LOCAL_BEST_KEY = "focusland-rooftop-runner-best-v5";

function loadLocalBest() {
  if (typeof window === "undefined") return 0;
  const raw = window.localStorage.getItem(LOCAL_BEST_KEY);
  return raw ? Number(raw) || 0 : 0;
}

function saveLocalBest(score: number) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(LOCAL_BEST_KEY, String(score));
  }
}

const RooftopRunner: React.FC = () => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<ReturnType<typeof createRooftopRunnerGame> | null>(null);
  const bestScoreRef = useRef(loadLocalBest());

  const [phase, setPhase] = useState<RooftopPhase>("title");
  const [hud, setHud] = useState<RooftopHudSnapshot>(DEFAULT_HUD);
  const [bestScore, setBestScore] = useState(() => loadLocalBest());
  const [status, setStatus] = useState(
    "A new rooftop chase built from scratch around longer rooftops, rooftop encounters, and cleaner side-view parkour."
  );
  const [lastRun, setLastRun] = useState<RooftopRunSummary | null>(null);

  useEffect(() => {
    bestScoreRef.current = bestScore;
  }, [bestScore]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const controller = createRooftopRunnerGame(mount, {
      onHudChange(nextHud, nextStatus) {
        setHud(nextHud);
        setStatus(nextStatus);
      },
      onPhaseChange(nextPhase) {
        setPhase(nextPhase);
      },
      onRunComplete(summary) {
        const nextBest = Math.max(bestScoreRef.current, summary.score);
        setBestScore(nextBest);
        saveLocalBest(nextBest);
        setLastRun(summary);
        setStatus(summary.reason);
        void recordArcadeResult({
          scoreGameName: "rooftop_runner",
          score: summary.score,
          goldEarned: summary.goldEarned
        }).catch(() => undefined);
      }
    });

    controllerRef.current = controller;
    return () => {
      controller.destroy();
      controllerRef.current = null;
    };
  }, []);

  const phaseHeadline = useMemo(() => {
    if (phase === "title") return "Side-View Rooftop Parkour";
    if (phase === "paused") return "Hold Your Line";
    if (phase === "gameOver") return `Run Score ${lastRun?.score ?? hud.score}`;
    return "Flow State";
  }, [hud.score, lastRun?.score, phase]);

  const phaseSummary = useMemo(() => {
    if (phase === "title") {
      return "Traverse long city rooftops, read rooftop clutter, and only commit to the bigger building jumps when the line opens up.";
    }
    if (phase === "paused") {
      return "Reset your eyes, then dive back into the roof sequence.";
    }
    if (phase === "gameOver") {
      return `${lastRun?.reason ?? "Run over."} Best combo ${lastRun?.bestCombo ?? hud.bestCombo}.`;
    }
    return "Keep your movement low, fast, and deliberate.";
  }, [hud.bestCombo, lastRun?.bestCombo, lastRun?.reason, phase]);

  const primaryAction = () => {
    if (!controllerRef.current) return;
    if (phase === "paused") {
      controllerRef.current.resume();
      return;
    }
    controllerRef.current.start();
  };

  const secondaryAction = () => {
    if (!controllerRef.current) return;
    if (phase === "playing") {
      controllerRef.current.pause();
      return;
    }
    controllerRef.current.restart();
  };

  return (
    <div className="page">
      <NavBar />
      <main className="content card rrx-shell">
        <section className="rrx-hero">
          <div className="rrx-hero-copy">
            <span className="rrx-kicker">Mirror&apos;s Edge-Inspired Rooftop Runner</span>
            <h1>Rooftop Runner</h1>
            <p>
              Rebuilt as a side-view rooftop chase. Cross actual rooftop spaces, read guards and roof clutter, and keep
              momentum through cleaner parkour decisions instead of constant tiny hops.
            </p>
          </div>

          <div className="rrx-hero-stats">
            <span>Best {bestScore}</span>
            <span>Current combo {hud.combo}</span>
            <span>{hud.speedText}</span>
          </div>
        </section>

        <section className="rrx-stage-wrap">
          <div className="rrx-stage">
            <div ref={mountRef} className="rrx-stage-mount" />

            <div className="rrx-hud rrx-hud--top">
              <span className="rrx-brand">Rooftop Runner</span>
              <span>{hud.districtName}</span>
              <span>{hud.heatLabel}</span>
              <span>Score {hud.score}</span>
              <span>{hud.distance}m</span>
              <span>Guard {hud.guard}</span>
            </div>

            <div className="rrx-hud rrx-hud--bottom">
              <span>Jump `W` / `Up` / `Space`</span>
              <span>Slide `S` / `Down`</span>
              <span>Pause `Esc`</span>
            </div>

            {phase !== "playing" ? (
              <div className="rrx-overlay">
                <div className="rrx-overlay-panel">
                  <p className="rrx-overlay-kicker">{phase === "title" ? "Fresh Build" : phase === "paused" ? "Pause" : "Run Complete"}</p>
                  <h2>{phaseHeadline}</h2>
                  <p>{phaseSummary}</p>
                  <div className="rrx-overlay-actions">
                    <button className="primary-button" type="button" onClick={primaryAction}>
                      {phase === "title" ? "Start Run" : phase === "paused" ? "Resume Run" : "Run Again"}
                    </button>
                    <button className="secondary-button" type="button" onClick={() => controllerRef.current?.restart()}>
                      Restart Fresh
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="rrx-deck">
            <section className="rrx-panel">
              <span className="rrx-panel-title">District Flow</span>
              <p>{hud.districtDescription}</p>
              <div className="rrx-district-row">
                {hud.districtRotation.map((district) => (
                  <span
                    key={district.name}
                    className={`rrx-chip ${district.active ? "is-active" : ""}`}
                    style={{ ["--rrx-accent" as string]: district.accent }}
                  >
                    {district.name}
                  </span>
                ))}
              </div>
            </section>

            <section className="rrx-panel">
              <span className="rrx-panel-title">Run Readout</span>
              <p>{status}</p>
              <div className="rrx-metrics">
                <span>Coins {hud.coins}</span>
                <span>Style {hud.styleScore}</span>
                <span>Best combo {hud.bestCombo}</span>
                <span>Best local {bestScore}</span>
              </div>
              {lastRun ? (
                <p>
                  Last run: {lastRun.score} score, {lastRun.distance}m, {lastRun.coins} coins, reward {lastRun.goldEarned}.
                </p>
              ) : null}
            </section>

            <section className="rrx-panel rrx-panel--actions">
              <span className="rrx-panel-title">Controls</span>
              <p>Play low and smooth. Use jump for clean clears, slide under guards and frames, and keep big gaps as punctuation instead of the whole game.</p>
              <div className="rrx-actions">
                <button className="primary-button" type="button" onClick={() => controllerRef.current?.start()}>
                  {phase === "playing" ? "Restart Run" : "Start Run"}
                </button>
                <button className="secondary-button" type="button" onClick={secondaryAction}>
                  {phase === "playing" ? "Pause" : "Reset"}
                </button>
              </div>
            </section>
          </div>
        </section>
      </main>
    </div>
  );
};

export default RooftopRunner;
