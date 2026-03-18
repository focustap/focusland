import React, { useEffect, useMemo, useRef, useState } from "react";
import NavBar from "../components/NavBar";
import { applyGoldDelta, recordArcadeResult } from "../lib/progression";

type Ball = {
  id: string;
  label: string;
  number: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  isStripe: boolean;
  isCue: boolean;
  isEight: boolean;
  pocketed: boolean;
};

type MouseState = {
  x: number;
  y: number;
  insideTable: boolean;
};

const TABLE_WIDTH = 920;
const TABLE_HEIGHT = 520;
const RAIL = 36;
const PLAY_X = RAIL;
const PLAY_Y = RAIL;
const PLAY_WIDTH = TABLE_WIDTH - RAIL * 2;
const PLAY_HEIGHT = TABLE_HEIGHT - RAIL * 2;
const BALL_RADIUS = 11;
const POCKET_RADIUS = 24;
const FRICTION = 0.992;
const MIN_SPEED = 0.03;
const MAX_POWER = 12;
const POWER_BAR_X = TABLE_WIDTH - 54;
const POWER_BAR_Y = 80;
const POWER_BAR_HEIGHT = 300;
const POWER_BAR_WIDTH = 18;
const POOL_REWARD_GOLD = 14;

const POCKETS = [
  { x: PLAY_X, y: PLAY_Y },
  { x: PLAY_X + PLAY_WIDTH / 2, y: PLAY_Y - 4 },
  { x: PLAY_X + PLAY_WIDTH, y: PLAY_Y },
  { x: PLAY_X, y: PLAY_Y + PLAY_HEIGHT },
  { x: PLAY_X + PLAY_WIDTH / 2, y: PLAY_Y + PLAY_HEIGHT + 4 },
  { x: PLAY_X + PLAY_WIDTH, y: PLAY_Y + PLAY_HEIGHT }
];

