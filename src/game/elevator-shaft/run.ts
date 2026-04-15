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
export const GRAPPLE_RANGE = 190;
export const GRAPPLE_PULL_SPEED = 690;
export const GRAPPLE_COOLDOWN_MS = 520;
export const COLLAPSE_KILL_BUFFER = 18;
export const SECTION_HEIGHT = 920;

const SECTION_ORDER: ShaftSectionId[] = ["service", "maintenance", "office", "industrial", "critical"];

const SECTION_LABELS: Record<ShaftSectionId, string> = {
  service: "Service Shaft",
  maintenance: "Maintenance Core",
  office: "Office Breakthrough",
  industrial: "Machine Deck",
  critical: "Critical Collapse"
};

const SECTION_COLORS: Record<ShaftSectionId, { bg: number; accent: number; hazard: number }> = {
  service: { bg: 0x0f172a, accent: 0x60a5fa, hazard: 0xf97316 },
  maintenance: { bg: 0x10261f, accent: 0x34d399, hazard: 0xfacc15 },
  office: { bg: 0x1f2340, accent: 0xc4b5fd, hazard: 0xfb7185 },
  industrial: { bg: 0x2a1a12, accent: 0xf59e0b, hazard: 0xef4444 },
  critical: { bg: 0x2c1014, accent: 0xf87171, hazard: 0xfbbf24 }
};

