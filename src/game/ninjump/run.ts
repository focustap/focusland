export const NINJUMP_WIDTH = 420;
export const NINJUMP_HEIGHT = 720;
export const PLAYFIELD_LEFT = 44;
export const PLAYFIELD_RIGHT = NINJUMP_WIDTH - 44;
export const PLAYER_DRAW_WIDTH = 58;
export const PLAYER_DRAW_HEIGHT = 74;

const PLAYER_HIT_WIDTH = 28;
const PLAYER_HIT_HEIGHT = 60;
const WALL_RUN_SPEED = 320;
const JUMP_VX = 500;
const JUMP_VY = 760;
const GRAVITY = 1820;
const WALL_ATTACH_BOOST = 368;
const FALL_MARGIN = 108;
const SPAWN_BUFFER = 1450;
const MAX_DELTA_MS = 33;
const COMBO_WINDOW_MS = 1050;
const BONUS_TIME_MS = 1800;
const SHIELD_FLASH_MS = 260;
const START_MERCY_MS = 4200;

export type WallSide = "left" | "right";
export type EnemyType = "ninja" | "bird" | "squirrel";
export type PickupType = "shield" | "orb";
export type RunPhase = "title" | "playing" | "gameOver";

export type NinjumpSprites = {
  idle: HTMLImageElement[];
  run: HTMLImageElement[];
  jump: HTMLImageElement[];
  slide: HTMLImageElement[];
  dead: HTMLImageElement[];
};

export type HudSnapshot = {
  score: number;
  height: number;
  combo: number;
  bestCombo: number;
  shielded: boolean;
  streakType: EnemyType | null;
  streakCount: number;
  bonusTimerMs: number;
  bonusLabel: string;
  tierLabel: string;
};

type Palette = {
  skyTop: string;
  skyBottom: string;
  mist: string;
  mountainFar: string;
  mountainNear: string;
  pagoda: string;
  wall: string;
  trim: string;
  accent: string;
  glow: string;
};

type PlayerState = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  wallSide: WallSide | null;
  facing: 1 | -1;
  alive: boolean;
  shielded: boolean;
  shieldFlashMs: number;
  animationMs: number;
  spinMs: number;
  deathTimerMs: number;
  trailMs: number;
};

type BarrierHazard = {
  id: number;
  kind: "barrier";
  y: number;
  side: WallSide;
  width: number;
  height: number;
  color: string;
};

type WallEnemyHazard = {
  id: number;
  kind: "wall-enemy";
  enemyType: "ninja" | "squirrel";
  y: number;
  side: WallSide;
  xOffset: number;
  bobPhase: number;
};

type BirdHazard = {
  id: number;
  kind: "bird";
  enemyType: "bird";
  x: number;
  y: number;
  vx: number;
  vy: number;
  flapPhase: number;
};

type ProjectileHazard = {
  id: number;
  kind: "star";
  x: number;
  y: number;
  vx: number;
  size: number;
  spin: number;
};

type BombHazard = {
  id: number;
  kind: "bomb";
  x: number;
  y: number;
  radius: number;
  pulse: number;
};

type PickupHazard = {
  id: number;
  kind: "pickup";
  pickupType: PickupType;
  x: number;
  y: number;
  radius: number;
  collected: boolean;
};

type Hazard = BarrierHazard | WallEnemyHazard | BirdHazard | ProjectileHazard | BombHazard | PickupHazard;

type SlashEffect = {
  id: number;
  x: number;
  y: number;
  lifeMs: number;
  maxLifeMs: number;
  color: string;
};

type Popup = {
  id: number;
  x: number;
  y: number;
  text: string;
  color: string;
  lifeMs: number;
  maxLifeMs: number;
  vy: number;
};

type SpawnEntryKind = "bird" | "wall-ninja" | "wall-squirrel" | "barrier" | "star" | "bomb" | "shield" | "orb";

type SpawnEntry = {
  kind: SpawnEntryKind;
  yOffset: number;
};

type SpawnPattern = {
  minScore: number;
  maxScore: number;
  entries: SpawnEntry[];
};

export type NinjumpState = {
  seed: number;
  phase: RunPhase;
  player: PlayerState;
  cameraY: number;
  startY: number;
  score: number;
  bestHeight: number;
  combo: number;
  bestCombo: number;
  comboTimerMs: number;
  elapsedMs: number;
  speedRamp: number;
  statusText: string;
  gameOverReason: string;
  nextSpawnY: number;
  nextHazardId: number;
  hazards: Hazard[];
  slashEffects: SlashEffect[];
  popups: Popup[];
  rngState: number;
  streakType: EnemyType | null;
  streakCount: number;
  bonusTimerMs: number;
  bonusLabel: string;
  empoweredUntilLand: boolean;
  mercyTimerMs: number;
  screenShakeMs: number;
  hitStopMs: number;
};

export type NinjumpInput = {
  jumpQueued: boolean;
};

const PALETTES: Palette[] = [
  {
    skyTop: "#d6f0ad",
    skyBottom: "#4f8f63",
    mist: "rgba(244,255,236,0.16)",
    mountainFar: "#82b37c",
    mountainNear: "#5f9166",
    pagoda: "#2a5e46",
    wall: "#8b5d34",
    trim: "#4d2f18",
    accent: "#df4548",
    glow: "rgba(154,255,186,0.3)"
  },
  {
    skyTop: "#efc8ff",
    skyBottom: "#8d6fa7",
    mist: "rgba(255,247,255,0.18)",
    mountainFar: "#ba9ccc",
    mountainNear: "#9477a5",
    pagoda: "#533d6b",
    wall: "#8b6039",
    trim: "#4f3018",
    accent: "#78a9ff",
    glow: "rgba(158,191,255,0.32)"
  },
  {
    skyTop: "#fff0b7",
    skyBottom: "#d19833",
    mist: "rgba(255,249,229,0.18)",
    mountainFar: "#dcc37f",
    mountainNear: "#b3853d",
    pagoda: "#8e5918",
    wall: "#8f5f31",
    trim: "#5f3916",
    accent: "#db3e32",
    glow: "rgba(255,230,135,0.34)"
  }
];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function lerp(from: number, to: number, amount: number) {
  return from + (to - from) * amount;
}