function createRack() {
  const cueX = PLAY_X + PLAY_WIDTH * 0.24;
  const cueY = PLAY_Y + PLAY_HEIGHT / 2;
  const rackX = PLAY_X + PLAY_WIDTH * 0.72;
  const rackY = PLAY_Y + PLAY_HEIGHT / 2;
  const spacing = BALL_RADIUS * 2.15;
  const rows = [
    [1],
    [9, 2],
    [10, 8, 3],
    [11, 4, 12, 5],
    [13, 6, 14, 7, 15]
  ];

  const colors: Record<number, string> = {
    1: "#facc15",
    2: "#2563eb",
    3: "#dc2626",
    4: "#7c3aed",
    5: "#f97316",
    6: "#15803d",
    7: "#7f1d1d",
    8: "#111827",
    9: "#facc15",
    10: "#2563eb",
    11: "#dc2626",
    12: "#7c3aed",
    13: "#f97316",
    14: "#15803d",
    15: "#7f1d1d"
  };

  const balls: Ball[] = [
    {
      id: "cue",
      label: "",
      number: 0,
      x: cueX,
      y: cueY,
      vx: 0,
      vy: 0,
      color: "#f8fafc",
      isStripe: false,
      isCue: true,
      isEight: false,
      pocketed: false
    }
  ];

  rows.forEach((row, rowIndex) => {
    row.forEach((number, rowBallIndex) => {
      balls.push({
        id: `ball-${number}`,
        label: String(number),
        number,
        x: rackX + rowIndex * spacing,
        y: rackY - (row.length - 1) * BALL_RADIUS + rowBallIndex * spacing,
        vx: 0,
        vy: 0,
        color: colors[number],
        isStripe: number >= 9,
        isCue: false,
        isEight: number === 8,
        pocketed: false
      });
    });
  });

  return balls;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function distance(ax: number, ay: number, bx: number, by: number) {
  return Math.hypot(ax - bx, ay - by);
}

const Pool: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const ballsRef = useRef<Ball[]>(createRack());
  const mouseRef = useRef<MouseState>({ x: PLAY_X + 120, y: PLAY_Y + PLAY_HEIGHT / 2, insideTable: false });
  const draggingPowerRef = useRef(false);
  const [balls, setBalls] = useState<Ball[]>(() => createRack());
  const [assignedGroup, setAssignedGroup] = useState<"solids" | "stripes" | null>(null);
  const [power, setPower] = useState(0.35);
  const [message, setMessage] = useState("Aim with the mouse. Drag the power bar down and release to shoot.");
  const [won, setWon] = useState(false);
  const [lost, setLost] = useState(false);
  const [awarded, setAwarded] = useState(false);

  useEffect(() => {
    ballsRef.current = balls;
  }, [balls]);

  const cueBall = useMemo(() => balls.find((ball) => ball.isCue) ?? null, [balls]);
  const allStopped = useMemo(
    () => balls.every((ball) => ball.pocketed || (Math.abs(ball.vx) < MIN_SPEED && Math.abs(ball.vy) < MIN_SPEED)),
    [balls]
  );

  useEffect(() => {
    if (!won || awarded) {
      return;
    }

    setAwarded(true);
    void (async () => {
      try {
        await applyGoldDelta(POOL_REWARD_GOLD);
        await recordArcadeResult({
          goldEarned: 0
        });
      } catch {
        // Ignore reward sync failures.
      }
    })();
  }, [awarded, won]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    const updatePhysics = () => {
      const nextBalls = ballsRef.current.map((ball) => ({ ...ball }));
      let cueScratch = false;
      let assigned = assignedGroup;
      let pocketedThisTurn: Ball[] = [];

      nextBalls.forEach((ball) => {
        if (ball.pocketed) {
          return;
        }

        ball.x += ball.vx;
        ball.y += ball.vy;
        ball.vx *= FRICTION;
        ball.vy *= FRICTION;

        if (Math.abs(ball.vx) < MIN_SPEED) ball.vx = 0;
        if (Math.abs(ball.vy) < MIN_SPEED) ball.vy = 0;

        if (ball.x - BALL_RADIUS <= PLAY_X) {
          ball.x = PLAY_X + BALL_RADIUS;
          ball.vx *= -1;
        }
        if (ball.x + BALL_RADIUS >= PLAY_X + PLAY_WIDTH) {
          ball.x = PLAY_X + PLAY_WIDTH - BALL_RADIUS;
          ball.vx *= -1;
        }
        if (ball.y - BALL_RADIUS <= PLAY_Y) {
          ball.y = PLAY_Y + BALL_RADIUS;
          ball.vy *= -1;
        }
        if (ball.y + BALL_RADIUS >= PLAY_Y + PLAY_HEIGHT) {
          ball.y = PLAY_Y + PLAY_HEIGHT - BALL_RADIUS;
          ball.vy *= -1;
        }
      });

      for (let i = 0; i < nextBalls.length; i += 1) {
        const a = nextBalls[i];
        if (a.pocketed) continue;
        for (let j = i + 1; j < nextBalls.length; j += 1) {
          const b = nextBalls[j];
          if (b.pocketed) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.hypot(dx, dy);
          const minDist = BALL_RADIUS * 2;
          if (!dist || dist >= minDist) continue;

          const nx = dx / dist;
          const ny = dy / dist;
          const overlap = minDist - dist;
          a.x -= nx * overlap * 0.5;
          a.y -= ny * overlap * 0.5;
          b.x += nx * overlap * 0.5;
          b.y += ny * overlap * 0.5;

          const tx = -ny;
          const ty = nx;
          const dpTanA = a.vx * tx + a.vy * ty;
          const dpTanB = b.vx * tx + b.vy * ty;
          const dpNormA = a.vx * nx + a.vy * ny;
          const dpNormB = b.vx * nx + b.vy * ny;

          a.vx = tx * dpTanA + nx * dpNormB;
          a.vy = ty * dpTanA + ny * dpNormB;
          b.vx = tx * dpTanB + nx * dpNormA;
          b.vy = ty * dpTanB + ny * dpNormA;
        }
      }

      nextBalls.forEach((ball) => {
        if (ball.pocketed) return;
        const inPocket = POCKETS.some((pocket) => distance(ball.x, ball.y, pocket.x, pocket.y) <= POCKET_RADIUS);
        if (!inPocket) return;

        ball.pocketed = true;
        ball.vx = 0;
        ball.vy = 0;
        pocketedThisTurn.push(ball);

        if (ball.isCue) {
          cueScratch = true;
        }
      });

      const moving = nextBalls.some((ball) => !ball.pocketed && (Math.abs(ball.vx) >= MIN_SPEED || Math.abs(ball.vy) >= MIN_SPEED));

      if (!moving && pocketedThisTurn.length > 0) {
        const firstObjectBall = pocketedThisTurn.find((ball) => !ball.isCue && !ball.isEight);
        if (!assigned && firstObjectBall) {
          assigned = firstObjectBall.isStripe ? "stripes" : "solids";
          setAssignedGroup(assigned);
          setMessage(`You are on ${assigned}.`);
        }

        const remainingGroupBalls = nextBalls.filter((ball) => {
          if (ball.pocketed || ball.isCue || ball.isEight) return false;
          if (!assigned) return true;
          return assigned === "stripes" ? ball.isStripe : !ball.isStripe;
        });

        const eightBallPocketed = pocketedThisTurn.some((ball) => ball.isEight);
        if (eightBallPocketed) {
          if (remainingGroupBalls.length === 0) {
            setWon(true);
            setMessage(`Eight ball down. You cleared the table and won ${POOL_REWARD_GOLD} gold.`);
          } else {
            setLost(true);
            setMessage("You sunk the eight ball early. Table lost.");
          }
        } else if (cueScratch) {
          const cue = nextBalls.find((ball) => ball.isCue);
          if (cue) {
            cue.pocketed = false;
            cue.x = PLAY_X + PLAY_WIDTH * 0.24;
            cue.y = PLAY_Y + PLAY_HEIGHT / 2;
          }
          setMessage("Scratch. Cue ball reset.");
        } else if (pocketedThisTurn.some((ball) => !ball.isCue)) {
          setMessage("Nice shot. Line up the next one.");
        }
      }

      setBalls(nextBalls);
    };

    const draw = () => {
      updatePhysics();
      const currentBalls = ballsRef.current;

      context.clearRect(0, 0, TABLE_WIDTH, TABLE_HEIGHT);
      context.fillStyle = "#4b2e19";
      context.fillRect(0, 0, TABLE_WIDTH, TABLE_HEIGHT);
      context.fillStyle = "#0f6b52";
      context.fillRect(PLAY_X, PLAY_Y, PLAY_WIDTH, PLAY_HEIGHT);
      context.strokeStyle = "rgba(255,255,255,0.12)";
      context.lineWidth = 2;
      context.strokeRect(PLAY_X + 2, PLAY_Y + 2, PLAY_WIDTH - 4, PLAY_HEIGHT - 4);

      POCKETS.forEach((pocket) => {
        context.fillStyle = "#020617";
        context.beginPath();
        context.arc(pocket.x, pocket.y, POCKET_RADIUS, 0, Math.PI * 2);
        context.fill();
      });

      currentBalls.forEach((ball) => {
        if (ball.pocketed) return;
        context.fillStyle = ball.color;
        context.beginPath();
        context.arc(ball.x, ball.y, BALL_RADIUS, 0, Math.PI * 2);
        context.fill();

        if (ball.isStripe && !ball.isCue) {
          context.fillStyle = "#f8fafc";
          context.beginPath();
          context.arc(ball.x, ball.y, BALL_RADIUS - 4, 0, Math.PI * 2);
          context.fill();
          context.fillStyle = ball.color;
          context.fillRect(ball.x - BALL_RADIUS + 3, ball.y - 4, BALL_RADIUS * 2 - 6, 8);
        }

        if (!ball.isCue) {
          context.fillStyle = ball.isEight ? "#f8fafc" : "#111827";
          context.font = "10px monospace";
          context.textAlign = "center";
          context.fillText(ball.label, ball.x, ball.y + 3);
        }
      });

      if (cueBall && allStopped && !won && !lost) {
        const dx = mouseRef.current.x - cueBall.x;
        const dy = mouseRef.current.y - cueBall.y;
        const length = Math.hypot(dx, dy) || 1;
        const aimX = dx / length;
        const aimY = dy / length;
        const guideLength = 92;

        context.strokeStyle = "rgba(255,255,255,0.6)";
        context.lineWidth = 2;
        context.beginPath();
        context.moveTo(cueBall.x, cueBall.y);
        context.lineTo(cueBall.x + aimX * guideLength, cueBall.y + aimY * guideLength);
        context.stroke();

        context.strokeStyle = "rgba(255,255,255,0.18)";
        context.lineWidth = 6;
        context.beginPath();
        context.moveTo(cueBall.x - aimX * 24, cueBall.y - aimY * 24);
        context.lineTo(cueBall.x - aimX * (38 + power * 18), cueBall.y - aimY * (38 + power * 18));
        context.stroke();
      }

      context.fillStyle = "#111827";
      context.fillRect(POWER_BAR_X, POWER_BAR_Y, POWER_BAR_WIDTH, POWER_BAR_HEIGHT);
      context.fillStyle = "#ef4444";
      context.fillRect(
        POWER_BAR_X,
        POWER_BAR_Y + POWER_BAR_HEIGHT * (1 - power),
        POWER_BAR_WIDTH,
        POWER_BAR_HEIGHT * power
      );
      context.strokeStyle = "#f8fafc";
      context.strokeRect(POWER_BAR_X, POWER_BAR_Y, POWER_BAR_WIDTH, POWER_BAR_HEIGHT);

      frameRef.current = window.requestAnimationFrame(draw);
    };

    frameRef.current = window.requestAnimationFrame(draw);
    return () => {
      if (frameRef.current) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [allStopped, assignedGroup, cueBall, lost, power, won]);

  const shoot = () => {
    const currentCue = ballsRef.current.find((ball) => ball.isCue);
    if (!currentCue || currentCue.pocketed || !allStopped || won || lost) {
      return;
    }

    const dx = mouseRef.current.x - currentCue.x;
    const dy = mouseRef.current.y - currentCue.y;
    const len = Math.hypot(dx, dy) || 1;
    const vx = (dx / len) * power * MAX_POWER;
    const vy = (dy / len) * power * MAX_POWER;

    setBalls((current) =>
      current.map((ball) =>
        ball.isCue
          ? {
              ...ball,
              vx,
              vy
            }
          : ball
      )
    );
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * TABLE_WIDTH;
    const y = ((event.clientY - rect.top) / rect.height) * TABLE_HEIGHT;
    mouseRef.current = {
      x,
      y,
      insideTable: x >= PLAY_X && x <= PLAY_X + PLAY_WIDTH && y >= PLAY_Y && y <= PLAY_Y + PLAY_HEIGHT
    };

    if (
      x >= POWER_BAR_X - 10 &&
      x <= POWER_BAR_X + POWER_BAR_WIDTH + 10 &&
      y >= POWER_BAR_Y &&
      y <= POWER_BAR_Y + POWER_BAR_HEIGHT
    ) {
      draggingPowerRef.current = true;
      setPower(clamp(1 - (y - POWER_BAR_Y) / POWER_BAR_HEIGHT, 0.12, 1));
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * TABLE_WIDTH;
    const y = ((event.clientY - rect.top) / rect.height) * TABLE_HEIGHT;
    mouseRef.current = {
      x,
      y,
      insideTable: x >= PLAY_X && x <= PLAY_X + PLAY_WIDTH && y >= PLAY_Y && y <= PLAY_Y + PLAY_HEIGHT
    };

    if (draggingPowerRef.current) {
      setPower(clamp(1 - (y - POWER_BAR_Y) / POWER_BAR_HEIGHT, 0.12, 1));
    }
  };

  const handlePointerUp = () => {
    if (!draggingPowerRef.current) {
      return;
    }
    draggingPowerRef.current = false;
    shoot();
  };

  const restart = () => {
    const nextRack = createRack();
    ballsRef.current = nextRack;
    setBalls(nextRack);
    setAssignedGroup(null);
    setPower(0.35);
    setWon(false);
    setLost(false);
    setAwarded(false);
    setMessage("Aim with the mouse. Drag the power bar down and release to shoot.");
  };

  const pocketedSolids = balls.filter((ball) => !ball.pocketed ? false : !ball.isCue && !ball.isEight && !ball.isStripe).length;
  const pocketedStripes = balls.filter((ball) => !ball.pocketed ? false : !ball.isCue && !ball.isEight && ball.isStripe).length;

  return (
    <div className="page">
      <NavBar />
      <div className="content card" style={{ maxWidth: 980 }}>
        <h2>8 Ball</h2>
        <p>Original-style solo table. Aim with the mouse, use the short guide line, then drag the power bar and release to strike the cue ball.</p>
        <canvas
          ref={canvasRef}
          width={TABLE_WIDTH}
          height={TABLE_HEIGHT}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          style={{
            width: "100%",
            maxWidth: TABLE_WIDTH,
            display: "block",
            margin: "1rem auto",
            borderRadius: "1rem",
            border: "1px solid #334155",
            background: "#4b2e19",
            touchAction: "none",
            cursor: allStopped ? "crosshair" : "default"
          }}
        />
        <p className="info">{message}</p>
        <p className="score-display">
          Group: {assignedGroup ?? "open table"} | Solids pocketed: {pocketedSolids}/7 | Stripes pocketed: {pocketedStripes}/7
        </p>
        <div className="button-row">
          <button className="primary-button" type="button" onClick={restart}>
            Rack again
          </button>
        </div>
      </div>
    </div>
  );
};

export default Pool;
