import React, { useEffect, useMemo, useRef, useState } from "react";
import NavBar from "../components/NavBar";
import { recordArcadeResult } from "../lib/progression";

type GamePhase = "title" | "playing" | "gameOver";
type DistrictTier = 0 | 1 | 2 | 3;
type PlayerAction =
  | "running"
  | "jumping"
  | "falling"
  | "sliding"
  | "wallSliding"
  | "grappling"
  | "vaulting";
type SurfaceKind = "roof" | "ledge" | "grapple-bar" | "anchor-wire";
type ObstacleKind = "low-barrier" | "slide-sign" | "air-hazard";
type HookPhase = "idle" | "extending" | "attached" | "retracting";

type Vec2 = { x: number; y: number };

type Surface = {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  kind: SurfaceKind;
  reward: number;
};

type Wall = {
  id: string;
  x: number;
  top: number;
  bottom: number;
};

type Platform = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  lane: "low" | "mid" | "high";
  surface: Surface;
  leftWall: Wall;
  rightWall: Wall;
};

type Obstacle = {
  id: string;
  kind: ObstacleKind;
  x: number;
  y: number;
  width: number;
  height: number;
  lane: "low" | "mid" | "high";
  vaultable?: boolean;
  slideClearance?: boolean;
};

type Pickup = {
  id: string;
  x: number;
  y: number;
  collected: boolean;
  lane: "low" | "mid" | "high";
};

type Chunk = {
  id: number;
  startX: number;
  endX: number;
  platforms: Platform[];
  grappleSurfaces: Surface[];
  walls: Wall[];
  obstacles: Obstacle[];
  pickups: Pickup[];
};

type Contacts = {
  grounded: boolean;
  leftWall: boolean;
  rightWall: boolean;
  underCeiling: boolean;
  platformId: string | null;
};

type HookState = {
  phase: HookPhase;
  origin: Vec2;
  tip: Vec2;
  target: Vec2 | null;
  travelDir: Vec2;
  ropeLength: number;
  ttlMs: number;
  hitSurfaceId: string | null;
};

type FlowState = {
  combo: number;
  bestCombo: number;
  comboTimerMs: number;
  styleScore: number;
  grappleShots: number;
  grappleHits: number;
  topRouteTicks: number;
  missions: string[];
};

type PlayerState = {
  position: Vec2;
  velocity: Vec2;
  action: PlayerAction;
  facing: 1 | -1;
  width: number;
  height: number;
  contacts: Contacts;
  slideTimerMs: number;
  vaultTimerMs: number;
  vaultFrom: Vec2 | null;
  vaultTo: Vec2 | null;
  coyoteMs: number;
  jumpBufferMs: number;
  wallJumpLockMs: number;
  grappleCooldownMs: number;
  hardLandingMs: number;
  hook: HookState;
};

type RunnerState = {
  seed: number;
  player: PlayerState;
  chunks: Chunk[];
  camera: Vec2;
  score: number;
  distance: number;
  coins: number;
  tier: DistrictTier;
  gameOver: boolean;
  reason: string;
  statusText: string;
  flow: FlowState;
  totalTimeMs: number;
  landingPulseMs: number;
  wallScrapeMs: number;
  lastSurfaceKind: SurfaceKind | null;
};

type HudState = {
  score: number;
  distance: number;
  coins: number;
  speed: number;
  districtTier: DistrictTier;
  combo: number;
  bestCombo: number;
  hookReady: boolean;
  hookAccuracy: number;
  styleScore: number;
};

type RunSummary = {
  score: number;
  distance: number;
  coins: number;
  goldEarned: number;
  reason: string;
  bestCombo: number;
  accuracy: number;
  styleScore: number;
};

type InputState = {
  jumpHeld: boolean;
  slideHeld: boolean;
  hookPressed: boolean;
  hookReleased: boolean;
  aimScreen: Vec2;
  aimWorld: Vec2;
};

type SegmentHit = {
  point: Vec2;
  distance: number;
  surface: Surface;
};

type ChunkTemplate = {
  lowGap: number;
  lowWidth: number;
  nextLowY: number;
  midEnabled: boolean;
  midX: number;
  midY: number;
  midWidth: number;
  highEnabled: boolean;
  highX: number;
  highY: number;
  highWidth: number;
  lowBarrier: boolean;
  slideSign: boolean;
  airHazard: boolean;
  poleBar: boolean;
};

const WIDTH = 960;
const HEIGHT = 540;
const PLAYER_SCREEN_X = 250;
const LOCAL_BEST_KEY = "focusland-rooftop-runner-best-v2";
const GRAVITY = 1900;
const BASE_RUN_SPEED = 320;
const MAX_SPEED = 720;
const JUMP_SPEED = 760;
const WALL_SLIDE_SPEED = 170;
const WALL_JUMP_X = 380;
const WALL_JUMP_Y = 760;
const HOOK_SPEED = 1450;
const HOOK_MAX_RANGE = 390;
const HOOK_MISS_COOLDOWN = 220;
const HOOK_HIT_COOLDOWN = 440;
const COYOTE_MS = 110;
const JUMP_BUFFER_MS = 120;
const SLIDE_MS = 380;
const COMBO_DECAY_MS = 1550;
const DISTRICT_THRESHOLDS = [500, 1000, 1500] as const;
const DISTRICT_NAMES = ["Sketch Block", "Pencil Plaza", "Hookline Heights", "Midnight Margin"] as const;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function lerp(from: number, to: number, amount: number) {
  return from + (to - from) * amount;
}

function length(vec: Vec2) {
  return Math.hypot(vec.x, vec.y);
}

function normalize(vec: Vec2) {
  const size = Math.max(0.0001, length(vec));
  return { x: vec.x / size, y: vec.y / size };
}

