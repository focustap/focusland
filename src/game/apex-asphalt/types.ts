export type TrackTheme = {
  skyTop: number;
  skyBottom: number;
  ground: number;
  infield: number;
  outerRim: number;
  road: number;
  shoulder: number;
  lane: number;
  rumbleA: number;
  rumbleB: number;
  accent: number;
  accentSoft: number;
  panel: string;
  panelBorder: string;
  text: string;
};

export type TrackSceneryKind =
  | "tree"
  | "palm"
  | "tower"
  | "neon"
  | "grandstand"
  | "dock"
  | "crate"
  | "billboard";

export type TrackScenery = {
  kind: TrackSceneryKind;
  x: number;
  y: number;
  scale?: number;
  rotation?: number;
  tint?: number;
};

export type TrackPoint = {
  x: number;
  y: number;
};

export type TrackSpec = {
  id: string;
  name: string;
  tagline: string;
  description: string;
  laps: number;
  roadWidth: number;
  worldWidth: number;
  worldHeight: number;
  startProgress: number;
  checkpointFractions: number[];
  controlPoints: TrackPoint[];
  scenery: TrackScenery[];
  theme: TrackTheme;
};

export type RaceHudSnapshot = {
  speed: number;
  lap: number;
  totalLaps: number;
  place: number;
  totalRacers: number;
  timeMs: number;
  countdown: number | null;
  message: string;
  trackName: string;
  trackTagline: string;
  boostHint: string;
  nextCheckpoint: number;
  totalCheckpoints: number;
};

export type RaceResult = {
  trackId: string;
  trackName: string;
  finished: boolean;
  won: boolean;
  place: number;
  totalRacers: number;
  timeMs: number;
  bestLapMs: number | null;
  score: number;
  goldEarned: number;
  reason: string;
};