function random(seed: number) {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function randBetween(seed: number, min: number, max: number) {
  return min + random(seed) * (max - min);
}

function getPalette(score: number) {
  return PALETTES[Math.floor(score / 760) % PALETTES.length];
}

function getTierLabel(score: number) {
  if (score >= 1800) return "Moon Pagoda";
  if (score >= 1200) return "Temple Rush";
  if (score >= 700) return "Skyline Shrine";
  return "Bamboo Rise";
}

function getWallX(side: WallSide) {
  return side === "left"
    ? PLAYFIELD_LEFT + PLAYER_HIT_WIDTH * 0.7
    : PLAYFIELD_RIGHT - PLAYER_HIT_WIDTH * 0.7;
}

function getTravelDirection(state: NinjumpState): 1 | -1 {
  if (state.player.vx > 0) return 1;
  if (state.player.vx < 0) return -1;
  if (state.player.wallSide === "left") return 1;
  if (state.player.wallSide === "right") return -1;
  return state.player.facing;
}

function preserveAirMomentum(state: NinjumpState, minimumSpeed: number) {
  const direction = getTravelDirection(state);
  state.player.wallSide = null;
  state.player.facing = direction;
  state.player.vx = direction * Math.max(Math.abs(state.player.vx), minimumSpeed);
}

function getPlayerBounds(state: NinjumpState) {
  return {
    left: state.player.x - PLAYER_HIT_WIDTH / 2,
    right: state.player.x + PLAYER_HIT_WIDTH / 2,
    top: state.player.y - PLAYER_HIT_HEIGHT,
    bottom: state.player.y
  };
}

function intersectsRect(a: { left: number; right: number; top: number; bottom: number }, b: { left: number; right: number; top: number; bottom: number }) {
  return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
}

function distSq(ax: number, ay: number, bx: number, by: number) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function isAirborneKillWindow(state: NinjumpState) {
  return state.player.wallSide === null && Math.abs(state.player.vx) > 140 && state.player.vy < 280;
}

function hasStartMercy(state: NinjumpState) {
  return state.mercyTimerMs > 0;
}

function awardPopup(state: NinjumpState, x: number, y: number, text: string, color: string) {
  state.popups.push({
    id: state.nextHazardId++,
    x,
    y,
    text,
    color,
    lifeMs: 700,
    maxLifeMs: 700,
    vy: -34
  });
}

function awardSlash(state: NinjumpState, x: number, y: number, color = "#ffffff") {
  state.slashEffects.push({
    id: state.nextHazardId++,
    x,
    y,
    color,
    lifeMs: 240,
    maxLifeMs: 240
  });
}

function bumpScore(state: NinjumpState, amount: number, x: number, y: number, label?: string) {
  const scoreMultiplier = state.bonusTimerMs > 0 ? 2 : 1;
  const total = amount * scoreMultiplier;
  state.score += total;
  awardPopup(state, x, y, label ?? `+${total}`, "#fff4c5");
}

function extendCombo(state: NinjumpState, bonus = 1) {
  state.combo = clamp(state.combo + bonus, 0, 99);
  state.bestCombo = Math.max(state.bestCombo, state.combo);
  state.comboTimerMs = COMBO_WINDOW_MS;
}

function registerEnemyDefeat(state: NinjumpState, enemyType: EnemyType, x: number, y: number) {
  if (state.streakType === enemyType) {
    state.streakCount += 1;
  } else {
    state.streakType = enemyType;
    state.streakCount = 1;
  }

  extendCombo(state, enemyType === "bird" ? 2 : 1);
  bumpScore(state, enemyType === "bird" ? 34 : 26, x, y, enemyType === "bird" ? "SLASH" : "+26");
  const carriedUpwardSpeed = Math.max(
    state.player.wallSide === null ? -state.player.vy : 0,
    WALL_RUN_SPEED * (1 + state.speedRamp * 0.12)
  );
  preserveAirMomentum(state, JUMP_VX * 0.9);
  state.player.vy = -Math.max(520, carriedUpwardSpeed);
  state.player.trailMs = 180;
  state.screenShakeMs = Math.max(state.screenShakeMs, 120);
  state.hitStopMs = Math.max(state.hitStopMs, 50);
  awardSlash(state, x, y, enemyType === "bird" ? "#d1f3ff" : "#ffffff");
  state.statusText = `${enemyType === "bird" ? "Bird" : enemyType === "squirrel" ? "Squirrel" : "Enemy ninja"} down. Keep the rhythm.`;

  if (state.streakCount >= 3) {
    state.bonusTimerMs = BONUS_TIME_MS;
    state.bonusLabel = enemyType === "bird" ? "Sky Break" : enemyType === "squirrel" ? "Wild Rush" : "Shadow Chain";
    state.empoweredUntilLand = true;
    preserveAirMomentum(state, JUMP_VX * 0.92);
    state.player.vy = -820;
    extendCombo(state, 2);
    bumpScore(state, 90, x, y - 20, state.bonusLabel.toUpperCase());
    state.statusText = `${state.bonusLabel} triggered. Ride the mega-jump.`;
  }
}

function consumeShield(state: NinjumpState, reason: string) {
  if (!state.player.shielded) {
    return false;
  }
  state.player.shielded = false;
  state.player.shieldFlashMs = SHIELD_FLASH_MS;
  state.screenShakeMs = Math.max(state.screenShakeMs, 90);
  state.hitStopMs = Math.max(state.hitStopMs, 36);
  state.combo = 0;
  state.streakType = null;
  state.streakCount = 0;
  state.statusText = `${reason} Shield absorbed the hit.`;
  awardPopup(state, state.player.x, state.player.y - 42, "SHIELD", "#8ef8ff");
  return true;
}

function killPlayer(state: NinjumpState, reason: string) {
  if (!state.player.alive) {
    return;
  }
  if (hasStartMercy(state)) {
    preserveAirMomentum(state, JUMP_VX * 0.84);
    state.player.vy = Math.min(state.player.vy, -320);
    state.player.trailMs = 160;
    state.screenShakeMs = Math.max(state.screenShakeMs, 70);
    awardPopup(state, state.player.x, state.player.y - 52, "MERCY", "#ffe9a6");
    state.statusText = "Opening grace saved the run.";
    return;
  }
  if (consumeShield(state, reason)) {
    preserveAirMomentum(state, JUMP_VX * 0.82);
    state.player.vy = Math.min(state.player.vy, -280);
    return;
  }

  state.phase = "gameOver";
  state.player.alive = false;
  state.player.wallSide = null;
  state.player.vx = state.player.facing * 44;
  state.player.vy = -180;
  state.player.deathTimerMs = 0;
  state.gameOverReason = reason;
  state.statusText = reason;
}

function createBarrier(state: NinjumpState, y: number, difficulty: number): BarrierHazard {
  const side: WallSide = random(state.rngState + y * 0.01) > 0.5 ? "left" : "right";
  const colors = ["#d14632", "#3f57c5", "#6e2dc9", "#101828", "#cb4731"];
  return {
    id: state.nextHazardId++,
    kind: "barrier",
    y,
    side,
    width: randBetween(state.rngState + y, 32, 66 + difficulty * 2),
    height: randBetween(state.rngState + y * 2, 18, 28),
    color: colors[Math.floor(random(state.rngState + y * 0.4) * colors.length) % colors.length]
  };
}

function createWallEnemy(state: NinjumpState, y: number, enemyType: "ninja" | "squirrel"): WallEnemyHazard {
  return {
    id: state.nextHazardId++,
    kind: "wall-enemy",
    enemyType,
    y,
    side: random(state.rngState + y * 0.2) > 0.5 ? "left" : "right",
    xOffset: randBetween(state.rngState + y * 0.08, 8, 24),
    bobPhase: randBetween(state.rngState + y * 0.11, 0, Math.PI * 2)
  };
}

function createBird(state: NinjumpState, y: number, difficulty: number): BirdHazard {
  const margin = 28;
  return {
    id: state.nextHazardId++,
    kind: "bird",
    enemyType: "bird",
    x: randBetween(state.rngState + y * 0.17, PLAYFIELD_LEFT + 82 + margin, PLAYFIELD_RIGHT - 82 - margin),
    y,
    vx: randBetween(state.rngState + y * 0.21, -60 - difficulty * 4, 60 + difficulty * 4),
    vy: 240 + difficulty * 24,
    flapPhase: randBetween(state.rngState + y * 0.23, 0, Math.PI * 2)
  };
}

function createStar(state: NinjumpState, y: number, difficulty: number): ProjectileHazard {
  const fromLeft = random(state.rngState + y * 0.31) > 0.5;
  return {
    id: state.nextHazardId++,
    kind: "star",
    x: fromLeft ? PLAYFIELD_LEFT - 24 : PLAYFIELD_RIGHT + 24,
    y,
    vx: fromLeft ? 280 + difficulty * 28 : -(280 + difficulty * 28),
    size: randBetween(state.rngState + y * 0.33, 11, 15),
    spin: randBetween(state.rngState + y * 0.35, 0, Math.PI * 2)
  };
}

function createBomb(state: NinjumpState, y: number, difficulty: number): BombHazard {
  return {
    id: state.nextHazardId++,
    kind: "bomb",
    x: randBetween(state.rngState + y * 0.4, PLAYFIELD_LEFT + 72, PLAYFIELD_RIGHT - 72),
    y,
    radius: 14 + difficulty * 0.6,
    pulse: randBetween(state.rngState + y * 0.43, 0, Math.PI * 2)
  };
}

function createPickup(state: NinjumpState, y: number, pickupType: PickupType): PickupHazard {
  return {
    id: state.nextHazardId++,
    kind: "pickup",
    pickupType,
    x: randBetween(state.rngState + y * 0.5, PLAYFIELD_LEFT + 78, PLAYFIELD_RIGHT - 78),
    y,
    radius: pickupType === "shield" ? 18 : 14,
    collected: false
  };
}

const SPAWN_PATTERNS: SpawnPattern[] = [
  { minScore: 0, maxScore: 160, entries: [{ kind: "bird", yOffset: 0 }] },
  { minScore: 0, maxScore: 180, entries: [{ kind: "wall-ninja", yOffset: 0 }] },
  { minScore: 0, maxScore: 240, entries: [{ kind: "barrier", yOffset: 0 }] },
  { minScore: 0, maxScore: 220, entries: [{ kind: "shield", yOffset: 0 }] },
  { minScore: 80, maxScore: 300, entries: [{ kind: "bird", yOffset: 0 }, { kind: "wall-ninja", yOffset: -84 }] },
  { minScore: 120, maxScore: 420, entries: [{ kind: "bird", yOffset: 0 }, { kind: "orb", yOffset: -64 }] },
  { minScore: 160, maxScore: 520, entries: [{ kind: "wall-ninja", yOffset: 0 }, { kind: "bird", yOffset: -92 }] },
  { minScore: 180, maxScore: 520, entries: [{ kind: "barrier", yOffset: 0 }, { kind: "wall-ninja", yOffset: -84 }] },
  { minScore: 220, maxScore: 620, entries: [{ kind: "wall-squirrel", yOffset: 0 }, { kind: "barrier", yOffset: -74 }] },
  { minScore: 240, maxScore: 9999, entries: [{ kind: "bird", yOffset: 0 }, { kind: "star", yOffset: -62 }] },
  { minScore: 340, maxScore: 9999, entries: [{ kind: "barrier", yOffset: 0 }, { kind: "bird", yOffset: -96 }] },
  { minScore: 420, maxScore: 9999, entries: [{ kind: "wall-ninja", yOffset: 0 }, { kind: "star", yOffset: -70 }] },
  { minScore: 520, maxScore: 9999, entries: [{ kind: "bomb", yOffset: 0 }, { kind: "bird", yOffset: -100 }] },
  { minScore: 640, maxScore: 9999, entries: [{ kind: "wall-squirrel", yOffset: 0 }, { kind: "bomb", yOffset: -84 }, { kind: "orb", yOffset: -144 }] },
  { minScore: 760, maxScore: 9999, entries: [{ kind: "bird", yOffset: 0 }, { kind: "bird", yOffset: -108 }] },
  { minScore: 760, maxScore: 9999, entries: [{ kind: "shield", yOffset: 0 }] }
];

function spawnEntry(state: NinjumpState, kind: SpawnEntryKind, y: number, difficulty: number) {
  switch (kind) {
    case "bird":
      state.hazards.push(createBird(state, y, difficulty));
      break;
    case "wall-ninja":
      state.hazards.push(createWallEnemy(state, y, "ninja"));
      break;
    case "wall-squirrel":
      state.hazards.push(createWallEnemy(state, y, "squirrel"));
      break;
    case "barrier":
      state.hazards.push(createBarrier(state, y, difficulty));
      break;
    case "star":
      state.hazards.push(createStar(state, y, difficulty));
      break;
    case "bomb":
      state.hazards.push(createBomb(state, y, difficulty));
      break;
    case "shield":
      state.hazards.push(createPickup(state, y, "shield"));
      break;
    case "orb":
      state.hazards.push(createPickup(state, y, "orb"));
      break;
  }
}

function spawnBand(state: NinjumpState) {
  const difficulty = 1 + Math.min(14, state.score / 145);
  const y = state.nextSpawnY;
  const availablePatterns = SPAWN_PATTERNS.filter((pattern) => state.score >= pattern.minScore && state.score < pattern.maxScore);
  const filteredPatterns = availablePatterns.filter((pattern) => {
    if (!hasStartMercy(state)) {
      return true;
    }
    const hasBomb = pattern.entries.some((entry) => entry.kind === "bomb");
    const hasStar = pattern.entries.some((entry) => entry.kind === "star");
    const hasBarrier = pattern.entries.some((entry) => entry.kind === "barrier");
    const enemyCount = pattern.entries.filter((entry) => entry.kind === "bird" || entry.kind === "wall-ninja" || entry.kind === "wall-squirrel").length;
    const pickupCount = pattern.entries.filter((entry) => entry.kind === "shield" || entry.kind === "orb").length;

    if (hasBomb || hasStar) {
      return false;
    }
    if (hasBarrier && enemyCount > 0) {
      return false;
    }
    return enemyCount <= 1 || pickupCount > 0;
  });
  const patternPool = filteredPatterns.length > 0 ? filteredPatterns : availablePatterns;
  const patternIndex = Math.floor(random(state.rngState + y * 0.01) * patternPool.length) % patternPool.length;
  const pattern = patternPool[patternIndex];

  for (const entry of pattern.entries) {
    spawnEntry(state, entry.kind, y + entry.yOffset, difficulty);
  }

  state.nextSpawnY -= randBetween(state.rngState + y * 0.07, 118, Math.max(144, 188 - difficulty * 4.8));
  state.rngState += 9973;
}

function ensureHazards(state: NinjumpState) {
  while (state.nextSpawnY > state.cameraY - SPAWN_BUFFER) {
    spawnBand(state);
  }

  state.hazards = state.hazards.filter((hazard) => {
    if (hazard.kind === "pickup") {
      return !hazard.collected && hazard.y < state.cameraY + NINJUMP_HEIGHT + 180;
    }
    return hazard.y < state.cameraY + NINJUMP_HEIGHT + 220;
  });
}

function updateMovingHazards(state: NinjumpState, deltaMs: number) {
  const dt = deltaMs / 1000;
  for (const hazard of state.hazards) {
    if (hazard.kind === "bird") {
      hazard.x += hazard.vx * dt;
      hazard.y += hazard.vy * dt;
      hazard.x = clamp(hazard.x, PLAYFIELD_LEFT + 34, PLAYFIELD_RIGHT - 34);
    } else if (hazard.kind === "star") {
      hazard.x += hazard.vx * dt;
      hazard.spin += dt * 8;
    }
  }

  state.hazards = state.hazards.filter((hazard) => {
    if (hazard.kind === "bird") {
      return hazard.x > PLAYFIELD_LEFT - 120 && hazard.x < PLAYFIELD_RIGHT + 120 && hazard.y < state.cameraY + NINJUMP_HEIGHT + 120;
    }
    if (hazard.kind === "star") {
      return hazard.x > PLAYFIELD_LEFT - 100 && hazard.x < PLAYFIELD_RIGHT + 100;
    }
    return true;
  });
}

function attachToWall(state: NinjumpState, side: WallSide) {
  state.player.wallSide = side;
  state.empoweredUntilLand = false;
  state.player.x = getWallX(side);
  state.player.vx = 0;
  state.player.vy = -Math.max(WALL_ATTACH_BOOST, WALL_RUN_SPEED * (1 + state.speedRamp * 0.04));
  state.player.facing = side === "left" ? 1 : -1;
  state.player.trailMs = 150;
  state.player.spinMs = 0;
  extendCombo(state, 1);
  state.score += 4 + Math.floor(state.combo * 1.2);
}

function updatePlayer(state: NinjumpState, input: NinjumpInput, deltaMs: number) {
  const dt = deltaMs / 1000;
  const speedScale = 1.08 + Math.min(1.55, state.score / 1100);

  if (state.player.alive && input.jumpQueued && state.player.wallSide) {
    const direction = state.player.wallSide === "left" ? 1 : -1;
    const carriedUpwardSpeed = WALL_RUN_SPEED * speedScale;
    state.player.wallSide = null;
    state.player.vx = JUMP_VX * direction * speedScale;
    state.player.vy = -Math.max(JUMP_VY, carriedUpwardSpeed + 140);
    state.player.facing = direction;
    state.player.trailMs = 220;
    state.player.spinMs = 240;
    state.statusText = "Leap.";
  }

  if (state.player.wallSide) {
    state.player.y -= WALL_RUN_SPEED * speedScale * dt;
  } else {
    state.player.vy += GRAVITY * dt;
    state.player.x += state.player.vx * dt;
    state.player.y += state.player.vy * dt;
  }

  if (!state.player.wallSide) {
    if (state.player.x <= getWallX("left")) {
      attachToWall(state, "left");
    } else if (state.player.x >= getWallX("right")) {
      attachToWall(state, "right");
    }
  }

  state.player.animationMs += deltaMs;
  state.player.trailMs = Math.max(0, state.player.trailMs - deltaMs);
  state.player.shieldFlashMs = Math.max(0, state.player.shieldFlashMs - deltaMs);
  state.player.spinMs = Math.max(0, state.player.spinMs - deltaMs);

  const climbed = Math.max(0, state.startY - state.player.y);
  state.bestHeight = Math.max(state.bestHeight, climbed);
  state.score = Math.max(state.score, Math.floor(climbed / 13));
  state.speedRamp = 1 + Math.floor(state.score / 180);
  state.cameraY = Math.min(state.cameraY, lerp(state.cameraY, state.player.y - NINJUMP_HEIGHT * 0.38, 0.2));

  if (state.player.y > state.cameraY + NINJUMP_HEIGHT - FALL_MARGIN) {
    killPlayer(state, "You fell out of the climb.");
  }
}

function updateTimers(state: NinjumpState, deltaMs: number) {
  state.mercyTimerMs = Math.max(0, state.mercyTimerMs - deltaMs);

  if (state.comboTimerMs > 0) {
    state.comboTimerMs -= deltaMs;
    if (state.comboTimerMs <= 0) {
      state.combo = 0;
    }
  }

  if (state.bonusTimerMs > 0) {
    state.bonusTimerMs = Math.max(0, state.bonusTimerMs - deltaMs);
    if (state.bonusTimerMs <= 0) {
      state.bonusLabel = "";
    }
  }

  state.screenShakeMs = Math.max(0, state.screenShakeMs - deltaMs);
  state.hitStopMs = Math.max(0, state.hitStopMs - deltaMs);
}

function handleHazardCollision(state: NinjumpState, hazard: Hazard) {
  const player = getPlayerBounds(state);
  const empowered = state.empoweredUntilLand && state.player.wallSide === null;

  if (hazard.kind === "barrier") {
    const x = hazard.side === "left" ? PLAYFIELD_LEFT : PLAYFIELD_RIGHT - hazard.width;
    const insetX = Math.max(4, hazard.width * 0.14);
    const insetY = Math.max(2, hazard.height * 0.18);
    const rect = {
      left: x + insetX,
      right: x + hazard.width - insetX,
      top: hazard.y - hazard.height / 2 + insetY,
      bottom: hazard.y + hazard.height / 2 - insetY
    };
    if (intersectsRect(player, rect)) {
      if (empowered) {
        bumpScore(state, 18, x + hazard.width / 2, hazard.y, "BREAK");
        awardSlash(state, x + hazard.width / 2, hazard.y, "#ffe6b8");
        state.screenShakeMs = Math.max(state.screenShakeMs, 90);
        return true;
      }
      killPlayer(state, "A ledge clipped the run.");
      return true;
    }
    return false;
  }

  if (hazard.kind === "wall-enemy") {
    const x = hazard.side === "left"
      ? PLAYFIELD_LEFT + hazard.xOffset
      : PLAYFIELD_RIGHT - hazard.xOffset;
    const halfWidth = hazard.enemyType === "ninja" ? 14 : 12;
    const top = hazard.enemyType === "ninja" ? hazard.y - 16 : hazard.y - 13;
    const bottom = hazard.enemyType === "ninja" ? hazard.y + 18 : hazard.y + 13;
    const rect = {
      left: x - halfWidth,
      right: x + halfWidth,
      top,
      bottom
    };
    if (!intersectsRect(player, rect)) {
      return false;
    }

    if (empowered || isAirborneKillWindow(state)) {
      registerEnemyDefeat(state, hazard.enemyType, x, hazard.y);
      return true;
    }

    killPlayer(state, hazard.enemyType === "ninja" ? "Enemy ninja caught you on the wall." : "A squirrel broke your line.");
    return true;
  }

  if (hazard.kind === "bird") {
    const birdCenterX = hazard.x;
    const birdCenterY = hazard.y + 1;
    const hitRadius = 14;
    if (distSq(state.player.x, state.player.y - 26, birdCenterX, birdCenterY) > (hitRadius + 14) * (hitRadius + 14)) {
      return false;
    }

    if (empowered || isAirborneKillWindow(state)) {
      registerEnemyDefeat(state, "bird", birdCenterX, birdCenterY);
      return true;
    }

    killPlayer(state, "A dive-bombing bird knocked you out.");
    return true;
  }

  if (hazard.kind === "star") {
    const hitRadius = Math.max(8, hazard.size - 2);
    if (distSq(state.player.x, state.player.y - 28, hazard.x, hazard.y) > (hitRadius + 12) * (hitRadius + 12)) {
      return false;
    }
    if (empowered) {
      bumpScore(state, 14, hazard.x, hazard.y, "CUT");
      awardSlash(state, hazard.x, hazard.y, "#d7f5ff");
      return true;
    }
    killPlayer(state, "A throwing star caught you.");
    return true;
  }

  if (hazard.kind === "bomb") {
    const coreRadius = Math.max(12, hazard.radius - 2);
    if (distSq(state.player.x, state.player.y - 20, hazard.x, hazard.y) > (coreRadius + 13) * (coreRadius + 13)) {
      return false;
    }
    if (empowered) {
      bumpScore(state, 22, hazard.x, hazard.y, "BOOM");
      awardSlash(state, hazard.x, hazard.y, "#ffd9b3");
      state.screenShakeMs = Math.max(state.screenShakeMs, 120);
      return true;
    }
    killPlayer(state, "You triggered a bomb.");
    return true;
  }

  if (hazard.collected) {
    return false;
  }

  if (distSq(state.player.x, state.player.y - 22, hazard.x, hazard.y) > (hazard.radius + 16) * (hazard.radius + 16)) {
    return false;
  }

  hazard.collected = true;
  if (hazard.pickupType === "shield") {
    state.player.shielded = true;
    awardPopup(state, hazard.x, hazard.y, "SHIELD UP", "#8ef8ff");
    state.statusText = "Shield up. One mistake is forgiven.";
  } else {
    bumpScore(state, 20, hazard.x, hazard.y, "+20");
    state.statusText = "Score pickup.";
  }
  return false;
}

function collideHazards(state: NinjumpState) {
  const remaining: Hazard[] = [];

  for (const hazard of state.hazards) {
    const remove = handleHazardCollision(state, hazard);
    if (!remove) {
      remaining.push(hazard);
    }
  }

  state.hazards = remaining;
}

function updateEffects(state: NinjumpState, deltaMs: number) {
  state.slashEffects = state.slashEffects
    .map((effect) => ({ ...effect, lifeMs: effect.lifeMs - deltaMs }))
    .filter((effect) => effect.lifeMs > 0);

  state.popups = state.popups
    .map((popup) => ({
      ...popup,
      y: popup.y + (popup.vy * deltaMs) / 1000,
      lifeMs: popup.lifeMs - deltaMs
    }))
    .filter((popup) => popup.lifeMs > 0);
}

export function createInitialNinjumpState(seed: number): NinjumpState {
  const startY = 618;
  return {
    seed,
    phase: "title",
    player: {
      x: getWallX("left"),
      y: startY,
      vx: 0,
      vy: 0,
      wallSide: "left",
      facing: 1,
      alive: true,
      shielded: false,
      shieldFlashMs: 0,
      animationMs: 0,
      spinMs: 0,
      deathTimerMs: 0,
      trailMs: 0
    },
    cameraY: startY - 418,
    startY,
    score: 0,
    bestHeight: 0,
    combo: 0,
    bestCombo: 0,
    comboTimerMs: 0,
    elapsedMs: 0,
    speedRamp: 1,
    statusText: "Tap, click, or press space to leap across the shaft.",
    gameOverReason: "",
    nextSpawnY: startY - 200,
    nextHazardId: 1,
    hazards: [],
    slashEffects: [],
    popups: [],
    rngState: seed,
    streakType: null,
    streakCount: 0,
    bonusTimerMs: 0,
    bonusLabel: "",
    empoweredUntilLand: false,
    mercyTimerMs: START_MERCY_MS,
    screenShakeMs: 0,
    hitStopMs: 0
  };
}

export function stepNinjumpState(state: NinjumpState, input: NinjumpInput, deltaMs: number) {
  const clampedDelta = Math.min(MAX_DELTA_MS, deltaMs);
  state.elapsedMs += clampedDelta;

  if (state.phase === "title") {
    state.phase = "playing";
  }

  updateTimers(state, clampedDelta);

  if (state.hitStopMs > 0) {
    updateEffects(state, clampedDelta);
    return;
  }

  if (!state.player.alive) {
    const dt = clampedDelta / 1000;
    state.player.vy += GRAVITY * dt * 0.4;
    state.player.x += state.player.vx * dt;
    state.player.y += state.player.vy * dt;
    state.player.deathTimerMs += clampedDelta;
    updateEffects(state, clampedDelta);
    return;
  }

  updatePlayer(state, input, clampedDelta);
  updateMovingHazards(state, clampedDelta);
  ensureHazards(state);
  collideHazards(state);
  updateEffects(state, clampedDelta);
}

export function getNinjumpHud(state: NinjumpState): HudSnapshot {
  return {
    score: state.score,
    height: Math.floor(state.bestHeight / 10),
    combo: state.combo,
    bestCombo: state.bestCombo,
    shielded: state.player.shielded,
    streakType: state.streakType,
    streakCount: state.streakCount,
    bonusTimerMs: state.bonusTimerMs,
    bonusLabel: state.bonusLabel,
    tierLabel: getTierLabel(state.score)
  };
}

function drawPagoda(ctx: CanvasRenderingContext2D, x: number, baseY: number, scale: number, color: string) {
  const roofWidth = 112 * scale;
  const tierHeight = 24 * scale;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, baseY - 126 * scale);
  ctx.lineTo(x - 13 * scale, baseY - 18 * scale);
  ctx.lineTo(x + 13 * scale, baseY - 18 * scale);
  ctx.closePath();
  ctx.fill();

  for (let tier = 0; tier < 3; tier += 1) {
    const y = baseY - tier * 40 * scale;
    const width = roofWidth - tier * 18 * scale;
    ctx.beginPath();
    ctx.moveTo(x - width / 2, y);
    ctx.quadraticCurveTo(x, y - tierHeight, x + width / 2, y);
    ctx.lineTo(x + width * 0.34, y + 8 * scale);
    ctx.lineTo(x - width * 0.34, y + 8 * scale);
    ctx.closePath();
    ctx.fill();
  }

  ctx.fillRect(x - 10 * scale, baseY - 16 * scale, 20 * scale, 96 * scale);
}