function noise(seed: number) {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function between(seed: number, min: number, max: number) {
  return min + noise(seed) * (max - min);
}

function getTier(score: number): DistrictTier {
  if (score >= DISTRICT_THRESHOLDS[2]) return 3;
  if (score >= DISTRICT_THRESHOLDS[1]) return 2;
  if (score >= DISTRICT_THRESHOLDS[0]) return 1;
  return 0;
}

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

function getBaseSpeed(tier: DistrictTier) {
  return BASE_RUN_SPEED + tier * 34;
}

function getPlayerHeight(action: PlayerAction) {
  return action === "sliding" ? 34 : 64;
}

function getPlayerBounds(player: PlayerState) {
  const halfWidth = player.width / 2;
  return {
    left: player.position.x - halfWidth,
    right: player.position.x + halfWidth,
    top: player.position.y - player.height,
    bottom: player.position.y
  };
}

function createSurface(id: string, x1: number, y1: number, x2: number, y2: number, kind: SurfaceKind, reward: number): Surface {
  return { id, x1, y1, x2, y2, kind, reward };
}

function makePlatform(id: string, x: number, y: number, width: number, lane: "low" | "mid" | "high"): Platform {
  const height = HEIGHT - y + 130;
  const surfaceKind: SurfaceKind = lane === "high" ? "ledge" : "roof";
  return {
    id,
    x,
    y,
    width,
    height,
    lane,
    surface: createSurface(`${id}-surface`, x, y, x + width, y, surfaceKind, lane === "high" ? 16 : lane === "mid" ? 10 : 6),
    leftWall: { id: `${id}-wall-left`, x, top: y, bottom: y + height },
    rightWall: { id: `${id}-wall-right`, x: x + width, top: y, bottom: y + height }
  };
}

function getChunkTemplate(id: number, seed: number, tier: DistrictTier): ChunkTemplate {
  const routeSeed = id * 97 + seed * 13.37;
  const early = id < 3;
  const midEnabled = early ? id !== 0 : noise(routeSeed + 1) > 0.2 || tier >= 1;
  const highEnabled = early ? id >= 1 : noise(routeSeed + 2) > 0.42 || tier >= 2;

  return {
    lowGap: Math.round(46 + between(routeSeed + 3, 0, tier >= 2 ? 44 : 26)),
    lowWidth: Math.round(228 + between(routeSeed + 4, tier >= 2 ? -12 : 0, 42)),
    nextLowY: 372 + Math.round(between(routeSeed + 5, -14, 14)),
    midEnabled,
    midX: 156 + Math.round(between(routeSeed + 6, -18, 24)),
    midY: 302 + Math.round(between(routeSeed + 7, -14, 10)),
    midWidth: 160 + Math.round(between(routeSeed + 8, -8, 26)),
    highEnabled,
    highX: 330 + Math.round(between(routeSeed + 9, -20, 26)),
    highY: 222 + Math.round(between(routeSeed + 10, -16, 18)),
    highWidth: 148 + Math.round(between(routeSeed + 11, -12, 20)),
    lowBarrier: !early && noise(routeSeed + 12) > 0.46,
    slideSign: tier >= 1 && !early && noise(routeSeed + 13) > 0.54,
    airHazard: tier >= 2 && noise(routeSeed + 14) > 0.7,
    poleBar: tier >= 2 && noise(routeSeed + 15) > 0.4
  };
}

function createChunk(id: number, startX: number, tier: DistrictTier, seed: number): Chunk {
  const platforms: Platform[] = [];
  const grappleSurfaces: Surface[] = [];
  const walls: Wall[] = [];
  const obstacles: Obstacle[] = [];
  const pickups: Pickup[] = [];

  const template = getChunkTemplate(id, seed, tier);
  const lowA = makePlatform(
    `${id}-low-a`,
    startX + 0,
    376 + Math.round(between(id * 11 + seed * 1.7, -8, 10)),
    Math.max(210, template.lowWidth),
    "low"
  );
  const lowB = makePlatform(
    `${id}-low-b`,
    lowA.x + lowA.width + template.lowGap,
    template.nextLowY,
    Math.max(196, template.lowWidth - 18),
    "low"
  );
  platforms.push(lowA, lowB);

  if (template.midEnabled) {
    const mid = makePlatform(
      `${id}-mid`,
      startX + template.midX,
      template.midY,
      template.midWidth,
      "mid"
    );
    platforms.push(mid);
    grappleSurfaces.push(
      createSurface(`${mid.id}-bar`, mid.x + 18, mid.y - 74, mid.x + mid.width - 18, mid.y - 74, "grapple-bar", 18)
    );
    walls.push(mid.leftWall, mid.rightWall);
    pickups.push({
      id: `${mid.id}-coin`,
      x: mid.x + mid.width / 2,
      y: mid.y - 28,
      collected: false,
      lane: "mid"
    });
  }

  if (template.highEnabled) {
    const high = makePlatform(
      `${id}-high`,
      startX + template.highX,
      template.highY,
      template.highWidth,
      "high"
    );
    platforms.push(high);
    grappleSurfaces.push(
      createSurface(`${high.id}-ledge`, high.x + 12, high.y - 88, high.x + high.width - 12, high.y - 88, "anchor-wire", 26),
      createSurface(`${high.id}-bar`, high.x + 28, high.y - 42, high.x + high.width - 20, high.y - 42, "grapple-bar", 22)
    );
    walls.push(high.leftWall, high.rightWall);
    pickups.push({
      id: `${high.id}-coin`,
      x: high.x + high.width / 2,
      y: high.y - 26,
      collected: false,
      lane: "high"
    });
  }

  platforms.forEach((platform) => {
    walls.push(platform.leftWall, platform.rightWall);
  });

  if (template.lowBarrier) {
    obstacles.push({
      id: `${lowB.id}-low`,
      kind: "low-barrier",
      x: lowB.x + lowB.width * 0.62,
      y: lowB.y,
      width: 40,
      height: 24,
      lane: "low",
      vaultable: true
    });
  }

  if (template.slideSign) {
    const slidePlatform = platforms.find((platform) => platform.lane === "mid") ?? lowB;
    obstacles.push({
      id: `${slidePlatform.id}-slide`,
      kind: "slide-sign",
      x: slidePlatform.x + slidePlatform.width * 0.56,
      y: slidePlatform.y - 34,
      width: 70,
      height: 18,
      lane: slidePlatform.lane,
      slideClearance: true
    });
  }

  if (template.airHazard) {
    const airPlatform = platforms.find((platform) => platform.lane === "high") ?? platforms.find((platform) => platform.lane === "mid");
    if (airPlatform) {
      obstacles.push({
        id: `${airPlatform.id}-air`,
        kind: "air-hazard",
        x: airPlatform.x + airPlatform.width * 0.58,
        y: airPlatform.y - between(id * 73 + seed * 3.1, 92, 126),
        width: 42,
        height: 18,
        lane: airPlatform.lane
      });
    }
  }

  if (template.poleBar) {
    const poleX = startX + 248 + Math.round(between(id * 79 + seed * 2.4, -10, 18));
    const poleY = 154 + Math.round(between(id * 83 + seed * 1.9, -8, 8));
    grappleSurfaces.push(
      createSurface(`${id}-pole-crossbar`, poleX - 42, poleY, poleX + 42, poleY, "grapple-bar", 30)
    );
  }

  const endX = Math.max(...platforms.map((platform) => platform.x + platform.width)) + 40;
  return { id, startX, endX, platforms, grappleSurfaces, walls, obstacles, pickups };
}

function createInitialChunks(seed: number): Chunk[] {
  const chunks: Chunk[] = [];
  let cursor = 0;
  for (let i = 0; i < 6; i += 1) {
    const chunk = createChunk(i, cursor, 0, seed);
    chunks.push(chunk);
    cursor = chunk.endX + 40;
  }
  return chunks;
}

function createInitialState(seed: number): RunnerState {
  const chunks = createInitialChunks(seed);
  const firstPlatform = chunks[0].platforms[0];

  return {
    seed,
    player: {
      position: { x: firstPlatform.x + 72, y: firstPlatform.y },
      velocity: { x: getBaseSpeed(0), y: 0 },
      action: "running",
      facing: 1,
      width: 26,
      height: 64,
      contacts: {
        grounded: true,
        leftWall: false,
        rightWall: false,
        underCeiling: false,
        platformId: firstPlatform.id
      },
      slideTimerMs: 0,
      vaultTimerMs: 0,
      vaultFrom: null,
      vaultTo: null,
      coyoteMs: 0,
      jumpBufferMs: 0,
      wallJumpLockMs: 0,
      grappleCooldownMs: 0,
      hardLandingMs: 0,
      hook: {
        phase: "idle",
        origin: { x: 0, y: 0 },
        tip: { x: 0, y: 0 },
        target: null,
        travelDir: { x: 0, y: 0 },
        ropeLength: 0,
        ttlMs: 0,
        hitSurfaceId: null
      }
    },
    chunks,
    camera: { x: 0, y: 0 },
    score: 0,
    distance: 0,
    coins: 0,
    tier: 0,
    gameOver: false,
    reason: "",
    statusText: "Sketch Block is live. Build flow through jumps and clean grapples.",
    flow: {
      combo: 0,
      bestCombo: 0,
      comboTimerMs: 0,
      styleScore: 0,
      grappleShots: 0,
      grappleHits: 0,
      topRouteTicks: 0,
      missions: ["Hit upper route", "Land 3 grapples", "Chain 5 flow actions"]
    },
    totalTimeMs: 0,
    landingPulseMs: 0,
    wallScrapeMs: 0,
    lastSurfaceKind: "roof"
  };
}

function getAllPlatforms(chunks: Chunk[]) {
  return chunks.flatMap((chunk) => chunk.platforms);
}

function getAllWalls(chunks: Chunk[]) {
  return chunks.flatMap((chunk) => chunk.walls);
}

function getAllGrappleSurfaces(chunks: Chunk[]) {
  return chunks.flatMap((chunk) => chunk.grappleSurfaces);
}

function getAllObstacles(chunks: Chunk[]) {
  return chunks.flatMap((chunk) => chunk.obstacles);
}

function getAllPickups(chunks: Chunk[]) {
  return chunks.flatMap((chunk) => chunk.pickups);
}

function ensureWorldAhead(state: RunnerState) {
  let lastChunk = state.chunks[state.chunks.length - 1];
  while (lastChunk.endX < state.player.position.x + 2200) {
    const nextChunk = createChunk(lastChunk.id + 1, lastChunk.endX + 40, state.tier, state.seed);
    state.chunks.push(nextChunk);
    lastChunk = nextChunk;
  }

  state.chunks = state.chunks.filter((chunk) => chunk.endX > state.player.position.x - 700);
}

function lineIntersection(rayOrigin: Vec2, rayDir: Vec2, maxDistance: number, surface: Surface): SegmentHit | null {
  const p = rayOrigin;
  const r = { x: rayDir.x * maxDistance, y: rayDir.y * maxDistance };
  const q = { x: surface.x1, y: surface.y1 };
  const s = { x: surface.x2 - surface.x1, y: surface.y2 - surface.y1 };
  const denom = r.x * s.y - r.y * s.x;
  if (Math.abs(denom) < 0.0001) {
    return null;
  }
  const qp = { x: q.x - p.x, y: q.y - p.y };
  const t = (qp.x * s.y - qp.y * s.x) / denom;
  const u = (qp.x * r.y - qp.y * r.x) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) {
    return null;
  }
  return {
    point: { x: p.x + r.x * t, y: p.y + r.y * t },
    distance: maxDistance * t,
    surface
  };
}

