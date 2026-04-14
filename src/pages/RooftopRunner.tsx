import React, { useEffect, useMemo, useRef, useState } from "react";
import NavBar from "../components/NavBar";
import { recordArcadeResult } from "../lib/progression";

type GamePhase = "title" | "playing" | "gameOver";
type DistrictTier = 0 | 1 | 2 | 3;
type AreaType =
  | "skylineSprint"
  | "constructionGauntlet"
  | "clutteredRoofs"
  | "wallRunDistrict"
  | "needleAlleys"
  | "openChase"
  | "industrialHazards"
  | "eliteFlow";
type PlayerAction =
  | "running"
  | "jumping"
  | "falling"
  | "sliding"
  | "wallSliding"
  | "grappling"
  | "vaulting";
type SurfaceKind = "roof" | "ledge" | "grapple-bar" | "anchor-wire";
type ObstacleKind = "low-barrier" | "slide-sign" | "slide-gap" | "air-hazard";
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
  cleared?: boolean;
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
  areaType: AreaType;
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
  wallContactSide: -1 | 0 | 1;
  wallContactGraceMs: number;
  lastWallJumpSide: -1 | 0 | 1;
  lastWallJumpAt: number;
  wallReusePenaltyCount: number;
  grappleCooldownMs: number;
  hardLandingMs: number;
  hook: HookState;
};