function sectionForHeight(height: number) {
  const index = Math.floor(height / SECTION_HEIGHT) % SECTION_ORDER.length;
  return SECTION_ORDER[index];
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

function generateSection(state: RunState) {
  const startY = state.nextSpawnY;
  const endY = startY - SECTION_HEIGHT;
  const random = Phaser.Math.RandomDataGenerator([String(state.seed + state.nextSectionId)]);
  const theme = sectionForHeight(Math.max(0, -endY));
  createSectionSlice(state, startY, endY, theme);

  let y = startY - 90;
  let previousX = Phaser.Math.Between(SHAFT_LEFT + 80, SHAFT_RIGHT - 80);

  while (y > endY + 60) {
    const spacing = randomBetween(() => random.frac(), 78, theme === "critical" ? 104 : 92);
    y -= spacing;

    const routeBias = Phaser.Math.Between(-1, 1);
    const swing = theme === "office" ? 122 : theme === "critical" ? 144 : 110;
    const nextX = clamp(
      previousX + routeBias * randomBetween(() => random.frac(), 42, swing),
      SHAFT_LEFT + 58,
      SHAFT_RIGHT - 58
    );

    const kindRoll = random.frac();
    const kind =
      theme === "critical" && kindRoll > 0.62
        ? "breakable"
        : theme === "industrial" && kindRoll > 0.72
          ? "moving"
          : kindRoll > 0.84
            ? "breakable"
            : "stable";
    const width =
      kind === "breakable"
        ? randomBetween(() => random.frac(), 76, 116)
        : kind === "moving"
          ? randomBetween(() => random.frac(), 84, 124)
          : randomBetween(() => random.frac(), 92, 148);

    const platform = createPlatform(state, {
      x: nextX,
      y,
      width,
      kind,
      vx: kind === "moving" ? random.pick([-48, 48]) : 0,
      minX: clamp(nextX - randomBetween(() => random.frac(), 34, 72), SHAFT_LEFT + 52, SHAFT_RIGHT - 52),
      maxX: clamp(nextX + randomBetween(() => random.frac(), 34, 72), SHAFT_LEFT + 52, SHAFT_RIGHT - 52),
      breakDelayMs: kind === "breakable" ? 360 : 0
    });

    const anchorChance =
      theme === "maintenance"
        ? 0.74
        : theme === "critical"
          ? 0.7
          : theme === "office"
            ? 0.5
            : 0.4;
    if (random.frac() < anchorChance) {
      const anchorX = clamp(
        nextX + randomBetween(() => random.frac(), -58, 58),
        SHAFT_LEFT + 38,
        SHAFT_RIGHT - 38
      );
      const anchorY = y - randomBetween(() => random.frac(), 48, 72);
      const anchor = createAnchor(state, anchorX, anchorY);
      platform.anchorId = anchor.id;
    }

    if (theme === "office" && random.frac() < 0.26) {
      createPlatform(state, {
        x: clamp(nextX + randomBetween(() => random.frac(), -138, 138), SHAFT_LEFT + 52, SHAFT_RIGHT - 52),
        y: y - randomBetween(() => random.frac(), 36, 56),
        width: randomBetween(() => random.frac(), 64, 90),
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
      grappleCooldownMs: 0,
      grappleLineMs: 0,
      grappleAnchorId: null
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
      state.combo += 1;
    } else if (player.wallLeft) {
      player.vx = WALL_JUMP_X;
      player.vy = -WALL_JUMP_Y;
      player.wallJumpLockMs = 90;
      player.jumpBufferMs = 0;
      player.jumpCutUsed = false;
      state.combo += 2;
    } else if (player.wallRight) {
      player.vx = -WALL_JUMP_X;
      player.vy = -WALL_JUMP_Y;
      player.wallJumpLockMs = 90;
      player.jumpBufferMs = 0;
      player.jumpCutUsed = false;
      state.combo += 2;
    }
    state.bestCombo = Math.max(state.bestCombo, state.combo);
  }

  if (!input.jumpHeld && player.vy < -260 && !player.jumpCutUsed) {
    player.vy *= 0.58;
    player.jumpCutUsed = true;
  }

  if (input.grapplePressed && player.grappleCooldownMs <= 0) {
    const pointerWorldX = input.pointerX;
    const pointerWorldY = input.pointerY + input.cameraY;
    let bestAnchor: GrappleAnchor | null = null;
    let bestScore = Number.POSITIVE_INFINITY;

    state.anchors.forEach((anchor) => {
      const dx = anchor.x - player.x;
      const dy = anchor.y - player.y;
      const distance = Math.hypot(dx, dy);
      if (distance > GRAPPLE_RANGE || dy > 36) {
        return;
      }

      const pointerDistance = Math.hypot(anchor.x - pointerWorldX, anchor.y - pointerWorldY);
      if (pointerDistance < bestScore) {
        bestScore = pointerDistance;
        bestAnchor = anchor;
      }
    });

    if (bestAnchor) {
      const dx = bestAnchor.x - player.x;
      const dy = bestAnchor.y - player.y;
      const length = Math.max(1, Math.hypot(dx, dy));
      player.vx = (dx / length) * GRAPPLE_PULL_SPEED;
      player.vy = (dy / length) * GRAPPLE_PULL_SPEED;
      player.grappleCooldownMs = GRAPPLE_COOLDOWN_MS;
      player.grappleLineMs = 160;
      player.grappleAnchorId = bestAnchor.id;
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
  } else if (player.x + halfWidth >= SHAFT_RIGHT) {
    player.x = SHAFT_RIGHT - halfWidth;
    player.vx = Math.min(player.vx, 0);
    player.wallRight = true;
  }

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

    const wasAbove = previousY + halfHeight <= platformTop + 3;
    const hitsTop = player.y + halfHeight >= platformTop && player.y + halfHeight <= platformBottom + 16;
    if (player.vy >= 0 && wasAbove && hitsTop) {
      player.y = platformTop - halfHeight;
      player.vy = 0;
      player.grounded = true;
      player.coyoteMs = COYOTE_MS;
      player.jumpCutUsed = false;
      if (platform.kind === "breakable" && !platform.triggered) {
        platform.triggered = true;
      }
      return;
    }
  });

  state.platforms.forEach((platform) => {
    if (platform.kind === "breakable" && platform.triggered && !platform.broken) {
      platform.breakDelayMs -= deltaMs;
      if (platform.breakDelayMs <= 0) {
        platform.broken = true;
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

  const collapseBaseSpeed = 52 + Math.min(132, state.topHeight * 0.028);
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
