import React, { useEffect, useMemo, useRef, useState } from "react";
import NavBar from "../components/NavBar";
import { recordArcadeResult } from "../lib/progression";

type GamePhase = "title" | "playing" | "paused" | "gameOver";
type DistrictTier = 0 | 1 | 2 | 3;
type Lane = "low" | "mid" | "high";
type DistrictId =
  | "apartments"
  | "construction"
  | "neon"
  | "industrial"
  | "billboard"
  | "glass"
  | "crane"
  | "storm";
type PlayerAction = "run" | "jump" | "fall" | "slide" | "wall" | "grapple" | "vault" | "hurt";
type SurfaceKind = "roof" | "ledge" | "grapple-bar" | "anchor-wire";
type GateResponse = "slide" | "jump" | "grapple";
type ObstacleKind = "vault" | "slide-sign" | "slide-tunnel" | "air-hazard" | "route-gate";
type HookPhase = "idle" | "extending" | "attached" | "retracting";

type Vec2 = { x: number; y: number };

type DistrictDefinition = {
  id: DistrictId;
  name: string;
  subtitle: string;
  emphasis: string;
  accent: string;
  accentSoft: string;
  skyTop: string;
  skyMid: string;
  skyBottom: string;
  haze: string;
  glow: string;
  layerA: string;
  layerB: string;
  layerC: string;
  platformTop: string;
  platformFace: string;
  platformTrim: string;
  window: string;
  sign: string;
  fogAlpha: number;
  gapBias: number;
  widthBias: number;
  midChance: number;
  highChance: number;
  slideChance: number;
  gateChance: number;
  airChance: number;
  grappleBias: number;
  wind: number;
  skylineMode: "apartments" | "scaffold" | "neon" | "industrial" | "billboards" | "glass" | "crane" | "storm";
};

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
  lane: Lane;
  district: DistrictId;
  surface: Surface;
  leftWall: Wall;
  rightWall: Wall;
};

type Obstacle = {
  id: string;
  kind: ObstacleKind;
  district: DistrictId;
  x: number;
  y: number;
  width: number;
  height: number;
  lane: Lane;
  vaultable?: boolean;
  slideClearance?: boolean;
  cleared?: boolean;
  gapY?: number;
  gapHeight?: number;
  response?: GateResponse;
  severity: number;
};

type Pickup = {
  id: string;
  x: number;
  y: number;
  collected: boolean;
  lane: Lane;
  district: DistrictId;
};

type Chunk = {
  id: number;
  startX: number;
  endX: number;
  district: DistrictId;
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
  nearMisses: number;
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
  wallContactSide: -1 | 0 | 1;
  wallContactGraceMs: number;
  lastWallJumpSide: -1 | 0 | 1;
  lastWallJumpAt: number;
  grappleCooldownMs: number;
  hardLandingMs: number;
  invulnerableMs: number;
  hurtMs: number;
  guard: number;
  maxGuard: number;
  hook: HookState;
};

type RunnerState = {
  seed: number;
  player: PlayerState;
  chunks: Chunk[];
  camera: Vec2;
  activeDistrict: DistrictId;
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
  hitFlashMs: number;
  windPulseMs: number;
  districtIndex: number;
};

type HudState = {
  score: number;
  distance: number;
  coins: number;
  speed: number;
  districtTier: DistrictTier;
  districtId: DistrictId;
  combo: number;
  bestCombo: number;
  hookReady: boolean;
  hookAccuracy: number;
  styleScore: number;
  guard: number;
  phaseLabel: string;
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
  districtName: string;
};

