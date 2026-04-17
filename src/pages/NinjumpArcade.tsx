import React, { useEffect, useMemo, useRef, useState } from "react";
import NavBar from "../components/NavBar";
import { recordArcadeResult } from "../lib/progression";
import {
  NINJUMP_HEIGHT,
  NINJUMP_WIDTH,
  createInitialNinjumpState,
  getNinjumpHud,
  renderNinjumpScene,
  stepNinjumpState,
  type HudSnapshot,
  type NinjumpSprites,
  type NinjumpState
} from "../game/ninjump/run";

type PagePhase = "loading" | "title" | "playing" | "gameOver";

type RunSummary = {
  score: number;
  height: number;
  goldEarned: number;
  reason: string;
  bestCombo: number;
};

const DEFAULT_HUD: HudSnapshot = {
  score: 0,
  height: 0,
  combo: 0,
  bestCombo: 0,
  shielded: false,
  streakType: null,
  streakCount: 0,
  bonusTimerMs: 0,
  bonusLabel: "",
  tierLabel: "Bamboo Rise"
};

const LOCAL_BEST_KEY = "focusland-ninjump-best";

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

function loadSeries(basePath: string, prefix: string) {
  const promises = Array.from({ length: 10 }, (_, index) => {
    const frame = `${index}`.padStart(3, "0");
    return new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Failed to load ${prefix} ${frame}`));
      image.src = `${basePath}${prefix}__${frame}.png`;
    });
  });

  return Promise.all(promises);
}

async function loadSprites(baseUrl: string): Promise<NinjumpSprites> {
  const path = `${baseUrl}assets/ninjump/ninja/`;
  const [idle, run, jump, slide, dead] = await Promise.all([
    loadSeries(path, "Idle"),
    loadSeries(path, "Run"),
    loadSeries(path, "Jump"),
    loadSeries(path, "Slide"),
    loadSeries(path, "Dead")
  ]);

  return { idle, run, jump, slide, dead };
}

const NinjumpArcade: React.FC = () => {
  const assetBase = import.meta.env.BASE_URL;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const spritesRef = useRef<NinjumpSprites | null>(null);
  const bestScoreRef = useRef(loadLocalBest());
  const jumpAudioRef = useRef<HTMLAudioElement | null>(null);
  const slashAudioRef = useRef<HTMLAudioElement | null>(null);
  const bonusAudioRef = useRef<HTMLAudioElement | null>(null);
  const shieldAudioRef = useRef<HTMLAudioElement | null>(null);
  const loseAudioRef = useRef<HTMLAudioElement | null>(null);
  const [phase, setPhase] = useState<PagePhase>("loading");
  const [hud, setHud] = useState<HudSnapshot>(DEFAULT_HUD);
  const [status, setStatus] = useState("Loading ninja frames.");
  const [runNonce, setRunNonce] = useState(0);
  const [bestScore, setBestScore] = useState(() => loadLocalBest());
  const [runSummary, setRunSummary] = useState<RunSummary | null>(null);

  const titleLabel = useMemo(() => {
    if (hud.bonusTimerMs > 0 && hud.bonusLabel) {
      return hud.bonusLabel;
    }
    if (hud.streakType && hud.streakCount > 0) {
      return `${hud.streakType} x${hud.streakCount}`;
    }
    return hud.tierLabel;
  }, [hud.bonusLabel, hud.bonusTimerMs, hud.streakCount, hud.streakType, hud.tierLabel]);

  useEffect(() => {
    let cancelled = false;

    void loadSprites(assetBase)
      .then((sprites) => {
        if (cancelled) {
          return;
        }
        spritesRef.current = sprites;
        setStatus("Tap or press space to begin the wall climb.");
        setPhase("title");
      })
      .catch(() => {
        if (!cancelled) {
          setStatus("The ninja art failed to load.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [assetBase]);

  useEffect(() => {
    bestScoreRef.current = bestScore;
  }, [bestScore]);

  useEffect(() => {
    const makeAudio = (path: string, volume: number) => {
      const audio = new Audio(path);
      audio.volume = volume;
      return audio;
    };

    jumpAudioRef.current = makeAudio(`${assetBase}assets/kenney/sfx/impactPunch_medium_000.ogg`, 0.18);
    slashAudioRef.current = makeAudio(`${assetBase}assets/kenney/sfx/impactPunch_heavy_001.ogg`, 0.22);
    bonusAudioRef.current = makeAudio(`${assetBase}assets/kenney/sfx/impactBell_heavy_003.ogg`, 0.28);
    shieldAudioRef.current = makeAudio(`${assetBase}assets/kenney/sfx/impactMining_002.ogg`, 0.22);
    loseAudioRef.current = makeAudio(`${assetBase}assets/kenney/sfx/impactPlate_heavy_001.ogg`, 0.24);

    return () => {
      [jumpAudioRef, slashAudioRef, bonusAudioRef, shieldAudioRef, loseAudioRef].forEach((ref) => {
        if (ref.current) {
          ref.current.pause();
          ref.current.src = "";
        }
      });
    };
  }, [assetBase]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const sprites = spritesRef.current;
    if (!canvas || !sprites || phase === "loading") {
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setStatus("Canvas rendering is unavailable in this browser.");
      return;
    }

    canvas.width = NINJUMP_WIDTH;
    canvas.height = NINJUMP_HEIGHT;

    const state: NinjumpState = createInitialNinjumpState(Date.now() + runNonce * 97);
    let raf = 0;
    let last = performance.now();
    let jumpQueued = false;
    let finished = false;
    let prevSlashCount = state.slashEffects.length;
    let prevShielded = state.player.shielded;
    let prevBonusTimer = state.bonusTimerMs;
    let prevAlive = state.player.alive;

    const updateHud = () => {
      const snapshot = getNinjumpHud(state);
      setHud(snapshot);
      setStatus(state.statusText);
    };

    const finishRun = () => {
      if (finished) {
        return;
      }
      finished = true;
      const nextBest = Math.max(bestScoreRef.current, state.score);
      saveLocalBest(nextBest);
      setBestScore(nextBest);

      const goldEarned = Math.max(
        2,
        Math.min(24, Math.floor(state.score / 180) + Math.floor(state.bestHeight / 420) + Math.floor(state.bestCombo / 4))
      );

      setRunSummary({
        score: state.score,
        height: Math.floor(state.bestHeight / 10),
        goldEarned,
        reason: state.gameOverReason || "Run over.",
        bestCombo: state.bestCombo
      });

      void recordArcadeResult({
        scoreGameName: "ninjump_arcade",
        score: state.score,
        goldEarned
      }).catch(() => undefined);

      setPhase("gameOver");
    };

    const queueJump = () => {
      if (phase === "title") {
        setPhase("playing");
      }
      if (!finished) {
        jumpQueued = true;
        if (phase !== "loading") {
          const jumpAudio = jumpAudioRef.current;
          if (jumpAudio) {
            jumpAudio.currentTime = 0;
            void jumpAudio.play().catch(() => undefined);
          }
        }
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Space" || event.code === "ArrowUp" || event.code === "KeyW") {
        event.preventDefault();
        queueJump();
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      event.preventDefault();
      queueJump();
    };

    const tick = (time: number) => {
      const deltaMs = Math.min(33, time - last);
      last = time;

      if (phase === "playing") {
        stepNinjumpState(state, { jumpQueued }, deltaMs);
      }

      if (phase === "playing" && state.slashEffects.length > prevSlashCount) {
        const slashAudio = slashAudioRef.current;
        if (slashAudio) {
          slashAudio.currentTime = 0;
          void slashAudio.play().catch(() => undefined);
        }
      }

      if (phase === "playing" && prevShielded && !state.player.shielded) {
        const shieldAudio = shieldAudioRef.current;
        if (shieldAudio) {
          shieldAudio.currentTime = 0;
          void shieldAudio.play().catch(() => undefined);
        }
      }

      if (phase === "playing" && prevBonusTimer <= 0 && state.bonusTimerMs > 0) {
        const bonusAudio = bonusAudioRef.current;
        if (bonusAudio) {
          bonusAudio.currentTime = 0;
          void bonusAudio.play().catch(() => undefined);
        }
      }

      if (phase === "playing" && prevAlive && !state.player.alive) {
        const loseAudio = loseAudioRef.current;
        if (loseAudio) {
          loseAudio.currentTime = 0;
          void loseAudio.play().catch(() => undefined);
        }
      }

      jumpQueued = false;
      renderNinjumpScene(ctx, state, sprites);
      updateHud();
      prevSlashCount = state.slashEffects.length;
      prevShielded = state.player.shielded;
      prevBonusTimer = state.bonusTimerMs;
      prevAlive = state.player.alive;

      if (state.phase === "gameOver" && phase === "playing") {
        finishRun();
        return;
      }

      raf = window.requestAnimationFrame(tick);
    };

    renderNinjumpScene(ctx, state, sprites);
    updateHud();
    window.addEventListener("keydown", onKeyDown);
    canvas.addEventListener("pointerdown", onPointerDown);
    raf = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKeyDown);
      canvas.removeEventListener("pointerdown", onPointerDown);
    };
  }, [phase, runNonce]);

  const startRun = () => {
    setRunSummary(null);
    setHud(DEFAULT_HUD);
    setStatus("Run live. Read the wall and keep the taps clean.");
    setPhase("playing");
    setRunNonce((value) => value + 1);
  };

  const overlayCopy =
    phase === "loading"
      ? {
          kicker: "Loading",
          heading: "Preparing the climb",
          body: "Pulling in the ninja frames and setting the tower."
        }
      : phase === "gameOver"
        ? {
            kicker: "Run Over",
            heading: `Score ${runSummary?.score ?? 0}`,
            body: runSummary
              ? `${runSummary.reason} Height ${runSummary.height}m. Best combo ${runSummary.bestCombo}.`
              : "Run over."
          }
        : {
            kicker: "Arcade Climber",
            heading: "NinJump",
            body: "One button, two walls, fast reads. Slash enemies on the way across and survive the tower long enough to trigger streak bonuses."
          };

  return (
    <div className="page">
      <NavBar />
      <main className="content card ninjump-shell">
        <section className="ninjump-copy">
          <span className="ninjump-kicker">Arcade Vertical Runner</span>
          <h1>NinJump</h1>
          <p>
            A fast wall-to-wall climber built around clean taps, readable chaos, slash chains, shields, and sudden bonus bursts.
            The early climb teaches the rhythm. The upper tower gets mean fast.
          </p>
        </section>

        <section className="ninjump-layout">
          <div className="ninjump-stage">
            <div className="ninjump-hud ninjump-hud--top">
              <span>Score {hud.score}</span>
              <span>Height {hud.height}m</span>
              <span>Combo {hud.combo}</span>
              <span>{titleLabel}</span>
            </div>

            <div className="ninjump-frame">
              <canvas ref={canvasRef} className="ninjump-canvas" width={NINJUMP_WIDTH} height={NINJUMP_HEIGHT} />

              {phase === "playing" && (hud.bonusTimerMs > 0 || hud.streakCount >= 2) ? (
                <div className={`ninjump-combo-banner ${hud.bonusTimerMs > 0 ? "is-live" : ""}`}>
                  <strong>{hud.bonusTimerMs > 0 ? hud.bonusLabel : `${titleLabel} streak`}</strong>
                  <span>
                    {hud.bonusTimerMs > 0
                      ? "Kill-through launch active until you land"
                      : `${hud.streakCount}/3 of the same type`}
                  </span>
                </div>
              ) : null}

              {phase !== "playing" ? (
                <div className="ninjump-overlay">
                  <div className="ninjump-overlay-card">
                    <span className="ninjump-overlay-kicker">{overlayCopy.kicker}</span>
                    <h2>{overlayCopy.heading}</h2>
                    <p>{overlayCopy.body}</p>
                    <button
                      className="primary-button"
                      type="button"
                      onClick={startRun}
                      disabled={phase === "loading"}
                    >
                      {phase === "gameOver" ? "Run It Back" : "Start Run"}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="ninjump-hud ninjump-hud--bottom">
              <span>Tap / click / `Space` to jump</span>
              <span>{hud.shielded ? "Shield up" : "No shield"}</span>
              <span>Best on this device {bestScore}</span>
            </div>
          </div>

          <aside className="ninjump-sidepanel">
            <div className="ninjump-panel">
              <span className="ninjump-panel-title">Core Loop</span>
              <p>The ninja runs upward automatically. Every tap jumps to the opposite wall. Slash enemies only when you catch them during the cross.</p>
            </div>
            <div className="ninjump-panel">
              <span className="ninjump-panel-title">Bonus Logic</span>
              <p>
                Defeat three of the same enemy type in a row to trigger a bonus burst. The streak tag in the HUD shows what you are building toward.
              </p>
            </div>
            <div className="ninjump-panel">
              <span className="ninjump-panel-title">Run Status</span>
              <p>{status}</p>
              {runSummary ? (
                <p>
                  Last run: {runSummary.score} score, {runSummary.height}m, reward {runSummary.goldEarned} gold.
                </p>
              ) : (
                <p>No finished run yet. Start easy, then the tower turns ugly.</p>
              )}
              <button className="primary-button" type="button" onClick={startRun} disabled={phase === "loading"}>
                {phase === "playing" ? "Restart Run" : "Start Run"}
              </button>
            </div>
          </aside>
        </section>
      </main>
    </div>
  );
};

export default NinjumpArcade;
