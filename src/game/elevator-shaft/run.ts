import Phaser from "phaser";
import type { GrappleAnchor, HudSnapshot, PlatformData, RunState, SectionSlice, ShaftSectionId } from "./types";

export const ELEVATOR_GAME_WIDTH = 560;
export const ELEVATOR_GAME_HEIGHT = 860;
export const SHAFT_LEFT = 88;
export const SHAFT_RIGHT = ELEVATOR_GAME_WIDTH - 88;
export const SHAFT_WIDTH = SHAFT_RIGHT - SHAFT_LEFT;
export const FLOOR_Y = 760;
export const PLAYER_WIDTH = 28;
export const PLAYER_HEIGHT = 38;
export const PLAYER_SPEED = 300;
export const AIR_SPEED = 250;
export const GRAVITY = 1750;
export const JUMP_SPEED = 760;
export const WALL_JUMP_X = 350;
export const WALL_JUMP_Y = 710;
export const WALL_SLIDE_SPEED = 220;
export const COYOTE_MS = 110;
export const JUMP_BUFFER_MS = 110;
export const GRAPPLE_RANGE = 230;
export const GRAPPLE_PULL_SPEED = 820;
export const GRAPPLE_COOLDOWN_MS = 860;
export const COLLAPSE_KILL_BUFFER = 18;
const METERS_PER_BAND = 1000;
const WORLD_UNITS_PER_METER = 10;

const SECTION_LABELS: Record<ShaftSectionId, string> = {
  service: "Service Shaft",
  maintenance: "Maintenance Core",
  office: "Office Breakthrough",
  industrial: "Machine Deck",
  relay: "Relay Void",
  surge: "Surge Grid",
  shutter: "Shutter Core",
  critical: "Critical Collapse"
};

const SECTION_COLORS: Record<ShaftSectionId, { bg: number; accent: number; hazard: number }> = {
  service: { bg: 0x0f172a, accent: 0x60a5fa, hazard: 0xf97316 },
  maintenance: { bg: 0x10261f, accent: 0x34d399, hazard: 0xfacc15 },
  office: { bg: 0x1f2340, accent: 0xc4b5fd, hazard: 0xfb7185 },
  industrial: { bg: 0x2a1a12, accent: 0xf59e0b, hazard: 0xef4444 },
  relay: { bg: 0x101827, accent: 0x22d3ee, hazard: 0xf97316 },
  surge: { bg: 0x1d1027, accent: 0xe879f9, hazard: 0xef4444 },
  shutter: { bg: 0x1e1f10, accent: 0xa3e635, hazard: 0xf59e0b },
  critical: { bg: 0x2c1014, accent: 0xf87171, hazard: 0xfbbf24 }
};

type SectionProfile = {
  theme: ShaftSectionId;
  spacingMin: number;
  spacingMax: number;
  swing: number;
  widthMin: number;
  widthMax: number;
  breakableChance: number;
  movingChance: number;
  hazardChance: number;
  anchorChance: number;
  forceAnchorGap: number;
  forceAnchorSpacing: number;
  extraPlatformChance: number;
  collapseBonus: number;
};