function queryGrappleSurfaces(state: RunnerState, segmentStart: Vec2, segmentEnd: Vec2, launchDir: Vec2): SegmentHit | null {
  const segmentDelta = { x: segmentEnd.x - segmentStart.x, y: segmentEnd.y - segmentStart.y };
  const segmentLength = Math.max(1, length(segmentDelta));
  if (launchDir.x < 0.02 || launchDir.y > 0.65) {
    return null;
  }

  const hits = getAllGrappleSurfaces(state.chunks)
    .map((surface) => lineIntersection(segmentStart, normalize(segmentDelta), segmentLength, surface))
    .filter((value): value is SegmentHit => value != null)
    .sort((a, b) => a.distance - b.distance);

  return hits[0] ?? null;
}

function queryStandingSurface(state: RunnerState, nextY: number) {
  const player = state.player;
  const bounds = getPlayerBounds(player);
  return getAllPlatforms(state.chunks).find((platform) => {
    const overlapsX = bounds.right > platform.x + 8 && bounds.left < platform.x + platform.width - 8;
    return overlapsX && player.position.y <= platform.y && nextY >= platform.y;
  }) ?? null;
}

function queryNearbyWalls(state: RunnerState) {
  const bounds = getPlayerBounds(state.player);
  let leftWall = false;
  let rightWall = false;

  getAllWalls(state.chunks).forEach((wall) => {
    const overlapsY = bounds.bottom > wall.top + 8 && bounds.top < wall.bottom - 8;
    if (!overlapsY) {
      return;
    }
    if (Math.abs(bounds.left - wall.x) < 8) {
      leftWall = true;
    }
    if (Math.abs(bounds.right - wall.x) < 8) {
      rightWall = true;
    }
  });

  return { leftWall, rightWall };
}

function queryCeilingObstacle(state: RunnerState) {
  const bounds = getPlayerBounds(state.player);
  return getAllObstacles(state.chunks).find((obstacle) => {
    if (obstacle.kind !== "slide-sign") {
      return false;
    }
    const left = obstacle.x - obstacle.width / 2;
    const right = obstacle.x + obstacle.width / 2;
    const top = obstacle.y;
    const bottom = obstacle.y + obstacle.height;
    return bounds.right > left && bounds.left < right && bounds.top < bottom && bounds.top > top - 18;
  }) ?? null;
}

function awardFlow(state: RunnerState, amount: number, style: number, label?: string) {
  state.flow.combo += amount;
  state.flow.bestCombo = Math.max(state.flow.bestCombo, state.flow.combo);
  state.flow.comboTimerMs = COMBO_DECAY_MS;
  state.flow.styleScore += style;
  if (label) {
    state.statusText = label;
  }
}

