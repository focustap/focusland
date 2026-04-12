import React, { useEffect, useMemo, useRef, useState } from "react";
import NavBar from "../components/NavBar";
import { recordArcadeResult } from "../lib/progression";

type GamePhase = "title" | "playing" | "gameOver";
type DistrictTier = 0 | 1 | 2 | 3;
type ObstacleType = "chimney" | "crate" | "clothesline";

type BuildingObstacle = {
  id: string;
  x: number;
  width: number;
  height: number;
  type: ObstacleType;
};

type Pickup = {
  id: string;
  x: number;
  y: number;
  collected: boolean;
};

type HookPoint = {
  id: string;
  x: number;
  y: number;
  kind: "pole" | "antenna" | "wire";
};

type AirObstacle = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  kind: "bird" | "kite" | "wire-cluster";
};

type Building = {
  id: number;
  x: number;
  width: number;
  top: number;
  height: number;
  anchorX: number;
  anchorY: number;
  seed: number;
  obstacles: BuildingObstacle[];
  pickups: Pickup[];
  hookPoints: HookPoint[];
  airObstacles: AirObstacle[];
};

type HookState = {
  anchorX: number;
  anchorY: number;
  timeMs: number;
};

type RunnerState = {
  playerX: number;
  playerY: number;
  previousY: number;
  velocityX: number;
  velocityY: number;
  grounded: boolean;
  ducking: boolean;
  coyoteMs: number;
  hookCooldownMs: number;
  hook: HookState | null;
  buildings: Building[];
  score: number;
  distance: number;
  coins: number;
  tier: DistrictTier;
  gameOver: boolean;
  reason: string;
  milestoneText: string;
  styleBonus: number;
};

type HudState = {
  score: number;
  distance: number;
  coins: number;
  speed: number;
  districtTier: DistrictTier;
  hookReady: boolean;
  hookCooldownPct: number;
};

type RunSummary = {
  score: number;
  distance: number;
  coins: number;
  goldEarned: number;
  reason: string;
};

type InputState = {
  jumpQueued: boolean;
  duckHeld: boolean;
  hookQueued: boolean;
  aimScreenX: number;
  aimScreenY: number;
  aimWorldX: number;
  aimWorldY: number;
};

const WIDTH = 960;
const HEIGHT = 540;
const PLAYER_SCREEN_X = 220;
const PLAYER_WIDTH = 28;
const PLAYER_STAND_HEIGHT = 64;
const PLAYER_DUCK_HEIGHT = 38;
const FAIL_Y = HEIGHT + 160;
const LOCAL_BEST_KEY = "focusland-rooftop-runner-best";
const DISTRICT_THRESHOLDS = [500, 1000, 1500] as const;
const DISTRICT_NAMES = ["Sketch Block", "Pencil Plaza", "Hookline Heights", "Midnight Margin"] as const;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function lerp(from: number, to: number, amount: number) {
  return from + (to - from) * amount;
}

function noise(seed: number) {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function between(seed: number, min: number, max: number) {
  return min + noise(seed) * (max - min);
}

function getDistrictTier(score: number): DistrictTier {
  if (score >= DISTRICT_THRESHOLDS[2]) return 3;
  if (score >= DISTRICT_THRESHOLDS[1]) return 2;
  if (score >= DISTRICT_THRESHOLDS[0]) return 1;
  return 0;
}

function loadLocalBest() {
  if (typeof window === "undefined") {
    return 0;
  }

  const raw = window.localStorage.getItem(LOCAL_BEST_KEY);
  return raw ? Number(raw) || 0 : 0;
}

function saveLocalBest(score: number) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(LOCAL_BEST_KEY, String(score));
  }
}

function getRunSpeed(tier: DistrictTier) {
  return 250 + tier * 28;
}

function getPlayerHeight(state: RunnerState) {
  return state.ducking ? PLAYER_DUCK_HEIGHT : PLAYER_STAND_HEIGHT;
}

function getPlayerBounds(state: RunnerState) {
  const height = getPlayerHeight(state);
  return {
    left: state.playerX - PLAYER_WIDTH / 2,
    right: state.playerX + PLAYER_WIDTH / 2,
    top: state.playerY - height,
    bottom: state.playerY
  };
}

function buildObstacle(seedBase: number, x: number, tier: DistrictTier, index: number): BuildingObstacle {
  const roll = noise(seedBase + index * 11);
  if (tier >= 1 && roll > 0.62) {
    return { id: `${seedBase}-line-${index}`, x, width: 66, height: 20, type: "clothesline" };
  }
  if (roll > 0.3) {
    return { id: `${seedBase}-chimney-${index}`, x, width: 34, height: 52, type: "chimney" };
  }
  return { id: `${seedBase}-crate-${index}`, x, width: 46, height: 28, type: "crate" };
}

