import React, { useEffect, useRef, useState } from "react";
import NavBar from "../components/NavBar";
import { recordArcadeResult } from "../lib/progression";
import {
  ELEVATOR_GAME_HEIGHT,
  ELEVATOR_GAME_WIDTH,
  FLOOR_Y,
  SHAFT_LEFT,
  SHAFT_RIGHT,
  createInitialRun,
  getHudSnapshot,
  getSectionForHeight,
  getSectionPalette,
  updateRun
} from "../game/elevator-shaft/run";

type HudState = {
  height: number;
  score: number;
  collapseGap: number;
  sectionLabel: string;
  grappleReady: boolean;
};

type RunSummary = {
  score: number;
  height: number;
  goldEarned: number;
  reason: string;
};

const DEFAULT_HUD: HudState = {
  height: 0,
  score: 0,
  collapseGap: 0,
  sectionLabel: "Service Shaft",
  grappleReady: true
};

function drawScene(
  ctx: CanvasRenderingContext2D,
  state: ReturnType<typeof createInitialRun>,
  cameraY: number,
  pointerX: number,
  pointerY: number
) {
  const section = getSectionForHeight(state.topHeight);
  const palette = getSectionPalette(section);

  ctx.clearRect(0, 0, ELEVATOR_GAME_WIDTH, ELEVATOR_GAME_HEIGHT);

  const bgGradient = ctx.createLinearGradient(0, 0, 0, ELEVATOR_GAME_HEIGHT);
  bgGradient.addColorStop(0, `#${palette.bg.toString(16).padStart(6, "0")}`);
  bgGradient.addColorStop(1, "#05070d");
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, ELEVATOR_GAME_WIDTH, ELEVATOR_GAME_HEIGHT);

  ctx.fillStyle = "#04060c";
  ctx.fillRect(0, 0, SHAFT_LEFT, ELEVATOR_GAME_HEIGHT);
  ctx.fillRect(SHAFT_RIGHT, 0, ELEVATOR_GAME_WIDTH - SHAFT_RIGHT, ELEVATOR_GAME_HEIGHT);

  const shaftGradient = ctx.createLinearGradient(SHAFT_LEFT, 0, SHAFT_RIGHT, 0);
  shaftGradient.addColorStop(0, "rgba(8, 12, 22, 0.86)");
  shaftGradient.addColorStop(0.5, "rgba(90, 140, 200, 0.08)");
  shaftGradient.addColorStop(1, "rgba(8, 12, 22, 0.86)");
  ctx.fillStyle = shaftGradient;
  ctx.fillRect(SHAFT_LEFT, 0, SHAFT_RIGHT - SHAFT_LEFT, ELEVATOR_GAME_HEIGHT);

  ctx.strokeStyle = "rgba(148, 163, 184, 0.22)";
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(SHAFT_LEFT, 0);
  ctx.lineTo(SHAFT_LEFT, ELEVATOR_GAME_HEIGHT);
  ctx.moveTo(SHAFT_RIGHT, 0);
  ctx.lineTo(SHAFT_RIGHT, ELEVATOR_GAME_HEIGHT);
  ctx.stroke();

  for (let i = -2; i < 16; i += 1) {
    const markerY = ((i * 72) - (cameraY * 0.2)) % (ELEVATOR_GAME_HEIGHT + 80);
    const y = markerY < -40 ? markerY + ELEVATOR_GAME_HEIGHT + 80 : markerY;
    ctx.fillStyle = "rgba(148, 163, 184, 0.12)";
    ctx.fillRect(SHAFT_LEFT + 14, y, 6, 30);
    ctx.fillRect(SHAFT_RIGHT - 20, y + 20, 6, 30);
  }

  state.platforms.forEach((platform) => {
    if (platform.broken) {
      return;
    }
    const screenY = platform.y - cameraY;
    if (screenY < -40 || screenY > ELEVATOR_GAME_HEIGHT + 40) {
      return;
    }
    ctx.fillStyle =
      platform.kind === "hazard"
        ? "#ef4444"
        : platform.kind === "wind"
          ? "rgba(34, 211, 238, 0.28)"
        : platform.kind === "breakable"
        ? "#f97316"
        : platform.kind === "moving"
          ? "#38bdf8"
          : "#e2e8f0";
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(platform.x - platform.width / 2, screenY - platform.height / 2, platform.width, platform.height, 8);
    ctx.fill();
    ctx.stroke();
    if (platform.kind === "hazard") {
      ctx.strokeStyle = "rgba(254, 242, 242, 0.75)";
      ctx.lineWidth = 2;
      for (let x = platform.x - platform.width / 2 + 8; x < platform.x + platform.width / 2 - 8; x += 16) {
        ctx.beginPath();
        ctx.moveTo(x - 4, screenY + 4);
        ctx.lineTo(x, screenY - 4);
        ctx.lineTo(x + 4, screenY + 4);
        ctx.stroke();
      }
    } else if (platform.kind === "wind") {
      ctx.strokeStyle = "rgba(103, 232, 249, 0.72)";
      ctx.lineWidth = 2;
      for (let row = -platform.height / 2 + 12; row < platform.height / 2 - 6; row += 18) {
        ctx.beginPath();
        ctx.moveTo(platform.x - 12, screenY + row);
        ctx.quadraticCurveTo(platform.x, screenY + row - 6, platform.x + 12, screenY + row);
        ctx.stroke();
      }
    }
  });

  state.anchors.forEach((anchor) => {
    const screenY = anchor.y - cameraY;
    if (screenY < -20 || screenY > ELEVATOR_GAME_HEIGHT + 20) {
      return;
    }
    const isTargeted = anchor.id === state.player.aimAnchorId;
    if (isTargeted) {
      ctx.fillStyle = "rgba(56, 189, 248, 0.22)";
      ctx.beginPath();
      ctx.arc(anchor.x, screenY, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(125, 211, 252, 0.75)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(anchor.x, screenY, 15, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = "#f8fafc";
    ctx.strokeStyle = isTargeted ? "#7dd3fc" : "#38bdf8";
    ctx.lineWidth = isTargeted ? 4 : 3;
    ctx.beginPath();
    ctx.arc(anchor.x, screenY, isTargeted ? 10 : 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });

  if (state.player.grappleLineMs > 0) {
    const anchor = state.anchors.find((item) => item.id === state.player.grappleAnchorId);
    const targetX = anchor?.x ?? pointerX;
    const targetY = (anchor?.y ?? (pointerY + cameraY)) - cameraY;
    ctx.strokeStyle = "rgba(248, 250, 252, 0.9)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(state.player.x, state.player.y - cameraY - 4);
    ctx.lineTo(targetX, targetY);
    ctx.stroke();
  }

  const collapseWorldY = FLOOR_Y - state.collapseHeight;
  const collapseScreenY = collapseWorldY - cameraY;
  const collapseGradient = ctx.createLinearGradient(0, collapseScreenY - 110, 0, collapseScreenY + 180);
  collapseGradient.addColorStop(0, "rgba(251, 146, 60, 0)");
  collapseGradient.addColorStop(0.35, "rgba(249, 115, 22, 0.34)");
  collapseGradient.addColorStop(1, "rgba(124, 45, 18, 0.88)");
  ctx.fillStyle = collapseGradient;
  ctx.fillRect(SHAFT_LEFT, collapseScreenY - 120, SHAFT_RIGHT - SHAFT_LEFT, ELEVATOR_GAME_HEIGHT - collapseScreenY + 160);

  for (let i = 0; i < 20; i += 1) {
    const sparkX = SHAFT_LEFT + ((i * 37 + state.elapsedMs * 0.02) % (SHAFT_RIGHT - SHAFT_LEFT));
    const sparkY = collapseScreenY + ((i * 19) % 110);
    ctx.fillStyle = i % 3 === 0 ? "rgba(251, 191, 36, 0.8)" : "rgba(248, 250, 252, 0.28)";
    ctx.fillRect(sparkX, sparkY, 3, 3);
  }

  const playerScreenY = state.player.y - cameraY;
  ctx.save();
  ctx.translate(state.player.x, playerScreenY);
  ctx.rotate(Math.max(-0.16, Math.min(0.16, state.player.vx * 0.0007)));
  ctx.fillStyle = "#e2e8f0";
  ctx.strokeStyle = "#38bdf8";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(-state.player.width / 2, -state.player.height / 2, state.player.width, state.player.height, 10);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(-7, -8, 14, 4);
  ctx.restore();

  ctx.fillStyle = "rgba(248, 250, 252, 0.1)";
  ctx.font = '14px "PublicPixel", monospace';
  ctx.fillText(state.statusText.toUpperCase().slice(0, 40), SHAFT_LEFT + 14, 28);
}

const ElevatorShaftEscape: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hud, setHud] = useState<HudState>(DEFAULT_HUD);
  const [status, setStatus] = useState("Climb before the collapse turns the shaft into a furnace.");
  const [runSummary, setRunSummary] = useState<RunSummary | null>(null);
  const [runNonce, setRunNonce] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setStatus("Canvas rendering is unavailable in this browser.");
      return;
    }

    const state = createInitialRun(Date.now() + runNonce);
    let raf = 0;
    let last = performance.now();
    let finished = false;
    let pointerX = ELEVATOR_GAME_WIDTH / 2;
    let pointerY = ELEVATOR_GAME_HEIGHT * 0.35;
    let move = 0;
    let jumpHeld = false;
    let jumpPressed = false;
    let grapplePressed = false;
    let cameraY = state.player.y - ELEVATOR_GAME_HEIGHT * 0.62;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "a" || event.key === "A" || event.key === "ArrowLeft") {
        move = -1;
      }
      if (event.key === "d" || event.key === "D" || event.key === "ArrowRight") {
        move = 1;
      }
      if (event.key === "w" || event.key === "W" || event.key === "ArrowUp" || event.key === " ") {
        if (!jumpHeld) {
          jumpPressed = true;
        }
        jumpHeld = true;
      }
      if (event.key === "e" || event.key === "E") {
        grapplePressed = true;
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (
        (event.key === "a" || event.key === "A" || event.key === "ArrowLeft") &&
        move < 0
      ) {
        move = 0;
      }
      if (
        (event.key === "d" || event.key === "D" || event.key === "ArrowRight") &&
        move > 0
      ) {
        move = 0;
      }
      if (event.key === "w" || event.key === "W" || event.key === "ArrowUp" || event.key === " ") {
        jumpHeld = false;
      }
    };

    const updatePointer = (event: PointerEvent) => {
      const bounds = canvas.getBoundingClientRect();
      const scaleX = ELEVATOR_GAME_WIDTH / bounds.width;
      const scaleY = ELEVATOR_GAME_HEIGHT / bounds.height;
      pointerX = (event.clientX - bounds.left) * scaleX;
      pointerY = (event.clientY - bounds.top) * scaleY;
    };

    const onPointerMove = (event: PointerEvent) => {
      updatePointer(event);
    };

    const onPointerDown = (event: PointerEvent) => {
      updatePointer(event);
      grapplePressed = true;
    };

    const finishRun = () => {
      if (finished) {
        return;
      }
      finished = true;
      const goldEarned = Math.max(
        2,
        Math.min(24, Math.floor(state.topHeight / 240) + 2)
      );
      const summary: RunSummary = {
        score: state.score,
        height: Math.floor(state.topHeight / 10),
        goldEarned,
        reason: state.reason
      };
      setRunSummary(summary);
      setStatus(summary.reason);
      void recordArcadeResult({
        scoreGameName: "elevator_shaft_escape",
        score: summary.score,
        goldEarned: summary.goldEarned
      }).catch(() => {
        setStatus(`${summary.reason} Local run complete, but score sync failed.`);
      });
    };

    const tick = (time: number) => {
      const deltaMs = Math.min(33, time - last);
      last = time;

      updateRun(
        state,
        {
          move,
          jumpPressed,
          jumpHeld,
          grapplePressed,
          pointerX,
          pointerY,
          cameraY
        },
        deltaMs
      );

      cameraY += ((state.player.y - ELEVATOR_GAME_HEIGHT * 0.62) - cameraY) * 0.11;
      drawScene(ctx, state, cameraY, pointerX, pointerY);
      setHud(getHudSnapshot(state));
      setStatus(state.statusText);

      jumpPressed = false;
      grapplePressed = false;

      if (state.gameOver) {
        finishRun();
      } else {
        raf = window.requestAnimationFrame(tick);
      }
    };

    drawScene(ctx, state, cameraY, pointerX, pointerY);
    setHud(getHudSnapshot(state));
    setStatus(state.statusText);

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerdown", onPointerDown);
    raf = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerdown", onPointerDown);
    };
  }, [runNonce]);

  const restartRun = () => {
    setRunSummary(null);
    setHud(DEFAULT_HUD);
    setStatus("Fresh run. The building is already moving under your feet.");
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
              Climb through a collapsing high-rise using sharp jumps, wall kicks, and quick grapples. Stay ahead of the collapse,
              adapt to each new shaft section, and push for the highest climb before the building wins.
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
              <span>{hud.grappleReady ? "Grapple Ready" : "Grapple Cooling"}</span>
              <span>Collapse Gap {hud.collapseGap}m</span>
            </div>
            <div className="elevator-stage__frame">
              <canvas
                ref={canvasRef}
                className="elevator-game-canvas"
                width={ELEVATOR_GAME_WIDTH}
                height={ELEVATOR_GAME_HEIGHT}
              />
              {runSummary ? (
                <div className="elevator-overlay">
                  <div className="elevator-overlay__card">
                    <span className="elevator-kicker">Run Over</span>
                    <h2>{runSummary.height}m climbed</h2>
                    <p>{runSummary.reason}</p>
                    <p>
                      Score {runSummary.score} | Reward {runSummary.goldEarned} gold
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
              <span>Restart the run with the button</span>
            </div>
          </div>

          <aside className="elevator-sidepanel">
            <div className="elevator-panel">
              <span className="elevator-panel__title">Core Loop</span>
              <p>Keep climbing, stay calm under pressure, and use each landing to set up the next move. The collapse below sets the pace, so hesitation is usually what gets you caught.</p>
            </div>
            <div className="elevator-panel">
              <span className="elevator-panel__title">How To Survive</span>
              <p>White platforms are safe footing. Orange platforms break and return after a short delay. Blue platforms move, so time your landing. Red energy bars are lethal, and some sweep across the shaft. Cyan vent columns push your movement, so use them or fight them depending on the route. Grapple anchors glow when targeted, and the hook is best used to recover or bridge dangerous gaps.</p>
            </div>
            <div className="elevator-panel">
              <span className="elevator-panel__title">Run Status</span>
              <p>{status}</p>
              {runSummary ? (
                <p>
                  Last run: {runSummary.height}m, score {runSummary.score}.
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