function triggerVault(state: RunnerState, obstacle: Obstacle) {
  state.player.action = "vaulting";
  state.player.vaultTimerMs = 170;
  state.player.vaultFrom = { ...state.player.position };
  state.player.vaultTo = { x: obstacle.x + obstacle.width / 2 + 22, y: obstacle.y };
  state.player.velocity.x = Math.max(state.player.velocity.x, getBaseSpeed(state.tier) + 80);
  state.player.velocity.y = -40;
  awardFlow(state, 1, 22, "Clean vault.");
}

function tryStartSlide(state: RunnerState) {
  if (!state.player.contacts.grounded || state.player.velocity.x < 250 || state.player.action === "sliding") {
    return;
  }
  state.player.action = "sliding";
  state.player.slideTimerMs = SLIDE_MS;
  state.player.height = getPlayerHeight("sliding");
  awardFlow(state, 1, 12, "Slide maintained momentum.");
}

function tryStartGrapple(state: RunnerState, input: InputState) {
  if (state.player.hook.phase !== "idle" || state.player.grappleCooldownMs > 0) {
    return;
  }
  const hand = { x: state.player.position.x + 8, y: state.player.position.y - state.player.height + 22 };
  const direction = normalize({ x: input.aimWorld.x - hand.x, y: input.aimWorld.y - hand.y });
  if (direction.x < 0.04 || input.aimWorld.y > hand.y - 16) {
    return;
  }
  state.flow.grappleShots += 1;
  state.player.hook = {
    phase: "extending",
    origin: hand,
    tip: { ...hand },
    target: null,
    travelDir: direction,
    ropeLength: 0,
    ttlMs: 440,
    hitSurfaceId: null
  };
  state.player.action = "grappling";
}

function updateHook(state: RunnerState, dt: number, input: InputState) {
  const hook = state.player.hook;
  if (hook.phase === "idle") {
    if (input.hookPressed) {
      tryStartGrapple(state, input);
    }
    return;
  }

  const step = HOOK_SPEED * dt;
  hook.ttlMs -= dt * 1000;

  if (hook.phase === "extending") {
    const previousTip = { ...hook.tip };
    hook.tip.x += hook.travelDir.x * step;
    hook.tip.y += hook.travelDir.y * step;
    hook.ropeLength += step;

    const hit = queryGrappleSurfaces(state, previousTip, hook.tip, hook.travelDir);
    if (hit) {
      hook.phase = "attached";
      hook.tip = { ...hit.point };
      hook.target = { ...hit.point };
      hook.ropeLength = length({ x: hit.point.x - hook.origin.x, y: hit.point.y - hook.origin.y });
      hook.hitSurfaceId = hit.surface.id;
      state.player.grappleCooldownMs = HOOK_HIT_COOLDOWN;
      state.flow.grappleHits += 1;
      awardFlow(state, 2, 28, "Grapple hit. Keep the line moving.");
      return;
    }

    if (hook.ropeLength >= HOOK_MAX_RANGE || hook.ttlMs <= 0) {
      hook.phase = "retracting";
      state.player.grappleCooldownMs = HOOK_MISS_COOLDOWN;
      state.statusText = "Missed grapple.";
    }
    return;
  }

  if (hook.phase === "attached" && hook.target) {
    const toTarget = { x: hook.target.x - state.player.position.x, y: hook.target.y - (state.player.position.y - state.player.height * 0.4) };
    const dist = Math.max(1, length(toTarget));
    const dir = normalize(toTarget);
    const tension = clamp((dist - 18) / 220, 0, 1);
    state.player.velocity.x += dir.x * (980 + tension * 620) * dt;
    state.player.velocity.y += dir.y * (760 + tension * 520) * dt;
    state.player.velocity.x = Math.max(state.player.velocity.x, getBaseSpeed(state.tier) * 0.95);

    if (input.jumpHeld && dist < 74) {
      state.player.velocity.y = -JUMP_SPEED * 0.82;
      state.player.velocity.x += 120;
      awardFlow(state, 2, 24, "Jumped out of grapple.");
      hook.phase = "retracting";
    } else if (dist < 26 || hook.ttlMs <= 0 || input.hookReleased) {
      awardFlow(state, 1, 18, "Released into flow.");
      hook.phase = "retracting";
    }
    return;
  }

  if (hook.phase === "retracting") {
    const toOrigin = { x: hook.origin.x - hook.tip.x, y: hook.origin.y - hook.tip.y };
    const dist = length(toOrigin);
    if (dist < 16) {
      state.player.hook = {
        phase: "idle",
        origin: { x: 0, y: 0 },
        tip: { x: 0, y: 0 },
        target: null,
        travelDir: { x: 0, y: 0 },
        ropeLength: 0,
        ttlMs: 0,
        hitSurfaceId: null
      };
      return;
    }
    const dir = normalize(toOrigin);
    hook.tip.x += dir.x * step;
    hook.tip.y += dir.y * step;
  }
}

function resolvePlayerCollisions(state: RunnerState, previousY: number) {
  const player = state.player;
  player.contacts.grounded = false;
  player.contacts.platformId = null;
  player.contacts.underCeiling = false;

  const landingSurface = queryStandingSurface(state, player.position.y);
  if (landingSurface && player.velocity.y >= 0 && previousY <= landingSurface.y) {
    const hardLanding = player.velocity.y > 560;
    player.position.y = landingSurface.y;
    player.velocity.y = 0;
    player.contacts.grounded = true;
    player.contacts.platformId = landingSurface.id;
    player.coyoteMs = COYOTE_MS;
    if (player.jumpBufferMs > 0) {
      player.velocity.y = -JUMP_SPEED;
      player.contacts.grounded = false;
      player.jumpBufferMs = 0;
      player.action = "jumping";
      awardFlow(state, 1, 8, "Buffered jump.");
    } else if (hardLanding) {
      state.landingPulseMs = 180;
      player.hardLandingMs = 120;
    }
  }

  const wallContacts = queryNearbyWalls(state);
  player.contacts.leftWall = wallContacts.leftWall;
  player.contacts.rightWall = wallContacts.rightWall;
  player.contacts.underCeiling = queryCeilingObstacle(state) != null;

  if (!player.contacts.grounded) {
    if (player.velocity.y > 0 && (player.contacts.leftWall || player.contacts.rightWall)) {
      player.action = "wallSliding";
      player.velocity.y = Math.min(player.velocity.y, WALL_SLIDE_SPEED);
      state.wallScrapeMs = 70;
    } else {
      player.action = player.velocity.y < 0 ? "jumping" : player.hook.phase === "attached" ? "grappling" : "falling";
    }
  } else if (player.action !== "vaulting" && player.action !== "sliding") {
    player.action = "running";
  }
}