function createBuilding(prev: Building, id: number, tier: DistrictTier): Building {
  const gap = between(id * 13, 76, 126) + (tier >= 2 && noise(id * 17) > 0.58 ? between(id * 29, 30, 72) : 0);
  const width = Math.round(between(id * 7, 180, 320));
  const top = clamp(prev.top + Math.round(between(id * 19, -48, 48)), 274, 390);
  const x = prev.x + prev.width + gap;
  const height = HEIGHT - top + 90 + Math.round(between(id * 37, 12, 54));
  const anchorX = x + width * between(id * 41, 0.52, 0.8);
  const anchorY = top - between(id * 43, 70, 122);

  const obstacleCount =
    width > 240
      ? tier >= 2
        ? 2
        : noise(id * 47) > 0.48
          ? 2
          : 1
      : noise(id * 53) > 0.56
        ? 1
        : 0;

  const obstacles: BuildingObstacle[] = [];
  for (let i = 0; i < obstacleCount; i += 1) {
    const obstacleX = x + 54 + (i + 1) * ((width - 112) / (obstacleCount + 1));
    obstacles.push(buildObstacle(id * 59, obstacleX, tier, i));
  }

  const pickups: Pickup[] = [];
  if (noise(id * 61) > 0.32) {
    pickups.push({
      id: `${id}-coin-0`,
      x: x + width * between(id * 67, 0.28, 0.72),
      y: top - between(id * 71, 46, 98),
      collected: false
    });
  }

  if (tier >= 2 && noise(id * 73) > 0.68) {
    pickups.push({
      id: `${id}-coin-1`,
      x: x + width * between(id * 79, 0.56, 0.86),
      y: top - between(id * 83, 58, 122),
      collected: false
    });
  }

  const hookPoints: HookPoint[] = [
    {
      id: `${id}-hook-primary`,
      x: anchorX,
      y: anchorY,
      kind: noise(id * 89) > 0.62 ? "antenna" : "pole"
    }
  ];

  if (width > 220 && noise(id * 101) > 0.5) {
    hookPoints.push({
      id: `${id}-hook-secondary`,
      x: x + width * between(id * 103, 0.28, 0.48),
      y: top - between(id * 107, 82, 132),
      kind: "wire"
    });
  }

  const airObstacles: AirObstacle[] = [];
  if (noise(id * 109) > 0.48) {
    airObstacles.push({
      id: `${id}-air-0`,
      x: x + width * between(id * 113, 0.24, 0.78),
      y: top - between(id * 127, 88, 146),
      width: 34,
      height: 18,
      kind: noise(id * 131) > 0.45 ? "bird" : "kite"
    });
  }

  if (tier >= 2 && noise(id * 137) > 0.7) {
    airObstacles.push({
      id: `${id}-air-1`,
      x: x + width * between(id * 139, 0.42, 0.88),
      y: top - between(id * 149, 120, 176),
      width: 46,
      height: 20,
      kind: "wire-cluster"
    });
  }

  return {
    id,
    x,
    width,
    top,
    height,
    anchorX,
    anchorY,
    seed: id * 97,
    obstacles,
    pickups,
    hookPoints,
    airObstacles
  };
}

function createInitialBuildings() {
  const first: Building = {
    id: 0,
    x: 0,
    width: 280,
    top: 360,
    height: HEIGHT - 360 + 110,
    anchorX: 176,
    anchorY: 276,
    seed: 1,
    obstacles: [],
    pickups: [{ id: "0-coin-0", x: 186, y: 308, collected: false }],
    hookPoints: [
      { id: "0-hook-primary", x: 176, y: 276, kind: "pole" },
      { id: "0-hook-secondary", x: 224, y: 248, kind: "wire" }
    ],
    airObstacles: []
  };

  const buildings = [first, createBuilding(first, 1, 0)];
  while (buildings[buildings.length - 1].x < 1500) {
    buildings.push(createBuilding(buildings[buildings.length - 1], buildings.length, 0));
  }

  return buildings;
}

function createInitialState(): RunnerState {
  const buildings = createInitialBuildings();
  const firstRoof = buildings[0].top;
  return {
    playerX: 84,
    playerY: firstRoof,
    previousY: firstRoof,
    velocityX: getRunSpeed(0),
    velocityY: 0,
    grounded: true,
    ducking: false,
    coyoteMs: 0,
    hookCooldownMs: 0,
    hook: null,
    buildings,
    score: 0,
    distance: 0,
    coins: 0,
    tier: 0,
    gameOver: false,
    reason: "",
    milestoneText: "Sketch Block is live. Run the roofline and learn the hook rhythm.",
    styleBonus: 0
  };
}

function findBuildingUnder(state: RunnerState, x: number) {
  return state.buildings.find((building) => x >= building.x && x <= building.x + building.width) ?? null;
}

function findHookTarget(state: RunnerState, aimWorldX: number, aimWorldY: number) {
  const candidates = state.buildings.flatMap((building) =>
    building.hookPoints
      .filter(
        (point) =>
          point.x > state.playerX + 30 &&
          point.x < state.playerX + 340 &&
          point.y < state.playerY - 16
      )
      .map((point) => ({
        point,
        score: Math.hypot(point.x - aimWorldX, point.y - aimWorldY)
      }))
  );

  if (!candidates.length) {
    return null;
  }

  candidates.sort((a, b) => a.score - b.score);
  if (candidates[0].score > 110) {
    return null;
  }

  return candidates[0].point;
}

function ensureWorldAhead(state: RunnerState) {
  while (state.buildings[state.buildings.length - 1].x < state.playerX + 1700) {
    state.buildings.push(createBuilding(state.buildings[state.buildings.length - 1], state.buildings.length, state.tier));
  }

  state.buildings = state.buildings.filter((building) => building.x + building.width > state.playerX - 420);
}