function renderBackground(ctx: CanvasRenderingContext2D, state: NinjumpState, palette: Palette) {
  const gradient = ctx.createLinearGradient(0, 0, 0, NINJUMP_HEIGHT);
  gradient.addColorStop(0, palette.skyTop);
  gradient.addColorStop(1, palette.skyBottom);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, NINJUMP_WIDTH, NINJUMP_HEIGHT);

  const farOffset = ((state.cameraY * 0.08) % 220 + 220) % 220;
  ctx.fillStyle = palette.mountainFar;
  for (let i = -1; i < 4; i += 1) {
    const x = i * 160 - farOffset;
    ctx.beginPath();
    ctx.moveTo(x, NINJUMP_HEIGHT);
    ctx.lineTo(x + 70, 280);
    ctx.lineTo(x + 150, NINJUMP_HEIGHT);
    ctx.closePath();
    ctx.fill();
  }

  const nearOffset = ((state.cameraY * 0.15) % 180 + 180) % 180;
  ctx.fillStyle = palette.mountainNear;
  for (let i = -1; i < 4; i += 1) {
    const x = i * 172 - nearOffset;
    ctx.beginPath();
    ctx.moveTo(x, NINJUMP_HEIGHT);
    ctx.lineTo(x + 84, 352);
    ctx.lineTo(x + 170, NINJUMP_HEIGHT);
    ctx.closePath();
    ctx.fill();
  }

  const pagodaY = 470 + ((state.cameraY * 0.12) % 120);
  drawPagoda(ctx, NINJUMP_WIDTH * 0.52, pagodaY, 1.18, palette.pagoda);
  drawPagoda(ctx, NINJUMP_WIDTH * 0.2, pagodaY + 126, 0.8, palette.pagoda);
  drawPagoda(ctx, NINJUMP_WIDTH * 0.84, pagodaY + 146, 0.76, palette.pagoda);

  ctx.fillStyle = palette.mist;
  for (let i = 0; i < 5; i += 1) {
    const y = (i * 144 + ((state.cameraY * 0.22) % 144) + 144) % (NINJUMP_HEIGHT + 36) - 18;
    ctx.fillRect(0, y, NINJUMP_WIDTH, 22);
  }

  ctx.fillStyle = "rgba(11,19,14,0.16)";
  ctx.fillRect(0, 0, NINJUMP_WIDTH, NINJUMP_HEIGHT);
}