type RunnerState = {
  seed: number;
  player: PlayerState;
  chunks: Chunk[];
  camera: Vec2;
  activeArea: AreaType;
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
  areaType: AreaType;
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

type ChunkTemplate = {
  areaType: AreaType;
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
const WALL_JUMP_X = 430;
const WALL_JUMP_Y = 650;
const HOOK_SPEED = 1450;
const HOOK_MAX_RANGE = 390;
const HOOK_MISS_COOLDOWN = 220;
const HOOK_HIT_COOLDOWN = 440;
const COYOTE_MS = 110;
const JUMP_BUFFER_MS = 120;
const SLIDE_MS = 420;
const SLIDE_CHAIN_MS = 180;
const WALL_CONTACT_GRACE_MS = 120;
const SAME_WALL_LOCK_MS = 520;
const COMBO_DECAY_MS = 1550;
const DISTRICT_THRESHOLDS = [500, 1000, 1500] as const;
const DISTRICT_NAMES = ["Sketch Block", "Pencil Plaza", "Hookline Heights", "Midnight Margin"] as const;
const AREA_ORDER: AreaType[] = [
  "openChase",
  "constructionGauntlet",
  "skylineSprint",
  "clutteredRoofs",
  "needleAlleys",
  "wallRunDistrict",
  "industrialHazards",
  "eliteFlow"
] as const;
const AREA_NAMES: Record<AreaType, string> = {
  skylineSprint: "Skyline Sprint",
  constructionGauntlet: "Construction Gauntlet",
  clutteredRoofs: "Cluttered Roofs",
  wallRunDistrict: "Wall Run District",
  needleAlleys: "Needle Alleys",
  openChase: "Open Chase",
  industrialHazards: "Industrial Hazards",
  eliteFlow: "Elite Flow"
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

function getAreaTypeForChunk(id: number, seed: number): AreaType {
  const block = Math.floor(id / 3);
  const rotation = Math.floor(noise(seed * 0.37) * AREA_ORDER.length);
  const wobble = Math.floor(noise(seed * 0.71 + block * 1.91) * AREA_ORDER.length);
  return AREA_ORDER[(rotation + block + wobble) % AREA_ORDER.length];
}

function getChunkTemplate(id: number, seed: number, tier: DistrictTier): ChunkTemplate {
  const routeSeed = id * 97 + seed * 13.37;
  const early = id < 3;
  const areaType = getAreaTypeForChunk(id, seed);
  const midEnabled = early ? id !== 0 : noise(routeSeed + 1) > 0.2 || tier >= 1;
  const highEnabled = early ? id >= 1 : noise(routeSeed + 2) > 0.42 || tier >= 2;

  const areaLowGapBias =
    areaType === "skylineSprint" ? 26 :
    areaType === "openChase" ? 18 :
    areaType === "needleAlleys" ? 8 :
    areaType === "constructionGauntlet" ? -4 :
    0;
  const areaHighBias =
    areaType === "skylineSprint" || areaType === "eliteFlow" ? 0.22 :
    areaType === "constructionGauntlet" ? -0.08 :
    areaType === "openChase" ? 0.1 :
    0;
  const areaMidBias =
    areaType === "constructionGauntlet" || areaType === "clutteredRoofs" ? 0.18 :
    areaType === "openChase" ? -0.08 :
    0;

  return {
    areaType,
    lowGap: Math.round(46 + areaLowGapBias + between(routeSeed + 3, 0, tier >= 2 ? 44 : 26)),
    lowWidth: Math.round(228 + between(routeSeed + 4, tier >= 2 ? -12 : 0, 42) + (areaType === "openChase" ? 32 : areaType === "needleAlleys" ? -24 : 0)),
    nextLowY: 372 + Math.round(between(routeSeed + 5, -14, 14)),
    midEnabled: midEnabled || noise(routeSeed + 101) < areaMidBias,
    midX: 156 + Math.round(between(routeSeed + 6, -18, 24)),
    midY: 302 + Math.round(between(routeSeed + 7, -14, 10)),
    midWidth: 160 + Math.round(between(routeSeed + 8, -8, 26)) + (areaType === "constructionGauntlet" ? 12 : areaType === "needleAlleys" ? -18 : 0),
    highEnabled: highEnabled || noise(routeSeed + 102) < areaHighBias,
    highX: 330 + Math.round(between(routeSeed + 9, -20, 26)),
    highY: 222 + Math.round(between(routeSeed + 10, -16, 18)),
    highWidth: 148 + Math.round(between(routeSeed + 11, -12, 20)) + (areaType === "skylineSprint" ? 10 : areaType === "needleAlleys" ? -12 : 0),
    lowBarrier:
      (!early && noise(routeSeed + 12) > 0.46) ||
      areaType === "clutteredRoofs" ||
      areaType === "eliteFlow",
    slideSign:
      (tier >= 1 && !early && noise(routeSeed + 13) > 0.54) ||
      areaType === "constructionGauntlet" ||
      areaType === "needleAlleys",
    airHazard:
      (tier >= 2 && noise(routeSeed + 14) > 0.7) ||
      areaType === "industrialHazards" ||
      areaType === "eliteFlow",
    poleBar:
      (tier >= 2 && noise(routeSeed + 15) > 0.4) ||
      areaType === "skylineSprint" ||
      areaType === "wallRunDistrict" ||
      areaType === "eliteFlow"
  };
}

function createChunk(id: number, startX: number, tier: DistrictTier, seed: number): Chunk {
  const platforms: Platform[] = [];
  const grappleSurfaces: Surface[] = [];
  const walls: Wall[] = [];
  const obstacles: Obstacle[] = [];
  const pickups: Pickup[] = [];

  const template = getChunkTemplate(id, seed, tier);
  const areaType = template.areaType;
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

    if (id > 1 || tier >= 1) {
      const rescueX1 = lowA.x + lowA.width + 26;
      const rescueX2 = Math.min(lowB.x - 22, rescueX1 + 84);
      if (rescueX2 > rescueX1 + 24) {
        grappleSurfaces.push(
          createSurface(`${mid.id}-rescue-bar`, rescueX1, mid.y - 52, rescueX2, mid.y - 52, "grapple-bar", 20)
        );
      }
    }
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
      x: lowB.x + lowB.width * (areaType === "clutteredRoofs" ? 0.4 : 0.62),
      y: lowB.y,
      width: areaType === "clutteredRoofs" ? 56 : 40,
      height: areaType === "clutteredRoofs" ? 28 : 24,
      lane: "low",
      vaultable: true
    });

    if (areaType === "clutteredRoofs" || areaType === "eliteFlow") {
      obstacles.push({
        id: `${lowB.id}-low-2`,
        kind: "low-barrier",
        x: lowB.x + lowB.width * 0.78,
        y: lowB.y,
        width: 48,
        height: 26,
        lane: "low",
        vaultable: true
      });
    }
  }

  if (template.slideSign) {
    const slidePlatform = platforms.find((platform) => platform.lane === "mid") ?? lowB;
    obstacles.push({
      id: `${slidePlatform.id}-slide`,
      kind: "slide-sign",
      x: slidePlatform.x + slidePlatform.width * (areaType === "constructionGauntlet" ? 0.48 : 0.56),
      y: slidePlatform.y - (areaType === "constructionGauntlet" ? 46 : 34),
      width: areaType === "constructionGauntlet" ? 92 : 70,
      height: areaType === "constructionGauntlet" ? 24 : 18,
      lane: slidePlatform.lane,
      slideClearance: true
    });

    if (slidePlatform.width > 140 || areaType === "constructionGauntlet" || areaType === "needleAlleys") {
      obstacles.push({
        id: `${slidePlatform.id}-tunnel`,
        kind: "slide-gap",
        x: slidePlatform.x + slidePlatform.width * (areaType === "needleAlleys" ? 0.64 : 0.74),
        y: slidePlatform.y - (areaType === "constructionGauntlet" ? 34 : 26),
        width: areaType === "needleAlleys" ? 76 : 92,
        height: areaType === "constructionGauntlet" ? 34 : 24,
        lane: slidePlatform.lane,
        slideClearance: true
      });

      if (areaType === "constructionGauntlet" || areaType === "eliteFlow") {
        obstacles.push({
          id: `${slidePlatform.id}-tunnel-2`,
          kind: "slide-gap",
          x: slidePlatform.x + slidePlatform.width * 0.86,
          y: slidePlatform.y - 30,
          width: 70,
          height: 28,
          lane: slidePlatform.lane,
          slideClearance: true
        });
      }
    }
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

  if (areaType === "skylineSprint" || areaType === "eliteFlow") {
    const skyBarX = startX + 210;
    const skyBarY = 138 + Math.round(between(id * 91 + seed, -12, 16));
    grappleSurfaces.push(
      createSurface(`${id}-skyline-bar`, skyBarX, skyBarY, skyBarX + 116, skyBarY, "grapple-bar", 32)
    );
  }

  if (areaType === "wallRunDistrict") {
    const wallBase = platforms.find((platform) => platform.lane === "mid") ?? lowB;
    grappleSurfaces.push(
      createSurface(`${wallBase.id}-wallrun-bar`, wallBase.x + wallBase.width * 0.62, wallBase.y - 70, wallBase.x + wallBase.width * 0.9, wallBase.y - 70, "grapple-bar", 20)
    );
  }

  const endX = Math.max(...platforms.map((platform) => platform.x + platform.width)) + 40;
  return { id, startX, endX, areaType, platforms, grappleSurfaces, walls, obstacles, pickups };
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
      wallContactSide: 0,
      wallContactGraceMs: 0,
      lastWallJumpSide: 0,
      lastWallJumpAt: 9999,
      wallReusePenaltyCount: 0,
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
    activeArea: chunks[0]?.areaType ?? "openChase",
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

function getActiveChunk(state: RunnerState) {
  return state.chunks.find((chunk) => state.player.position.x >= chunk.startX && state.player.position.x < chunk.endX) ?? state.chunks[0];
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

function getCurrentLane(state: RunnerState): "low" | "mid" | "high" | null {
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
  state.player.velocity.x = Math.min(MAX_SPEED + 80, Math.max(state.player.velocity.x, getBaseSpeed(state.tier) + 125));
  awardFlow(state, 1, 14, "Slide locked the line in.");
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

    if (input.jumpPressed && dist < 74) {
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

  const contactSide: -1 | 0 | 1 = player.contacts.leftWall ? -1 : player.contacts.rightWall ? 1 : 0;
  if (!player.contacts.grounded && contactSide !== 0 && player.velocity.y >= 0) {
    if (player.wallContactSide !== contactSide) {
      player.wallReusePenaltyCount = 0;
    }
    player.wallContactSide = contactSide;
    player.wallContactGraceMs = WALL_CONTACT_GRACE_MS;
  } else if (player.wallContactGraceMs <= 0) {
    player.wallContactSide = 0;
  }

  if (!player.contacts.grounded) {
    if (player.velocity.y > 0 && (player.contacts.leftWall || player.contacts.rightWall)) {
      player.action = "wallSliding";
      player.velocity.y = Math.min(player.velocity.y, WALL_SLIDE_SPEED);
      state.wallScrapeMs = 70;
    } else {
      player.action = player.velocity.y < 0 ? "jumping" : player.hook.phase === "attached" ? "grappling" : "falling";
    }
  } else if (player.action !== "vaulting" && player.action !== "sliding") {
    player.wallContactSide = 0;
    player.wallContactGraceMs = 0;
    player.wallReusePenaltyCount = 0;
    player.action = "running";
  }
}

function updateScoringAndCombo(state: RunnerState, dtMs: number) {
  const lane = getCurrentLane(state);
  const comboDrain = lane === "low" && state.tier >= 1 ? 1.5 : lane === "mid" ? 1.05 : 1;
  state.flow.comboTimerMs = Math.max(0, state.flow.comboTimerMs - dtMs * comboDrain);
  if (state.flow.comboTimerMs === 0) {
    state.flow.combo = 0;
  }

  if (lane === "high") {
    state.flow.topRouteTicks += dtMs;
    state.flow.styleScore += dtMs / 200;
  } else if (lane === "low" && state.tier >= 1) {
    state.flow.styleScore = Math.max(0, state.flow.styleScore - dtMs / 420);
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
  player.wallContactGraceMs = Math.max(0, player.wallContactGraceMs - dtMs);
  player.lastWallJumpAt = Math.min(9999, player.lastWallJumpAt + dtMs);
  player.grappleCooldownMs = Math.max(0, player.grappleCooldownMs - dtMs);
  player.coyoteMs = Math.max(0, player.coyoteMs - dtMs);
  player.hardLandingMs = Math.max(0, player.hardLandingMs - dtMs);
  state.landingPulseMs = Math.max(0, state.landingPulseMs - dtMs);
  state.wallScrapeMs = Math.max(0, state.wallScrapeMs - dtMs);
  state.totalTimeMs += dtMs;

  if (input.jumpPressed) {
    player.jumpBufferMs = JUMP_BUFFER_MS;
  }
  if (input.slidePressed && player.contacts.grounded) {
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

  if ((player.contacts.grounded || player.coyoteMs > 0) && player.jumpBufferMs > 0) {
    player.velocity.y = -JUMP_SPEED;
    player.contacts.grounded = false;
    player.action = "jumping";
    player.jumpBufferMs = 0;
    player.coyoteMs = 0;
    awardFlow(state, 1, 8, "Clean jump.");
  } else if (!player.contacts.grounded && player.jumpBufferMs > 0) {
    const sameWallLocked =
      player.wallContactSide !== 0 &&
      player.wallContactSide === player.lastWallJumpSide &&
      player.lastWallJumpAt < SAME_WALL_LOCK_MS;
    const canWallJump =
      player.action === "wallSliding" &&
      player.wallContactSide !== 0 &&
      player.wallContactGraceMs > 0 &&
      player.velocity.y >= -10 &&
      !sameWallLocked;

    if (canWallJump) {
      player.velocity.y = -WALL_JUMP_Y;
      player.velocity.x = player.wallContactSide === -1 ? WALL_JUMP_X : -WALL_JUMP_X;
      player.wallJumpLockMs = 180;
      player.jumpBufferMs = 0;
      player.action = "jumping";
      player.lastWallJumpSide = player.wallContactSide;
      player.lastWallJumpAt = 0;
      player.wallReusePenaltyCount += 1;
      player.wallContactGraceMs = 0;
      awardFlow(state, 2, 20, "Wall kick kept the route alive.");
    } else if (sameWallLocked) {
      player.jumpBufferMs = 0;
      state.statusText = "You need a fresh wall for another kick.";
    }
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
    player.velocity.x = Math.max(player.velocity.x - 26 * dt, targetRunSpeed + 80);
    player.height = getPlayerHeight("sliding");
    if (input.jumpPressed && player.slideTimerMs < SLIDE_CHAIN_MS) {
      player.velocity.y = -JUMP_SPEED * 0.84;
      player.velocity.x = Math.min(MAX_SPEED + 70, player.velocity.x + 35);
      player.action = "jumping";
      player.slideTimerMs = 0;
      player.jumpBufferMs = 0;
      awardFlow(state, 2, 18, "Slide-hop kept the pace up.");
    }
    if (player.slideTimerMs <= 0) {
      player.action = player.contacts.grounded ? "running" : "falling";
      player.height = getPlayerHeight(player.action);
    }
  } else if (!player.contacts.grounded && player.hook.phase !== "attached") {
    player.velocity.x = Math.max(targetRunSpeed * 0.9, player.velocity.x - 82 * dt);
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

  const blockingSlideObstacle = getAllObstacles(state.chunks).find(
    (obstacle) =>
      !obstacle.cleared &&
      (obstacle.kind === "slide-sign" || obstacle.kind === "slide-gap") &&
      movedBounds.right > obstacle.x - obstacle.width / 2 &&
      movedBounds.left < obstacle.x + obstacle.width / 2 &&
      movedBounds.bottom > obstacle.y &&
      movedBounds.top < obstacle.y + obstacle.height
  );
  if (blockingSlideObstacle && player.action !== "sliding") {
    state.gameOver = true;
    state.reason = blockingSlideObstacle.kind === "slide-gap"
      ? "You hit the low tunnel because you stayed tall."
      : "You clipped a low sign instead of sliding.";
  } else if (blockingSlideObstacle && player.action === "sliding") {
    blockingSlideObstacle.cleared = true;
    player.velocity.x = Math.min(MAX_SPEED + 90, player.velocity.x + 24);
    awardFlow(state, 2, 20, "Threaded the slide line.");
  }

  const airHazard = getAllObstacles(state.chunks).find(
    (obstacle) =>
      !obstacle.cleared &&
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
  const activeChunk = getActiveChunk(state);
  if (activeChunk && activeChunk.areaType !== state.activeArea) {
    state.activeArea = activeChunk.areaType;
    state.statusText = `${AREA_NAMES[activeChunk.areaType]} coming up. Read the rooftops.`;
  } else if (activeChunk) {
    state.activeArea = activeChunk.areaType;
  }
  updateScoringAndCombo(state, dtMs);

  const lane = getCurrentLane(state);
  if (lane === "low" && state.tier >= 1 && !player.contacts.grounded) {
    state.statusText = "You dropped to the safety line. Find a clean recovery route.";
  }

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

function renderBackground(ctx: CanvasRenderingContext2D, tier: DistrictTier, areaType: AreaType = "openChase", cameraX = 0, speed = 0) {
  const topColor =
    areaType === "industrialHazards" ? "#2d2f3d" :
    areaType === "constructionGauntlet" ? "#314b63" :
    areaType === "skylineSprint" ? "#1d2742" :
    areaType === "eliteFlow" ? "#231f4d" :
    "#243453";
  const midColor =
    areaType === "industrialHazards" ? "#5a4a4a" :
    areaType === "constructionGauntlet" ? "#58708c" :
    areaType === "openChase" ? "#52658e" :
    "#45557c";
  const bottomColor =
    areaType === "industrialHazards" ? "#e88a5d" :
    areaType === "skylineSprint" ? "#f0b783" :
    areaType === "needleAlleys" ? "#eab08a" :
    "#f0b783";
  const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  sky.addColorStop(0, tier >= 2 ? topColor : topColor);
  sky.addColorStop(0.52, tier >= 2 ? midColor : midColor);
  sky.addColorStop(1, bottomColor);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = "rgba(255, 210, 159, 0.12)";
  ctx.beginPath();
  ctx.arc(WIDTH - 120, 92, 52, 0, Math.PI * 2);
  ctx.fill();

  const layers = [
    { color: areaType === "constructionGauntlet" ? "rgba(42, 57, 76, 0.28)" : "rgba(19, 26, 43, 0.24)", baseY: 250, height: 140, width: 120, factor: 0.12 },
    { color: areaType === "industrialHazards" ? "rgba(52, 37, 37, 0.46)" : "rgba(18, 24, 38, 0.42)", baseY: 302, height: 190, width: 92, factor: 0.22 },
    { color: areaType === "eliteFlow" ? "rgba(18, 15, 43, 0.72)" : "rgba(13, 18, 31, 0.68)", baseY: 356, height: 240, width: 72, factor: 0.36 }
  ];

  layers.forEach((layer, layerIndex) => {
    ctx.fillStyle = layer.color;
    const scroll = (cameraX * layer.factor) % (layer.width + 38);
    for (let i = -2; i < 14; i += 1) {
      const x = i * (layer.width + 38) - scroll;
      const wobble = Math.sin((i + layerIndex * 2.1) * 1.73) * 18;
      const towerHeight = layer.height + wobble + (i % 3) * 24;
      ctx.fillRect(x, layer.baseY - towerHeight, layer.width, towerHeight);
      ctx.fillRect(x + 14, layer.baseY - towerHeight - 18, 22, 18);
      if (layerIndex > 0) {
        ctx.fillRect(x + layer.width - 26, layer.baseY - towerHeight - 30, 12, 30);
      }
    }
  });

  ctx.strokeStyle = "rgba(255, 248, 233, 0.08)";
  for (let i = 0; i < 7; i += 1) {
    drawLine(ctx, 0, 100 + i * 44, WIDTH, 96 + i * 44, 1, 0.5);
  }

  const speedAlpha = clamp((speed - BASE_RUN_SPEED) / 280, 0, 0.22);
  if (speedAlpha > 0) {
    ctx.strokeStyle = `rgba(255,255,255,${speedAlpha})`;
    for (let i = 0; i < 8; i += 1) {
      drawLine(ctx, 34 + i * 118, 142 + (i % 3) * 56, 88 + i * 118, 138 + (i % 3) * 56, 1.5, 1);
    }
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

  ctx.fillStyle = "rgba(10,15,25,0.18)";
  ctx.beginPath();
  ctx.ellipse(x + 1, y + 6, 18, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#0b1020";
  ctx.lineWidth = 3.6;
  ctx.beginPath();
  ctx.arc(x, top + 11, 11, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#f8f5ed";
  ctx.beginPath();
  ctx.arc(x, top + 11, 8.5, 0, Math.PI * 2);
  ctx.fill();
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
  ctx.strokeStyle = "#ef4444";
  drawLine(ctx, x - 2, top + 27, x + 8, top + 34, 1.7, 0.75);
}

function renderWorld(ctx: CanvasRenderingContext2D, state: RunnerState, input: InputState) {
  const targetCameraX = Math.max(0, state.player.position.x - PLAYER_SCREEN_X + state.player.velocity.x * 0.14);
  state.camera.x = lerp(state.camera.x, targetCameraX, 0.12);
  const cameraX = state.camera.x;
  renderBackground(ctx, state.tier, state.activeArea, cameraX, state.player.velocity.x);

  ctx.strokeStyle = "#0f172a";
  ctx.fillStyle = "#151c2f";

  state.chunks.forEach((chunk) => {
    chunk.platforms.forEach((platform) => {
      const x = platform.x - cameraX;
      if (x + platform.width < -60 || x > WIDTH + 60) return;
      ctx.fillStyle = platform.lane === "high" ? "#202b47" : platform.lane === "mid" ? "#182238" : "#131b2b";
      ctx.fillRect(x, platform.y, platform.width, platform.height);
      ctx.fillStyle = platform.lane === "high" ? "#7387b8" : platform.lane === "mid" ? "#5f7398" : "#4c5e80";
      ctx.fillRect(x, platform.y, platform.width, 6);
      ctx.strokeStyle = "rgba(9, 14, 25, 0.9)";
      drawRectStroke(ctx, x, platform.y, platform.width, platform.height, 1);
      ctx.strokeStyle = "rgba(103, 122, 159, 0.18)";
      drawLine(ctx, x, platform.y + 18, x + platform.width, platform.y + 18, 2, 1);
      for (let i = 0; i < Math.floor(platform.width / 54); i += 1) {
        const ventX = x + 18 + i * 38;
        const ventY = platform.y + 24 + (i % 2) * 14;
        ctx.strokeStyle = "rgba(175, 188, 212, 0.32)";
        drawRectStroke(ctx, ventX, ventY, 12, 18, 0.8);
      }
      ctx.strokeStyle = "rgba(198, 211, 235, 0.2)";
      drawLine(ctx, x + 22, platform.y - 18, x + 22, platform.y, 2, 0.8);
      drawLine(ctx, x + 22, platform.y - 18, x + 52, platform.y - 18, 2, 0.8);
    });

    chunk.grappleSurfaces.forEach((surface) => {
      const x1 = surface.x1 - cameraX;
      const x2 = surface.x2 - cameraX;
      ctx.strokeStyle = surface.kind === "anchor-wire" ? "#9fb8d8" : "#67d4ff";
      drawLine(ctx, x1, surface.y1, x2, surface.y2, surface.kind === "anchor-wire" ? 2.5 : 3.2, 0.98);
      if (surface.kind !== "anchor-wire") {
        drawLine(ctx, x1, surface.y1 - 5, x2, surface.y2 - 5, 1, 0.42);
      }
    });

    chunk.obstacles.forEach((obstacle) => {
      const x = obstacle.x - cameraX - obstacle.width / 2;
      if (obstacle.kind === "low-barrier") {
        ctx.fillStyle = "#2b364f";
        ctx.fillRect(x, obstacle.y - obstacle.height, obstacle.width, obstacle.height);
        ctx.strokeStyle = "#c58f57";
        drawRectStroke(ctx, x, obstacle.y - obstacle.height, obstacle.width, obstacle.height, 1);
      } else if (obstacle.kind === "slide-sign") {
        ctx.strokeStyle = "#ffb04d";
        drawLine(ctx, x, obstacle.y, x + obstacle.width, obstacle.y, 4, 1);
        drawLine(ctx, x + 10, obstacle.y, x + 10, obstacle.y + 22, 2.4, 0.9);
        drawLine(ctx, x + obstacle.width - 10, obstacle.y, x + obstacle.width - 10, obstacle.y + 22, 2.4, 0.9);
        ctx.strokeStyle = "rgba(255,176,77,0.35)";
        drawLine(ctx, x + 18, obstacle.y - 7, x + obstacle.width - 18, obstacle.y - 7, 1.5, 1);
      } else if (obstacle.kind === "slide-gap") {
        ctx.fillStyle = "rgba(15, 23, 42, 0.78)";
        ctx.fillRect(x, obstacle.y, obstacle.width, obstacle.height);
        ctx.strokeStyle = "#7dd3fc";
        drawRectStroke(ctx, x, obstacle.y, obstacle.width, obstacle.height, 1);
        drawLine(ctx, x + 14, obstacle.y + obstacle.height / 2, x + obstacle.width - 14, obstacle.y + obstacle.height / 2, 2, 0.5);
      } else {
        ctx.strokeStyle = "#f87171";
        drawLine(ctx, x, obstacle.y, x + obstacle.width / 2, obstacle.y - obstacle.height / 2, 2.4, 1);
        drawLine(ctx, x + obstacle.width / 2, obstacle.y - obstacle.height / 2, x + obstacle.width, obstacle.y, 2.4, 1);
        drawLine(ctx, x + obstacle.width * 0.2, obstacle.y + 6, x + obstacle.width * 0.8, obstacle.y - obstacle.height * 0.35 + 6, 1.3, 0.75);
      }
    });

    chunk.pickups.forEach((pickup) => {
      if (pickup.collected) return;
      const x = pickup.x - cameraX;
      ctx.strokeStyle = "#ffd166";
      ctx.beginPath();
      ctx.arc(x, pickup.y, 9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255, 209, 102, 0.45)";
      ctx.beginPath();
      ctx.arc(x, pickup.y, 14, 0, Math.PI * 2);
      ctx.stroke();
    });
  });

  if (state.player.hook.phase !== "idle") {
    const handX = state.player.position.x - cameraX + 8;
    const handY = state.player.position.y - state.player.height + 22;
    ctx.strokeStyle = "#b6e4ff";
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(handX, handY);
    ctx.quadraticCurveTo((handX + state.player.hook.tip.x - cameraX) / 2, handY - 12, state.player.hook.tip.x - cameraX, state.player.hook.tip.y);
    ctx.stroke();
    ctx.fillStyle = "#67d4ff";
    ctx.beginPath();
    ctx.arc(state.player.hook.tip.x - cameraX, state.player.hook.tip.y, 4, 0, Math.PI * 2);
    ctx.fill();
    if (state.player.hook.phase === "attached") {
      ctx.strokeStyle = "rgba(103,212,255,0.55)";
      ctx.beginPath();
      ctx.arc(state.player.hook.tip.x - cameraX, state.player.hook.tip.y, 10, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  if (state.landingPulseMs > 0) {
    ctx.strokeStyle = "rgba(255,236,204,0.7)";
    drawLine(ctx, state.player.position.x - cameraX - 24, state.player.position.y + 2, state.player.position.x - cameraX - 4, state.player.position.y + 8, 2);
    drawLine(ctx, state.player.position.x - cameraX + 4, state.player.position.y + 8, state.player.position.x - cameraX + 24, state.player.position.y + 2, 2);
  }

  if (state.wallScrapeMs > 0) {
    ctx.strokeStyle = "rgba(255,184,107,0.7)";
    drawLine(ctx, state.player.position.x - cameraX + (state.player.contacts.leftWall ? -14 : 14), state.player.position.y - 48, state.player.position.x - cameraX + (state.player.contacts.leftWall ? -22 : 22), state.player.position.y - 10, 2);
  }

  const speedLineAlpha = clamp((state.flow.combo - 2) / 8, 0, 0.3);
  if (speedLineAlpha > 0) {
    ctx.strokeStyle = `rgba(226,232,240,${speedLineAlpha})`;
    for (let i = 0; i < 10; i += 1) {
      const lineY = 120 + i * 26 + ((state.totalTimeMs / 18) % 12);
      drawLine(ctx, 0, lineY, 44, lineY, 1.2, 1);
    }
  }

  renderPlayer(ctx, state, cameraX);

  ctx.strokeStyle = "rgba(191,219,254,0.65)";
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
    areaType: "openChase",
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
    renderBackground(ctx, hud.districtTier, hud.areaType);
    ctx.fillStyle = "rgba(10, 15, 26, 0.78)";
    ctx.fillRect(88, 86, WIDTH - 176, HEIGHT - 172);
    ctx.strokeStyle = "rgba(147, 197, 253, 0.34)";
    drawRectStroke(ctx, 88, 86, WIDTH - 176, HEIGHT - 172, 1);
    ctx.fillStyle = "#f8fafc";
    ctx.font = "bold 38px PublicPixel, monospace";
    ctx.fillText("Rooftop Runner", 120, 150);
    ctx.fillStyle = "#7dd3fc";
    ctx.font = "18px system-ui";
    ctx.fillText("Momentum-based rooftop parkour with click-to-fire grappling.", 120, 194);
    ctx.fillStyle = "#dbeafe";
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
        state.distance < 40
          ? 1
          : Math.max(
              2,
              Math.min(
                24,
                Math.floor(state.distance / 120) +
                  Math.floor(state.score / 260) +
                  Math.floor(state.flow.bestCombo / 5) +
                  state.tier * 2 +
                  Math.floor(state.coins / 3) +
                  Math.floor(state.flow.styleScore / 220)
              )
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
          areaType: state.activeArea,
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
      areaType: "openChase",
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
            A city parkour action-runner built around chaining jumps, grapples, slides, vaults, and clutch recoveries.
            The low line is stable. The skyline pays if you can actually hold it.
          </p>
        </div>

        <div className="rooftop-layout">
          <section className="rooftop-stage rooftop-stage--paper">
            <canvas ref={canvasRef} className="rooftop-canvas" />

            <div className="rooftop-hud rooftop-hud--top">
              <div className="rooftop-marquee">
                <span className="rooftop-logo">Rooftop Runner</span>
                <span className="rooftop-district">{DISTRICT_NAMES[hud.districtTier]}</span>
                <span className="rooftop-district">{AREA_NAMES[hud.areaType]}</span>
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
              <p>Click to fire a traveling grapple toward the cursor. It only sticks when the hook actually hits a valid bar, wire, or recovery anchor.</p>
              <p>Slides now preserve speed through low-clearance lines. Wall kicks are deliberate recovery tools, not infinite climbing.</p>
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
