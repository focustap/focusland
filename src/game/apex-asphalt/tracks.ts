import type { TrackSpec } from "./types";

const neonTheme = {
  skyTop: 0x091126,
  skyBottom: 0x152d55,
  ground: 0x0f1c28,
  infield: 0x173a2d,
  outerRim: 0x081018,
  road: 0x2f3348,
  shoulder: 0x56606d,
  lane: 0xf8d95c,
  rumbleA: 0xf97316,
  rumbleB: 0xfffbeb,
  accent: 0x38bdf8,
  accentSoft: 0x7dd3fc,
  panel: "rgba(8, 15, 28, 0.82)",
  panelBorder: "rgba(125, 211, 252, 0.18)",
  text: "#e6f3ff"
} as const;

const harborTheme = {
  skyTop: 0x13202d,
  skyBottom: 0x35577a,
  ground: 0x20383f,
  infield: 0x29514e,
  outerRim: 0x0f1c22,
  road: 0x353943,
  shoulder: 0x72757f,
  lane: 0xfff0b3,
  rumbleA: 0xef4444,
  rumbleB: 0xf8fafc,
  accent: 0xf59e0b,
  accentSoft: 0xfcd34d,
  panel: "rgba(16, 27, 31, 0.82)",
  panelBorder: "rgba(252, 211, 77, 0.18)",
  text: "#f9f4e8"
} as const;

export const APEX_TRACKS: TrackSpec[] = [
  {
    id: "neon-loop",
    name: "Neon Loop",
    tagline: "Wide sweepers, one killer inner switchback, and forgiving exits if you stay brave.",
    description:
      "A polished night circuit built to feel fast right away. The long final arc rewards committed throttle, but the mid-map switchback punishes lazy steering.",
    laps: 3,
    roadWidth: 168,
    worldWidth: 2400,
    worldHeight: 1600,
    startProgress: 0.03,
    checkpointFractions: [0.2, 0.42, 0.66, 0.84],
    controlPoints: [
      { x: 1530, y: 1180 },
      { x: 1870, y: 1120 },
      { x: 2040, y: 870 },
      { x: 1960, y: 560 },
      { x: 1630, y: 360 },
      { x: 1240, y: 320 },
      { x: 900, y: 410 },
      { x: 650, y: 670 },
      { x: 640, y: 1020 },
      { x: 860, y: 1260 },
      { x: 1160, y: 1330 }
    ],
    scenery: [
      { kind: "neon", x: 430, y: 540, scale: 1.1 },
      { kind: "neon", x: 2140, y: 980, scale: 1.2 },
      { kind: "tower", x: 1170, y: 170, scale: 1.15 },
      { kind: "tower", x: 1810, y: 260, scale: 0.95 },
      { kind: "grandstand", x: 700, y: 1450, scale: 1.15 },
      { kind: "grandstand", x: 1775, y: 1380, scale: 1.05 },
      { kind: "billboard", x: 2125, y: 690, scale: 1 },
      { kind: "billboard", x: 420, y: 930, scale: 0.95 },
      { kind: "tree", x: 1180, y: 720, scale: 1.1 },
      { kind: "tree", x: 1280, y: 860, scale: 0.92 },
      { kind: "tree", x: 1370, y: 980, scale: 0.88 },
      { kind: "tree", x: 1450, y: 740, scale: 0.86 },
      { kind: "tree", x: 1010, y: 860, scale: 0.9 },
      { kind: "tree", x: 1550, y: 870, scale: 1.05 },
      { kind: "palm", x: 480, y: 1180, scale: 1.08 },
      { kind: "palm", x: 2030, y: 1220, scale: 0.98 }
    ],
    theme: neonTheme
  },
  {
    id: "harbor-hairpin",
    name: "Harbor Hairpin",
    tagline: "Tighter walls, rougher exits, and a dockside back section that loves late braking.",
    description:
      "A coastal course with stronger rotation demands. The hairpin complex is slower but more tactical, so racecraft matters more than raw pace.",
    laps: 3,
    roadWidth: 158,
    worldWidth: 2460,
    worldHeight: 1680,
    startProgress: 0.06,
    checkpointFractions: [0.16, 0.34, 0.58, 0.79],
    controlPoints: [
      { x: 1570, y: 1260 },
      { x: 1880, y: 1190 },
      { x: 2120, y: 950 },
      { x: 2140, y: 670 },
      { x: 1940, y: 420 },
      { x: 1520, y: 330 },
      { x: 1160, y: 430 },
      { x: 930, y: 660 },
      { x: 760, y: 910 },
      { x: 560, y: 980 },
      { x: 420, y: 830 },
      { x: 470, y: 620 },
      { x: 710, y: 420 },
      { x: 820, y: 250 },
      { x: 610, y: 190 },
      { x: 350, y: 260 },
      { x: 240, y: 520 },
      { x: 260, y: 890 },
      { x: 520, y: 1230 },
      { x: 880, y: 1380 },
      { x: 1220, y: 1410 }
    ],
    scenery: [
      { kind: "dock", x: 1940, y: 1400, scale: 1.25 },
      { kind: "dock", x: 2190, y: 1250, scale: 1.05 },
      { kind: "crate", x: 2030, y: 1325, scale: 0.92 },
      { kind: "crate", x: 2250, y: 1190, scale: 0.86 },
      { kind: "billboard", x: 1740, y: 150, scale: 1.12 },
      { kind: "billboard", x: 330, y: 1110, scale: 0.96 },
      { kind: "grandstand", x: 1240, y: 1530, scale: 1.18 },
      { kind: "grandstand", x: 1860, y: 1440, scale: 1.08 },
      { kind: "tower", x: 1040, y: 180, scale: 1.12 },
      { kind: "tower", x: 380, y: 160, scale: 0.88 },
      { kind: "palm", x: 1450, y: 770, scale: 1.1 },
      { kind: "palm", x: 1330, y: 900, scale: 0.88 },
      { kind: "palm", x: 1540, y: 945, scale: 0.96 },
      { kind: "tree", x: 1030, y: 1040, scale: 0.9 },
      { kind: "tree", x: 970, y: 1160, scale: 0.82 },
      { kind: "tree", x: 880, y: 1020, scale: 0.94 },
      { kind: "tree", x: 760, y: 1120, scale: 0.84 },
      { kind: "neon", x: 1550, y: 1520, scale: 0.95 }
    ],
    theme: harborTheme
  }
];

export function getApexTrack(trackId: string) {
  return APEX_TRACKS.find((track) => track.id === trackId) ?? APEX_TRACKS[0];
}