type InputState = {
  jumpHeld: boolean;
  jumpPressed: boolean;
  slideHeld: boolean;
  slidePressed: boolean;
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

type SpriteBank = {
  run: HTMLImageElement[];
  jump: HTMLImageElement[];
  slide: HTMLImageElement[];
  hurt: HTMLImageElement[];
};

const WIDTH = 960;
const HEIGHT = 540;
const PLAYER_SCREEN_X = 250;
const LOCAL_BEST_KEY = "focusland-rooftop-runner-best-v3";
const GRAVITY = 1980;
const BASE_RUN_SPEED = 330;
const MAX_SPEED = 780;
const JUMP_SPEED = 800;
const WALL_SLIDE_SPEED = 165;
const WALL_JUMP_X = 460;
const WALL_JUMP_Y = 670;
const HOOK_SPEED = 1520;
const HOOK_MAX_RANGE = 420;
const HOOK_MISS_COOLDOWN = 240;
const HOOK_HIT_COOLDOWN = 360;
const COYOTE_MS = 120;
const JUMP_BUFFER_MS = 125;
const SLIDE_MS = 520;
const SLIDE_CHAIN_MS = 220;
const WALL_CONTACT_GRACE_MS = 120;
const SAME_WALL_LOCK_MS = 520;
const COMBO_DECAY_MS = 1700;
const DISTRICT_THRESHOLDS = [450, 1100, 2200] as const;
const DISTRICT_FLOW_NAMES = ["Street Heat", "Skyline Heat", "Chase Heat", "Legend Heat"] as const;

const DISTRICT_ORDER: DistrictId[] = [
  "apartments",
  "construction",
  "neon",
  "industrial",
  "billboard",
  "glass",
  "crane",
  "storm"
];

const DISTRICTS: Record<DistrictId, DistrictDefinition> = {
  apartments: {
    id: "apartments",
    name: "Dense Apartment Roofs",
    subtitle: "Tight hops, laundry lines, fast reactions.",
    emphasis: "Short hops and cluttered low-route reads.",
    accent: "#ffd27c",
    accentSoft: "rgba(255, 210, 124, 0.2)",
    skyTop: "#1d2944",
    skyMid: "#516991",
    skyBottom: "#f2b57c",
    haze: "rgba(255, 222, 182, 0.12)",
    glow: "rgba(255, 199, 118, 0.24)",
    layerA: "rgba(35, 44, 68, 0.22)",
    layerB: "rgba(21, 28, 45, 0.42)",
    layerC: "rgba(14, 19, 30, 0.78)",
    platformTop: "#8fa7c8",
    platformFace: "#1d283b",
    platformTrim: "#4d617d",
    window: "rgba(255, 221, 169, 0.28)",
    sign: "#f7c56e",
    fogAlpha: 0.12,
    gapBias: -10,
    widthBias: 24,
    midChance: 0.48,
    highChance: 0.22,
    slideChance: 0.38,
    gateChance: 0.18,
    airChance: 0.08,
    grappleBias: 0.18,
    wind: 0,
    skylineMode: "apartments"
  },
  construction: {
    id: "construction",
    name: "Construction Zone",
    subtitle: "Scaffolds, orange warnings, low tunnels.",
    emphasis: "Slide lanes, scaffold recoveries, awkward edges.",
    accent: "#ff9a3d",
    accentSoft: "rgba(255, 154, 61, 0.24)",
    skyTop: "#233148",
    skyMid: "#4b6780",
    skyBottom: "#e6a46d",
    haze: "rgba(255, 180, 110, 0.12)",
    glow: "rgba(255, 158, 61, 0.18)",
    layerA: "rgba(58, 67, 82, 0.25)",
    layerB: "rgba(42, 50, 63, 0.48)",
    layerC: "rgba(24, 28, 37, 0.82)",
    platformTop: "#c3d0de",
    platformFace: "#26303f",
    platformTrim: "#8c6b50",
    window: "rgba(255, 191, 128, 0.2)",
    sign: "#ffae52",
    fogAlpha: 0.1,
    gapBias: 8,
    widthBias: 12,
    midChance: 0.7,
    highChance: 0.35,
    slideChance: 0.7,
    gateChance: 0.3,
    airChance: 0.12,
    grappleBias: 0.28,
    wind: 0,
    skylineMode: "scaffold"
  },
  neon: {
    id: "neon",
    name: "Neon Night District",
    subtitle: "Bright signs, cable bars, and skyline glow.",
    emphasis: "Upper-route grapples and high-speed aerial chains.",
    accent: "#66e0ff",
    accentSoft: "rgba(102, 224, 255, 0.22)",
    skyTop: "#120f2d",
    skyMid: "#30265f",
    skyBottom: "#d95e9d",
    haze: "rgba(110, 212, 255, 0.1)",
    glow: "rgba(121, 224, 255, 0.24)",
    layerA: "rgba(40, 26, 75, 0.24)",
    layerB: "rgba(26, 18, 58, 0.46)",
    layerC: "rgba(16, 11, 35, 0.82)",
    platformTop: "#7bc4ff",
    platformFace: "#171d39",
    platformTrim: "#33568f",
    window: "rgba(113, 234, 255, 0.35)",
    sign: "#6fe9ff",
    fogAlpha: 0.14,
    gapBias: 4,
    widthBias: -10,
    midChance: 0.52,
    highChance: 0.72,
    slideChance: 0.24,
    gateChance: 0.48,
    airChance: 0.2,
    grappleBias: 0.65,
    wind: 0,
    skylineMode: "neon"
  },
  industrial: {
    id: "industrial",
    name: "Industrial Roofworks",
    subtitle: "Steam vents, pipe lanes, heavy machinery.",
    emphasis: "Air hazards and chunky, readable low-line pressure.",
    accent: "#ff8461",
    accentSoft: "rgba(255, 132, 97, 0.2)",
    skyTop: "#25262d",
    skyMid: "#4c505d",
    skyBottom: "#db815d",
    haze: "rgba(255, 145, 99, 0.1)",
    glow: "rgba(255, 120, 84, 0.18)",
    layerA: "rgba(53, 52, 58, 0.22)",
    layerB: "rgba(33, 31, 38, 0.44)",
    layerC: "rgba(19, 18, 23, 0.82)",
    platformTop: "#a0aab7",
    platformFace: "#242933",
    platformTrim: "#6a727f",
    window: "rgba(255, 173, 127, 0.18)",
    sign: "#ff8d64",
    fogAlpha: 0.12,
    gapBias: 18,
    widthBias: 18,
    midChance: 0.44,
    highChance: 0.24,
    slideChance: 0.4,
    gateChance: 0.22,
    airChance: 0.48,
    grappleBias: 0.16,
    wind: 0,
    skylineMode: "industrial"
  },
  billboard: {
    id: "billboard",
    name: "Billboard District",
    subtitle: "Huge sign frames and narrow timing windows.",
    emphasis: "Readable route gates and frame threading.",
    accent: "#ffe16b",
    accentSoft: "rgba(255, 225, 107, 0.22)",
    skyTop: "#20264b",
    skyMid: "#51649c",
    skyBottom: "#f8ba77",
    haze: "rgba(255, 232, 140, 0.12)",
    glow: "rgba(255, 223, 107, 0.18)",
    layerA: "rgba(37, 49, 83, 0.24)",
    layerB: "rgba(22, 31, 55, 0.44)",
    layerC: "rgba(13, 19, 33, 0.8)",
    platformTop: "#a6bdd6",
    platformFace: "#1f2841",
    platformTrim: "#536d8d",
    window: "rgba(255, 245, 187, 0.24)",
    sign: "#ffe670",
    fogAlpha: 0.1,
    gapBias: 10,
    widthBias: -18,
    midChance: 0.56,
    highChance: 0.42,
    slideChance: 0.22,
    gateChance: 0.62,
    airChance: 0.14,
    grappleBias: 0.3,
    wind: 0,
    skylineMode: "billboards"
  },
  glass: {
    id: "glass",
    name: "Glass Tower Roofs",
    subtitle: "Slick ledges, long jumps, reflective facades.",
    emphasis: "Narrow landings and precision skyline lines.",
    accent: "#9fe7ff",
    accentSoft: "rgba(159, 231, 255, 0.22)",
    skyTop: "#17324d",
    skyMid: "#4c83aa",
    skyBottom: "#d9a87a",
    haze: "rgba(187, 240, 255, 0.14)",
    glow: "rgba(160, 229, 255, 0.2)",
    layerA: "rgba(41, 83, 110, 0.22)",
    layerB: "rgba(26, 53, 72, 0.46)",
    layerC: "rgba(14, 27, 38, 0.82)",
    platformTop: "#d8edf7",
    platformFace: "#1e3247",
    platformTrim: "#7aa5bd",
    window: "rgba(200, 244, 255, 0.32)",
    sign: "#8be6ff",
    fogAlpha: 0.16,
    gapBias: 22,
    widthBias: -30,
    midChance: 0.4,
    highChance: 0.58,
    slideChance: 0.18,
    gateChance: 0.34,
    airChance: 0.16,
    grappleBias: 0.36,
    wind: 0,
    skylineMode: "glass"
  },
  crane: {
    id: "crane",
    name: "Crane and Scaffold Span",
    subtitle: "Vertical climbs, hanging bars, exposed air.",
    emphasis: "Wall recoveries and grapple-heavy traversal setpieces.",
    accent: "#ffcb6a",
    accentSoft: "rgba(255, 203, 106, 0.2)",
    skyTop: "#1f263b",
    skyMid: "#566e8b",
    skyBottom: "#edb27a",
    haze: "rgba(255, 223, 157, 0.1)",
    glow: "rgba(255, 201, 106, 0.18)",
    layerA: "rgba(47, 59, 79, 0.22)",
    layerB: "rgba(28, 36, 52, 0.46)",
    layerC: "rgba(14, 19, 30, 0.82)",
    platformTop: "#bac6d6",
    platformFace: "#1a2436",
    platformTrim: "#6c7d95",
    window: "rgba(255, 220, 159, 0.16)",
    sign: "#ffc66b",
    fogAlpha: 0.09,
    gapBias: 14,
    widthBias: -14,
    midChance: 0.72,
    highChance: 0.68,
    slideChance: 0.22,
    gateChance: 0.44,
    airChance: 0.16,
    grappleBias: 0.72,
    wind: 0.1,
    skylineMode: "crane"
  },
  storm: {
    id: "storm",
    name: "Storm High-Rise Run",
    subtitle: "Rain, wind drag, and electric skyline tension.",
    emphasis: "Long reads under pressure with subtle wind drift.",
    accent: "#94d6ff",
    accentSoft: "rgba(148, 214, 255, 0.22)",
    skyTop: "#0d1224",
    skyMid: "#273b62",
    skyBottom: "#5678a7",
    haze: "rgba(164, 211, 255, 0.1)",
    glow: "rgba(133, 214, 255, 0.12)",
    layerA: "rgba(29, 42, 70, 0.22)",
    layerB: "rgba(19, 30, 53, 0.48)",
    layerC: "rgba(9, 14, 25, 0.84)",
    platformTop: "#a5b8d1",
    platformFace: "#182132",
    platformTrim: "#5e7392",
    window: "rgba(196, 221, 255, 0.18)",
    sign: "#9ee1ff",
    fogAlpha: 0.18,
    gapBias: 28,
    widthBias: -8,
    midChance: 0.46,
    highChance: 0.52,
    slideChance: 0.3,
    gateChance: 0.52,
    airChance: 0.24,
    grappleBias: 0.34,
    wind: 0.22,
    skylineMode: "storm"
  }
};

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
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function between(seed: number, min: number, max: number) {
  return min + noise(seed) * (max - min);
}

function pick<T>(seed: number, items: T[]) {
  return items[Math.floor(noise(seed) * items.length) % items.length];
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
  return BASE_RUN_SPEED + tier * 38;
}

function getPlayerHeight(action: PlayerAction) {
  return action === "slide" ? 38 : 76;
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

function makePlatform(id: string, district: DistrictId, x: number, y: number, width: number, lane: Lane): Platform {
  const height = HEIGHT - y + 130;
  const surfaceKind: SurfaceKind = lane === "high" ? "ledge" : "roof";
  return {
    id,
    x,
    y,
    width,
    height,
    lane,
    district,
    surface: createSurface(`${id}-surface`, x, y, x + width, y, surfaceKind, lane === "high" ? 18 : lane === "mid" ? 12 : 7),
    leftWall: { id: `${id}-wall-left`, x, top: y, bottom: y + height },
    rightWall: { id: `${id}-wall-right`, x: x + width, top: y, bottom: y + height }
  };
}

function getDistrictForChunk(id: number, seed: number): DistrictDefinition {
  const group = Math.floor(id / 2);
  return DISTRICTS[DISTRICT_ORDER[group % DISTRICT_ORDER.length]];
}

function getGateResponseForChunk(id: number, district: DistrictId): GateResponse {
  if (district === "construction") return pick(id * 1.31, ["slide", "slide", "jump"]);
  if (district === "billboard") return pick(id * 1.77, ["jump", "slide", "grapple"]);
  if (district === "crane") return pick(id * 1.93, ["grapple", "jump", "grapple"]);
  if (district === "storm") return pick(id * 2.11, ["jump", "grapple", "slide"]);
  const localIndex = ((id % 3) + 3) % 3;
  if (localIndex === 0) return "slide";
  if (localIndex === 1) return "jump";
  return "grapple";
}

function getAllPlatforms(chunks: Chunk[]) {
  return chunks.flatMap((chunk) => chunk.platforms);
}

function getAllWalls(chunks: Chunk[]) {
  return chunks.flatMap((chunk) => chunk.walls);
}

function getAllObstacles(chunks: Chunk[]) {
  return chunks.flatMap((chunk) => chunk.obstacles);
}

function getAllPickups(chunks: Chunk[]) {
  return chunks.flatMap((chunk) => chunk.pickups);
}

function getAllGrappleSurfaces(chunks: Chunk[]) {
  return chunks.flatMap((chunk) => chunk.grappleSurfaces);
}

function createChunk(id: number, startX: number, tier: DistrictTier, seed: number): Chunk {
  const platforms: Platform[] = [];
  const grappleSurfaces: Surface[] = [];
  const walls: Wall[] = [];
  const obstacles: Obstacle[] = [];
  const pickups: Pickup[] = [];
  const district = getDistrictForChunk(id, seed);
  const difficulty = clamp(tier + id / 8, 0, 6);
  const routeSeed = id * 97 + seed * 13.37;
  const early = id < 2;

  const lowGap = Math.round(54 + district.gapBias + between(routeSeed + 3, 0, 18 + difficulty * 10));
  const lowWidth = Math.round(232 + district.widthBias + between(routeSeed + 4, -26, 48));
  const nextLowY = 370 + Math.round(between(routeSeed + 5, -18, 16));
  const lowY = 376 + Math.round(between(routeSeed + 6, -10, 12));
  const lowA = makePlatform(`${id}-low-a`, district.id, startX, lowY, Math.max(188, lowWidth), "low");
  const lowB = makePlatform(`${id}-low-b`, district.id, lowA.x + lowA.width + lowGap, nextLowY, Math.max(178, lowWidth - 18), "low");
  platforms.push(lowA, lowB);

  const midEnabled = early ? id !== 0 : noise(routeSeed + 7) < district.midChance + tier * 0.05;
  const highEnabled = early ? id >= 1 : noise(routeSeed + 8) < district.highChance + tier * 0.04;

  if (midEnabled) {
    const mid = makePlatform(
      `${id}-mid`,
      district.id,
      startX + 150 + Math.round(between(routeSeed + 9, -22, 28)),
      294 + Math.round(between(routeSeed + 10, -18, 18)),
      152 + Math.round(between(routeSeed + 11, -16, 28)),
      "mid"
    );
    platforms.push(mid);
    grappleSurfaces.push(createSurface(`${mid.id}-bar`, mid.x + 18, mid.y - 72, mid.x + mid.width - 18, mid.y - 72, "grapple-bar", 18));
    pickups.push({
      id: `${mid.id}-coin`,
      x: mid.x + mid.width / 2,
      y: mid.y - 28,
      collected: false,
      lane: "mid",
      district: district.id
    });
  }

  if (highEnabled) {
    const high = makePlatform(
      `${id}-high`,
      district.id,
      startX + 332 + Math.round(between(routeSeed + 12, -26, 32)),
      212 + Math.round(between(routeSeed + 13, -22, 18)),
      136 + Math.round(between(routeSeed + 14, -18, 20)),
      "high"
    );
    platforms.push(high);
    grappleSurfaces.push(
      createSurface(`${high.id}-ledge`, high.x + 10, high.y - 86, high.x + high.width - 10, high.y - 86, "anchor-wire", 24),
      createSurface(`${high.id}-bar`, high.x + 22, high.y - 38, high.x + high.width - 20, high.y - 38, "grapple-bar", 20)
    );
    pickups.push({
      id: `${high.id}-coin`,
      x: high.x + high.width / 2,
      y: high.y - 24,
      collected: false,
      lane: "high",
      district: district.id
    });
  }

  platforms.forEach((platform) => {
    walls.push(platform.leftWall, platform.rightWall);
  });

  const shouldSlide = !early && noise(routeSeed + 15) < district.slideChance;
  const shouldGate = !early && noise(routeSeed + 16) < district.gateChance;
  const shouldAir = !early && noise(routeSeed + 17) < district.airChance + (tier >= 2 ? 0.05 : 0);
  const shouldVault = !early && noise(routeSeed + 18) < 0.48;
  const shouldGrapple = noise(routeSeed + 19) < district.grappleBias;

  if (shouldVault) {
    obstacles.push({
      id: `${lowB.id}-vault`,
      kind: "vault",
      district: district.id,
      x: lowB.x + lowB.width * (district.id === "apartments" ? 0.42 : 0.62),
      y: lowB.y,
      width: district.id === "glass" ? 42 : 54,
      height: district.id === "glass" ? 20 : 28,
      lane: "low",
      vaultable: true,
      severity: 1
    });
  }

  if (shouldSlide) {
    const slidePlatform = platforms.find((platform) => platform.lane === (district.id === "construction" || district.id === "billboard" ? "mid" : "low")) ?? lowB;
    obstacles.push({
      id: `${slidePlatform.id}-sign`,
      kind: "slide-sign",
      district: district.id,
      x: slidePlatform.x + slidePlatform.width * 0.54,
      y: slidePlatform.y - (district.id === "construction" ? 52 : 38),
      width: district.id === "construction" ? 96 : 76,
      height: district.id === "construction" ? 24 : 18,
      lane: slidePlatform.lane,
      slideClearance: true,
      severity: 1
    });

    obstacles.push({
      id: `${slidePlatform.id}-tunnel`,
      kind: "slide-tunnel",
      district: district.id,
      x: slidePlatform.x + slidePlatform.width * (district.id === "construction" ? 0.7 : 0.76),
      y: slidePlatform.y - (district.id === "construction" ? 34 : 26),
      width: district.id === "construction" ? 94 : 84,
      height: district.id === "construction" ? 34 : 24,
      lane: slidePlatform.lane,
      slideClearance: true,
      severity: 1
    });
  }

  if (shouldAir) {
    const airPlatform = platforms.find((platform) => platform.lane === "high") ?? platforms.find((platform) => platform.lane === "mid");
    if (airPlatform) {
      obstacles.push({
        id: `${airPlatform.id}-air`,
        kind: "air-hazard",
        district: district.id,
        x: airPlatform.x + airPlatform.width * 0.6,
        y: airPlatform.y - between(routeSeed + 20, 86, 124),
        width: district.id === "industrial" ? 54 : district.id === "storm" ? 46 : 40,
        height: district.id === "industrial" ? 28 : 20,
        lane: airPlatform.lane,
        severity: district.id === "storm" ? 2 : 1
      });
    }
  }

  if (shouldGate) {
    const gateResponse = getGateResponseForChunk(id, district.id);
    const gateX = lowA.x + lowA.width + lowGap * 0.5;
    const gateWidth = Math.min(70, Math.max(48, lowGap - 16));
    const gateGapHeight = gateResponse === "slide" ? 40 : gateResponse === "jump" ? 64 : 72;
    const gateGapY =
      gateResponse === "slide"
        ? lowA.y - 34
        : gateResponse === "jump"
          ? lowA.y - 116
          : 152 + Math.round(between(routeSeed + 21, -10, 20));

    obstacles.push({
      id: `${id}-route-gate-${gateResponse}`,
      kind: "route-gate",
      district: district.id,
      x: gateX,
      y: 0,
      width: gateWidth,
      height: HEIGHT,
      lane: gateResponse === "grapple" ? "high" : gateResponse === "jump" ? "mid" : "low",
      gapY: gateGapY,
      gapHeight: gateGapHeight,
      response: gateResponse,
      severity: gateResponse === "grapple" ? 2 : 1
    });

    if (gateResponse === "grapple") {
      grappleSurfaces.push(createSurface(`${id}-gate-grapple-bar`, gateX - 56, gateGapY - 28, gateX + 56, gateGapY - 28, "grapple-bar", 24));
    }
  }

  if (shouldGrapple) {
    const barX = startX + 210 + Math.round(between(routeSeed + 22, -16, 26));
    const barY = district.id === "storm" ? 140 : district.id === "neon" ? 132 : 148;
    grappleSurfaces.push(createSurface(`${id}-theme-bar`, barX, barY, barX + 116, barY, "grapple-bar", 30));
  }

  if (district.id === "crane") {
    const craneX = startX + 280;
    grappleSurfaces.push(
      createSurface(`${id}-crane-hook`, craneX - 42, 128, craneX + 42, 128, "grapple-bar", 32),
      createSurface(`${id}-crane-wire`, craneX + 22, 186, craneX + 92, 186, "anchor-wire", 22)
    );
  }

  if (district.id === "storm") {
    grappleSurfaces.push(createSurface(`${id}-storm-wire`, startX + 196, 162, startX + 302, 162, "anchor-wire", 20));
  }

  const endX = Math.max(...platforms.map((platform) => platform.x + platform.width)) + 40;
  return { id, startX, endX, district: district.id, platforms, grappleSurfaces, walls, obstacles, pickups };
}

function createInitialChunks(seed: number): Chunk[] {
  const chunks: Chunk[] = [];
  let cursor = 0;
  for (let i = 0; i < 7; i += 1) {
    const chunk = createChunk(i, cursor, 0, seed);
    chunks.push(chunk);
    cursor = chunk.endX + 40;
  }
  return chunks;
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

function createInitialState(seed: number): RunnerState {
  const chunks = createInitialChunks(seed);
  const firstPlatform = chunks[0].platforms[0];

  return {
    seed,
    player: {
      position: { x: firstPlatform.x + 78, y: firstPlatform.y },
      velocity: { x: getBaseSpeed(0), y: 0 },
      action: "run",
      facing: 1,
      width: 32,
      height: 76,
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
      coyoteMs: COYOTE_MS,
      jumpBufferMs: 0,
      wallJumpLockMs: 0,
      wallContactSide: 0,
      wallContactGraceMs: 0,
      lastWallJumpSide: 0,
      lastWallJumpAt: 9999,
      grappleCooldownMs: 0,
      hardLandingMs: 0,
      invulnerableMs: 0,
      hurtMs: 0,
      guard: 3,
      maxGuard: 3,
      hook: makeEmptyHook()
    },
    chunks,
    camera: { x: 0, y: 0 },
    activeDistrict: chunks[0].district,
    score: 0,
    distance: 0,
    coins: 0,
    tier: 0,
    gameOver: false,
    reason: "",
    statusText: `${DISTRICTS[chunks[0].district].name}. Build speed before chasing the skyline.`,
    flow: {
      combo: 0,
      bestCombo: 0,
      comboTimerMs: 0,
      styleScore: 0,
      grappleShots: 0,
      grappleHits: 0,
      topRouteTicks: 0,
      nearMisses: 0
    },
    totalTimeMs: 0,
    landingPulseMs: 0,
    wallScrapeMs: 0,
    hitFlashMs: 0,
    windPulseMs: 0,
    districtIndex: 0
  };
}

function createTitlePreviewState(seed: number): RunnerState {
  const state = createInitialState(seed);
  state.camera.x = 80;
  state.activeDistrict = "neon";
  state.player.position.x = 420;
  state.player.position.y = 258;
  state.player.velocity.x = 520;
  state.player.velocity.y = -120;
  state.player.action = "grapple";
  state.player.hook = {
    phase: "attached",
    origin: { x: state.player.position.x, y: state.player.position.y - 46 },
    tip: { x: 548, y: 136 },
    target: { x: 548, y: 136 },
    travelDir: { x: 1, y: -1 },
    ropeLength: 160,
    ttlMs: 400,
    hitSurfaceId: "title-hook"
  };
  state.flow.combo = 8;
  state.flow.bestCombo = 13;
  state.flow.styleScore = 188;
  return state;
}

function getActiveChunk(state: RunnerState) {
  return state.chunks.find((chunk) => state.player.position.x >= chunk.startX && state.player.position.x < chunk.endX) ?? state.chunks[0];
}

function ensureWorldAhead(state: RunnerState) {
  let lastChunk = state.chunks[state.chunks.length - 1];
  while (lastChunk.endX < state.player.position.x + 2300) {
    const nextChunk = createChunk(lastChunk.id + 1, lastChunk.endX + 40, state.tier, state.seed);
    state.chunks.push(nextChunk);
    lastChunk = nextChunk;
  }

  state.chunks = state.chunks.filter((chunk) => chunk.endX > state.player.position.x - 760);
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
  if (launchDir.x < 0.02 || launchDir.y > 0.7) {
    return null;
  }

  const hits = getAllGrappleSurfaces(state.chunks)
    .map((surface) => lineIntersection(segmentStart, normalize(segmentDelta), segmentLength, surface))
    .filter((value): value is SegmentHit => value != null)
    .sort((a, b) => a.distance - b.distance);

  return hits[0] ?? null;
}

function queryStandingSurface(state: RunnerState, previousY: number, nextY: number) {
  const player = state.player;
  const bounds = getPlayerBounds(player);
  return getAllPlatforms(state.chunks)
    .filter((platform) => {
      const overlapsX = bounds.right > platform.x + 8 && bounds.left < platform.x + platform.width - 8;
      return overlapsX && previousY <= platform.y && nextY >= platform.y;
    })
    .sort((a, b) => a.y - b.y)[0] ?? null;
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

function getCurrentLane(state: RunnerState): Lane | null {
  const platformId = state.player.contacts.platformId;
  if (!platformId) return null;
  if (platformId.includes("high")) return "high";
  if (platformId.includes("mid")) return "mid";
  if (platformId.includes("low")) return "low";
  return null;
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
  state.player.action = "vault";
  state.player.vaultTimerMs = 190;
  state.player.vaultFrom = { ...state.player.position };
  state.player.vaultTo = { x: obstacle.x + obstacle.width / 2 + 26, y: obstacle.y };
  state.player.velocity.x = Math.max(state.player.velocity.x, getBaseSpeed(state.tier) + 110);
  state.player.velocity.y = -40;
  obstacle.cleared = true;
  awardFlow(state, 1, 24, "Clean vault kept the line alive.");
}

function tryStartSlide(state: RunnerState) {
  if (!state.player.contacts.grounded || state.player.velocity.x < 250 || state.player.action === "slide") {
    return;
  }
  state.player.action = "slide";
  state.player.slideTimerMs = SLIDE_MS;
  state.player.height = getPlayerHeight("slide");
  state.player.velocity.x = Math.min(MAX_SPEED + 70, Math.max(state.player.velocity.x, getBaseSpeed(state.tier) + 140));
  awardFlow(state, 1, 14, "Slide locked in. Keep it smooth.");
}

function applyPlayerHit(state: RunnerState, reason: string, severity: number, fatal = false) {
  const player = state.player;
  if (player.invulnerableMs > 0 || state.gameOver) {
    return;
  }

  const remainingGuard = player.guard - severity;
  if (fatal || remainingGuard < 0) {
    state.gameOver = true;
    state.reason = reason;
    return;
  }

  player.guard = remainingGuard;
  player.invulnerableMs = 850;
  player.hurtMs = 280;
  player.action = "hurt";
  player.velocity.x = Math.max(getBaseSpeed(state.tier) * 0.86, player.velocity.x - 170 - severity * 40);
  player.velocity.y = Math.min(player.velocity.y, -190 - severity * 40);
  state.flow.combo = Math.max(0, state.flow.combo - (severity === 2 ? 5 : 3));
  state.flow.comboTimerMs = Math.min(state.flow.comboTimerMs, 600);
  state.hitFlashMs = 220;
  state.statusText = `${reason} Guard ${player.guard}/${player.maxGuard}.`;

  if (player.guard === 0) {
    state.statusText = `${reason} One more mistake ends the run.`;
  }
}

function tryStartGrapple(state: RunnerState, input: InputState) {
  if (state.player.hook.phase !== "idle" || state.player.grappleCooldownMs > 0) {
    return;
  }
  const hand = { x: state.player.position.x + 8, y: state.player.position.y - state.player.height + 24 };
  const direction = normalize({ x: input.aimWorld.x - hand.x, y: input.aimWorld.y - hand.y });
  if (direction.x < 0.04 || input.aimWorld.y > hand.y - 8) {
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
    ttlMs: 460,
    hitSurfaceId: null
  };
  state.player.action = "grapple";
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
      awardFlow(state, 2, 30, "Grapple connected. Chase the upper route.");
      return;
    }

    if (hook.ropeLength >= HOOK_MAX_RANGE || hook.ttlMs <= 0) {
      hook.phase = "retracting";
      state.player.grappleCooldownMs = HOOK_MISS_COOLDOWN;
      state.statusText = "Missed grapple. Stay grounded and rebuild.";
    }
    return;
  }

  if (hook.phase === "attached" && hook.target) {
    const toTarget = { x: hook.target.x - state.player.position.x, y: hook.target.y - (state.player.position.y - state.player.height * 0.38) };
    const dist = Math.max(1, length(toTarget));
    const dir = normalize(toTarget);
    const tension = clamp((dist - 20) / 240, 0, 1);
    state.player.velocity.x += dir.x * (1020 + tension * 660) * dt;
    state.player.velocity.y += dir.y * (780 + tension * 540) * dt;
    state.player.velocity.x = Math.max(state.player.velocity.x, getBaseSpeed(state.tier) * 0.96);

    if (input.jumpPressed && dist < 84) {
      state.player.velocity.y = -JUMP_SPEED * 0.84;
      state.player.velocity.x = Math.min(MAX_SPEED + 100, state.player.velocity.x + 150);
      awardFlow(state, 2, 24, "Jumped out of the grapple arc.");
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
      state.player.hook = makeEmptyHook();
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

  const landingSurface = queryStandingSurface(state, previousY, player.position.y);
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
      player.action = "jump";
      awardFlow(state, 1, 8, "Buffered jump kept the rhythm clean.");
    } else if (hardLanding) {
      state.landingPulseMs = 180;
      player.hardLandingMs = 140;
      player.velocity.x = Math.max(getBaseSpeed(state.tier), player.velocity.x - 20);
    }
  }

  const wallContacts = queryNearbyWalls(state);
  player.contacts.leftWall = wallContacts.leftWall;
  player.contacts.rightWall = wallContacts.rightWall;
  player.contacts.underCeiling = queryCeilingObstacle(state) != null;

  const contactSide: -1 | 0 | 1 = player.contacts.leftWall ? -1 : player.contacts.rightWall ? 1 : 0;
  if (!player.contacts.grounded && contactSide !== 0 && player.velocity.y >= 0) {
    player.wallContactSide = contactSide;
    player.wallContactGraceMs = WALL_CONTACT_GRACE_MS;
  } else if (player.wallContactGraceMs <= 0) {
    player.wallContactSide = 0;
  }

  if (!player.contacts.grounded) {
    if (player.velocity.y > 0 && (player.contacts.leftWall || player.contacts.rightWall)) {
      player.action = "wall";
      player.velocity.y = Math.min(player.velocity.y, WALL_SLIDE_SPEED);
      state.wallScrapeMs = 70;
    } else if (player.hurtMs <= 0) {
      player.action = player.velocity.y < 0 ? "jump" : player.hook.phase === "attached" ? "grapple" : "fall";
    }
  } else if (player.action !== "vault" && player.action !== "slide" && player.hurtMs <= 0) {
    player.wallContactSide = 0;
    player.wallContactGraceMs = 0;
    player.action = "run";
  }
}

function updateScoringAndCombo(state: RunnerState, dtMs: number) {
  const lane = getCurrentLane(state);
  const comboDrain = lane === "low" && state.tier >= 1 ? 1.65 : lane === "mid" ? 1.08 : 1;
  state.flow.comboTimerMs = Math.max(0, state.flow.comboTimerMs - dtMs * comboDrain);
  if (state.flow.comboTimerMs === 0) {
    state.flow.combo = 0;
  }

  if (lane === "high") {
    state.flow.topRouteTicks += dtMs;
    state.flow.styleScore += dtMs / 185;
  } else if (lane === "mid") {
    state.flow.styleScore += dtMs / 260;
  } else if (lane === "low" && state.tier >= 1) {
    state.flow.styleScore = Math.max(0, state.flow.styleScore - dtMs / 450);
  }

  state.distance = Math.max(0, Math.floor((state.player.position.x - 80) / 10));
  const comboBonus = state.flow.combo * 14 + Math.floor(state.flow.styleScore);
  const guardBonus = state.player.guard * 18;
  state.score = Math.max(0, Math.floor(state.distance * 1.22 + state.coins * 34 + comboBonus + guardBonus));

  const nextTier = getTier(state.score);
  if (nextTier !== state.tier) {
    state.tier = nextTier;
    state.player.guard = Math.min(state.player.maxGuard, state.player.guard + 1);
    awardFlow(state, 2, 26, `${DISTRICT_FLOW_NAMES[nextTier]} reached. Guard restored by 1.`);
  }
}

function getObstacleRect(obstacle: Obstacle) {
  if (obstacle.kind === "slide-sign") {
    return {
      left: obstacle.x - obstacle.width / 2,
      right: obstacle.x + obstacle.width / 2,
      top: obstacle.y - 4,
      bottom: obstacle.y + obstacle.height
    };
  }
  if (obstacle.kind === "slide-tunnel") {
    return {
      left: obstacle.x - obstacle.width / 2,
      right: obstacle.x + obstacle.width / 2,
      top: obstacle.y,
      bottom: obstacle.y + obstacle.height
    };
  }
  if (obstacle.kind === "vault") {
    return {
      left: obstacle.x - obstacle.width / 2,
      right: obstacle.x + obstacle.width / 2,
      top: obstacle.y - obstacle.height,
      bottom: obstacle.y
    };
  }
  if (obstacle.kind === "air-hazard") {
    return {
      left: obstacle.x - obstacle.width / 2,
      right: obstacle.x + obstacle.width / 2,
      top: obstacle.y - obstacle.height,
      bottom: obstacle.y + obstacle.height
    };
  }
  return {
    left: obstacle.x - obstacle.width / 2,
    right: obstacle.x + obstacle.width / 2,
    top: 0,
    bottom: HEIGHT
  };
}

function intersects(bounds: ReturnType<typeof getPlayerBounds>, rect: ReturnType<typeof getObstacleRect>) {
  return bounds.right > rect.left && bounds.left < rect.right && bounds.bottom > rect.top && bounds.top < rect.bottom;
}

function updatePlayerMovement(state: RunnerState, input: InputState, dtMs: number) {
  const dt = dtMs / 1000;
  const player = state.player;
  const previousY = player.position.y;
  const activeDistrict = DISTRICTS[state.activeDistrict];

  player.height = getPlayerHeight(player.action);
  player.jumpBufferMs = Math.max(0, player.jumpBufferMs - dtMs);
  player.slideTimerMs = Math.max(0, player.slideTimerMs - dtMs);
  player.vaultTimerMs = Math.max(0, player.vaultTimerMs - dtMs);
  player.wallJumpLockMs = Math.max(0, player.wallJumpLockMs - dtMs);
  player.wallContactGraceMs = Math.max(0, player.wallContactGraceMs - dtMs);
  player.lastWallJumpAt = Math.min(9999, player.lastWallJumpAt + dtMs);
  player.grappleCooldownMs = Math.max(0, player.grappleCooldownMs - dtMs);
  player.coyoteMs = Math.max(0, player.coyoteMs - dtMs);
  player.hardLandingMs = Math.max(0, player.hardLandingMs - dtMs);
  player.invulnerableMs = Math.max(0, player.invulnerableMs - dtMs);
  player.hurtMs = Math.max(0, player.hurtMs - dtMs);
  state.landingPulseMs = Math.max(0, state.landingPulseMs - dtMs);
  state.wallScrapeMs = Math.max(0, state.wallScrapeMs - dtMs);
  state.hitFlashMs = Math.max(0, state.hitFlashMs - dtMs);
  state.totalTimeMs += dtMs;
  state.windPulseMs += dtMs;

  if (input.jumpPressed) {
    player.jumpBufferMs = JUMP_BUFFER_MS;
  }
  if (input.slidePressed && player.contacts.grounded) {
    tryStartSlide(state);
  }

  if (player.action === "vault" && player.vaultFrom && player.vaultTo && player.vaultTimerMs > 0) {
    const progress = 1 - player.vaultTimerMs / 190;
    player.position.x = lerp(player.vaultFrom.x, player.vaultTo.x, progress);
    player.position.y = lerp(player.vaultFrom.y, player.vaultTo.y, progress) - Math.sin(progress * Math.PI) * 18;
    player.velocity.x = Math.max(player.velocity.x, getBaseSpeed(state.tier) + 80);
    if (player.vaultTimerMs <= 0) {
      player.action = "run";
      player.vaultFrom = null;
      player.vaultTo = null;
    }
    resolvePlayerCollisions(state, previousY);
    updateScoringAndCombo(state, dtMs);
    return;
  }

  if ((player.contacts.grounded || player.coyoteMs > 0) && player.jumpBufferMs > 0) {
    player.velocity.y = -JUMP_SPEED;
    player.contacts.grounded = false;
    player.action = "jump";
    player.jumpBufferMs = 0;
    player.coyoteMs = 0;
    player.velocity.x = Math.min(MAX_SPEED + 70, player.velocity.x + 18);
    awardFlow(state, 1, 8, "Clean jump.");
  } else if (!player.contacts.grounded && player.jumpBufferMs > 0) {
    const sameWallLocked =
      player.wallContactSide !== 0 &&
      player.wallContactSide === player.lastWallJumpSide &&
      player.lastWallJumpAt < SAME_WALL_LOCK_MS;
    const canWallJump =
      player.action === "wall" &&
      player.wallContactSide !== 0 &&
      player.wallContactGraceMs > 0 &&
      player.velocity.y >= -10 &&
      !sameWallLocked;

    if (canWallJump) {
      player.velocity.y = -WALL_JUMP_Y;
      player.velocity.x = player.wallContactSide === -1 ? WALL_JUMP_X : -WALL_JUMP_X;
      player.wallJumpLockMs = 180;
      player.jumpBufferMs = 0;
      player.action = "jump";
      player.lastWallJumpSide = player.wallContactSide;
      player.lastWallJumpAt = 0;
      player.wallContactGraceMs = 0;
      awardFlow(state, 2, 22, "Wall kick saved the route.");
    } else if (sameWallLocked) {
      player.jumpBufferMs = 0;
      state.statusText = "Fresh wall only. Find the next surface.";
    }
  }

  updateHook(state, dt, input);

  if (player.hook.phase !== "attached") {
    player.velocity.y += GRAVITY * dt;
  }

  if (!player.contacts.grounded && activeDistrict.wind > 0) {
    const gust = Math.sin((state.windPulseMs + state.player.position.x * 0.08) / 310) * activeDistrict.wind * 80;
    player.velocity.x += gust * dt;
    if (player.action !== "wall") {
      player.velocity.y += Math.cos((state.windPulseMs + state.player.position.x) / 420) * activeDistrict.wind * 28 * dt;
    }
  }

  const targetRunSpeed = getBaseSpeed(state.tier);
  const speedBlend = player.contacts.grounded ? 0.2 : 0.08;
  if (player.wallJumpLockMs <= 0) {
    player.velocity.x = lerp(player.velocity.x, Math.max(targetRunSpeed, player.velocity.x), speedBlend);
  }

  if (player.action === "slide") {
    player.velocity.x = Math.max(player.velocity.x - 20 * dt, targetRunSpeed + 96);
    player.height = getPlayerHeight("slide");
    if (input.jumpPressed && player.slideTimerMs < SLIDE_CHAIN_MS + 110) {
      player.velocity.y = -JUMP_SPEED * 0.82;
      player.velocity.x = Math.min(MAX_SPEED + 90, player.velocity.x + 45);
      player.action = "jump";
      player.slideTimerMs = 0;
      player.jumpBufferMs = 0;
      awardFlow(state, 2, 20, "Slide-hop preserved the burst.");
    }
    if (player.slideTimerMs <= 0) {
      player.action = player.contacts.grounded ? "run" : "fall";
      player.height = getPlayerHeight(player.action);
    }
  } else if (!player.contacts.grounded && player.hook.phase !== "attached") {
    player.velocity.x = Math.max(targetRunSpeed * 0.92, player.velocity.x - 74 * dt);
  }

  const vaultable = getAllObstacles(state.chunks).find(
    (obstacle) =>
      !obstacle.cleared &&
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

  const slideHit = getAllObstacles(state.chunks).find((obstacle) => {
    if (obstacle.cleared || (obstacle.kind !== "slide-sign" && obstacle.kind !== "slide-tunnel")) {
      return false;
    }
    return intersects(movedBounds, getObstacleRect(obstacle));
  });
  if (slideHit && player.action !== "slide") {
    slideHit.cleared = true;
    applyPlayerHit(
      state,
      slideHit.kind === "slide-tunnel" ? "You stayed tall through the tunnel." : "You clipped the low sign.",
      slideHit.severity
    );
  } else if (slideHit && player.action === "slide") {
    slideHit.cleared = true;
    player.velocity.x = Math.min(MAX_SPEED + 100, player.velocity.x + 28);
    awardFlow(state, 2, 22, "Threaded the slide line.");
    if (Math.abs(movedBounds.top - (slideHit.y + 2)) < 12) {
      state.flow.nearMisses += 1;
      state.flow.styleScore += 12;
    }
  }

  const routeGate = getAllObstacles(state.chunks).find((obstacle) => {
    if (obstacle.kind !== "route-gate" || obstacle.cleared || obstacle.gapY == null || obstacle.gapHeight == null) {
      return false;
    }
    const left = obstacle.x - obstacle.width / 2;
    const right = obstacle.x + obstacle.width / 2;
    return movedBounds.right > left && movedBounds.left < right;
  });
  if (routeGate && routeGate.gapY != null && routeGate.gapHeight != null) {
    const gapTop = routeGate.gapY;
    const gapBottom = routeGate.gapY + routeGate.gapHeight;
    const fullyInsideGap = movedBounds.top >= gapTop && movedBounds.bottom <= gapBottom;
    if (fullyInsideGap) {
      routeGate.cleared = true;
      if (routeGate.response === "slide") {
        player.velocity.x = Math.min(MAX_SPEED + 100, player.velocity.x + 32);
        awardFlow(state, 2, 24, "Slide gate cleared clean.");
      } else if (routeGate.response === "jump") {
        awardFlow(state, 2, 24, "Jump gate snapped into place.");
      } else {
        awardFlow(state, 3, 30, "Grapple gate cleared.");
      }
    } else {
      routeGate.cleared = true;
      applyPlayerHit(
        state,
        routeGate.response === "slide"
          ? "Missed the low gate. Slide was the line."
          : routeGate.response === "jump"
            ? "Stayed too low for the jump gate."
            : "Missed the high gate. Grapple was the answer.",
        routeGate.severity,
        state.player.guard === 0 && routeGate.response === "grapple"
      );
    }
  }

  const airHazard = getAllObstacles(state.chunks).find(
    (obstacle) => !obstacle.cleared && obstacle.kind === "air-hazard" && intersects(movedBounds, getObstacleRect(obstacle))
  );
  if (airHazard) {
    airHazard.cleared = true;
    applyPlayerHit(
      state,
      airHazard.district === "industrial" ? "Steam blast clipped you." : airHazard.district === "storm" ? "Storm hazard broke your line." : "Air hazard tagged you.",
      airHazard.severity
    );
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
    state.player.guard = Math.min(state.player.maxGuard, state.player.guard + (state.coins % 10 === 0 ? 1 : 0));
    awardFlow(state, 1, 14, "Picked the cleaner line.");
  }

  resolvePlayerCollisions(state, previousY);
  ensureWorldAhead(state);
  const activeChunk = getActiveChunk(state);
  if (activeChunk && activeChunk.district !== state.activeDistrict) {
    state.activeDistrict = activeChunk.district;
    state.statusText = `${DISTRICTS[activeChunk.district].name}. ${DISTRICTS[activeChunk.district].emphasis}`;
  } else if (activeChunk) {
    state.activeDistrict = activeChunk.district;
  }

  updateScoringAndCombo(state, dtMs);

  const lane = getCurrentLane(state);
  if (lane === "low" && state.tier >= 1 && !player.contacts.grounded) {
    state.statusText = "You dropped to the safety line. Reclaim the upper route.";
  }

  if (player.position.y > HEIGHT + 150) {
    state.gameOver = true;
    state.reason = "You missed the route and fell out of the city.";
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

function renderSkylineLayer(
  ctx: CanvasRenderingContext2D,
  district: DistrictDefinition,
  color: string,
  baseY: number,
  width: number,
  factor: number,
  cameraX: number,
  timeMs: number,
  depth: number
) {
  ctx.fillStyle = color;
  const spacing = width + 32;
  const scroll = (cameraX * factor) % spacing;
  for (let i = -2; i < 15; i += 1) {
    const x = i * spacing - scroll;
    const wobble = Math.sin((i + depth) * 1.73) * 18;
    const towerHeight = 120 + wobble + (i % 4) * 28 + depth * 18;
    if (district.skylineMode === "glass") {
      ctx.fillRect(x, baseY - towerHeight, width, towerHeight);
      ctx.fillStyle = district.window;
      for (let row = 0; row < Math.floor(towerHeight / 18); row += 1) {
        ctx.fillRect(x + 12, baseY - towerHeight + 10 + row * 18, width - 24, 3);
      }
      ctx.fillStyle = color;
      ctx.fillRect(x + width - 16, baseY - towerHeight - 20, 8, 20);
    } else if (district.skylineMode === "billboards") {
      ctx.fillRect(x, baseY - towerHeight, width, towerHeight);
      ctx.fillRect(x + 16, baseY - towerHeight - 44, width - 32, 28);
      ctx.fillStyle = district.sign;
      ctx.fillRect(x + 22, baseY - towerHeight - 38, width - 44, 16);
      ctx.fillStyle = color;
      drawLine(ctx, x + 30, baseY - towerHeight - 16, x + 30, baseY - towerHeight, 3, 0.9);
      drawLine(ctx, x + width - 30, baseY - towerHeight - 16, x + width - 30, baseY - towerHeight, 3, 0.9);
    } else if (district.skylineMode === "crane") {
      ctx.fillRect(x, baseY - towerHeight, width * 0.7, towerHeight);
      drawLine(ctx, x + width * 0.72, baseY - towerHeight - 80, x + width * 0.72, baseY - 6, 3, 0.9);
      drawLine(ctx, x + width * 0.72, baseY - towerHeight - 74, x + width * 1.16, baseY - towerHeight - 92, 3, 0.9);
      drawLine(ctx, x + width * 1.02, baseY - towerHeight - 90, x + width * 1.02, baseY - towerHeight - 18, 2, 0.6);
    } else if (district.skylineMode === "storm") {
      ctx.fillRect(x, baseY - towerHeight, width, towerHeight);
      if (i % 5 === 0 && (timeMs / 260 + i) % 9 < 0.25) {
        ctx.strokeStyle = "rgba(226, 244, 255, 0.65)";
        drawLine(ctx, x + width * 0.55, baseY - towerHeight - 48, x + width * 0.44, baseY - towerHeight + 10, 2.2, 1);
      }
    } else if (district.skylineMode === "scaffold") {
      ctx.fillRect(x, baseY - towerHeight, width * 0.72, towerHeight);
      ctx.strokeStyle = district.platformTrim;
      for (let row = 0; row < Math.floor(towerHeight / 26); row += 1) {
        drawLine(ctx, x + width * 0.78, baseY - towerHeight + row * 24, x + width * 0.98, baseY - towerHeight + row * 24 + 18, 2, 0.55);
        drawLine(ctx, x + width * 0.98, baseY - towerHeight + row * 24, x + width * 0.78, baseY - towerHeight + row * 24 + 18, 2, 0.55);
      }
    } else {
      ctx.fillRect(x, baseY - towerHeight, width, towerHeight);
      ctx.fillStyle = district.window;
      const flicker = 0.75 + Math.sin((timeMs + i * 100) / 420) * 0.15;
      ctx.globalAlpha = flicker;
      for (let row = 0; row < Math.floor(towerHeight / 22); row += 1) {
        for (let col = 0; col < 3; col += 1) {
          if ((row + col + i) % 2 === 0) {
            ctx.fillRect(x + 10 + col * 18, baseY - towerHeight + 10 + row * 20, 10, 7);
          }
        }
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = color;
      if (district.skylineMode === "neon") {
        ctx.fillStyle = district.sign;
        ctx.fillRect(x + 12, baseY - towerHeight + 28, width - 24, 6);
        ctx.fillStyle = color;
      }
      if (district.skylineMode === "industrial") {
        ctx.fillRect(x + width - 20, baseY - towerHeight - 26, 12, 26);
        ctx.fillRect(x + width - 28, baseY - towerHeight - 30, 28, 6);
      }
    }
    ctx.fillStyle = color;
  }
}

function renderBackground(ctx: CanvasRenderingContext2D, tier: DistrictTier, districtId: DistrictId, cameraX = 0, speed = 0, timeMs = 0) {
  const district = DISTRICTS[districtId];
  const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  sky.addColorStop(0, district.skyTop);
  sky.addColorStop(0.56, district.skyMid);
  sky.addColorStop(1, district.skyBottom);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = district.haze;
  ctx.beginPath();
  ctx.arc(WIDTH - 130, 98, district.id === "storm" ? 44 : 56, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = district.glow;
  ctx.beginPath();
  ctx.ellipse(WIDTH - 120, 112, 120, 46, -0.1, 0, Math.PI * 2);
  ctx.fill();

  renderSkylineLayer(ctx, district, district.layerA, 252, 124, 0.1, cameraX, timeMs, 0);
  renderSkylineLayer(ctx, district, district.layerB, 312, 96, 0.21, cameraX, timeMs, 1);
  renderSkylineLayer(ctx, district, district.layerC, 372, 78, 0.34, cameraX, timeMs, 2);

  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  for (let i = 0; i < 8; i += 1) {
    drawLine(ctx, 0, 84 + i * 48, WIDTH, 80 + i * 48, 1, 0.35);
  }

  if (district.id === "storm") {
    ctx.strokeStyle = "rgba(186, 223, 255, 0.16)";
    for (let i = 0; i < 32; i += 1) {
      const x = ((i * 43 + timeMs * 0.6) % (WIDTH + 80)) - 40;
      const y = (i * 17 + timeMs * 0.18) % HEIGHT;
      drawLine(ctx, x, y, x - 8, y + 18, 1.2, 0.9);
    }
  }

  const speedAlpha = clamp((speed - BASE_RUN_SPEED) / 260, 0, 0.28);
  if (speedAlpha > 0) {
    ctx.strokeStyle = `rgba(255,255,255,${speedAlpha})`;
    for (let i = 0; i < 10; i += 1) {
      drawLine(ctx, 24 + i * 96, 132 + (i % 4) * 48, 78 + i * 96, 126 + (i % 4) * 48, 1.4, 1);
    }
  }

  ctx.fillStyle = `rgba(255,255,255,${district.fogAlpha})`;
  ctx.fillRect(0, HEIGHT - 140, WIDTH, 140);
}

function renderPlatformDecor(ctx: CanvasRenderingContext2D, platform: Platform, cameraX: number, timeMs: number) {
  const district = DISTRICTS[platform.district];
  const x = platform.x - cameraX;
  const laneMultiplier = platform.lane === "high" ? 1.14 : platform.lane === "mid" ? 1.04 : 1;

  ctx.fillStyle = district.platformFace;
  ctx.fillRect(x, platform.y, platform.width, platform.height);
  ctx.fillStyle = district.platformTop;
  ctx.fillRect(x, platform.y, platform.width, 8);
  ctx.fillStyle = district.platformTrim;
  ctx.fillRect(x, platform.y + 12, platform.width, 4);
  ctx.strokeStyle = "rgba(8, 12, 21, 0.9)";
  drawRectStroke(ctx, x, platform.y, platform.width, platform.height, 1);

  for (let i = 0; i < Math.floor(platform.width / 42); i += 1) {
    const propX = x + 16 + i * 36;
    const bob = Math.sin((timeMs + i * 60) / 260) * 0.4;
    if (platform.district === "apartments") {
      ctx.fillStyle = "rgba(220, 227, 239, 0.18)";
      ctx.fillRect(propX, platform.y + 18 + (i % 2) * 10, 13, 18);
      ctx.fillStyle = district.sign;
      ctx.fillRect(propX + 2, platform.y + 22 + bob, 9, 2);
    } else if (platform.district === "construction") {
      ctx.strokeStyle = district.sign;
      drawLine(ctx, propX, platform.y + 12, propX + 12, platform.y + 30, 2, 0.75);
      drawLine(ctx, propX + 12, platform.y + 12, propX, platform.y + 30, 2, 0.75);
    } else if (platform.district === "neon") {
      ctx.fillStyle = district.sign;
      ctx.fillRect(propX, platform.y + 18, 14, 4);
      ctx.fillStyle = "rgba(255,255,255,0.1)";
      ctx.fillRect(propX + 2, platform.y + 24, 10, 10);
    } else if (platform.district === "industrial") {
      ctx.fillStyle = "rgba(169, 181, 196, 0.26)";
      ctx.fillRect(propX, platform.y + 18, 16, 20);
      ctx.fillStyle = district.sign;
      ctx.fillRect(propX + 4, platform.y + 12, 8, 6);
    } else if (platform.district === "billboard") {
      ctx.strokeStyle = district.sign;
      drawLine(ctx, propX + 2, platform.y + 8, propX + 2, platform.y + 30, 2, 0.65);
      drawLine(ctx, propX + 14, platform.y + 8, propX + 14, platform.y + 30, 2, 0.65);
      ctx.fillStyle = district.sign;
      ctx.fillRect(propX, platform.y + 10, 16, 10);
    } else if (platform.district === "glass") {
      ctx.fillStyle = "rgba(214, 245, 255, 0.2)";
      ctx.fillRect(propX, platform.y + 16, 8, 24);
      ctx.fillRect(propX + 10, platform.y + 20, 6, 20);
    } else if (platform.district === "crane") {
      ctx.strokeStyle = district.sign;
      drawLine(ctx, propX + 3, platform.y + 12, propX + 3, platform.y + 34, 2, 0.65);
      drawLine(ctx, propX + 3, platform.y + 12, propX + 18, platform.y + 12, 2, 0.65);
    } else if (platform.district === "storm") {
      ctx.strokeStyle = "rgba(198, 226, 255, 0.24)";
      drawLine(ctx, propX, platform.y + 16, propX + 12, platform.y + 28, 1.4, 0.7);
    }
  }

  ctx.strokeStyle = district.window;
  for (let row = 0; row < Math.min(4, Math.floor(platform.height / 30)); row += 1) {
    drawLine(ctx, x + 12, platform.y + 24 + row * 26, x + platform.width - 12, platform.y + 24 + row * 26, 1, 0.35 * laneMultiplier);
  }
}

function renderObstacle(ctx: CanvasRenderingContext2D, obstacle: Obstacle, cameraX: number, timeMs: number) {
  const district = DISTRICTS[obstacle.district];
  const x = obstacle.x - cameraX - obstacle.width / 2;

  if (obstacle.kind === "vault") {
    ctx.fillStyle = district.platformTrim;
    ctx.fillRect(x, obstacle.y - obstacle.height, obstacle.width, obstacle.height);
    ctx.fillStyle = district.accent;
    ctx.fillRect(x + 6, obstacle.y - obstacle.height + 6, obstacle.width - 12, 4);
    ctx.strokeStyle = "rgba(12, 18, 29, 0.9)";
    drawRectStroke(ctx, x, obstacle.y - obstacle.height, obstacle.width, obstacle.height, 1);
  } else if (obstacle.kind === "slide-sign") {
    ctx.strokeStyle = district.sign;
    drawLine(ctx, x, obstacle.y, x + obstacle.width, obstacle.y, 4, 1);
    drawLine(ctx, x + 10, obstacle.y, x + 10, obstacle.y + obstacle.height, 2.4, 0.9);
    drawLine(ctx, x + obstacle.width - 10, obstacle.y, x + obstacle.width - 10, obstacle.y + obstacle.height, 2.4, 0.9);
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    drawLine(ctx, x + 16, obstacle.y - 8, x + obstacle.width - 16, obstacle.y - 8, 1.5, 1);
  } else if (obstacle.kind === "slide-tunnel") {
    ctx.fillStyle = "rgba(10, 16, 27, 0.78)";
    ctx.fillRect(x, obstacle.y, obstacle.width, obstacle.height);
    ctx.strokeStyle = district.accent;
    drawRectStroke(ctx, x, obstacle.y, obstacle.width, obstacle.height, 1);
    drawLine(ctx, x + 14, obstacle.y + obstacle.height / 2, x + obstacle.width - 14, obstacle.y + obstacle.height / 2, 2, 0.5);
  } else if (obstacle.kind === "air-hazard") {
    const pulse = 0.75 + Math.sin((timeMs + obstacle.x) / 120) * 0.2;
    ctx.save();
    ctx.globalAlpha = pulse;
    if (obstacle.district === "industrial") {
      ctx.fillStyle = "rgba(255, 130, 91, 0.36)";
      ctx.beginPath();
      ctx.ellipse(x + obstacle.width / 2, obstacle.y, obstacle.width / 2, obstacle.height, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = district.accent;
      drawLine(ctx, x + 10, obstacle.y + 8, x + obstacle.width - 6, obstacle.y - 10, 2.2, 1);
      drawLine(ctx, x + 10, obstacle.y - 8, x + obstacle.width - 6, obstacle.y + 10, 2.2, 1);
    } else {
      ctx.strokeStyle = district.accent;
      drawLine(ctx, x, obstacle.y, x + obstacle.width / 2, obstacle.y - obstacle.height / 2, 2.4, 1);
      drawLine(ctx, x + obstacle.width / 2, obstacle.y - obstacle.height / 2, x + obstacle.width, obstacle.y, 2.4, 1);
      drawLine(ctx, x + obstacle.width * 0.2, obstacle.y + 6, x + obstacle.width * 0.8, obstacle.y - obstacle.height * 0.35 + 6, 1.3, 0.75);
    }
    ctx.restore();
  } else if (obstacle.kind === "route-gate" && obstacle.gapY != null && obstacle.gapHeight != null) {
    const gateLeft = x;
    const gapTop = obstacle.gapY;
    const gapBottom = obstacle.gapY + obstacle.gapHeight;
    ctx.fillStyle = "rgba(7, 11, 19, 0.88)";
    ctx.fillRect(gateLeft, 0, obstacle.width, gapTop);
    ctx.fillRect(gateLeft, gapBottom, obstacle.width, HEIGHT - gapBottom);
    ctx.strokeStyle =
      obstacle.response === "slide"
        ? "#f59e0b"
        : obstacle.response === "jump"
          ? "#9ff0a6"
          : "#74d5ff";
    drawRectStroke(ctx, gateLeft, 0, obstacle.width, gapTop, 1);
    drawRectStroke(ctx, gateLeft, gapBottom, obstacle.width, HEIGHT - gapBottom, 1);
    drawLine(ctx, gateLeft + 8, gapTop, gateLeft + obstacle.width - 8, gapTop, 2.5, 0.85);
    drawLine(ctx, gateLeft + 8, gapBottom, gateLeft + obstacle.width - 8, gapBottom, 2.5, 0.85);
    ctx.fillStyle = district.accentSoft;
    ctx.fillRect(gateLeft - 4, gapTop, obstacle.width + 8, obstacle.gapHeight);
  }
}

function getSpriteImage(bank: SpriteBank | null, action: PlayerAction, totalTimeMs: number, velocityY: number) {
  if (!bank) return null;
  if (action === "slide") {
    return bank.slide[Math.floor(totalTimeMs / 55) % bank.slide.length] ?? null;
  }
  if (action === "hurt") {
    return bank.hurt[Math.floor(totalTimeMs / 60) % bank.hurt.length] ?? bank.jump[5] ?? null;
  }
  if (action === "jump" || action === "fall" || action === "wall" || action === "grapple" || velocityY !== 0) {
    const index = velocityY < -40 ? 2 : velocityY > 140 ? 7 : 5;
    return bank.jump[index] ?? bank.jump[0] ?? null;
  }
  return bank.run[Math.floor(totalTimeMs / 75) % bank.run.length] ?? null;
}

function renderPlayer(ctx: CanvasRenderingContext2D, state: RunnerState, cameraX: number, spriteBank: SpriteBank | null) {
  const player = state.player;
  const x = player.position.x - cameraX;
  const y = player.position.y;
  const district = DISTRICTS[state.activeDistrict];
  const sprite = getSpriteImage(spriteBank, player.action, state.totalTimeMs, player.velocity.y);
  const width = player.action === "slide" ? 86 : player.action === "wall" ? 80 : 74;
  const height = player.action === "slide" ? 62 : 96;
  const alpha = player.invulnerableMs > 0 ? (Math.floor(player.invulnerableMs / 80) % 2 === 0 ? 0.55 : 0.9) : 1;
  const trailAlpha = clamp((player.velocity.x - BASE_RUN_SPEED) / 300, 0, 0.35);

  ctx.fillStyle = "rgba(5, 7, 15, 0.26)";
  ctx.beginPath();
  ctx.ellipse(x + 4, y + 7, player.action === "slide" ? 28 : 22, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  if (trailAlpha > 0) {
    ctx.strokeStyle = `rgba(255,255,255,${trailAlpha})`;
    for (let i = 0; i < 4; i += 1) {
      drawLine(ctx, x - 18 - i * 10, y - 22 + i * 9, x - 42 - i * 10, y - 16 + i * 9, 1.7 - i * 0.2, 1);
    }
  }

  if (sprite) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y - (player.action === "slide" ? 34 : 52));
    if (player.facing === -1) {
      ctx.scale(-1, 1);
    }
    if (player.action === "wall") {
      ctx.rotate(player.contacts.leftWall ? -0.08 : 0.08);
    } else if (player.action === "grapple") {
      ctx.rotate(-0.06);
    } else if (player.action === "hurt") {
      ctx.rotate(0.09);
    }
    ctx.drawImage(sprite, -width / 2, -height / 2, width, height);
    ctx.restore();
  } else {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = district.accent;
    ctx.fillRect(x - 10, y - 60, 20, 36);
    ctx.fillStyle = "#f8f4ec";
    ctx.beginPath();
    ctx.arc(x, y - 68, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  if (state.player.hook.phase !== "idle") {
    ctx.strokeStyle = "#bfeaff";
    drawLine(ctx, x + 10, y - player.height + 24, state.player.hook.tip.x - cameraX, state.player.hook.tip.y, 2.5, 0.95);
    ctx.fillStyle = "#74d5ff";
    ctx.beginPath();
    ctx.arc(state.player.hook.tip.x - cameraX, state.player.hook.tip.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  if (state.landingPulseMs > 0) {
    ctx.strokeStyle = "rgba(255,240,204,0.78)";
    drawLine(ctx, x - 28, y + 2, x - 4, y + 8, 2.2, 1);
    drawLine(ctx, x + 4, y + 8, x + 28, y + 2, 2.2, 1);
  }

  if (state.wallScrapeMs > 0) {
    ctx.strokeStyle = "rgba(255,194,102,0.84)";
    drawLine(ctx, x + (player.contacts.leftWall ? -16 : 16), y - 46, x + (player.contacts.leftWall ? -24 : 24), y - 8, 2, 1);
  }
}

function renderWorld(ctx: CanvasRenderingContext2D, state: RunnerState, input: InputState, spriteBank: SpriteBank | null) {
  const targetCameraX = Math.max(0, state.player.position.x - PLAYER_SCREEN_X + state.player.velocity.x * 0.14);
  state.camera.x = lerp(state.camera.x, targetCameraX, 0.12);
  const cameraX = state.camera.x;
  renderBackground(ctx, state.tier, state.activeDistrict, cameraX, state.player.velocity.x, state.totalTimeMs);

  state.chunks.forEach((chunk) => {
    chunk.platforms.forEach((platform) => {
      const x = platform.x - cameraX;
      if (x + platform.width < -60 || x > WIDTH + 60) return;
      renderPlatformDecor(ctx, platform, cameraX, state.totalTimeMs);
    });

    chunk.grappleSurfaces.forEach((surface) => {
      const x1 = surface.x1 - cameraX;
      const x2 = surface.x2 - cameraX;
      const district = DISTRICTS[chunk.district];
      ctx.strokeStyle = surface.kind === "anchor-wire" ? "rgba(213, 232, 255, 0.85)" : district.accent;
      drawLine(ctx, x1, surface.y1, x2, surface.y2, surface.kind === "anchor-wire" ? 2.5 : 3.2, 0.98);
      if (surface.kind !== "anchor-wire") {
        drawLine(ctx, x1, surface.y1 - 4, x2, surface.y2 - 4, 1, 0.45);
      }
    });

    chunk.obstacles.forEach((obstacle) => {
      if (!obstacle.cleared) {
        renderObstacle(ctx, obstacle, cameraX, state.totalTimeMs);
      }
    });

    chunk.pickups.forEach((pickup) => {
      if (pickup.collected) return;
      const district = DISTRICTS[pickup.district];
      const x = pickup.x - cameraX;
      const pulse = 0.8 + Math.sin((state.totalTimeMs + pickup.x) / 120) * 0.15;
      ctx.strokeStyle = district.accent;
      ctx.beginPath();
      ctx.arc(x, pickup.y, 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = pulse;
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.beginPath();
      ctx.arc(x, pickup.y, 13, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    });
  });

  renderPlayer(ctx, state, cameraX, spriteBank);

  ctx.strokeStyle = "rgba(191, 219, 254, 0.65)";
  drawLine(ctx, input.aimScreen.x - 8, input.aimScreen.y, input.aimScreen.x + 8, input.aimScreen.y, 1.4);
  drawLine(ctx, input.aimScreen.x, input.aimScreen.y - 8, input.aimScreen.x, input.aimScreen.y + 8, 1.4);

  if (state.hitFlashMs > 0) {
    ctx.fillStyle = "rgba(255, 120, 96, 0.16)";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }
}

function makeHudState(): HudState {
  return {
    score: 0,
    distance: 0,
    coins: 0,
    speed: getBaseSpeed(0),
    districtTier: 0,
    districtId: "apartments",
    combo: 0,
    bestCombo: 0,
    hookReady: true,
    hookAccuracy: 0,
    styleScore: 0,
    guard: 3,
    phaseLabel: DISTRICT_FLOW_NAMES[0]
  };
}

const RooftopRunner: React.FC = () => {
  const assetBase = import.meta.env.BASE_URL;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<RunnerState | null>(null);
  const spriteBankRef = useRef<SpriteBank | null>(null);
  const bestScoreRef = useRef(loadLocalBest());
  const autoStartRef = useRef(false);
  const titleAudioRef = useRef<HTMLAudioElement | null>(null);
  const gameplayAudioRef = useRef<HTMLAudioElement | null>(null);
  const bonusAudioRef = useRef<HTMLAudioElement | null>(null);
  const resultsAudioRef = useRef<HTMLAudioElement | null>(null);

  const [phase, setPhase] = useState<GamePhase>("title");
  const [runSeed, setRunSeed] = useState(0);
  const [spritesReady, setSpritesReady] = useState(false);
  const [bestScore, setBestScore] = useState(() => loadLocalBest());
  const [status, setStatus] = useState("Build speed low, cash in style high, and use mistakes as recoveries instead of endings.");
  const [hud, setHud] = useState<HudState>(makeHudState);
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
    titleTrack.volume = 0.18;
    const gameplayTrack = new Audio(gameplayTrackPath);
    gameplayTrack.loop = true;
    gameplayTrack.volume = 0.15;
    const bonusTrack = new Audio(bonusTrackPath);
    bonusTrack.volume = 0.38;
    const resultsTrack = new Audio(resultsTrackPath);
    resultsTrack.volume = 0.24;

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
    const makeFrames = async (prefix: "Run" | "Jump" | "Slide" | "Dead") => {
      const entries = await Promise.all(
        Array.from({ length: 10 }, (_, index) => {
          const img = new Image();
          img.decoding = "async";
          img.src = `${assetBase}assets/ninjump/ninja/${prefix}__${String(index).padStart(3, "0")}.png`;
          return img.decode().catch(() => undefined).then(() => img);
        })
      );
      return entries;
    };

    let cancelled = false;
    Promise.all([makeFrames("Run"), makeFrames("Jump"), makeFrames("Slide"), makeFrames("Dead")]).then(
      ([run, jump, slide, hurt]) => {
        if (cancelled) return;
        spriteBankRef.current = { run, jump, slide, hurt };
        setSpritesReady(true);
      }
    );

    return () => {
      cancelled = true;
    };
  }, [assetBase]);

  useEffect(() => {
    if (phase === "title") {
      gameplayAudioRef.current?.pause();
      resultsAudioRef.current?.pause();
      void titleAudioRef.current?.play().catch(() => undefined);
    } else if (phase === "playing") {
      titleAudioRef.current?.pause();
      resultsAudioRef.current?.pause();
      void gameplayAudioRef.current?.play().catch(() => undefined);
    } else if (phase === "paused") {
      gameplayAudioRef.current?.pause();
      titleAudioRef.current?.pause();
      resultsAudioRef.current?.pause();
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
    if (!canvas || phase === "playing") return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = WIDTH;
    canvas.height = HEIGHT;

    const preview = phase === "title" ? createTitlePreviewState(11) : stateRef.current ?? createTitlePreviewState(11);
    renderWorld(
      ctx,
      preview,
      {
        jumpHeld: false,
        jumpPressed: false,
        slideHeld: false,
        slidePressed: false,
        hookPressed: false,
        hookReleased: false,
        aimScreen: { x: WIDTH * 0.72, y: HEIGHT * 0.28 },
        aimWorld: { x: preview.player.position.x + 150, y: 140 }
      },
      spritesReady ? spriteBankRef.current : null
    );
  }, [phase, spritesReady]);

  useEffect(() => {
    if (phase !== "playing") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = WIDTH;
    canvas.height = HEIGHT;

    const state = stateRef.current ?? createInitialState(runSeed + 1);
    stateRef.current = state;
    let raf = 0;
    let last = performance.now();
    let hudAccum = 0;
    let milestonePlayedForTier: DistrictTier = state.tier;
    let finished = false;

    const input: InputState = {
      jumpHeld: false,
      jumpPressed: false,
      slideHeld: false,
      slidePressed: false,
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
      if (event.code === "Escape") {
        setPhase("paused");
        event.preventDefault();
        return;
      }
      if (event.code === "ArrowUp" || event.code === "KeyW" || event.code === "Space") {
        if (!input.jumpHeld) {
          input.jumpPressed = true;
        }
        input.jumpHeld = true;
        event.preventDefault();
      }
      if (event.code === "ArrowDown" || event.code === "KeyS") {
        if (!input.slideHeld) {
          input.slidePressed = true;
        }
        input.slideHeld = true;
        event.preventDefault();
      }
      if (event.code === "KeyE" || event.code === "ShiftLeft" || event.code === "ShiftRight") {
        input.hookPressed = true;
        event.preventDefault();
      }
      if (event.code === "KeyR") {
        event.preventDefault();
        beginRun();
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
        if (state.player.hook.phase === "attached") {
          input.hookReleased = true;
        } else {
          input.hookPressed = true;
        }
      } else if (input.aimScreen.y < HEIGHT * 0.6) {
        input.jumpPressed = true;
        input.jumpHeld = true;
      } else {
        input.slidePressed = true;
        input.slideHeld = true;
      }
    };
    const onPointerUp = () => {
      input.jumpHeld = false;
      input.slideHeld = false;
    };

    const finalize = () => {
      if (finished) return;
      finished = true;
      const accuracy = state.flow.grappleShots > 0 ? Math.round((state.flow.grappleHits / state.flow.grappleShots) * 100) : 0;
      const goldEarned =
        state.distance < 60
          ? 0
          : clamp(
              Math.floor(state.distance / 220) +
                Math.floor(state.score / 560) +
                Math.floor(state.flow.bestCombo / 7) +
                Math.floor(state.flow.styleScore / 260) +
                Math.floor(state.coins / 5),
              1,
              18
            );
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
        styleScore: Math.round(state.flow.styleScore),
        districtName: DISTRICTS[state.activeDistrict].name
      });
      void recordArcadeResult({ scoreGameName: "rooftop_runner", score: state.score, goldEarned }).catch(() => undefined);
      window.setTimeout(() => setPhase("gameOver"), 180);
    };

    const tick = (time: number) => {
      const deltaMs = Math.min(33, time - last);
      last = time;
      updatePlayerMovement(state, input, deltaMs);
      renderWorld(ctx, state, input, spritesReady ? spriteBankRef.current : null);

      if (state.tier > milestonePlayedForTier) {
        milestonePlayedForTier = state.tier;
        void bonusAudioRef.current?.play().catch(() => undefined);
      }

      hudAccum += deltaMs;
      if (hudAccum >= 80) {
        hudAccum = 0;
        const accuracy = state.flow.grappleShots > 0 ? Math.round((state.flow.grappleHits / state.flow.grappleShots) * 100) : 0;
        setHud({
          score: state.score,
          distance: state.distance,
          coins: state.coins,
          speed: Math.round(state.player.velocity.x),
          districtTier: state.tier,
          districtId: state.activeDistrict,
          combo: state.flow.combo,
          bestCombo: state.flow.bestCombo,
          hookReady: state.player.grappleCooldownMs <= 0 && state.player.hook.phase === "idle",
          hookAccuracy: accuracy,
          styleScore: Math.round(state.flow.styleScore),
          guard: state.player.guard,
          phaseLabel: DISTRICT_FLOW_NAMES[state.tier]
        });
        setStatus(state.statusText);
      }

      input.hookPressed = false;
      input.hookReleased = false;
      input.jumpPressed = false;
      input.slidePressed = false;

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
  }, [phase, runSeed, spritesReady]);

  const beginRun = () => {
    const nextState = createInitialState(runSeed + 1);
    stateRef.current = nextState;
    setLastRun(null);
    setStatus(nextState.statusText);
    setHud(makeHudState());
    setRunSeed((value) => value + 1);
    setPhase("playing");
  };

  const resumeRun = () => {
    if (stateRef.current) {
      setPhase("playing");
    }
  };

  useEffect(() => {
    if (phase !== "title" || autoStartRef.current) return;
    const search = new URLSearchParams(window.location.search);
    if (search.get("autostart") !== "1") return;
    autoStartRef.current = true;
    const timer = window.setTimeout(() => beginRun(), 260);
    return () => window.clearTimeout(timer);
  }, [phase, spritesReady]);

  const activeDistrict = DISTRICTS[hud.districtId];

  return (
    <div className="page">
      <NavBar />
      <main className="content card rooftop-shell">
        <div className="rooftop-copy">
          <span className="rooftop-hero-kicker">Arcade Parkour Runner</span>
          <h1>Rooftop Runner</h1>
          <p>
            A compact rooftop arcade run built around speed, flow, and stylish survival. Chain slides, vaults, wall kicks,
            and aimed grapples across eight city districts until the run feels untouchable.
          </p>
        </div>

        <div className="rooftop-layout">
          <section className="rooftop-stage rooftop-stage--paper">
            <canvas ref={canvasRef} className="rooftop-canvas" />

            <div className="rooftop-hud rooftop-hud--top">
              <div className="rooftop-marquee">
                <span className="rooftop-logo">Rooftop Runner</span>
                <span className="rooftop-pill">{activeDistrict.name}</span>
                <span className="rooftop-pill rooftop-pill--accent">{hud.phaseLabel}</span>
              </div>

              <div className="rooftop-scoreboard">
                <span>Score {hud.score}</span>
                <span>{hud.distance}m</span>
                <span>Coins {hud.coins}</span>
                <span>Combo x{hud.combo}</span>
              </div>
            </div>

            <div className="rooftop-hud rooftop-hud--bottom">
              <span>Jump `W` / `Up` / `Space`</span>
              <span>Slide `S` / `Down`</span>
              <span>Grapple click / `E` / `Shift`</span>
              <span>Pause `Esc`</span>
            </div>

            {phase !== "playing" ? (
              <div className="rooftop-overlay">
                <div className="rooftop-overlay-card rooftop-overlay-card--paper">
                  <p className="rooftop-overlay-kicker">
                    {phase === "title" ? "Momentum Parkour" : phase === "paused" ? "Run Paused" : "Run Complete"}
                  </p>
                  <h2>
                    {phase === "title" ? "Hit the skyline" : phase === "paused" ? "Hold the line" : `Score ${lastRun?.score ?? 0}`}
                  </h2>
                  <p>
                    {phase === "title"
                      ? "Mistakes drain guard instead of ending the run instantly. Clean routes, upper bars, and smart slides build the real score."
                      : phase === "paused"
                        ? "Resume when you’re ready, or restart and chase a cleaner route through the next district."
                        : `${lastRun?.reason ?? "Run complete."} Combo ${lastRun?.bestCombo ?? 0}. Accuracy ${lastRun?.accuracy ?? 0}%.`}
                  </p>

                  <div className="rooftop-overlay-grid">
                    {phase === "title" ? (
                      <>
                        <span>8 themed districts</span>
                        <span>Guard-based recovery</span>
                        <span>Useful slide routes</span>
                        <span>High-route grapple scoring</span>
                      </>
                    ) : lastRun ? (
                      <>
                        <span>{lastRun.distance}m covered</span>
                        <span>{lastRun.coins} pickups</span>
                        <span>{lastRun.styleScore} style</span>
                        <span>{lastRun.goldEarned} gold</span>
                      </>
                    ) : null}
                  </div>

                  <div className="rooftop-overlay-actions">
                    {phase === "paused" ? (
                      <button className="primary-button" type="button" onClick={resumeRun}>
                        Resume Run
                      </button>
                    ) : null}
                    <button className="primary-button" type="button" onClick={beginRun}>
                      {phase === "title" ? "Start Run" : "Run It Back"}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </section>

          <aside className="rooftop-sidepanel">
            <div className="rooftop-panel rooftop-panel--paper">
              <span className="rooftop-panel-title">Current District</span>
              <p>{activeDistrict.subtitle}</p>
              <p>{activeDistrict.emphasis}</p>
              <div className="rooftop-districts-grid">
                {DISTRICT_ORDER.map((districtId) => (
                  <span
                    key={districtId}
                    className={`rooftop-district-chip ${districtId === hud.districtId ? "is-active" : ""}`}
                    style={{ ["--district-accent" as string]: DISTRICTS[districtId].accent }}
                  >
                    {DISTRICTS[districtId].name}
                  </span>
                ))}
              </div>
            </div>

            <div className="rooftop-panel rooftop-panel--paper">
              <span className="rooftop-panel-title">Run Readout</span>
              <p>Speed {hud.speed}</p>
              <p>Guard {hud.guard}/3</p>
              <p>Best combo {hud.bestCombo}</p>
              <p>Hook accuracy {hud.hookAccuracy}%</p>
              <p>Style score {hud.styleScore}</p>
            </div>

            <div className="rooftop-panel rooftop-panel--paper">
              <span className="rooftop-panel-title">Run Status</span>
              <p>{status}</p>
              <p>Best score on this device: {bestScore}</p>
              {lastRun ? (
                <p>
                  Last run: {lastRun.score} score, {lastRun.distance}m, {lastRun.coins} pickups, combo {lastRun.bestCombo}.
                </p>
              ) : (
                <p>Low route is safer. Upper route wins runs.</p>
              )}
              <div className="rooftop-panel-actions">
                <button className="primary-button" type="button" onClick={beginRun}>
                  {phase === "playing" ? "Restart Run" : phase === "paused" ? "Restart Fresh" : "Start Run"}
                </button>
                {phase === "paused" ? (
                  <button className="secondary-button" type="button" onClick={resumeRun}>
                    Resume
                  </button>
                ) : null}
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
};

export default RooftopRunner;