function updateScoringAndCombo(state: RunnerState, dtMs: number) {
  state.flow.comboTimerMs = Math.max(0, state.flow.comboTimerMs - dtMs);
  if (state.flow.comboTimerMs === 0) {
    state.flow.combo = 0;
  }

  if (state.player.contacts.platformId?.includes("high")) {
    state.flow.topRouteTicks += dtMs;
    state.flow.styleScore += dtMs / 200;
  }

  state.distance = Math.max(0, Math.floor((state.player.position.x - 70) / 10));
  const comboBonus = state.flow.combo * 12 + Math.floor(state.flow.styleScore);
  state.score = Math.max(0, Math.floor(state.distance * 1.15 + state.coins * 24 + comboBonus));

  const nextTier = getTier(state.score);
  if (nextTier !== state.tier) {
    state.tier = nextTier;
    awardFlow(state, 2, 22, `${DISTRICT_NAMES[nextTier]} unlocked. The upper line is worth more now.`);
  }
}

function updatePlayerMovement(state: RunnerState, input: InputState, dtMs: number) {
  const dt = dtMs / 1000;
  const player = state.player;
  const previousY = player.position.y;

  player.height = getPlayerHeight(player.action);
  player.jumpBufferMs = Math.max(0, player.jumpBufferMs - dtMs);
  player.slideTimerMs = Math.max(0, player.slideTimerMs - dtMs);
  player.vaultTimerMs = Math.max(0, player.vaultTimerMs - dtMs);
  player.wallJumpLockMs = Math.max(0, player.wallJumpLockMs - dtMs);
  player.grappleCooldownMs = Math.max(0, player.grappleCooldownMs - dtMs);
  player.coyoteMs = Math.max(0, player.coyoteMs - dtMs);
  player.hardLandingMs = Math.max(0, player.hardLandingMs - dtMs);
  state.landingPulseMs = Math.max(0, state.landingPulseMs - dtMs);
  state.wallScrapeMs = Math.max(0, state.wallScrapeMs - dtMs);
  state.totalTimeMs += dtMs;

  if (input.jumpHeld) {
    player.jumpBufferMs = JUMP_BUFFER_MS;
  }
  if (input.slideHeld && player.contacts.grounded) {
    tryStartSlide(state);
  }

  if (player.action === "vaulting" && player.vaultFrom && player.vaultTo && player.vaultTimerMs > 0) {
    const progress = 1 - player.vaultTimerMs / 170;
    player.position.x = lerp(player.vaultFrom.x, player.vaultTo.x, progress);
    player.position.y = lerp(player.vaultFrom.y, player.vaultTo.y, progress) - Math.sin(progress * Math.PI) * 16;
    player.velocity.x = Math.max(player.velocity.x, getBaseSpeed(state.tier) + 40);
    if (player.vaultTimerMs <= 0) {
      player.action = "running";
      player.vaultFrom = null;
      player.vaultTo = null;
    }
    resolvePlayerCollisions(state, previousY);
    updateScoringAndCombo(state, dtMs);
    return;
  }

  if (player.contacts.grounded && player.jumpBufferMs > 0) {
    player.velocity.y = -JUMP_SPEED;
    player.contacts.grounded = false;
    player.action = "jumping";
    player.jumpBufferMs = 0;
    awardFlow(state, 1, 8, "Clean jump.");
  } else if ((player.contacts.leftWall || player.contacts.rightWall) && player.jumpBufferMs > 0 && !player.contacts.grounded) {
    player.velocity.y = -WALL_JUMP_Y;
    player.velocity.x = player.contacts.leftWall ? WALL_JUMP_X : -WALL_JUMP_X;
    player.wallJumpLockMs = 140;
    player.jumpBufferMs = 0;
    player.action = "jumping";
    awardFlow(state, 2, 20, "Wall jump snapped you forward.");
  }

  updateHook(state, dt, input);

  if (player.hook.phase !== "attached") {
    player.velocity.y += GRAVITY * dt;
  }

  const targetRunSpeed = getBaseSpeed(state.tier);
  const speedBlend = player.contacts.grounded ? 0.18 : 0.06;
  if (player.wallJumpLockMs <= 0) {
    player.velocity.x = lerp(player.velocity.x, Math.max(targetRunSpeed, player.velocity.x), speedBlend);
  }

  if (player.action === "sliding") {
    player.velocity.x = Math.max(player.velocity.x * 0.997, targetRunSpeed * 0.92);
    player.height = getPlayerHeight("sliding");
    if (player.slideTimerMs <= 0) {
      player.action = player.contacts.grounded ? "running" : "falling";
      player.height = getPlayerHeight(player.action);
    }
  }

  const vaultable = getAllObstacles(state.chunks).find(
    (obstacle) =>
      obstacle.vaultable &&
      player.contacts.grounded &&
      player.velocity.x > 300 &&
      getPlayerBounds(player).right > obstacle.x - obstacle.width / 2 - 6 &&
      getPlayerBounds(player).left < obstacle.x &&
      Math.abs(player.position.y - obstacle.y) < 6
  );
  if (vaultable) {
    triggerVault(state, vaultable);
    updateScoringAndCombo(state, dtMs);
    return;
  }

  player.position.x += player.velocity.x * dt;
  player.position.y += player.velocity.y * dt;
  player.facing = player.velocity.x >= 0 ? 1 : -1;
  const movedBounds = getPlayerBounds(player);

  const blockingSlideObstacle = getAllObstacles(state.chunks).find(
    (obstacle) =>
      obstacle.kind === "slide-sign" &&
      movedBounds.right > obstacle.x - obstacle.width / 2 &&
      movedBounds.left < obstacle.x + obstacle.width / 2 &&
      movedBounds.bottom > obstacle.y &&
      movedBounds.top < obstacle.y + obstacle.height
  );
  if (blockingSlideObstacle && player.action !== "sliding") {
    state.gameOver = true;
    state.reason = "You clipped a low sign instead of sliding.";
  } else if (blockingSlideObstacle && player.action === "sliding") {
    awardFlow(state, 1, 16, "Threaded the slide.");
  }

  const airHazard = getAllObstacles(state.chunks).find(
    (obstacle) =>
      obstacle.kind === "air-hazard" &&
      movedBounds.right > obstacle.x - obstacle.width / 2 &&
      movedBounds.left < obstacle.x + obstacle.width / 2 &&
      movedBounds.top < obstacle.y + obstacle.height &&
      movedBounds.bottom > obstacle.y - obstacle.height
  );
  if (airHazard) {
    state.gameOver = true;
    state.reason = "You got tagged by an air hazard.";
  }

  const pickup = getAllPickups(state.chunks).find(
    (coin) =>
      !coin.collected &&
      Math.abs(coin.x - player.position.x) < 18 &&
      Math.abs(coin.y - (player.position.y - player.height * 0.5)) < 18
  );
  if (pickup) {
    pickup.collected = true;
    state.coins += 1;
    awardFlow(state, 1, 14, "Picked the better line.");
  }

  resolvePlayerCollisions(state, previousY);
  ensureWorldAhead(state);
  updateScoringAndCombo(state, dtMs);

  if (player.position.y > HEIGHT + 140) {
    state.gameOver = true;
    state.reason = "You missed the route and fell out of the run.";
  }
}