function getSectionProfile(height: number): SectionProfile {
  const meters = Math.floor(height / WORLD_UNITS_PER_METER);
  const band = Math.floor(meters / METERS_PER_BAND);
  switch (band) {
    case 0:
      return { theme: "service", spacingMin: 78, spacingMax: 92, swing: 108, widthMin: 96, widthMax: 148, breakableChance: 0.08, movingChance: 0.02, hazardChance: 0, anchorChance: 0.58, forceAnchorGap: 116, forceAnchorSpacing: 96, extraPlatformChance: 0.22, collapseBonus: 0 };
    case 1:
      return { theme: "maintenance", spacingMin: 84, spacingMax: 102, swing: 122, widthMin: 88, widthMax: 138, breakableChance: 0.14, movingChance: 0.06, hazardChance: 0.02, anchorChance: 0.48, forceAnchorGap: 120, forceAnchorSpacing: 100, extraPlatformChance: 0.16, collapseBonus: 4 };
    case 2:
      return { theme: "office", spacingMin: 92, spacingMax: 110, swing: 136, widthMin: 82, widthMax: 126, breakableChance: 0.18, movingChance: 0.1, hazardChance: 0.04, anchorChance: 0.38, forceAnchorGap: 126, forceAnchorSpacing: 106, extraPlatformChance: 0.1, collapseBonus: 8 };
    case 3:
      return { theme: "industrial", spacingMin: 96, spacingMax: 118, swing: 148, widthMin: 78, widthMax: 120, breakableChance: 0.22, movingChance: 0.18, hazardChance: 0.08, anchorChance: 0.28, forceAnchorGap: 132, forceAnchorSpacing: 108, extraPlatformChance: 0.06, collapseBonus: 12 };
    case 4:
      return { theme: "relay", spacingMin: 112, spacingMax: 132, swing: 168, widthMin: 72, widthMax: 108, breakableChance: 0.18, movingChance: 0.2, hazardChance: 0.1, anchorChance: 0.16, forceAnchorGap: 126, forceAnchorSpacing: 100, extraPlatformChance: 0.03, collapseBonus: 18 };
    case 5:
      return { theme: "surge", spacingMin: 114, spacingMax: 136, swing: 176, widthMin: 70, widthMax: 104, breakableChance: 0.18, movingChance: 0.16, hazardChance: 0.18, anchorChance: 0.12, forceAnchorGap: 120, forceAnchorSpacing: 98, extraPlatformChance: 0.02, collapseBonus: 24 };
    case 6:
      return { theme: "shutter", spacingMin: 120, spacingMax: 142, swing: 184, widthMin: 64, widthMax: 96, breakableChance: 0.14, movingChance: 0.28, hazardChance: 0.16, anchorChance: 0.08, forceAnchorGap: 116, forceAnchorSpacing: 94, extraPlatformChance: 0.01, collapseBonus: 32 };
    default:
      return { theme: "critical", spacingMin: 124, spacingMax: 148, swing: 194, widthMin: 60, widthMax: 92, breakableChance: 0.18, movingChance: 0.24, hazardChance: 0.22, anchorChance: 0.06, forceAnchorGap: 112, forceAnchorSpacing: 92, extraPlatformChance: 0, collapseBonus: 40 };
  }
}

function sectionForHeight(height: number) {
  return getSectionProfile(height).theme;
}

