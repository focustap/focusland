import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import NavBar from "../components/NavBar";
import { recordArcadeResult } from "../lib/progression";
import { mountApexAsphaltGame } from "../game/apex-asphalt/createApexAsphaltGame";
import { APEX_TRACKS, getApexTrack } from "../game/apex-asphalt/tracks";
import type { RaceHudSnapshot, RaceResult } from "../game/apex-asphalt/types";

type PagePhase = "menu" | "racing" | "result";

const DEFAULT_HUD: RaceHudSnapshot = {
  speed: 0,
  lap: 1,
  totalLaps: 3,
  place: 4,
  totalRacers: 4,
  timeMs: 0,
  countdown: null,
  message: "Select a circuit and hit the grid.",
  trackName: APEX_TRACKS[0].name,
  trackTagline: APEX_TRACKS[0].tagline,
  boostHint: "Brake before the tight stuff, then fire out clean.",
  nextCheckpoint: 1,
  totalCheckpoints: APEX_TRACKS[0].checkpointFractions.length
};

const BEST_KEY_PREFIX = "focusland-apex-asphalt-best";

function formatRaceTime(timeMs: number) {
  const totalSeconds = Math.floor(timeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const hundredths = Math.floor((timeMs % 1000) / 10);
  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(hundredths).padStart(2, "0")}`;
}

function readBest(trackId: string) {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = window.localStorage.getItem(`${BEST_KEY_PREFIX}-${trackId}`);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as { bestTimeMs?: number; bestPlace?: number };
    return {
      bestTimeMs: typeof parsed.bestTimeMs === "number" ? parsed.bestTimeMs : null,
      bestPlace: typeof parsed.bestPlace === "number" ? parsed.bestPlace : null
    };
  } catch {
    return null;
  }
}

function writeBest(trackId: string, result: RaceResult) {
  if (typeof window === "undefined" || !result.finished) {
    return;
  }

  const current = readBest(trackId);
  const payload = {
    bestTimeMs:
      current?.bestTimeMs == null
        ? result.timeMs
        : Math.min(current.bestTimeMs, result.timeMs),
    bestPlace:
      current?.bestPlace == null
        ? result.place
        : Math.min(current.bestPlace, result.place)
  };

  window.localStorage.setItem(`${BEST_KEY_PREFIX}-${trackId}`, JSON.stringify(payload));
}

const ApexAsphalt: React.FC = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [phase, setPhase] = useState<PagePhase>("menu");
  const [selectedTrackId, setSelectedTrackId] = useState(APEX_TRACKS[0].id);
  const [sessionNonce, setSessionNonce] = useState(0);
  const [hud, setHud] = useState<RaceHudSnapshot>(DEFAULT_HUD);
  const [status, setStatus] = useState("Select a circuit and hit the grid.");
  const [result, setResult] = useState<RaceResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [bestSnapshot, setBestSnapshot] = useState(() => readBest(APEX_TRACKS[0].id));

  const selectedTrack = useMemo(() => getApexTrack(selectedTrackId), [selectedTrackId]);

  useEffect(() => {
    setBestSnapshot(readBest(selectedTrackId));
  }, [selectedTrackId]);

  useEffect(() => {
    if (phase !== "racing" || !containerRef.current) {
      return;
    }

    const destroy = mountApexAsphaltGame({
      parent: containerRef.current,
      trackId: selectedTrackId,
      onHudChange: (snapshot) => setHud(snapshot),
      onRaceEnd: (nextResult) => {
        setResult(nextResult);
        setPhase("result");
        setSaving(true);
        writeBest(selectedTrackId, nextResult);
        setBestSnapshot(readBest(selectedTrackId));
        void recordArcadeResult({
          scoreGameName: "apex_asphalt",
          score: nextResult.score,
          goldEarned: nextResult.goldEarned
        })
          .then(() => {
            setSaving(false);
            setStatus(
              `${nextResult.reason} Score saved at ${nextResult.score}. +${nextResult.goldEarned} gold.`
            );
          })
          .catch(() => {
            setSaving(false);
            setStatus(`${nextResult.reason} Local result saved, but score sync failed.`);
          });
      },
      onStatus: (message) => setStatus(message)
    });

    return () => {
      destroy();
    };
  }, [phase, selectedTrackId, sessionNonce]);

  const startRace = () => {
    setResult(null);
    setStatus(`Grid set for ${selectedTrack.name}.`);
    setHud({
      ...DEFAULT_HUD,
      trackName: selectedTrack.name,
      trackTagline: selectedTrack.tagline,
      totalLaps: selectedTrack.laps,
      totalCheckpoints: selectedTrack.checkpointFractions.length
    });
    setPhase("racing");
    setSessionNonce((value) => value + 1);
  };

  const returnToMenu = () => {
    setPhase("menu");
    setStatus("Select a circuit and hit the grid.");
  };

  return (
    <div className="page">
      <NavBar />
      <main className="content card apex-shell">
        <section className="apex-hero">
          <div className="apex-hero__copy">
            <span className="apex-kicker">Arcade Racer</span>
            <h1>Apex Asphalt</h1>
            <p>
              A full top-down sprint racer built for the arcade room: smooth throttle-and-rotation handling,
              checkpointed laps, AI rivals, two circuits with distinct corner shapes, readable feedback,
              and a proper finish flow from countdown to podium result.
            </p>
          </div>
          <div className="apex-summary-card">
            <span className="apex-summary-card__label">Current Circuit</span>
            <strong>{selectedTrack.name}</strong>
            <span className="apex-summary-card__meta">{selectedTrack.tagline}</span>
          </div>
        </section>

        <section className="apex-layout">
          <div className="apex-stage">
            <div className="apex-stage__hud apex-stage__hud--top">
              <span>{hud.trackName}</span>
              <span>Lap {hud.lap}/{hud.totalLaps}</span>
              <span>Place P{hud.place}/{hud.totalRacers}</span>
              <span>{formatRaceTime(hud.timeMs)}</span>
              <span>{hud.speed} KPH</span>
            </div>

            <div className="apex-stage__frame">
              <div ref={containerRef} className="apex-game-host" />

              {phase === "menu" ? (
                <div className="apex-overlay">
                  <div className="apex-overlay__card">
                    <span className="apex-kicker">Grid Select</span>
                    <h2>Choose your circuit</h2>
                    <p>{selectedTrack.description}</p>
                    <div className="apex-track-grid">
                      {APEX_TRACKS.map((track) => {
                        const best = readBest(track.id);
                        return (
                          <button
                            key={track.id}
                            type="button"
                            className={`apex-track-card ${track.id === selectedTrackId ? "is-selected" : ""}`}
                            onClick={() => setSelectedTrackId(track.id)}
                          >
                            <strong>{track.name}</strong>
                            <span>{track.tagline}</span>
                            <small>
                              {best?.bestTimeMs
                                ? `Best ${formatRaceTime(best.bestTimeMs)}`
                                : "No clean finish yet"}
                            </small>
                          </button>
                        );
                      })}
                    </div>
                    <div className="button-row">
                      <button className="primary-button" type="button" onClick={startRace}>
                        Start Race
                      </button>
                      <Link className="secondary-button" to="/arcade">
                        Back to Arcade
                      </Link>
                    </div>
                  </div>
                </div>
              ) : null}

              {phase === "result" && result ? (
                <div className="apex-overlay">
                  <div className="apex-overlay__card apex-overlay__card--result">
                    <span className="apex-kicker">{result.won ? "Victory" : "Race Complete"}</span>
                    <h2>{result.trackName}</h2>
                    <p>
                      Finished P{result.place}/{result.totalRacers} in {formatRaceTime(result.timeMs)}.
                      {result.bestLapMs ? ` Best lap ${formatRaceTime(result.bestLapMs)}.` : ""}
                    </p>
                    <p>
                      Score {result.score} | Reward {result.goldEarned} gold
                    </p>
                    <p>{saving ? "Saving result..." : status}</p>
                    <div className="button-row">
                      <button className="primary-button" type="button" onClick={startRace}>
                        Race Again
                      </button>
                      <button className="secondary-button" type="button" onClick={returnToMenu}>
                        Change Track
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="apex-stage__hud apex-stage__hud--bottom">
              <span>{hud.countdown ? `Start in ${hud.countdown}` : hud.message}</span>
              <span>Checkpoint {hud.nextCheckpoint}/{hud.totalCheckpoints}</span>
              <span>{hud.boostHint}</span>
            </div>
          </div>

          <aside className="apex-sidepanel">
            <div className="apex-panel">
              <span className="apex-panel__title">Controls</span>
              <p>
                `WASD` or arrow keys drive the car. Hold throttle through the wide stuff, brake before the tight corners,
                and treat the rumble strip like a helper, not the whole plan.
              </p>
            </div>

            <div className="apex-panel">
              <span className="apex-panel__title">Race Read</span>
              <p>{status}</p>
              <p>
                Best on this device:
                {" "}
                {bestSnapshot?.bestTimeMs
                  ? `${formatRaceTime(bestSnapshot.bestTimeMs)}`
                  : "no finished run yet"}
                {bestSnapshot?.bestPlace ? ` | best place P${bestSnapshot.bestPlace}` : ""}
              </p>
            </div>

            <div className="apex-panel">
              <span className="apex-panel__title">Circuit Notes</span>
              <p>{selectedTrack.description}</p>
              <p>
                {selectedTrack.name === "Neon Loop"
                  ? "The final sweeper is where clean exit speed wins the lap. Over-rotate in the switchback and the AI will get underneath you."
                  : "Harbor Hairpin asks for patience. Brake early, square the corner, and stop fighting the wheel on exit."}
              </p>
            </div>
          </aside>
        </section>
      </main>
    </div>
  );
};

export default ApexAsphalt;