function intersectsPlayer(state: RunnerState, obstacle: BuildingObstacle, building: Building) {
  const player = getPlayerBounds(state);
  const obstacleRect =
    obstacle.type === "clothesline"
      ? {
          left: obstacle.x - obstacle.width / 2,
          right: obstacle.x + obstacle.width / 2,
          top: building.top - 54,
          bottom: building.top - 12
        }
      : {
          left: obstacle.x - obstacle.width / 2,
          right: obstacle.x + obstacle.width / 2,
          top: building.top - obstacle.height,
          bottom: building.top
        };

  return (
    player.left < obstacleRect.right &&
    player.right > obstacleRect.left &&
    player.top < obstacleRect.bottom &&
    player.bottom > obstacleRect.top
  );
}

function intersectsAirObstacle(state: RunnerState, obstacle: AirObstacle) {
  const player = getPlayerBounds(state);
  return (
    player.left < obstacle.x + obstacle.width / 2 &&
    player.right > obstacle.x - obstacle.width / 2 &&
    player.top < obstacle.y + obstacle.height / 2 &&
    player.bottom > obstacle.y - obstacle.height / 2
  );
}

function awardMilestoneText(tier: DistrictTier) {
  if (tier === 1) {
    return "Pencil Plaza unlocked. Roof heights swing harder and clotheslines start showing up.";
  }
  if (tier === 2) {
    return "Hookline Heights unlocked. Gaps get wider and grapple routes matter.";
  }
  return "Midnight Margin unlocked. The skyline gets denser and the tempo kicks up.";
}

function updateRunnerState(
  state: RunnerState,
  input: InputState,
  dtMs: number,
  onMilestone: (message: string) => void
) {
  if (state.gameOver) {
    return;
  }

  const dt = dtMs / 1000;
  const targetRunSpeed = getRunSpeed(state.tier);

  state.previousY = state.playerY;
  state.hookCooldownMs = Math.max(0, state.hookCooldownMs - dtMs);
  state.coyoteMs = Math.max(0, state.coyoteMs - dtMs);
  state.ducking = input.duckHeld && state.grounded;

  if (input.jumpQueued && (state.grounded || state.coyoteMs > 0)) {
    state.velocityY = -690;
    state.grounded = false;
    state.coyoteMs = 0;
  }

  if (input.hookQueued && state.hookCooldownMs <= 0) {
    const target = findHookTarget(state, input.aimWorldX, input.aimWorldY);
    if (target) {
      state.hook = { anchorX: target.x, anchorY: target.y, timeMs: 0 };
      state.hookCooldownMs = 1100;
      if (state.grounded) {
        state.velocityY = -380;
        state.grounded = false;
      }
    }
  }

  if (state.hook) {
    state.hook.timeMs += dtMs;
    const dx = state.hook.anchorX - state.playerX;
    const dy = state.hook.anchorY - state.playerY;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const pull = clamp((320 - distance) / 320, 0.15, 1);
    state.velocityX += (dx / distance) * 1700 * pull * dt;
    state.velocityY += (dy / distance) * 1400 * pull * dt;
    state.velocityY += 480 * dt;

    if (distance < 34 || state.hook.timeMs > 620 || state.playerX > state.hook.anchorX + 18) {
      state.styleBonus += 60;
      state.velocityX = Math.max(state.velocityX, targetRunSpeed + 110);
      state.hook = null;
    }
  } else {
    state.velocityY += 1750 * dt;
  }

  state.velocityX = state.grounded ? lerp(state.velocityX, targetRunSpeed, 0.18) : Math.max(state.velocityX, targetRunSpeed * 0.9);
  state.playerX += state.velocityX * dt;
  state.playerY += state.velocityY * dt;

  const buildingUnder = findBuildingUnder(state, state.playerX);
  if (buildingUnder) {
    if (state.velocityY >= 0 && state.previousY <= buildingUnder.top && state.playerY >= buildingUnder.top) {
      state.playerY = buildingUnder.top;
      state.velocityY = 0;
      state.grounded = true;
      state.coyoteMs = 90;
      state.hook = null;
    } else if (state.grounded) {
      state.playerY = buildingUnder.top;
    }
  } else if (state.grounded) {
    state.grounded = false;
    state.coyoteMs = 130;
  }

  state.buildings.forEach((building) => {
    building.pickups.forEach((pickup) => {
      if (pickup.collected) {
        return;
      }

      const player = getPlayerBounds(state);
      if (
        player.left < pickup.x + 12 &&
        player.right > pickup.x - 12 &&
        player.top < pickup.y + 12 &&
        player.bottom > pickup.y - 12
      ) {
        pickup.collected = true;
        state.coins += 1;
        state.styleBonus += 18;
      }
    });

    if (state.playerX < building.x - 80 || state.playerX > building.x + building.width + 80) {
      return;
    }

    if (building.obstacles.some((obstacle) => intersectsPlayer(state, obstacle, building))) {
      state.gameOver = true;
      state.reason = "You wiped out on rooftop junk.";
    }

    if (building.airObstacles.some((obstacle) => intersectsAirObstacle(state, obstacle))) {
      state.gameOver = true;
      state.reason = "You clipped something nasty in the air.";
    }
  });

  ensureWorldAhead(state);

  state.distance = Math.max(0, Math.floor((state.playerX - 84) / 10));
  state.score = Math.max(0, Math.floor(state.distance * 1.18 + state.coins * 26 + state.styleBonus));

  const nextTier = getDistrictTier(state.score);
  if (nextTier !== state.tier) {
    state.tier = nextTier;
    state.styleBonus += 45;
    state.milestoneText = awardMilestoneText(nextTier);
    onMilestone(state.milestoneText);
  }

  if (state.playerY > FAIL_Y) {
    state.gameOver = true;
    state.reason = "You missed the next building and ate concrete.";
  }
}