function randomBetween(random: () => number, min: number, max: number) {
  return min + (max - min) * random();
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function createPlatform(
  state: RunState,
  options: Partial<PlatformData> & Pick<PlatformData, "x" | "y" | "width">
) {
  const platform: PlatformData = {
    id: state.nextPlatformId,
    x: options.x,
    y: options.y,
    width: options.width,
    height: options.height ?? 14,
    vx: options.vx ?? 0,
    minX: options.minX ?? options.x,
    maxX: options.maxX ?? options.x,
    kind: options.kind ?? "stable",
    anchorId: options.anchorId ?? null,
    breakDelayMs: options.breakDelayMs ?? 0,
    respawnDelayMs: options.respawnDelayMs ?? 0,
    broken: false,
    triggered: false
  };
  state.nextPlatformId += 1;
  state.platforms.push(platform);
  return platform;
}

function createAnchor(state: RunState, x: number, y: number) {
  const anchor: GrappleAnchor = {
    id: state.nextAnchorId,
    x,
    y
  };
  state.nextAnchorId += 1;
  state.anchors.push(anchor);
  return anchor;
}

function createSectionSlice(state: RunState, startY: number, endY: number, theme: ShaftSectionId) {
  const slice: SectionSlice = {
    id: state.nextSectionId,
    startY,
    endY,
    theme
  };
  state.nextSectionId += 1;
  state.sections.push(slice);
  return slice;
}

function findBestAnchor(state: RunState, pointerWorldX: number, pointerWorldY: number) {
  const player = state.player;
  let bestAnchor: GrappleAnchor | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  state.anchors.forEach((anchor) => {
    const dx = anchor.x - player.x;
    const dy = anchor.y - player.y;
    const distance = Math.hypot(dx, dy);
    if (distance > GRAPPLE_RANGE || dy > 120) {
      return;
    }

    const pointerDistance = Math.hypot(anchor.x - pointerWorldX, anchor.y - pointerWorldY);
    const verticalPreference = dy < 0 ? 0 : 36;
    const score = pointerDistance * 0.72 + distance * 0.22 + verticalPreference;
    if (score < bestScore) {
      bestScore = score;
      bestAnchor = anchor;
    }
  });

  return bestAnchor;
}

function generateSection(state: RunState) {
  const startY = state.nextSpawnY;
  const profile = getSectionProfile(Math.max(0, -startY));
  const endY = startY - 1000;
  const random = new Phaser.Math.RandomDataGenerator([String(state.seed + state.nextSectionId)]);
  createSectionSlice(state, startY, endY, profile.theme);

  let y = startY - 90;
  let previousX = Phaser.Math.Between(SHAFT_LEFT + 80, SHAFT_RIGHT - 80);
  let previousHadAnchor = true;

  while (y > endY + 60) {
    const spacing = randomBetween(() => random.frac(), profile.spacingMin, profile.spacingMax);
    y -= spacing;

    const routeBias = Phaser.Math.Between(-1, 1);
    const nextX = clamp(
      previousX + routeBias * randomBetween(() => random.frac(), 42, profile.swing),
      SHAFT_LEFT + 58,
      SHAFT_RIGHT - 58
    );

    const kindRoll = random.frac();
    let kind: PlatformData["kind"] = "stable";
    if (kindRoll < profile.hazardChance) {
      kind = "hazard";
    } else if (kindRoll < profile.hazardChance + profile.movingChance) {
      kind = "moving";
    } else if (kindRoll < profile.hazardChance + profile.movingChance + profile.breakableChance) {
      kind = "breakable";
    }
    const width =
      kind === "hazard"
        ? randomBetween(() => random.frac(), profile.widthMin + 4, profile.widthMax + 18)
        : kind === "breakable"
          ? randomBetween(() => random.frac(), profile.widthMin, profile.widthMax)
          : kind === "moving"
            ? randomBetween(() => random.frac(), profile.widthMin + 8, profile.widthMax + 8)
            : randomBetween(() => random.frac(), profile.widthMin + 10, profile.widthMax + 24);

    const platform = createPlatform(state, {
      x: nextX,
      y,
      width,
      kind,
      vx: kind === "moving" ? random.pick([-1, 1]) * randomBetween(() => random.frac(), 56, 88) : 0,
      minX: clamp(nextX - randomBetween(() => random.frac(), 34, profile.theme === "shutter" ? 108 : 72), SHAFT_LEFT + 52, SHAFT_RIGHT - 52),
      maxX: clamp(nextX + randomBetween(() => random.frac(), 34, profile.theme === "shutter" ? 108 : 72), SHAFT_LEFT + 52, SHAFT_RIGHT - 52),
      breakDelayMs: kind === "breakable" ? 360 : 0,
      respawnDelayMs: kind === "breakable" ? 1200 : 0
    });

    const shouldForceAnchor =
      kind === "hazard" ||
      Math.abs(nextX - previousX) > profile.forceAnchorGap ||
      spacing > profile.forceAnchorSpacing ||
      !previousHadAnchor;
    if (random.frac() < profile.anchorChance || shouldForceAnchor) {
      const anchorX = clamp(
        shouldForceAnchor
          ? (previousX + nextX) / 2 + randomBetween(() => random.frac(), -26, 26)
          : nextX + randomBetween(() => random.frac(), -58, 58),
        SHAFT_LEFT + 38,
        SHAFT_RIGHT - 38
      );
      const anchorY = y - randomBetween(() => random.frac(), shouldForceAnchor ? 56 : 48, shouldForceAnchor ? 92 : 72);
      const anchor = createAnchor(state, anchorX, anchorY);
      platform.anchorId = anchor.id;
      previousHadAnchor = true;
    } else {
      previousHadAnchor = false;
    }

    if (random.frac() < profile.extraPlatformChance) {
      createPlatform(state, {
        x: clamp(nextX + randomBetween(() => random.frac(), -138, 138), SHAFT_LEFT + 52, SHAFT_RIGHT - 52),
        y: y - randomBetween(() => random.frac(), 36, 56),
        width: randomBetween(() => random.frac(), 60, 86),
        kind: "stable"
      });
    }

    previousX = nextX;
  }

  state.nextSpawnY = endY;
}

export function createInitialRun(seed: number): RunState {
  const state: RunState = {
    player: {
      x: ELEVATOR_GAME_WIDTH / 2,
      y: FLOOR_Y - 140,
      vx: 0,
      vy: 0,
      width: PLAYER_WIDTH,
      height: PLAYER_HEIGHT,
      grounded: false,
      wallLeft: false,
      wallRight: false,
      coyoteMs: 0,
      jumpBufferMs: 0,
      jumpCutUsed: false,
      wallJumpLockMs: 0,
      lastWallJumpSide: 0,
      grappleCooldownMs: 0,
      grappleLineMs: 0,
      grappleAnchorId: null,
      aimAnchorId: null
    },
    platforms: [],
    anchors: [],
    sections: [],
    nextPlatformId: 1,
    nextAnchorId: 1,
    nextSectionId: 1,
    nextSpawnY: FLOOR_Y - 60,
    topHeight: 0,
    score: 0,
    combo: 0,
    bestCombo: 0,
    statusText: "Climb. The shaft is collapsing below you.",
    collapseHeight: -80,
    collapseSpeed: 52,
    elapsedMs: 0,
    gameOver: false,
    reason: "",
    seed
  };

  createPlatform(state, {
    x: ELEVATOR_GAME_WIDTH / 2,
    y: FLOOR_Y,
    width: SHAFT_WIDTH - 24,
    height: 24,
    kind: "stable"
  });
  createPlatform(state, {
    x: ELEVATOR_GAME_WIDTH / 2 - 70,
    y: FLOOR_Y - 130,
    width: 120,
    kind: "stable"
  });
  createPlatform(state, {
    x: ELEVATOR_GAME_WIDTH / 2 + 90,
    y: FLOOR_Y - 220,
    width: 104,
    kind: "stable"
  });
  createAnchor(state, ELEVATOR_GAME_WIDTH / 2 + 120, FLOOR_Y - 280);

  while (state.nextSpawnY > FLOOR_Y - 2800) {
    generateSection(state);
  }

  return state;
}

function findCurrentSection(state: RunState, height: number) {
  return (
    state.sections.find((section) => height >= -section.startY && height < -section.endY) ??
    state.sections[state.sections.length - 1]
  );
}

export function updateRun(
  state: RunState,
  input: {
    move: number;
    jumpPressed: boolean;
    jumpHeld: boolean;
    grapplePressed: boolean;
    pointerX: number;
    pointerY: number;
    cameraY: number;
  },
  deltaMs: number
) {
  if (state.gameOver) {
    return;
  }

  const player = state.player;
  const deltaSeconds = deltaMs / 1000;
  state.elapsedMs += deltaMs;

  while (state.nextSpawnY > player.y - ELEVATOR_GAME_HEIGHT * 5) {
    generateSection(state);
  }

  player.coyoteMs = Math.max(0, player.coyoteMs - deltaMs);
  player.jumpBufferMs = Math.max(0, player.jumpBufferMs - deltaMs);
  player.wallJumpLockMs = Math.max(0, player.wallJumpLockMs - deltaMs);
  player.grappleCooldownMs = Math.max(0, player.grappleCooldownMs - deltaMs);
  player.grappleLineMs = Math.max(0, player.grappleLineMs - deltaMs);

  const pointerWorldX = input.pointerX;
  const pointerWorldY = input.pointerY + input.cameraY;
  const aimedAnchor = findBestAnchor(state, pointerWorldX, pointerWorldY);
  player.aimAnchorId = aimedAnchor?.id ?? null;

  if (input.jumpPressed) {
    player.jumpBufferMs = JUMP_BUFFER_MS;
  }

  const acceleration = player.grounded ? PLAYER_SPEED * 7.2 : AIR_SPEED * 5.2;
  const maxMoveSpeed = player.grounded ? PLAYER_SPEED : AIR_SPEED;
  const targetVelocityX = input.move * maxMoveSpeed;
  player.vx = Phaser.Math.Linear(player.vx, targetVelocityX, clamp(acceleration * deltaSeconds / maxMoveSpeed, 0, 1));

  if (!player.grounded && player.wallLeft && player.vy > WALL_SLIDE_SPEED) {
    player.vy = WALL_SLIDE_SPEED;
  }
  if (!player.grounded && player.wallRight && player.vy > WALL_SLIDE_SPEED) {
    player.vy = WALL_SLIDE_SPEED;
  }

  if (player.jumpBufferMs > 0) {
    if (player.grounded || player.coyoteMs > 0) {
      player.vy = -JUMP_SPEED;
      player.grounded = false;
      player.coyoteMs = 0;
      player.jumpBufferMs = 0;
      player.jumpCutUsed = false;
      player.lastWallJumpSide = 0;
      state.combo += 1;
    } else if (player.wallLeft && player.lastWallJumpSide !== -1) {
      player.vx = WALL_JUMP_X;
      player.vy = -WALL_JUMP_Y;
      player.wallJumpLockMs = 90;
      player.jumpBufferMs = 0;
      player.jumpCutUsed = false;
      player.lastWallJumpSide = -1;
      state.combo += 2;
    } else if (player.wallRight && player.lastWallJumpSide !== 1) {
      player.vx = -WALL_JUMP_X;
      player.vy = -WALL_JUMP_Y;
      player.wallJumpLockMs = 90;
      player.jumpBufferMs = 0;
      player.jumpCutUsed = false;
      player.lastWallJumpSide = 1;
      state.combo += 2;
    }
    state.bestCombo = Math.max(state.bestCombo, state.combo);
  }

  if (!input.jumpHeld && player.vy < -260 && !player.jumpCutUsed) {
    player.vy *= 0.58;
    player.jumpCutUsed = true;
  }

  if (input.grapplePressed && player.grappleCooldownMs <= 0) {
    const bestAnchor = aimedAnchor;

    if (bestAnchor) {
      const dx = bestAnchor.x - player.x;
      const dy = bestAnchor.y - player.y;
      const length = Math.max(1, Math.hypot(dx, dy));
      player.vx = (dx / length) * GRAPPLE_PULL_SPEED;
      player.vy = (dy / length) * GRAPPLE_PULL_SPEED - 90;
      player.grappleCooldownMs = GRAPPLE_COOLDOWN_MS;
      player.grappleLineMs = 160;
      player.grappleAnchorId = bestAnchor.id;
      player.lastWallJumpSide = 0;
      state.combo += 2;
      state.bestCombo = Math.max(state.bestCombo, state.combo);
      state.statusText = "Anchor locked. Keep the chain alive.";
    } else {
      player.grappleCooldownMs = 220;
      player.grappleLineMs = 90;
      player.grappleAnchorId = null;
      state.combo = Math.max(0, state.combo - 1);
      state.statusText = "No anchor. Stay calm and keep climbing.";
    }
  }

  player.vy += GRAVITY * deltaSeconds;

  const previousX = player.x;
  const previousY = player.y;

  player.x += player.vx * deltaSeconds;
  player.y += player.vy * deltaSeconds;
  player.grounded = false;
  player.wallLeft = false;
  player.wallRight = false;

  const halfWidth = player.width / 2;
  const halfHeight = player.height / 2;

  if (player.x - halfWidth <= SHAFT_LEFT) {
    player.x = SHAFT_LEFT + halfWidth;
    player.vx = Math.max(player.vx, 0);
    player.wallLeft = true;
    if (player.lastWallJumpSide === 1) {
      player.lastWallJumpSide = 0;
    }
  } else if (player.x + halfWidth >= SHAFT_RIGHT) {
    player.x = SHAFT_RIGHT - halfWidth;
    player.vx = Math.min(player.vx, 0);
    player.wallRight = true;
    if (player.lastWallJumpSide === -1) {
      player.lastWallJumpSide = 0;
    }
  }

  let landingPlatform: PlatformData | null = null;
  state.platforms.forEach((platform) => {
    if (platform.broken) {
      return;
    }

    if (platform.kind === "moving") {
      platform.x += platform.vx * deltaSeconds;
      if (platform.x <= platform.minX || platform.x >= platform.maxX) {
        platform.vx *= -1;
        platform.x = clamp(platform.x, platform.minX, platform.maxX);
      }
    }

    const halfPlatform = platform.width / 2;
    const platformTop = platform.y - platform.height / 2;
    const platformBottom = platform.y + platform.height / 2;
    const withinX = player.x + halfWidth > platform.x - halfPlatform && player.x - halfWidth < platform.x + halfPlatform;
    if (!withinX) {
      return;
    }

    const overlapsHazard =
      platform.kind === "hazard" &&
      player.y + halfHeight > platformTop &&
      player.y - halfHeight < platformBottom;
    if (overlapsHazard) {
      state.gameOver = true;
      state.reason = "You clipped an energized barrier.";
      return;
    }

    const wasAbove = previousY + halfHeight <= platformTop + 3;
    const hitsTop = player.y + halfHeight >= platformTop && player.y + halfHeight <= platformBottom + 16;
    if (platform.kind !== "hazard" && player.vy >= 0 && wasAbove && hitsTop) {
      if (!landingPlatform || platformTop < landingPlatform.y - landingPlatform.height / 2) {
        landingPlatform = platform;
      }
    }
  });

  if (landingPlatform) {
    const platformTop = landingPlatform.y - landingPlatform.height / 2;
    player.y = platformTop - halfHeight;
    player.vy = 0;
    player.grounded = true;
    player.coyoteMs = COYOTE_MS;
    player.jumpCutUsed = false;
    player.lastWallJumpSide = 0;
    if (landingPlatform.kind === "breakable" && !landingPlatform.triggered) {
      landingPlatform.triggered = true;
      landingPlatform.breakDelayMs = 360;
    }
  }

  state.platforms.forEach((platform) => {
    if (platform.kind === "breakable" && platform.triggered && !platform.broken) {
      platform.breakDelayMs -= deltaMs;
      if (platform.breakDelayMs <= 0) {
        platform.broken = true;
        platform.triggered = false;
      }
    } else if (platform.kind === "breakable" && platform.broken) {
      platform.respawnDelayMs -= deltaMs;
      if (platform.respawnDelayMs <= 0) {
        platform.broken = false;
        platform.triggered = false;
        platform.breakDelayMs = 360;
        platform.respawnDelayMs = 1200;
      }
    }
  });

  if (!player.grounded) {
    if (player.x - halfWidth <= SHAFT_LEFT + 1) {
      player.wallLeft = true;
    }
    if (player.x + halfWidth >= SHAFT_RIGHT - 1) {
      player.wallRight = true;
    }
  }

  if (player.grounded) {
    state.combo = Math.max(1, state.combo);
    player.grappleAnchorId = null;
  } else if (player.y > previousY + 18) {
    state.combo = Math.max(0, state.combo - deltaSeconds * 1.4);
  }

  state.platforms = state.platforms.filter((platform) => platform.y < player.y + ELEVATOR_GAME_HEIGHT * 1.8);
  state.anchors = state.anchors.filter((anchor) => anchor.y < player.y + ELEVATOR_GAME_HEIGHT * 1.9);
  state.sections = state.sections.filter((section) => section.startY < player.y + ELEVATOR_GAME_HEIGHT * 2.1);

  const height = Math.max(0, FLOOR_Y - player.y);
  state.topHeight = Math.max(state.topHeight, height);
  state.score = Math.floor(state.topHeight + state.elapsedMs * 0.015 + state.bestCombo * 18);

  const collapseBaseSpeed = 52 + Math.min(132, state.topHeight * 0.028) + getSectionProfile(state.topHeight).collapseBonus;
  state.collapseSpeed = collapseBaseSpeed;
  state.collapseHeight += state.collapseSpeed * deltaSeconds;

  const collapseWorldY = FLOOR_Y - state.collapseHeight;
  if (player.y + halfHeight >= collapseWorldY - COLLAPSE_KILL_BUFFER) {
    state.gameOver = true;
    state.reason = "The collapse wave swallowed the shaft.";
  }

  if (player.y > collapseWorldY + 140) {
    state.gameOver = true;
    state.reason = "You fell back into the collapse.";
  }

  const currentSection = findCurrentSection(state, state.topHeight);
  const sectionLabel = currentSection ? SECTION_LABELS[currentSection.theme] : "Service Shaft";
  const collapseGap = Math.max(0, Math.floor((collapseWorldY - player.y) / 10));
  state.statusText = state.gameOver
    ? state.reason
    : collapseGap < 14
      ? "Collapse is close. Commit upward."
      : collapseGap < 24
        ? "Tight gap. Use walls and anchors."
        : `Climbing through ${sectionLabel}.`;
}

export function getHudSnapshot(state: RunState): HudSnapshot {
  const currentSection = findCurrentSection(state, state.topHeight);
  const collapseWorldY = FLOOR_Y - state.collapseHeight;
  return {
    height: Math.floor(state.topHeight / 10),
    score: state.score,
    combo: Math.floor(state.combo),
    bestCombo: state.bestCombo,
    collapseGap: Math.max(0, Math.floor((collapseWorldY - state.player.y) / 10)),
    sectionLabel: currentSection ? SECTION_LABELS[currentSection.theme] : "Service Shaft",
    grappleReady: state.player.grappleCooldownMs <= 0
  };
}

export function getSectionPalette(sectionId: ShaftSectionId) {
  return SECTION_COLORS[sectionId];
}

export function getSectionForHeight(height: number) {
  return sectionForHeight(height);
}
