export type PlatformKind = "stable" | "breakable" | "moving" | "hazard" | "wind";

export type ShaftSectionId =
  | "service"
  | "maintenance"
  | "office"
  | "industrial"
  | "relay"
  | "surge"
  | "shutter"
  | "critical";

export type GrappleAnchor = {
  id: number;
  x: number;
  y: number;
};

export type PlatformData = {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  vx: number;
  vy: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  kind: PlatformKind;
  anchorId: number | null;
  forceX: number;
  forceY: number;
  breakDelayMs: number;
  respawnDelayMs: number;
  broken: boolean;
  triggered: boolean;
};

export type SectionSlice = {
  id: number;
  startY: number;
  endY: number;
  theme: ShaftSectionId;
};

export type PlayerState = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  grounded: boolean;
  wallLeft: boolean;
  wallRight: boolean;
  coyoteMs: number;
  jumpBufferMs: number;
  jumpCutUsed: boolean;
  wallJumpLockMs: number;
  lastWallJumpSide: -1 | 0 | 1;
  grappleCooldownMs: number;
  grappleLineMs: number;
  grappleAnchorId: number | null;
  aimAnchorId: number | null;
};

export type RunState = {
  player: PlayerState;
  platforms: PlatformData[];
  anchors: GrappleAnchor[];
  sections: SectionSlice[];
  nextPlatformId: number;
  nextAnchorId: number;
  nextSectionId: number;
  nextSpawnY: number;
  topHeight: number;
  score: number;
  combo: number;
  bestCombo: number;
  statusText: string;
  collapseHeight: number;
  collapseSpeed: number;
  elapsedMs: number;
  gameOver: boolean;
  reason: string;
  seed: number;
};

export type HudSnapshot = {
  height: number;
  score: number;
  collapseGap: number;
  sectionLabel: string;
  grappleReady: boolean;
};