function drawSketchLine(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  wobble: number
) {
  ctx.beginPath();
  ctx.moveTo(x1 + wobble * 0.4, y1 - wobble * 0.3);
  ctx.lineTo(x2 - wobble * 0.3, y2 + wobble * 0.4);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x1 - wobble * 0.25, y1 + wobble * 0.2);
  ctx.lineTo(x2 + wobble * 0.2, y2 - wobble * 0.25);
  ctx.stroke();
}

function drawSketchRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  wobble: number
) {
  drawSketchLine(ctx, x, y, x + width, y, wobble);
  drawSketchLine(ctx, x + width, y, x + width, y + height, wobble);
  drawSketchLine(ctx, x + width, y + height, x, y + height, wobble);
  drawSketchLine(ctx, x, y + height, x, y, wobble);
}

function renderBackground(ctx: CanvasRenderingContext2D, score: number) {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = "#f7f1de";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.strokeStyle = "rgba(86, 150, 212, 0.24)";
  ctx.lineWidth = 1;
  for (let y = 44; y < HEIGHT; y += 32) {
    drawSketchLine(ctx, 0, y, WIDTH, y, 0.8);
  }

  ctx.strokeStyle = "rgba(224, 86, 86, 0.18)";
  drawSketchLine(ctx, 46, 0, 46, HEIGHT, 0.4);

  ctx.fillStyle =
    score >= DISTRICT_THRESHOLDS[2]
      ? "rgba(29, 78, 216, 0.06)"
      : score >= DISTRICT_THRESHOLDS[1]
        ? "rgba(180, 83, 9, 0.05)"
        : "rgba(15, 23, 42, 0.03)";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

function renderWorld(
  ctx: CanvasRenderingContext2D,
  state: RunnerState,
  aim?: { screenX: number; screenY: number }
) {
  renderBackground(ctx, state.score);
  const cameraX = Math.max(0, state.playerX - PLAYER_SCREEN_X);
  const visibleBuildings = state.buildings.filter(
    (building) => building.x + building.width >= cameraX - 120 && building.x <= cameraX + WIDTH + 160
  );

  ctx.strokeStyle = "#151515";
  ctx.lineWidth = 2;

  for (let i = 0; i < 8; i += 1) {
    const worldX = cameraX + i * 180 + ((cameraX * 0.25) % 180);
    const screenX = worldX - cameraX;
    const skylineWidth = 60 + (i % 3) * 26;
    const skylineHeight = 100 + (i % 4) * 30;
    ctx.globalAlpha = 0.16;
    drawSketchRect(ctx, screenX, 250 - skylineHeight, skylineWidth, skylineHeight, 1.2);
    ctx.globalAlpha = 1;
  }

  visibleBuildings.forEach((building) => {
    const x = building.x - cameraX;
    const wobble = 1 + noise(building.seed) * 1.6;

    ctx.fillStyle = "rgba(255,255,255,0.28)";
    ctx.fillRect(x, building.top, building.width, building.height);
    ctx.strokeStyle = "#171717";
    drawSketchRect(ctx, x, building.top, building.width, building.height, wobble);
    drawSketchLine(ctx, x, building.top + 8, x + building.width, building.top + 8, wobble);

    for (let i = 0; i < Math.floor(building.width / 48); i += 1) {
      const windowX = x + 18 + i * 42;
      const windowY = building.top + 28 + (i % 2) * 22;
      drawSketchRect(ctx, windowX, windowY, 16, 22, 0.7);
    }

    building.hookPoints.forEach((point) => {
      const pointX = point.x - cameraX;
      ctx.strokeStyle = point.kind === "pole" ? "#7c2d12" : point.kind === "antenna" ? "#334155" : "#1f2937";
      if (point.kind === "wire") {
        drawSketchLine(ctx, pointX - 12, point.y + 6, pointX + 12, point.y + 6, 0.5);
        drawSketchLine(ctx, pointX, point.y + 6, pointX, building.top, 0.5);
      } else {
        drawSketchLine(ctx, pointX, point.y, pointX, building.top, 0.9);
        drawSketchLine(ctx, pointX - 14, point.y + 10, pointX + 14, point.y + 10, 0.5);
      }
      ctx.strokeStyle = "#1d4ed8";
      ctx.beginPath();
      ctx.arc(pointX, point.y, 6, 0, Math.PI * 2);
      ctx.stroke();
    });

    building.obstacles.forEach((obstacle) => {
      const obstacleX = obstacle.x - cameraX;
      if (obstacle.type === "clothesline") {
        drawSketchLine(ctx, obstacleX - 26, building.top - 52, obstacleX + 26, building.top - 52, 0.7);
        drawSketchLine(ctx, obstacleX - 24, building.top - 52, obstacleX - 24, building.top - 10, 0.7);
        drawSketchLine(ctx, obstacleX + 24, building.top - 52, obstacleX + 24, building.top - 10, 0.7);
        drawSketchLine(ctx, obstacleX - 12, building.top - 43, obstacleX - 6, building.top - 24, 0.6);
        drawSketchLine(ctx, obstacleX + 2, building.top - 43, obstacleX + 8, building.top - 24, 0.6);
      } else {
        const obstacleY = building.top - obstacle.height;
        drawSketchRect(ctx, obstacleX - obstacle.width / 2, obstacleY, obstacle.width, obstacle.height, 0.9);
        if (obstacle.type === "chimney") {
          drawSketchLine(ctx, obstacleX - 10, obstacleY + 8, obstacleX + 10, obstacleY + 8, 0.6);
        }
      }
    });

    building.pickups.forEach((pickup) => {
      if (pickup.collected) {
        return;
      }

      const pickupX = pickup.x - cameraX;
      ctx.beginPath();
      ctx.arc(pickupX, pickup.y, 10, 0, Math.PI * 2);
      ctx.stroke();
      drawSketchLine(ctx, pickupX - 8, pickup.y, pickupX + 8, pickup.y, 0.5);
      drawSketchLine(ctx, pickupX, pickup.y - 8, pickupX, pickup.y + 8, 0.5);
    });

    building.airObstacles.forEach((obstacle) => {
      const obstacleX = obstacle.x - cameraX;
      ctx.strokeStyle = "#111827";
      if (obstacle.kind === "bird") {
        drawSketchLine(ctx, obstacleX - 14, obstacle.y, obstacleX - 2, obstacle.y - 8, 0.5);
        drawSketchLine(ctx, obstacleX - 2, obstacle.y - 8, obstacleX + 12, obstacle.y, 0.5);
        drawSketchLine(ctx, obstacleX - 2, obstacle.y - 6, obstacleX + 8, obstacle.y - 12, 0.4);
      } else if (obstacle.kind === "kite") {
        drawSketchLine(ctx, obstacleX, obstacle.y - 12, obstacleX + 12, obstacle.y, 0.5);
        drawSketchLine(ctx, obstacleX + 12, obstacle.y, obstacleX, obstacle.y + 12, 0.5);
        drawSketchLine(ctx, obstacleX, obstacle.y + 12, obstacleX - 12, obstacle.y, 0.5);
        drawSketchLine(ctx, obstacleX - 12, obstacle.y, obstacleX, obstacle.y - 12, 0.5);
        drawSketchLine(ctx, obstacleX, obstacle.y + 12, obstacleX + 10, obstacle.y + 26, 0.5);
      } else {
        drawSketchLine(ctx, obstacleX - 20, obstacle.y, obstacleX + 20, obstacle.y, 0.5);
        drawSketchLine(ctx, obstacleX - 12, obstacle.y - 8, obstacleX - 12, obstacle.y + 8, 0.5);
        drawSketchLine(ctx, obstacleX + 4, obstacle.y - 10, obstacleX + 4, obstacle.y + 10, 0.5);
      }
    });
  });

  if (state.hook) {
    ctx.strokeStyle = "#1d4ed8";
    drawSketchLine(
      ctx,
      state.playerX - cameraX,
      state.playerY - getPlayerHeight(state) + 14,
      state.hook.anchorX - cameraX,
      state.hook.anchorY,
      1
    );
  }

  const playerScreenX = state.playerX - cameraX;
  const playerTop = state.playerY - getPlayerHeight(state);
  const runCycle = (state.distance * 0.085) % (Math.PI * 2);
  const legSwing = state.grounded ? Math.sin(runCycle) * 12 : Math.max(-8, Math.min(8, state.velocityY * 0.02));
  const armSwing = state.grounded ? Math.cos(runCycle) * 10 : -12;
  const torsoLean = state.hook ? 10 : state.grounded ? Math.sin(runCycle) * 2 : -8;
  const headOffsetY = state.grounded ? Math.sin(runCycle * 2) * 1.5 : 0;

  ctx.strokeStyle = "#101010";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(playerScreenX, playerTop + 12 + headOffsetY, 11, 0, Math.PI * 2);
  ctx.stroke();
  drawSketchLine(ctx, playerScreenX, playerTop + 24, playerScreenX + torsoLean * 0.25, playerTop + 47, 0.6);

  if (state.hook) {
    const hookScreenX = state.hook.anchorX - cameraX;
    const hookDx = clamp(hookScreenX - playerScreenX, -36, 36);
    drawSketchLine(ctx, playerScreenX, playerTop + 30, playerScreenX + hookDx * 0.7, playerTop + 18, 0.5);
    drawSketchLine(ctx, playerScreenX, playerTop + 30, playerScreenX - 12, playerTop + 44, 0.5);
  } else {
    drawSketchLine(ctx, playerScreenX, playerTop + 30, playerScreenX - 14 + armSwing * 0.2, playerTop + 40, 0.6);
    drawSketchLine(ctx, playerScreenX, playerTop + 30, playerScreenX + 14 - armSwing * 0.2, playerTop + 38, 0.6);
  }

  if (state.ducking) {
    drawSketchLine(ctx, playerScreenX + torsoLean * 0.25, playerTop + 47, playerScreenX - 12, playerTop + 57, 0.6);
    drawSketchLine(ctx, playerScreenX + torsoLean * 0.25, playerTop + 47, playerScreenX + 14, playerTop + 55, 0.6);
  } else if (!state.grounded) {
    drawSketchLine(ctx, playerScreenX + torsoLean * 0.25, playerTop + 47, playerScreenX - 10, playerTop + 58 - legSwing * 0.2, 0.6);
    drawSketchLine(ctx, playerScreenX + torsoLean * 0.25, playerTop + 47, playerScreenX + 12, playerTop + 54 + legSwing * 0.2, 0.6);
  } else {
    drawSketchLine(ctx, playerScreenX + torsoLean * 0.25, playerTop + 47, playerScreenX - 11 + legSwing, playerTop + 63, 0.6);
    drawSketchLine(ctx, playerScreenX + torsoLean * 0.25, playerTop + 47, playerScreenX + 11 - legSwing, playerTop + 63, 0.6);
  }

  drawSketchLine(ctx, playerScreenX - 3, playerTop + 8 + headOffsetY, playerScreenX - 3, playerTop + 14 + headOffsetY, 0.2);
  drawSketchLine(ctx, playerScreenX + 3, playerTop + 8 + headOffsetY, playerScreenX + 3, playerTop + 14 + headOffsetY, 0.2);

  if (aim) {
    ctx.strokeStyle = "rgba(29, 78, 216, 0.6)";
    drawSketchLine(ctx, aim.screenX - 10, aim.screenY, aim.screenX + 10, aim.screenY, 0.2);
    drawSketchLine(ctx, aim.screenX, aim.screenY - 10, aim.screenX, aim.screenY + 10, 0.2);
  }
}

function renderPoster(ctx: CanvasRenderingContext2D, bestScore: number, lastRun: RunSummary | null, phase: GamePhase) {
  const preview = createInitialState();
  preview.playerX = 116;
  preview.distance = 18;
  preview.styleBonus = 40;
  preview.buildings = preview.buildings.slice(0, 4);
  renderWorld(ctx, preview);

  ctx.fillStyle = "rgba(247, 241, 222, 0.78)";
  ctx.fillRect(86, 82, WIDTH - 172, HEIGHT - 164);
  ctx.strokeStyle = "#171717";
  ctx.lineWidth = 2;
  drawSketchRect(ctx, 86, 82, WIDTH - 172, HEIGHT - 164, 1.2);

  ctx.fillStyle = "#111827";
  ctx.font = "bold 38px PublicPixel, monospace";
  ctx.fillText("Rooftop Runner", 118, 146);
  ctx.font = "18px system-ui";
  ctx.fillText("Stick figure parkour across hand-drawn rooftops.", 118, 188);
  ctx.fillText("Jump gaps, duck roof junk, and sling forward with the grappling hook.", 118, 216);
  ctx.fillText("Best score on this device: " + bestScore, 118, 268);

  if (phase === "gameOver" && lastRun) {
    ctx.fillText(`Last run: ${lastRun.score} score, ${lastRun.distance}m, ${lastRun.coins} coins.`, 118, 306);
    ctx.fillText(lastRun.reason, 118, 334);
  } else {
    ctx.fillText("Press Start Run to hit the skyline.", 118, 306);
  }
}

function playAudio(audio: HTMLAudioElement | null, reset = false) {
  if (!audio) {
    return;
  }

  if (reset) {
    audio.currentTime = 0;
  }

  void audio.play().catch(() => undefined);
}

function pauseAudio(audio: HTMLAudioElement | null) {
  audio?.pause();
}

const RooftopRunner: React.FC = () => {
  const assetBase = import.meta.env.BASE_URL;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bestScoreRef = useRef(loadLocalBest());
  const titleAudioRef = useRef<HTMLAudioElement | null>(null);
  const gameplayAudioRef = useRef<HTMLAudioElement | null>(null);
  const bonusAudioRef = useRef<HTMLAudioElement | null>(null);
  const resultsAudioRef = useRef<HTMLAudioElement | null>(null);

  const [phase, setPhase] = useState<GamePhase>("title");
  const [runSeed, setRunSeed] = useState(0);
  const [bestScore, setBestScore] = useState(() => loadLocalBest());
  const [status, setStatus] = useState("Build momentum, read the rooftops, and use the hook to save greedy jumps.");
  const [hud, setHud] = useState<HudState>({
    score: 0,
    distance: 0,
    coins: 0,
    speed: getRunSpeed(0),
    districtTier: 0,
    hookReady: true,
    hookCooldownPct: 100
  });
  const [lastRun, setLastRun] = useState<RunSummary | null>(null);

  const titleTrackPath = useMemo(() => `${assetBase}assets/music/town-rush/SwinginSafari.wav`, [assetBase]);
  const gameplayTrackPath = useMemo(() => `${assetBase}assets/music/town-rush/BourbonBlues.wav`, [assetBase]);
  const bonusTrackPath = useMemo(() => `${assetBase}assets/music/town-rush/BoogieWonderland.wav`, [assetBase]);
  const resultsTrackPath = useMemo(() => `${assetBase}assets/music/town-rush/CoolCatCaper.wav`, [assetBase]);

  useEffect(() => {
    bestScoreRef.current = bestScore;
  }, [bestScore]);

  useEffect(() => {
    const titleTrack = new Audio(titleTrackPath);
    titleTrack.loop = true;
    titleTrack.volume = 0.26;

    const gameplayTrack = new Audio(gameplayTrackPath);
    gameplayTrack.loop = true;
    gameplayTrack.volume = 0.22;

    const bonusTrack = new Audio(bonusTrackPath);
    bonusTrack.volume = 0.48;

    const resultsTrack = new Audio(resultsTrackPath);
    resultsTrack.volume = 0.34;

    titleAudioRef.current = titleTrack;
    gameplayAudioRef.current = gameplayTrack;
    bonusAudioRef.current = bonusTrack;
    resultsAudioRef.current = resultsTrack;

    return () => {
      [titleTrack, gameplayTrack, bonusTrack, resultsTrack].forEach((audio) => {
        audio.pause();
        audio.src = "";
      });
    };
  }, [bonusTrackPath, gameplayTrackPath, resultsTrackPath, titleTrackPath]);

  useEffect(() => {
    if (phase === "title") {
      pauseAudio(gameplayAudioRef.current);
      pauseAudio(resultsAudioRef.current);
      playAudio(titleAudioRef.current);
    } else if (phase === "playing") {
      pauseAudio(titleAudioRef.current);
      pauseAudio(resultsAudioRef.current);
      playAudio(gameplayAudioRef.current);
    } else {
      pauseAudio(gameplayAudioRef.current);
      pauseAudio(titleAudioRef.current);
      playAudio(resultsAudioRef.current, true);
    }
  }, [phase]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    renderPoster(context, bestScore, lastRun, phase);
  }, [bestScore, lastRun, phase]);

  useEffect(() => {
    if (phase !== "playing") {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    const input: InputState = {
      jumpQueued: false,
      duckHeld: false,
      hookQueued: false,
      aimScreenX: WIDTH * 0.68,
      aimScreenY: HEIGHT * 0.28,
      aimWorldX: 0,
      aimWorldY: 0
    };
    const state = createInitialState();
    input.aimWorldX = state.playerX + 180;
    input.aimWorldY = state.playerY - 110;
    let animationFrame = 0;
    let lastTime = performance.now();
    let hudAccumulator = 0;
    let finalised = false;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "ArrowUp" || event.code === "KeyW" || event.code === "Space") {
        input.jumpQueued = true;
        event.preventDefault();
      }
      if (event.code === "ArrowDown" || event.code === "KeyS") {
        input.duckHeld = true;
        event.preventDefault();
      }
      if (event.code === "KeyE" || event.code === "ShiftLeft" || event.code === "ShiftRight") {
        input.hookQueued = true;
        event.preventDefault();
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === "ArrowDown" || event.code === "KeyS") {
        input.duckHeld = false;
      }
    };

    const syncAimFromPointer = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      const x = ((clientX - rect.left) / rect.width) * WIDTH;
      const y = ((clientY - rect.top) / rect.height) * HEIGHT;

      input.aimScreenX = x;
      input.aimScreenY = y;
      input.aimWorldX = Math.max(0, state.playerX - PLAYER_SCREEN_X) + x;
      input.aimWorldY = y;
    };

    const pointerToAction = (clientX: number, clientY: number, pointerType: string) => {
      syncAimFromPointer(clientX, clientY);
      if (pointerType === "mouse") {
        input.hookQueued = true;
      } else if (input.aimScreenY < HEIGHT * 0.58) {
        input.jumpQueued = true;
      } else {
        input.duckHeld = true;
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      pointerToAction(event.clientX, event.clientY, event.pointerType);
    };

    const onPointerMove = (event: PointerEvent) => {
      syncAimFromPointer(event.clientX, event.clientY);
    };

    const onPointerUp = () => {
      input.duckHeld = false;
    };

    const finishRun = () => {
      if (finalised) {
        return;
      }

      finalised = true;
      const finalScore = state.score;
      const distance = state.distance;
      const goldEarned = Math.max(26, Math.floor(finalScore / 18) + state.coins * 8);
      const nextBest = Math.max(bestScoreRef.current, finalScore);

      setStatus(state.reason);
      setLastRun({
        score: finalScore,
        distance,
        coins: state.coins,
        goldEarned,
        reason: state.reason
      });
      setBestScore(nextBest);
      saveLocalBest(nextBest);
      pauseAudio(gameplayAudioRef.current);

      void recordArcadeResult({
        scoreGameName: "rooftop_runner",
        score: finalScore,
        goldEarned
      }).catch(() => undefined);

      window.setTimeout(() => {
        setPhase("gameOver");
      }, 220);
    };

    const tick = (time: number) => {
      const deltaMs = Math.min(33, time - lastTime);
      lastTime = time;

      updateRunnerState(state, input, deltaMs, (message) => {
        setStatus(message);
        playAudio(bonusAudioRef.current, true);
      });

      renderWorld(context, state, {
        screenX: input.aimScreenX,
        screenY: input.aimScreenY
      });

      hudAccumulator += deltaMs;
      if (hudAccumulator >= 90) {
        hudAccumulator = 0;
        setHud({
          score: state.score,
          distance: state.distance,
          coins: state.coins,
          speed: Math.round(state.velocityX),
          districtTier: state.tier,
          hookReady: state.hookCooldownMs <= 0,
          hookCooldownPct: Math.round(100 - (state.hookCooldownMs / 1100) * 100)
        });
      }

      input.jumpQueued = false;
      input.hookQueued = false;

      if (state.gameOver) {
        finishRun();
        return;
      }

      animationFrame = window.requestAnimationFrame(tick);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);

    animationFrame = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [phase, runSeed]);

  const districtName = DISTRICT_NAMES[hud.districtTier];

  const beginRun = () => {
    setHud({
      score: 0,
      distance: 0,
      coins: 0,
      speed: getRunSpeed(0),
      districtTier: 0,
      hookReady: true,
      hookCooldownPct: 100
    });
    setLastRun(null);
    setStatus("Sketch Block is live. Jump gaps, duck clotheslines, and click to hook across greedy gaps.");
    setRunSeed((value) => value + 1);
    setPhase("playing");
  };

  return (
    <div className="page">
      <NavBar />
      <main className="content card rooftop-shell">
        <div className="rooftop-copy">
          <h1>Rooftop Runner</h1>
          <p>
            A stick-figure rooftop parkour game drawn like it belongs on notebook paper.
            Jump between buildings, duck roof junk, and use a grappling hook to keep runs alive.
          </p>
        </div>

        <div className="rooftop-layout">
          <section className="rooftop-stage rooftop-stage--paper">
            <canvas ref={canvasRef} className="rooftop-canvas" />

            <div className="rooftop-hud rooftop-hud--top">
              <div className="rooftop-marquee">
                <span className="rooftop-logo">Rooftop Runner</span>
                <span className="rooftop-district">{districtName}</span>
              </div>
              <div className="rooftop-scoreboard">
                <span>Score {hud.score}</span>
                <span>{hud.distance}m</span>
                <span>Coins {hud.coins}</span>
              </div>
            </div>

            <div className="rooftop-hud rooftop-hud--bottom">
              <span>Jump `W` / `Up` / tap top</span>
              <span>Duck `S` / `Down` / hold bottom</span>
              <span>Hook click mouse / `E` / `Shift`</span>
              <span>{hud.hookReady ? "Hook ready" : `Hook ${Math.max(0, hud.hookCooldownPct)}%`}</span>
            </div>

            {phase !== "playing" ? (
              <div className="rooftop-overlay">
                <div className="rooftop-overlay-card rooftop-overlay-card--paper">
                  <p className="rooftop-overlay-kicker">
                    {phase === "title" ? "Notebook Parkour" : "Another Take"}
                  </p>
                  <h2>{phase === "title" ? "Hit the skyline" : `Score ${lastRun?.score ?? 0}`}</h2>
                  <p>
                    {phase === "title"
                      ? "This one is built around rooftop jumps, readable gaps, and a grappling hook that creates comeback moments."
                      : `${lastRun?.reason ?? "Run over."} ${lastRun ? `Banked ${lastRun.goldEarned} gold and ${lastRun.coins} coins.` : ""}`}
                  </p>
                  <button className="primary-button" type="button" onClick={beginRun}>
                    {phase === "title" ? "Start Run" : "Run It Back"}
                  </button>
                </div>
              </div>
            ) : null}
          </section>

          <aside className="rooftop-sidepanel">
            <div className="rooftop-panel rooftop-panel--paper">
              <span className="rooftop-panel-title">Controls</span>
              <p>Jump between individual rooftops and clear chimneys and crates.</p>
              <p>Duck under clotheslines when the roof gets crowded.</p>
              <p>Aim with the mouse and click to fire the grappling hook at poles, wires, and anchors above the skyline.</p>
            </div>

            <div className="rooftop-panel rooftop-panel--paper">
              <span className="rooftop-panel-title">Progression</span>
              <p>500 score: Pencil Plaza adds bigger roof swings and more duck checks.</p>
              <p>1000 score: Hookline Heights brings wider gaps, higher anchors, and air hazards.</p>
              <p>1500 score: Midnight Margin speeds the city up and stacks denser rooftops and overhead clutter.</p>
            </div>

            <div className="rooftop-panel rooftop-panel--paper">
              <span className="rooftop-panel-title">Run Status</span>
              <p>{status}</p>
              <p>Best score on this device: {bestScore}</p>
              {lastRun ? (
                <p>
                  Last run: {lastRun.score} score, {lastRun.distance}m, {lastRun.coins} coins.
                </p>
              ) : (
                <p>No clean take yet. Start a run and sketch a better line through the city.</p>
              )}
              <button className="primary-button" type="button" onClick={beginRun}>
                {phase === "playing" ? "Restart Run" : phase === "gameOver" ? "Run It Back" : "Start Run"}
              </button>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
};

export default RooftopRunner;