function drawLine(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, width = 2, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

function drawRectStroke(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeRect(x, y, width, height);
  ctx.restore();
}

function renderBackground(ctx: CanvasRenderingContext2D, tier: DistrictTier) {
  const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  gradient.addColorStop(0, "#f6f1e6");
  gradient.addColorStop(1, tier >= 2 ? "#d9d5cc" : "#e9e3d5");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.strokeStyle = "rgba(17, 24, 39, 0.08)";
  for (let i = 0; i < 5; i += 1) {
    drawLine(ctx, 24, 90 + i * 76, WIDTH - 24, 86 + i * 76, 1, 0.8);
  }
  ctx.strokeStyle = tier >= 2 ? "rgba(99, 102, 241, 0.09)" : "rgba(17, 24, 39, 0.06)";
  for (let i = 0; i < 6; i += 1) {
    drawLine(ctx, 48 + i * 160, 28, 22 + i * 155, HEIGHT - 26, 1, 0.6);
  }
}

function renderPlayer(ctx: CanvasRenderingContext2D, state: RunnerState, cameraX: number) {
  const player = state.player;
  const x = player.position.x - cameraX;
  const y = player.position.y;
  const top = y - player.height;
  const action = player.action;
  const gait = (state.totalTimeMs / 100) % (Math.PI * 2);
  const runSwing = Math.sin(gait) * 10;
  const armSwing = Math.cos(gait) * 8;
  const lean = action === "grappling" ? 12 : action === "wallSliding" ? (player.contacts.leftWall ? -8 : 8) : action === "jumping" ? 6 : 0;

  ctx.fillStyle = "rgba(17,24,39,0.14)";
  ctx.beginPath();
  ctx.ellipse(x, y + 5, 18, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#101010";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, top + 11, 11, 0, Math.PI * 2);
  ctx.stroke();
  drawLine(ctx, x, top + 23, x + lean * 0.25, top + 46, 3);

  if (action === "sliding") {
    drawLine(ctx, x, top + 28, x + 20, top + 34, 3);
    drawLine(ctx, x, top + 28, x - 16, top + 38, 3);
    drawLine(ctx, x + lean * 0.25, top + 46, x + 18, top + 54, 3);
    drawLine(ctx, x + lean * 0.25, top + 46, x - 16, top + 52, 3);
  } else if (action === "wallSliding") {
    const armDir = player.contacts.leftWall ? -16 : 16;
    drawLine(ctx, x, top + 30, x + armDir, top + 26, 3);
    drawLine(ctx, x, top + 30, x - armDir * 0.4, top + 42, 3);
    drawLine(ctx, x + lean * 0.25, top + 46, x - 8, top + 62, 3);
    drawLine(ctx, x + lean * 0.25, top + 46, x + 10, top + 60, 3);
  } else if (action === "grappling" && player.hook.target) {
    const hookDir = player.hook.target.x - player.position.x > 0 ? 16 : -16;
    drawLine(ctx, x, top + 28, x + hookDir, top + 20, 3);
    drawLine(ctx, x, top + 28, x - 12, top + 42, 3);
    drawLine(ctx, x + lean * 0.25, top + 46, x - 12, top + 60, 3);
    drawLine(ctx, x + lean * 0.25, top + 46, x + 12, top + 54, 3);
  } else {
    drawLine(ctx, x, top + 30, x - 12 + armSwing * 0.25, top + 40, 3);
    drawLine(ctx, x, top + 30, x + 12 - armSwing * 0.25, top + 38, 3);
    drawLine(ctx, x + lean * 0.25, top + 46, x - 11 + runSwing, top + 63, 3);
    drawLine(ctx, x + lean * 0.25, top + 46, x + 11 - runSwing, top + 63, 3);
  }

  drawLine(ctx, x - 3, top + 7, x - 3, top + 13, 2);
  drawLine(ctx, x + 3, top + 7, x + 3, top + 13, 2);
}

function renderWorld(ctx: CanvasRenderingContext2D, state: RunnerState, input: InputState) {
  renderBackground(ctx, state.tier);
  const targetCameraX = Math.max(0, state.player.position.x - PLAYER_SCREEN_X + state.player.velocity.x * 0.14);
  state.camera.x = lerp(state.camera.x, targetCameraX, 0.12);
  const cameraX = state.camera.x;

  ctx.strokeStyle = "#171717";
  ctx.fillStyle = "#f5f1e6";

  state.chunks.forEach((chunk) => {
    chunk.platforms.forEach((platform) => {
      const x = platform.x - cameraX;
      if (x + platform.width < -60 || x > WIDTH + 60) return;
      ctx.fillRect(x, platform.y, platform.width, platform.height);
      drawRectStroke(ctx, x, platform.y, platform.width, platform.height, 1);
      drawLine(ctx, x, platform.y + 6, x + platform.width, platform.y + 6, 2, 0.65);
      for (let i = 0; i < Math.floor(platform.width / 54); i += 1) {
        drawRectStroke(ctx, x + 18 + i * 38, platform.y + 28 + (i % 2) * 20, 12, 18, 0.5);
      }
    });

    chunk.grappleSurfaces.forEach((surface) => {
      const x1 = surface.x1 - cameraX;
      const x2 = surface.x2 - cameraX;
      ctx.strokeStyle = surface.kind === "anchor-wire" ? "#475569" : "#6b4f3f";
      drawLine(ctx, x1, surface.y1, x2, surface.y2, 3, 0.95);
      if (surface.kind !== "anchor-wire") {
        drawLine(ctx, x1, surface.y1 - 5, x2, surface.y2 - 5, 1, 0.28);
      }
    });

    chunk.obstacles.forEach((obstacle) => {
      const x = obstacle.x - cameraX - obstacle.width / 2;
      if (obstacle.kind === "low-barrier") {
        drawRectStroke(ctx, x, obstacle.y - obstacle.height, obstacle.width, obstacle.height, 1);
      } else if (obstacle.kind === "slide-sign") {
        drawLine(ctx, x, obstacle.y, x + obstacle.width, obstacle.y, 3, 1);
        drawLine(ctx, x + 10, obstacle.y, x + 10, obstacle.y + 22, 2, 0.8);
        drawLine(ctx, x + obstacle.width - 10, obstacle.y, x + obstacle.width - 10, obstacle.y + 22, 2, 0.8);
      } else {
        drawLine(ctx, x, obstacle.y, x + obstacle.width / 2, obstacle.y - obstacle.height / 2, 2, 0.9);
        drawLine(ctx, x + obstacle.width / 2, obstacle.y - obstacle.height / 2, x + obstacle.width, obstacle.y, 2, 0.9);
      }
    });

    chunk.pickups.forEach((pickup) => {
      if (pickup.collected) return;
      const x = pickup.x - cameraX;
      ctx.strokeStyle = "#8b6b2e";
      ctx.beginPath();
      ctx.arc(x, pickup.y, 9, 0, Math.PI * 2);
      ctx.stroke();
    });
  });

  if (state.player.hook.phase !== "idle") {
    const handX = state.player.position.x - cameraX + 8;
    const handY = state.player.position.y - state.player.height + 22;
    ctx.strokeStyle = "#334155";
    drawLine(ctx, handX, handY, state.player.hook.tip.x - cameraX, state.player.hook.tip.y, 2.5, 0.9);
    ctx.fillStyle = "#111827";
    ctx.beginPath();
    ctx.arc(state.player.hook.tip.x - cameraX, state.player.hook.tip.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  if (state.landingPulseMs > 0) {
    ctx.strokeStyle = "rgba(17,24,39,0.4)";
    drawLine(ctx, state.player.position.x - cameraX - 24, state.player.position.y + 2, state.player.position.x - cameraX - 4, state.player.position.y + 8, 2);
    drawLine(ctx, state.player.position.x - cameraX + 4, state.player.position.y + 8, state.player.position.x - cameraX + 24, state.player.position.y + 2, 2);
  }

  if (state.wallScrapeMs > 0) {
    ctx.strokeStyle = "rgba(120,120,120,0.55)";
    drawLine(ctx, state.player.position.x - cameraX + (state.player.contacts.leftWall ? -14 : 14), state.player.position.y - 48, state.player.position.x - cameraX + (state.player.contacts.leftWall ? -22 : 22), state.player.position.y - 10, 2);
  }

  renderPlayer(ctx, state, cameraX);

  ctx.strokeStyle = "rgba(51,65,85,0.55)";
  drawLine(ctx, input.aimScreen.x - 9, input.aimScreen.y, input.aimScreen.x + 9, input.aimScreen.y, 1.5);
  drawLine(ctx, input.aimScreen.x, input.aimScreen.y - 9, input.aimScreen.x, input.aimScreen.y + 9, 1.5);
}

function makeEmptyHook(): HookState {
  return {
    phase: "idle",
    origin: { x: 0, y: 0 },
    tip: { x: 0, y: 0 },
    target: null,
    travelDir: { x: 0, y: 0 },
    ropeLength: 0,
    ttlMs: 0,
    hitSurfaceId: null
  };
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
  const [status, setStatus] = useState("Momentum matters. Build flow through upper routes, grapples, and clean landings.");
  const [hud, setHud] = useState<HudState>({
    score: 0,
    distance: 0,
    coins: 0,
    speed: getBaseSpeed(0),
    districtTier: 0,
    combo: 0,
    bestCombo: 0,
    hookReady: true,
    hookAccuracy: 0,
    styleScore: 0
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
    titleTrack.volume = 0.25;
    const gameplayTrack = new Audio(gameplayTrackPath);
    gameplayTrack.loop = true;
    gameplayTrack.volume = 0.2;
    const bonusTrack = new Audio(bonusTrackPath);
    bonusTrack.volume = 0.45;
    const resultsTrack = new Audio(resultsTrackPath);
    resultsTrack.volume = 0.3;

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
      gameplayAudioRef.current?.pause();
      resultsAudioRef.current?.pause();
      void titleAudioRef.current?.play().catch(() => undefined);
    } else if (phase === "playing") {
      titleAudioRef.current?.pause();
      resultsAudioRef.current?.pause();
      void gameplayAudioRef.current?.play().catch(() => undefined);
    } else {
      gameplayAudioRef.current?.pause();
      titleAudioRef.current?.pause();
      if (resultsAudioRef.current) {
        resultsAudioRef.current.currentTime = 0;
        void resultsAudioRef.current.play().catch(() => undefined);
      }
    }
  }, [phase]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    renderBackground(ctx, hud.districtTier);
    ctx.fillStyle = "rgba(245,241,232,0.92)";
    ctx.fillRect(88, 86, WIDTH - 176, HEIGHT - 172);
    ctx.strokeStyle = "#1b1b1b";
    drawRectStroke(ctx, 88, 86, WIDTH - 176, HEIGHT - 172, 1);
    ctx.fillStyle = "#111827";
    ctx.font = "bold 38px PublicPixel, monospace";
    ctx.fillText("Rooftop Runner", 120, 150);
    ctx.font = "18px system-ui";
    ctx.fillText("Momentum-based rooftop parkour with click-to-fire grappling.", 120, 194);
    ctx.fillText(`Best score on this device: ${bestScore}`, 120, 242);
    if (phase === "gameOver" && lastRun) {
      ctx.fillText(`Last run: ${lastRun.score} score, ${lastRun.distance}m, combo ${lastRun.bestCombo}.`, 120, 286);
      ctx.fillText(lastRun.reason, 120, 314);
    } else {
      ctx.fillText("Start a run to build flow through grapples, wall tech, slides, and vaults.", 120, 286);
    }
  }, [bestScore, hud.districtTier, lastRun, phase]);

  useEffect(() => {
    if (phase !== "playing") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const state = createInitialState(runSeed + 1);
    let raf = 0;
    let last = performance.now();
    let hudAccum = 0;
    let milestonePlayedForTier: DistrictTier = 0;
    let finished = false;

    const input: InputState = {
      jumpHeld: false,
      slideHeld: false,
      hookPressed: false,
      hookReleased: false,
      aimScreen: { x: WIDTH * 0.68, y: HEIGHT * 0.28 },
      aimWorld: { x: state.player.position.x + 180, y: state.player.position.y - 120 }
    };

    const syncAim = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      input.aimScreen = {
        x: ((clientX - rect.left) / rect.width) * WIDTH,
        y: ((clientY - rect.top) / rect.height) * HEIGHT
      };
      input.aimWorld = {
        x: state.camera.x + input.aimScreen.x,
        y: input.aimScreen.y
      };
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "ArrowUp" || event.code === "KeyW" || event.code === "Space") {
        input.jumpHeld = true;
        event.preventDefault();
      }
      if (event.code === "ArrowDown" || event.code === "KeyS") {
        input.slideHeld = true;
        event.preventDefault();
      }
      if (event.code === "KeyE" || event.code === "ShiftLeft" || event.code === "ShiftRight") {
        input.hookPressed = true;
        event.preventDefault();
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === "ArrowUp" || event.code === "KeyW" || event.code === "Space") {
        input.jumpHeld = false;
      }
      if (event.code === "ArrowDown" || event.code === "KeyS") {
        input.slideHeld = false;
      }
      if (event.code === "KeyE" || event.code === "ShiftLeft" || event.code === "ShiftRight") {
        input.hookReleased = true;
      }
    };

    const onPointerMove = (event: PointerEvent) => syncAim(event.clientX, event.clientY);
    const onPointerDown = (event: PointerEvent) => {
      syncAim(event.clientX, event.clientY);
      if (event.pointerType === "mouse") {
        input.hookPressed = true;
      } else if (input.aimScreen.y < HEIGHT * 0.6) {
        input.jumpHeld = true;
      } else {
        input.slideHeld = true;
      }
    };
    const onPointerUp = () => {
      input.slideHeld = false;
      input.hookReleased = true;
    };

    const finalize = () => {
      if (finished) return;
      finished = true;
      const accuracy = state.flow.grappleShots > 0 ? Math.round((state.flow.grappleHits / state.flow.grappleShots) * 100) : 0;
      const goldEarned = Math.max(28, Math.floor(state.score / 18) + Math.floor(state.flow.bestCombo * 3) + state.coins * 7);
      const nextBest = Math.max(bestScoreRef.current, state.score);
      setBestScore(nextBest);
      saveLocalBest(nextBest);
      setStatus(state.reason);
      setLastRun({
        score: state.score,
        distance: state.distance,
        coins: state.coins,
        goldEarned,
        reason: state.reason,
        bestCombo: state.flow.bestCombo,
        accuracy,
        styleScore: Math.round(state.flow.styleScore)
      });
      void recordArcadeResult({ scoreGameName: "rooftop_runner", score: state.score, goldEarned }).catch(() => undefined);
      window.setTimeout(() => setPhase("gameOver"), 180);
    };

    const tick = (time: number) => {
      const deltaMs = Math.min(33, time - last);
      last = time;
      updatePlayerMovement(state, input, deltaMs);
      renderWorld(ctx, state, input);

      if (state.tier > milestonePlayedForTier) {
        milestonePlayedForTier = state.tier;
        void bonusAudioRef.current?.play().catch(() => undefined);
      }

      hudAccum += deltaMs;
      if (hudAccum >= 90) {
        hudAccum = 0;
        const accuracy = state.flow.grappleShots > 0 ? Math.round((state.flow.grappleHits / state.flow.grappleShots) * 100) : 0;
        setHud({
          score: state.score,
          distance: state.distance,
          coins: state.coins,
          speed: Math.round(state.player.velocity.x),
          districtTier: state.tier,
          combo: state.flow.combo,
          bestCombo: state.flow.bestCombo,
          hookReady: state.player.grappleCooldownMs <= 0 && state.player.hook.phase === "idle",
          hookAccuracy: accuracy,
          styleScore: Math.round(state.flow.styleScore)
        });
        setStatus(state.statusText);
      }

      input.hookPressed = false;
      input.hookReleased = false;

      if (state.gameOver) {
        finalize();
        return;
      }
      raf = window.requestAnimationFrame(tick);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onPointerUp);
    raf = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [phase, runSeed]);

  const beginRun = () => {
    setLastRun(null);
    setStatus("Sketch Block is live. Build flow through upper routes, grapples, and clean landings.");
    setHud({
      score: 0,
      distance: 0,
      coins: 0,
      speed: getBaseSpeed(0),
      districtTier: 0,
      combo: 0,
      bestCombo: 0,
      hookReady: true,
      hookAccuracy: 0,
      styleScore: 0
    });
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
            A polished momentum runner built around chaining jump, grapple, wall tech, slide, and vault.
            Lower routes are safer. Upper routes are faster and score harder.
          </p>
        </div>

        <div className="rooftop-layout">
          <section className="rooftop-stage rooftop-stage--paper">
            <canvas ref={canvasRef} className="rooftop-canvas" />

            <div className="rooftop-hud rooftop-hud--top">
              <div className="rooftop-marquee">
                <span className="rooftop-logo">Rooftop Runner</span>
                <span className="rooftop-district">{DISTRICT_NAMES[hud.districtTier]}</span>
              </div>
              <div className="rooftop-scoreboard">
                <span>Score {hud.score}</span>
                <span>{hud.distance}m</span>
                <span>Coins {hud.coins}</span>
              </div>
            </div>

            <div className="rooftop-hud rooftop-hud--bottom">
              <span>Jump `W` / `Up` / `Space`</span>
              <span>Slide `S` / `Down`</span>
              <span>Grapple click / `E` / `Shift`</span>
              <span>{hud.hookReady ? "Hook ready" : "Hook cooling"}</span>
            </div>

            {phase !== "playing" ? (
              <div className="rooftop-overlay">
                <div className="rooftop-overlay-card rooftop-overlay-card--paper">
                  <p className="rooftop-overlay-kicker">{phase === "title" ? "Momentum Parkour" : "Run Complete"}</p>
                  <h2>{phase === "title" ? "Hit the skyline" : `Score ${lastRun?.score ?? 0}`}</h2>
                  <p>
                    {phase === "title"
                      ? "Free-aim grapples, upper-route bars, wall jumps, slides, vaults, and combo-driven scoring."
                      : `${lastRun?.reason ?? "Run over."} Combo ${lastRun?.bestCombo ?? 0}. Accuracy ${lastRun?.accuracy ?? 0}%.`}
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
              <span className="rooftop-panel-title">Movement</span>
              <p>Click to fire a traveling grapple toward the cursor. It only attaches when the shot hits a valid bar, wire, or upper anchor.</p>
              <p>Wall slides and wall jumps use actual wall contact. Slides preserve speed. Low barriers can vault cleanly.</p>
            </div>

            <div className="rooftop-panel rooftop-panel--paper">
              <span className="rooftop-panel-title">Flow</span>
              <p>Combo: {hud.combo}</p>
              <p>Best combo: {hud.bestCombo}</p>
              <p>Hook accuracy: {hud.hookAccuracy}%</p>
              <p>Style score: {hud.styleScore}</p>
            </div>

            <div className="rooftop-panel rooftop-panel--paper">
              <span className="rooftop-panel-title">Run Status</span>
              <p>{status}</p>
              <p>Best score on this device: {bestScore}</p>
              {lastRun ? (
                <p>
                  Last run: {lastRun.score} score, {lastRun.distance}m, {lastRun.coins} coins, combo {lastRun.bestCombo}.
                </p>
              ) : (
                <p>No clean take yet. The upper route pays more if you can stay there.</p>
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