function renderWalls(ctx: CanvasRenderingContext2D, palette: Palette) {
  ctx.fillStyle = palette.trim;
  ctx.fillRect(0, 0, PLAYFIELD_LEFT, NINJUMP_HEIGHT);
  ctx.fillRect(PLAYFIELD_RIGHT, 0, NINJUMP_WIDTH - PLAYFIELD_RIGHT, NINJUMP_HEIGHT);

  ctx.fillStyle = palette.wall;
  ctx.fillRect(8, 0, PLAYFIELD_LEFT - 16, NINJUMP_HEIGHT);
  ctx.fillRect(PLAYFIELD_RIGHT + 8, 0, NINJUMP_WIDTH - PLAYFIELD_RIGHT - 16, NINJUMP_HEIGHT);

  ctx.strokeStyle = "rgba(255,243,212,0.36)";
  ctx.lineWidth = 2;
  for (let y = -22; y < NINJUMP_HEIGHT + 40; y += 38) {
    ctx.beginPath();
    ctx.moveTo(8, y);
    ctx.lineTo(PLAYFIELD_LEFT - 8, y + 10);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(PLAYFIELD_RIGHT + 8, y + 10);
    ctx.lineTo(NINJUMP_WIDTH - 8, y);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(77,46,24,0.84)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(PLAYFIELD_LEFT, 0);
  ctx.lineTo(PLAYFIELD_LEFT, NINJUMP_HEIGHT);
  ctx.moveTo(PLAYFIELD_RIGHT, 0);
  ctx.lineTo(PLAYFIELD_RIGHT, NINJUMP_HEIGHT);
  ctx.stroke();
}

function renderBarrier(ctx: CanvasRenderingContext2D, barrier: BarrierHazard, state: NinjumpState) {
  const screenY = barrier.y - state.cameraY;
  const x = barrier.side === "left" ? PLAYFIELD_LEFT : PLAYFIELD_RIGHT - barrier.width;
  ctx.fillStyle = barrier.color;
  ctx.fillRect(x, screenY - barrier.height / 2, barrier.width, barrier.height);
  ctx.fillStyle = "rgba(255,255,255,0.28)";
  ctx.fillRect(x + 4, screenY - barrier.height / 2 + 4, barrier.width - 8, 4);
}

function renderWallEnemy(
  ctx: CanvasRenderingContext2D,
  enemy: WallEnemyHazard,
  state: NinjumpState,
  sprites: NinjumpSprites
) {
  const screenY = enemy.y - state.cameraY + Math.sin(state.elapsedMs * 0.006 + enemy.bobPhase) * 3;
  const x = enemy.side === "left" ? PLAYFIELD_LEFT + enemy.xOffset : PLAYFIELD_RIGHT - enemy.xOffset;
  ctx.save();
  ctx.translate(x, screenY);
  if (enemy.side === "right") {
    ctx.scale(-1, 1);
  }
  if (enemy.enemyType === "ninja") {
    const frames = sprites.run;
    const frameIndex = Math.floor(state.elapsedMs / 140) % frames.length;
    const image = frames[frameIndex] ?? frames[0];
    ctx.filter = "hue-rotate(120deg) saturate(0.9) brightness(0.9)";
    ctx.drawImage(image, -24, -30, 48, 60);
    ctx.filter = "none";
  } else {
    ctx.fillStyle = "#705025";
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-16, -5, 10, 6);
    ctx.fillRect(6, -5, 10, 6);
    ctx.fillStyle = "#f6d8a0";
    ctx.beginPath();
    ctx.arc(0, -2, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function renderBird(ctx: CanvasRenderingContext2D, bird: BirdHazard, state: NinjumpState) {
  const wing = Math.sin(state.elapsedMs * 0.016 + bird.flapPhase) * 10;
  const screenY = bird.y - state.cameraY;
  const shadowY = Math.min(NINJUMP_HEIGHT - 18, screenY + 54);
  ctx.fillStyle = "rgba(16, 24, 39, 0.16)";
  ctx.beginPath();
  ctx.ellipse(bird.x, shadowY, 18, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.translate(bird.x, screenY);
  if (bird.vx < 0) {
    ctx.scale(-1, 1);
  }
  ctx.fillStyle = "#3876d8";
  ctx.beginPath();
  ctx.moveTo(-16, 0);
  ctx.quadraticCurveTo(-4, -10 - wing, 2, -2);
  ctx.quadraticCurveTo(10, -12, 16, 0);
  ctx.quadraticCurveTo(8, 8 + wing * 0.4, 0, 6);
  ctx.quadraticCurveTo(-8, 8 + wing * 0.4, -16, 0);
  ctx.fill();
  ctx.fillStyle = "#e7f4ff";
  ctx.fillRect(2, -3, 5, 3);
  ctx.restore();
}

function renderStar(ctx: CanvasRenderingContext2D, star: ProjectileHazard, state: NinjumpState) {
  const screenY = star.y - state.cameraY;
  const warningEdge = star.vx > 0 ? PLAYFIELD_LEFT + 10 : PLAYFIELD_RIGHT - 10;
  const warningAlpha = 0.28 + 0.2 * Math.sin(state.elapsedMs * 0.025 + star.spin);
  ctx.strokeStyle = `rgba(255, 235, 166, ${warningAlpha})`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(warningEdge, screenY - 12);
  ctx.lineTo(warningEdge, screenY + 12);
  ctx.stroke();
  ctx.fillStyle = `rgba(255, 235, 166, ${warningAlpha * 0.9})`;
  ctx.beginPath();
  ctx.moveTo(warningEdge + (star.vx > 0 ? 0 : -10), screenY);
  ctx.lineTo(warningEdge + (star.vx > 0 ? 10 : 0), screenY - 7);
  ctx.lineTo(warningEdge + (star.vx > 0 ? 10 : 0), screenY + 7);
  ctx.closePath();
  ctx.fill();
  ctx.save();
  ctx.translate(star.x, screenY);
  ctx.rotate(star.spin + state.elapsedMs * 0.012);
  ctx.fillStyle = "#0f172a";
  for (let i = 0; i < 4; i += 1) {
    ctx.rotate(Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(0, -star.size);
    ctx.lineTo(star.size * 0.35, 0);
    ctx.lineTo(0, star.size);
    ctx.lineTo(-star.size * 0.35, 0);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function renderBomb(ctx: CanvasRenderingContext2D, bomb: BombHazard, state: NinjumpState) {
  const screenY = bomb.y - state.cameraY;
  const pulse = (Math.sin(state.elapsedMs * 0.01 + bomb.pulse) + 1) * 0.5;
  ctx.strokeStyle = `rgba(255, 208, 153, ${0.25 + pulse * 0.25})`;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(bomb.x, screenY, bomb.radius + 10 + pulse * 8, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#1f2937";
  ctx.beginPath();
  ctx.arc(bomb.x, screenY, bomb.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ff7a3d";
  ctx.fillRect(bomb.x - 2, screenY - bomb.radius - 10, 4, 10);
  ctx.fillStyle = pulse > 0.55 ? "#ffd28c" : "#ff8a4c";
  ctx.beginPath();
  ctx.arc(bomb.x, screenY, 4 + pulse * 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = `rgba(255, 126, 61, ${0.32 + pulse * 0.36})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(bomb.x, screenY, bomb.radius + 18 + pulse * 10, 0, Math.PI * 2);
  ctx.stroke();
}

function renderPickup(ctx: CanvasRenderingContext2D, pickup: PickupHazard, state: NinjumpState, palette: Palette) {
  if (pickup.collected) {
    return;
  }
  const screenY = pickup.y - state.cameraY;
  ctx.strokeStyle = palette.glow;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(pickup.x, screenY, pickup.radius + 7, 0, Math.PI * 2);
  ctx.stroke();

  if (pickup.pickupType === "shield") {
    ctx.fillStyle = "#8ef8ff";
    ctx.beginPath();
    ctx.moveTo(pickup.x, screenY - 18);
    ctx.lineTo(pickup.x + 12, screenY - 8);
    ctx.lineTo(pickup.x + 8, screenY + 12);
    ctx.lineTo(pickup.x, screenY + 18);
    ctx.lineTo(pickup.x - 8, screenY + 12);
    ctx.lineTo(pickup.x - 12, screenY - 8);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.fillStyle = "#fff0a6";
    ctx.beginPath();
    ctx.arc(pickup.x, screenY, pickup.radius - 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function renderHazards(ctx: CanvasRenderingContext2D, state: NinjumpState, palette: Palette, sprites: NinjumpSprites) {
  for (const hazard of state.hazards) {
    const screenY = hazard.y - state.cameraY;
    if (screenY < -100 || screenY > NINJUMP_HEIGHT + 100) {
      continue;
    }

    if (hazard.kind === "barrier") {
      renderBarrier(ctx, hazard, state);
    } else if (hazard.kind === "wall-enemy") {
      renderWallEnemy(ctx, hazard, state, sprites);
    } else if (hazard.kind === "bird") {
      renderBird(ctx, hazard, state);
    } else if (hazard.kind === "star") {
      renderStar(ctx, hazard, state);
    } else if (hazard.kind === "bomb") {
      renderBomb(ctx, hazard, state);
    } else {
      renderPickup(ctx, hazard, state, palette);
    }
  }
}

function getPlayerFrame(state: NinjumpState, sprites: NinjumpSprites) {
  if (!state.player.alive) {
    return sprites.dead;
  }
  if (state.phase === "title") {
    return sprites.idle;
  }
  if (!state.player.wallSide) {
    return sprites.jump;
  }
  return sprites.run;
}

function renderPlayer(ctx: CanvasRenderingContext2D, state: NinjumpState, sprites: NinjumpSprites) {
  const frames = getPlayerFrame(state, sprites);
  const frameIndex = Math.floor(state.player.animationMs / (state.player.wallSide ? 78 : 94)) % frames.length;
  const image = frames[frameIndex] ?? frames[0];
  const screenX = state.player.x;
  const screenY = state.player.y - state.cameraY;

  if (state.player.trailMs > 0 && state.player.alive) {
    ctx.fillStyle = "rgba(255,255,255,0.16)";
    for (let i = 1; i <= 3; i += 1) {
      const offset = i * 16;
      ctx.beginPath();
      ctx.arc(screenX - state.player.facing * offset * 0.18, screenY + offset, 12 - i * 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (state.player.shielded || state.player.shieldFlashMs > 0) {
    const alpha = state.player.shielded ? 0.38 : state.player.shieldFlashMs / SHIELD_FLASH_MS;
    ctx.strokeStyle = `rgba(142,248,255,${alpha})`;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(screenX, screenY - 22, 34, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (hasStartMercy(state)) {
    const alpha = 0.36 + 0.14 * Math.sin(state.elapsedMs * 0.02);
    ctx.strokeStyle = `rgba(255,233,166,${alpha})`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(screenX, screenY - 22, 42, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.save();
  ctx.translate(screenX, screenY - 12);
  if (state.player.wallSide === "left") {
    ctx.rotate(Math.PI / 2);
    ctx.scale(-1, 1);
  } else if (state.player.wallSide === "right") {
    ctx.rotate(-Math.PI / 2);
  } else {
    const spinProgress = state.player.spinMs > 0 ? (1 - state.player.spinMs / 240) * Math.PI * 2 : 0;
    ctx.rotate(clamp(state.player.vx / 700, -0.45, 0.45) + spinProgress * state.player.facing);
    if (state.player.facing < 0) {
      ctx.scale(-1, 1);
    }
  }
  ctx.drawImage(image, -PLAYER_DRAW_WIDTH / 2, -PLAYER_DRAW_HEIGHT / 2, PLAYER_DRAW_WIDTH, PLAYER_DRAW_HEIGHT);
  ctx.restore();
}

function renderSlashEffects(ctx: CanvasRenderingContext2D, state: NinjumpState) {
  for (const effect of state.slashEffects) {
    const progress = 1 - effect.lifeMs / effect.maxLifeMs;
    const alpha = effect.lifeMs / effect.maxLifeMs;
    const screenY = effect.y - state.cameraY;
    ctx.strokeStyle = effect.color === "#d1f3ff"
      ? `rgba(209,243,255,${alpha})`
      : `rgba(255,255,255,${alpha})`;
    ctx.lineWidth = 5 - progress * 2;
    ctx.beginPath();
    ctx.arc(effect.x, screenY, 14 + progress * 32, Math.PI * 0.18, Math.PI * 1.42);
    ctx.stroke();
  }
}

function renderPopups(ctx: CanvasRenderingContext2D, state: NinjumpState) {
  ctx.font = 'bold 13px "PublicPixel", monospace';
  ctx.textAlign = "center";
  for (const popup of state.popups) {
    const alpha = popup.lifeMs / popup.maxLifeMs;
    ctx.fillStyle = popup.color;
    ctx.globalAlpha = alpha;
    ctx.fillText(popup.text, popup.x, popup.y - state.cameraY);
  }
  ctx.globalAlpha = 1;
}

export function renderNinjumpScene(ctx: CanvasRenderingContext2D, state: NinjumpState, sprites: NinjumpSprites) {
  const palette = getPalette(state.score);
  const shakeX = state.screenShakeMs > 0 ? Math.sin(state.elapsedMs * 0.09) * 3.2 : 0;
  const shakeY = state.screenShakeMs > 0 ? Math.cos(state.elapsedMs * 0.12) * 2.4 : 0;

  ctx.save();
  ctx.translate(shakeX, shakeY);
  renderBackground(ctx, state, palette);
  renderWalls(ctx, palette);
  renderHazards(ctx, state, palette, sprites);
  renderSlashEffects(ctx, state);
  renderPlayer(ctx, state, sprites);
  renderPopups(ctx, state);
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.strokeRect(PLAYFIELD_LEFT, 0, PLAYFIELD_RIGHT - PLAYFIELD_LEFT, NINJUMP_HEIGHT);
  ctx.restore();
}
