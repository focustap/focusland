import Phaser from "phaser";
import { getApexTrack } from "./tracks";
import type { RaceHudSnapshot, RaceResult, TrackPoint, TrackScenery, TrackSpec } from "./types";

type ControlsState = {
  accelerate: boolean;
  brake: boolean;
  left: boolean;
  right: boolean;
};

type CarPalette = {
  key: string;
  body: number;
  stripe: number;
  trim: number;
  shadow: number;
};

type CarState = {
  id: string;
  name: string;
  isPlayer: boolean;
  sprite: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Ellipse;
  exhaust: Phaser.GameObjects.Particles.ParticleEmitter;
  smoke: Phaser.GameObjects.Particles.ParticleEmitter;
  spark: Phaser.GameObjects.Particles.ParticleEmitter;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  speed: number;
  topSpeed: number;
  acceleration: number;
  brakePower: number;
  turnRate: number;
  grip: number;
  turnVelocity: number;
  sampleIndex: number;
  totalDistance: number;
  lap: number;
  nextCheckpoint: number;
  lastLapMs: number | null;
  bestLapMs: number | null;
  finished: boolean;
  finishedAtMs: number | null;
  finishPlace: number | null;
  lapStartedAtMs: number;
  aiOffset: number;
  aiLookahead: number;
  aiCornerBias: number;
  hudMessage: string;
  impactCooldownMs: number;
  wobbleMs: number;
  offroadRatio: number;
};

type DerivedTrack = {
  spec: TrackSpec;
  points: Phaser.Math.Vector2[];
  samplePoints: Phaser.Math.Vector2[];
  sampleNormals: Phaser.Math.Vector2[];
  cumulativeLengths: number[];
  totalLength: number;
  startSampleIndex: number;
  checkpointSamples: number[];
};

type MountOptions = {
  parent: HTMLDivElement;
  trackId: string;
  playerMode?: "manual" | "autopilot";
  onHudChange: (snapshot: RaceHudSnapshot) => void;
  onRaceEnd: (result: RaceResult) => void;
  onStatus: (message: string) => void;
};

const VIEW_WIDTH = 960;
const VIEW_HEIGHT = 540;
const CAMERA_LERP = 0.12;
const TOTAL_RACERS = 4;
const ROAD_DRAG = 180;
const OFFROAD_DRAG = 420;
const MAX_REVERSE_SPEED = 120;
const TRACK_MARGIN_HIT = 0.69;
const TRACK_MARGIN_OFFROAD = 0.57;
const COLLISION_RADIUS = 26;
const COUNTDOWN_MS = 3800;

function getCountdownValue(countdownMs: number) {
  if (countdownMs > 2800) return 3;
  if (countdownMs > 1800) return 2;
  if (countdownMs > 800) return 1;
  return null;
}

const DRIVER_COLORS: CarPalette[] = [
  { key: "player", body: 0xf97316, stripe: 0xfff7ed, trim: 0x0f172a, shadow: 0x3b1d12 },
  { key: "rival-1", body: 0x38bdf8, stripe: 0xe0f2fe, trim: 0x082f49, shadow: 0x10263b },
  { key: "rival-2", body: 0xf43f5e, stripe: 0xfff1f2, trim: 0x4c0519, shadow: 0x321520 },
  { key: "rival-3", body: 0xa3e635, stripe: 0xf7fee7, trim: 0x1a2e05, shadow: 0x213016 }
];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function wrapAngle(angle: number) {
  const tau = Math.PI * 2;
  let normalized = angle % tau;
  if (normalized < -Math.PI) {
    normalized += tau;
  } else if (normalized > Math.PI) {
    normalized -= tau;
  }
  return normalized;
}

function formatRaceTime(timeMs: number) {
  const totalSeconds = Math.floor(timeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const hundredths = Math.floor((timeMs % 1000) / 10);
  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(hundredths).padStart(2, "0")}`;
}

function blendColor(base: number, target: number, amount: number) {
  const baseColor = Phaser.Display.Color.IntegerToColor(base);
  const targetColor = Phaser.Display.Color.IntegerToColor(target);
  return Phaser.Display.Color.GetColor(
    Math.round(Phaser.Math.Linear(baseColor.red, targetColor.red, amount)),
    Math.round(Phaser.Math.Linear(baseColor.green, targetColor.green, amount)),
    Math.round(Phaser.Math.Linear(baseColor.blue, targetColor.blue, amount))
  );
}

function createCarTexture(scene: Phaser.Scene, palette: CarPalette) {
  const textureKey = `apex-car-${palette.key}`;
  if (scene.textures.exists(textureKey)) {
    return textureKey;
  }

  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  g.fillStyle(palette.shadow, 1);
  g.fillRoundedRect(8, 6, 48, 20, 8);
  g.fillStyle(palette.body, 1);
  g.fillRoundedRect(10, 4, 44, 24, 9);
  g.fillStyle(palette.stripe, 1);
  g.fillRoundedRect(28, 5, 10, 22, 4);
  g.fillStyle(palette.trim, 1);
  g.fillRoundedRect(18, 8, 28, 16, 7);
  g.fillStyle(0xe2e8f0, 0.85);
  g.fillRect(21, 9, 6, 5);
  g.fillRect(39, 9, 6, 5);
  g.fillRect(21, 18, 6, 5);
  g.fillRect(39, 18, 6, 5);
  g.fillStyle(0x111827, 1);
  g.fillRect(12, 8, 4, 6);
  g.fillRect(48, 8, 4, 6);
  g.fillRect(12, 18, 4, 6);
  g.fillRect(48, 18, 4, 6);
  g.generateTexture(textureKey, 64, 32);
  g.destroy();

  return textureKey;
}

function createParticleTextures(scene: Phaser.Scene) {
  if (!scene.textures.exists("apex-spark")) {
    const spark = scene.make.graphics({ x: 0, y: 0, add: false });
    spark.fillStyle(0xfff7ed, 1);
    spark.fillCircle(4, 4, 4);
    spark.generateTexture("apex-spark", 8, 8);
    spark.destroy();
  }

  if (!scene.textures.exists("apex-smoke")) {
    const smoke = scene.make.graphics({ x: 0, y: 0, add: false });
    smoke.fillStyle(0xf8fafc, 1);
    smoke.fillCircle(8, 8, 8);
    smoke.generateTexture("apex-smoke", 16, 16);
    smoke.destroy();
  }
}

function makeClosedSpline(points: TrackPoint[]) {
  const splinePoints = [...points, points[0], points[1]].map((point) => new Phaser.Math.Vector2(point.x, point.y));
  return new Phaser.Curves.Spline(splinePoints);
}

function deriveTrack(spec: TrackSpec): DerivedTrack {
  const curve = makeClosedSpline(spec.controlPoints);
  const samples = Math.max(320, spec.controlPoints.length * 36);
  const samplePoints = Array.from({ length: samples }, (_, index) => curve.getPoint(index / samples));
  const sampleNormals: Phaser.Math.Vector2[] = [];
  const cumulativeLengths: number[] = [0];

  for (let index = 0; index < samplePoints.length; index += 1) {
    const point = samplePoints[index];
    const next = samplePoints[(index + 1) % samplePoints.length];
    const previous = samplePoints[(index - 1 + samplePoints.length) % samplePoints.length];
    const tangent = next.clone().subtract(previous).normalize();
    sampleNormals.push(new Phaser.Math.Vector2(-tangent.y, tangent.x));
    const length = Phaser.Math.Distance.Between(point.x, point.y, next.x, next.y);
    cumulativeLengths.push(cumulativeLengths[cumulativeLengths.length - 1] + length);
  }

  const totalLength = cumulativeLengths[cumulativeLengths.length - 1];
  const startSampleIndex = Math.floor(spec.startProgress * samplePoints.length) % samplePoints.length;
  const checkpointSamples = spec.checkpointFractions.map((fraction) =>
    (startSampleIndex + Math.floor(fraction * samplePoints.length)) % samplePoints.length
  );

  return {
    spec,
    points: spec.controlPoints.map((point) => new Phaser.Math.Vector2(point.x, point.y)),
    samplePoints,
    sampleNormals,
    cumulativeLengths,
    totalLength,
    startSampleIndex,
    checkpointSamples
  };
}

function relativeProgressForSample(track: DerivedTrack, sampleIndex: number) {
  return (
    (sampleIndex - track.startSampleIndex + track.samplePoints.length) % track.samplePoints.length
  ) / track.samplePoints.length;
}

function pointForSample(track: DerivedTrack, sampleIndex: number, laneOffset = 0) {
  const wrapped = (sampleIndex + track.samplePoints.length) % track.samplePoints.length;
  return track.samplePoints[wrapped].clone().add(track.sampleNormals[wrapped].clone().scale(laneOffset));
}

function tangentForSample(track: DerivedTrack, sampleIndex: number) {
  const wrapped = (sampleIndex + track.samplePoints.length) % track.samplePoints.length;
  const current = track.samplePoints[wrapped];
  const next = track.samplePoints[(wrapped + 1) % track.samplePoints.length];
  return next.clone().subtract(current).normalize();
}

function findNearestSample(track: DerivedTrack, x: number, y: number, currentIndex?: number) {
  let bestIndex = currentIndex ?? 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  const total = track.samplePoints.length;

  if (typeof currentIndex === "number") {
    const searchRadius = 48;
    for (let offset = -searchRadius; offset <= searchRadius; offset += 1) {
      const index = (currentIndex + offset + total) % total;
      const point = track.samplePoints[index];
      const distance = Phaser.Math.Distance.Squared(point.x, point.y, x, y);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    }
    if (bestDistance < track.spec.roadWidth * track.spec.roadWidth * 1.4) {
      return bestIndex;
    }
  }

  for (let index = 0; index < total; index += 1) {
    const point = track.samplePoints[index];
    const distance = Phaser.Math.Distance.Squared(point.x, point.y, x, y);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }

  return bestIndex;
}

function emitExhaust(car: CarState) {
  const heading = new Phaser.Math.Vector2(Math.cos(car.angle), Math.sin(car.angle));
  const rearX = car.x - heading.x * 18;
  const rearY = car.y - heading.y * 18;
  car.exhaust.emitParticleAt(rearX, rearY, 1);
}

function updateEmitterPose(emitter: Phaser.GameObjects.Particles.ParticleEmitter, car: CarState) {
  emitter.setAngle(Phaser.Math.RadToDeg(car.angle) + 180);
}

function drawScenery(graphics: Phaser.GameObjects.Graphics, item: TrackScenery, sceneTime = 0) {
  const scale = item.scale ?? 1;
  const tint = item.tint ?? 0xffffff;
  const color = tint;
  const x = item.x;
  const y = item.y;
  graphics.save();
  graphics.translateCanvas(x, y);
  graphics.rotateCanvas(item.rotation ?? 0);

  if (item.kind === "tree") {
    graphics.fillStyle(0x5b3f1e, 1);
    graphics.fillRect(-5 * scale, 8 * scale, 10 * scale, 18 * scale);
    graphics.fillStyle(blendColor(0x1f7a3f, color, 0.1), 1);
    graphics.fillCircle(0, -2 * scale, 22 * scale);
    graphics.fillCircle(-12 * scale, 8 * scale, 15 * scale);
    graphics.fillCircle(14 * scale, 10 * scale, 14 * scale);
  } else if (item.kind === "palm") {
    graphics.fillStyle(0x8b5a2b, 1);
    graphics.fillRect(-3 * scale, -2 * scale, 6 * scale, 32 * scale);
    graphics.fillStyle(0x31b36b, 1);
    for (let index = 0; index < 5; index += 1) {
      graphics.fillTriangle(
        0,
        0,
        Math.cos((index / 5) * Math.PI * 2) * 26 * scale,
        Math.sin((index / 5) * Math.PI * 2) * 14 * scale,
        Math.cos(((index + 1) / 5) * Math.PI * 2) * 20 * scale,
        Math.sin(((index + 1) / 5) * Math.PI * 2) * 10 * scale
      );
    }
  } else if (item.kind === "tower") {
    graphics.fillStyle(0x233047, 1);
    graphics.fillRoundedRect(-24 * scale, -52 * scale, 48 * scale, 104 * scale, 10 * scale);
    graphics.fillStyle(0x8ec5ff, 0.9);
    for (let row = -40; row <= 28; row += 18) {
      graphics.fillRect(-15 * scale, row * scale, 30 * scale, 8 * scale);
    }
  } else if (item.kind === "neon") {
    const pulse = 0.74 + Math.sin(sceneTime * 0.004 + x * 0.01 + y * 0.01) * 0.18;
    graphics.lineStyle(6 * scale, color, pulse);
    graphics.strokeRoundedRect(-30 * scale, -18 * scale, 60 * scale, 36 * scale, 10 * scale);
    graphics.fillStyle(0x091126, 0.86);
    graphics.fillRoundedRect(-22 * scale, -12 * scale, 44 * scale, 24 * scale, 8 * scale);
  } else if (item.kind === "grandstand") {
    graphics.fillStyle(0x374151, 1);
    graphics.fillRect(-42 * scale, -18 * scale, 84 * scale, 36 * scale);
    graphics.fillStyle(0x94a3b8, 0.95);
    for (let index = 0; index < 5; index += 1) {
      graphics.fillRect((-36 + index * 18) * scale, (-10 + (index % 2) * 7) * scale, 12 * scale, 14 * scale);
    }
  } else if (item.kind === "dock") {
    graphics.fillStyle(0x8b5a2b, 1);
    graphics.fillRect(-64 * scale, -18 * scale, 128 * scale, 36 * scale);
    graphics.fillStyle(0x5b6470, 1);
    graphics.fillRect(-58 * scale, -12 * scale, 20 * scale, 24 * scale);
    graphics.fillRect(10 * scale, -12 * scale, 42 * scale, 24 * scale);
  } else if (item.kind === "crate") {
    graphics.fillStyle(0xb7791f, 1);
    graphics.fillRect(-12 * scale, -12 * scale, 24 * scale, 24 * scale);
    graphics.lineStyle(2 * scale, 0x6b3f15, 1);
    graphics.strokeRect(-12 * scale, -12 * scale, 24 * scale, 24 * scale);
    graphics.strokeLineShape(new Phaser.Geom.Line(-12 * scale, -12 * scale, 12 * scale, 12 * scale));
    graphics.strokeLineShape(new Phaser.Geom.Line(12 * scale, -12 * scale, -12 * scale, 12 * scale));
  } else if (item.kind === "billboard") {
    graphics.fillStyle(0x2b2d42, 1);
    graphics.fillRoundedRect(-34 * scale, -22 * scale, 68 * scale, 44 * scale, 6 * scale);
    graphics.fillStyle(color, 0.95);
    graphics.fillRoundedRect(-26 * scale, -15 * scale, 52 * scale, 30 * scale, 4 * scale);
    graphics.fillStyle(0x475569, 1);
    graphics.fillRect(-4 * scale, 18 * scale, 8 * scale, 18 * scale);
  }

  graphics.restore();
}

function drawTrackScene(scene: Phaser.Scene, track: DerivedTrack, checkpointGraphics: Phaser.GameObjects.Graphics) {
  const { spec } = track;
  const backdrop = scene.add.graphics();
  backdrop.fillGradientStyle(spec.theme.skyTop, spec.theme.skyTop, spec.theme.skyBottom, spec.theme.skyBottom, 1);
  backdrop.fillRect(0, 0, spec.worldWidth, spec.worldHeight);
  backdrop.fillStyle(spec.theme.ground, 1);
  backdrop.fillRect(0, 0, spec.worldWidth, spec.worldHeight);

  const infield = scene.add.graphics();
  infield.fillStyle(spec.theme.outerRim, 1);
  infield.fillCircle(spec.worldWidth * 0.5, spec.worldHeight * 0.5, Math.max(spec.worldWidth, spec.worldHeight) * 0.46);
  infield.fillStyle(spec.theme.infield, 1);
  infield.fillCircle(spec.worldWidth * 0.52, spec.worldHeight * 0.52, Math.max(spec.worldWidth, spec.worldHeight) * 0.26);
  infield.fillStyle(spec.theme.accentSoft, 0.08);
  infield.fillCircle(spec.worldWidth * 0.55, spec.worldHeight * 0.45, 170);
  infield.fillCircle(spec.worldWidth * 0.3, spec.worldHeight * 0.6, 140);

  const road = scene.add.graphics();
  road.lineStyle(spec.roadWidth + 34, spec.theme.shoulder, 1);
  road.strokePoints(track.samplePoints, true, true);
  road.lineStyle(spec.roadWidth, spec.theme.road, 1);
  road.strokePoints(track.samplePoints, true, true);

  const rumble = scene.add.graphics();
  const rumbleSpacing = 10;
  for (let index = 0; index < track.samplePoints.length; index += rumbleSpacing) {
    const point = track.samplePoints[index];
    const normal = track.sampleNormals[index];
    const tangent = tangentForSample(track, index);
    const color = Math.floor(index / rumbleSpacing) % 2 === 0 ? spec.theme.rumbleA : spec.theme.rumbleB;
    const halfStrip = spec.roadWidth * 0.53;
    const outerStrip = spec.roadWidth * 0.63;
    const segmentLength = 18;
    const innerLeft = point.clone().add(normal.clone().scale(-halfStrip));
    const outerLeft = point.clone().add(normal.clone().scale(-outerStrip));
    const innerRight = point.clone().add(normal.clone().scale(halfStrip));
    const outerRight = point.clone().add(normal.clone().scale(outerStrip));
    const tangentOffset = tangent.clone().scale(segmentLength * 0.5);
    const leftPolygon = [
      outerLeft.clone().subtract(tangentOffset),
      outerLeft.clone().add(tangentOffset),
      innerLeft.clone().add(tangentOffset),
      innerLeft.clone().subtract(tangentOffset)
    ];
    const rightPolygon = [
      innerRight.clone().subtract(tangentOffset),
      innerRight.clone().add(tangentOffset),
      outerRight.clone().add(tangentOffset),
      outerRight.clone().subtract(tangentOffset)
    ];
    rumble.fillStyle(color, 1);
    rumble.fillPoints(leftPolygon, true, true);
    rumble.fillPoints(rightPolygon, true, true);
  }

  const lane = scene.add.graphics();
  lane.lineStyle(5, spec.theme.lane, 0.92);
  for (let index = 0; index < track.samplePoints.length; index += 16) {
    const start = track.samplePoints[index];
    const end = track.samplePoints[(index + 8) % track.samplePoints.length];
    lane.strokeLineShape(new Phaser.Geom.Line(start.x, start.y, end.x, end.y));
  }

  const finish = scene.add.graphics();
  const finishPoint = track.samplePoints[track.startSampleIndex];
  const finishNormal = track.sampleNormals[track.startSampleIndex];
  const finishTangent = tangentForSample(track, track.startSampleIndex);
  const gateHalf = spec.roadWidth * 0.56;
  for (let stripe = -6; stripe <= 6; stripe += 1) {
    const stripeOffset = stripe * 14;
    const center = finishPoint.clone().add(finishTangent.clone().scale(stripeOffset));
    finish.lineStyle(
      12,
      stripe % 2 === 0 ? 0xf8fafc : 0x0f172a,
      1
    );
    finish.strokeLineShape(
      new Phaser.Geom.Line(
        center.x + finishNormal.x * gateHalf,
        center.y + finishNormal.y * gateHalf,
        center.x - finishNormal.x * gateHalf,
        center.y - finishNormal.y * gateHalf
      )
    );
  }

  const scenery = scene.add.graphics();
  spec.scenery.forEach((item) => drawScenery(scenery, item));

  checkpointGraphics.clear();
}

function buildHudSnapshot(track: DerivedTrack, cars: CarState[], player: CarState, raceClockMs: number, countdownMs: number) {
  const ranked = [...cars].sort((a, b) => {
    if (a.finished && b.finished) {
      return (a.finishedAtMs ?? Number.MAX_SAFE_INTEGER) - (b.finishedAtMs ?? Number.MAX_SAFE_INTEGER);
    }
    if (a.finished) return -1;
    if (b.finished) return 1;
    return b.totalDistance - a.totalDistance;
  });
      const place = ranked.findIndex((car) => car.id === player.id) + 1;
  const countdown = countdownMs > 0 ? getCountdownValue(countdownMs) : null;

  return {
    speed: Math.round(Math.abs(player.speed) * 0.82),
    lap: Math.min(track.spec.laps, Math.floor(player.totalDistance) + 1),
    totalLaps: track.spec.laps,
    place,
    totalRacers: cars.length,
    timeMs: raceClockMs,
    countdown,
    message: player.hudMessage,
    trackName: track.spec.name,
    trackTagline: track.spec.tagline,
    boostHint: player.offroadRatio > 0.15 ? "Grip is falling. Ease it back onto the asphalt." : "Brake before the tight stuff, then fire out clean.",
    nextCheckpoint: player.nextCheckpoint + 1,
    totalCheckpoints: track.spec.checkpointFractions.length
  } satisfies RaceHudSnapshot;
}

function createPlayerResult(track: DerivedTrack, cars: CarState[], player: CarState, raceClockMs: number) {
  const ranked = [...cars].sort((a, b) => {
    if (a.finished && b.finished) {
      return (a.finishedAtMs ?? Number.MAX_SAFE_INTEGER) - (b.finishedAtMs ?? Number.MAX_SAFE_INTEGER);
    }
    if (a.finished) return -1;
    if (b.finished) return 1;
    return b.totalDistance - a.totalDistance;
  });
  const place = ranked.findIndex((car) => car.id === player.id) + 1;
  const finished = player.finished;
  const score = Math.max(
    120,
    Math.round(
      (finished ? 1400 : 700) +
      (cars.length - place) * 260 +
      player.totalDistance * 140 +
      (player.bestLapMs ? Math.max(0, 280 - player.bestLapMs / 24) : 0)
    )
  );
  const goldEarned = Math.max(6, Math.min(30, Math.round(score / 100)));
  const won = place === 1 && finished;

  return {
    trackId: track.spec.id,
    trackName: track.spec.name,
    finished,
    won,
    place,
    totalRacers: cars.length,
    timeMs: finished ? (player.finishedAtMs ?? raceClockMs) : raceClockMs,
    bestLapMs: player.bestLapMs,
    score,
    goldEarned,
    reason: won ? "Victory. You owned the last lap." : finished ? "Race complete." : "Run ended before the flag."
  } satisfies RaceResult;
}

export function mountApexAsphaltGame(options: MountOptions) {
  const track = deriveTrack(getApexTrack(options.trackId));

  class ApexAsphaltScene extends Phaser.Scene {
    private controls: ControlsState = {
      accelerate: false,
      brake: false,
      left: false,
      right: false
    };

    private cars: CarState[] = [];
    private player!: CarState;
    private checkpointGraphics!: Phaser.GameObjects.Graphics;
    private messageText!: Phaser.GameObjects.Text;
    private countdownText!: Phaser.GameObjects.Text;
    private started = false;
    private finished = false;
    private countdownMs = COUNTDOWN_MS;
    private raceClockMs = 0;
    private lastHudMs = -Infinity;
    private lastMessage = "Green lights coming up.";

    constructor() {
      super("ApexAsphaltScene");
    }

    preload() {
      DRIVER_COLORS.forEach((palette) => createCarTexture(this, palette));
      createParticleTextures(this);
    }

    create() {
      this.cameras.main.setBounds(0, 0, track.spec.worldWidth, track.spec.worldHeight);
      this.cameras.main.setBackgroundColor(track.spec.theme.ground);
      drawTrackScene(this, track, this.checkpointGraphics = this.add.graphics());

      this.messageText = this.add.text(24, 24, track.spec.name, {
        fontFamily: "\"PublicPixel\", monospace",
        fontSize: "12px",
        color: track.spec.theme.text
      }).setScrollFactor(0).setDepth(200);

      this.countdownText = this.add.text(VIEW_WIDTH / 2, VIEW_HEIGHT * 0.18, "3", {
        fontFamily: "\"PublicPixel\", monospace",
        fontSize: "44px",
        color: "#fff7ed",
        stroke: "#0f172a",
        strokeThickness: 8
      }).setOrigin(0.5).setScrollFactor(0).setDepth(210);

      DRIVER_COLORS.slice(0, TOTAL_RACERS).forEach((palette, index) => {
        const sampleIndex = (track.startSampleIndex - index * 5 + track.samplePoints.length) % track.samplePoints.length;
        const tangent = tangentForSample(track, sampleIndex);
        const normal = track.sampleNormals[sampleIndex];
        const laneOffset = (index - 1.5) * 26;
        const spawn = pointForSample(track, sampleIndex, laneOffset);
        const textureKey = `apex-car-${palette.key}`;
        const shadow = this.add.ellipse(spawn.x, spawn.y + 10, 38, 18, 0x020617, 0.34).setDepth(40);
        const sprite = this.add.image(spawn.x, spawn.y, textureKey).setDepth(44);
        sprite.setDisplaySize(56, 28);

        const exhaust = this.add.particles(0, 0, "apex-spark", {
          speed: { min: 10, max: 45 },
          angle: { min: 150, max: 210 },
          scale: { start: 0.5, end: 0 },
          lifespan: { min: 120, max: 220 },
          quantity: 0,
          tint: [palette.body, palette.stripe]
        }).setDepth(35);
        const smoke = this.add.particles(0, 0, "apex-smoke", {
          speed: { min: 10, max: 55 },
          angle: { min: 150, max: 210 },
          scale: { start: 0.25, end: 1.1 },
          alpha: { start: 0.28, end: 0 },
          lifespan: { min: 220, max: 380 },
          quantity: 0,
          tint: [0xcbd5e1]
        }).setDepth(33);
        const spark = this.add.particles(0, 0, "apex-spark", {
          speed: { min: 60, max: 160 },
          angle: { min: 0, max: 360 },
          scale: { start: 0.7, end: 0 },
          lifespan: { min: 120, max: 240 },
          quantity: 0,
          tint: [0xf8fafc, 0xf97316]
        }).setDepth(60);

        const car: CarState = {
          id: index === 0 ? "player" : `ai-${index}`,
          name: index === 0 ? "You" : ["Mako", "Vera", "Knox"][index - 1] ?? `AI ${index}`,
          isPlayer: index === 0,
          sprite,
          shadow,
          exhaust,
          smoke,
          spark,
          x: spawn.x,
          y: spawn.y,
          vx: tangent.x * 10,
          vy: tangent.y * 10,
          angle: tangent.angle(),
          speed: 0,
          topSpeed: index === 0 ? 420 : 392 + index * 14,
          acceleration: index === 0 ? 340 : 302 + index * 16,
          brakePower: index === 0 ? 420 : 360,
          turnRate: index === 0 ? 2.55 : 2.26 + index * 0.06,
          grip: index === 0 ? 4.6 : 4.3,
          turnVelocity: 0,
          sampleIndex,
          totalDistance: 0,
          lap: 1,
          nextCheckpoint: 0,
          lastLapMs: null,
          bestLapMs: null,
          finished: false,
          finishedAtMs: null,
          finishPlace: null,
          lapStartedAtMs: 0,
          aiOffset: laneOffset,
          aiLookahead: 14 + index * 3,
          aiCornerBias: 0.88 + index * 0.08,
          hudMessage: index === 0 ? "Hold it steady off the line." : "",
          impactCooldownMs: 0,
          wobbleMs: 0,
          offroadRatio: 0
        };

        this.cars.push(car);
        if (car.isPlayer) {
          this.player = car;
        }
      });

      const firstTarget = pointForSample(track, this.player.sampleIndex, this.player.aiOffset);
      this.cameras.main.centerOn(firstTarget.x, firstTarget.y);
      this.cameras.main.setZoom(0.92);

      this.input.keyboard?.on("keydown-UP", () => { this.controls.accelerate = true; });
      this.input.keyboard?.on("keyup-UP", () => { this.controls.accelerate = false; });
      this.input.keyboard?.on("keydown-W", () => { this.controls.accelerate = true; });
      this.input.keyboard?.on("keyup-W", () => { this.controls.accelerate = false; });
      this.input.keyboard?.on("keydown-DOWN", () => { this.controls.brake = true; });
      this.input.keyboard?.on("keyup-DOWN", () => { this.controls.brake = false; });
      this.input.keyboard?.on("keydown-S", () => { this.controls.brake = true; });
      this.input.keyboard?.on("keyup-S", () => { this.controls.brake = false; });
      this.input.keyboard?.on("keydown-LEFT", () => { this.controls.left = true; });
      this.input.keyboard?.on("keyup-LEFT", () => { this.controls.left = false; });
      this.input.keyboard?.on("keydown-A", () => { this.controls.left = true; });
      this.input.keyboard?.on("keyup-A", () => { this.controls.left = false; });
      this.input.keyboard?.on("keydown-RIGHT", () => { this.controls.right = true; });
      this.input.keyboard?.on("keyup-RIGHT", () => { this.controls.right = false; });
      this.input.keyboard?.on("keydown-D", () => { this.controls.right = true; });
      this.input.keyboard?.on("keyup-D", () => { this.controls.right = false; });

      options.onStatus(`Loaded ${track.spec.name}. ${track.spec.tagline}`);
      options.onHudChange(buildHudSnapshot(track, this.cars, this.player, 0, this.countdownMs));
    }

    private updatePlayer(car: CarState, deltaSeconds: number) {
      const steerInput = (this.controls.right ? 1 : 0) - (this.controls.left ? 1 : 0);
      const onRoadFactor = 1 - car.offroadRatio * 0.55;
      if (this.controls.accelerate) {
        car.speed += car.acceleration * deltaSeconds * (car.offroadRatio > 0.18 ? 0.7 : 1);
      } else if (this.controls.brake) {
        car.speed -= car.brakePower * deltaSeconds;
      } else if (car.speed > 0) {
        car.speed = Math.max(0, car.speed - ROAD_DRAG * deltaSeconds);
      } else {
        car.speed = Math.min(0, car.speed + ROAD_DRAG * deltaSeconds);
      }

      const targetTurnVelocity =
        steerInput *
        car.turnRate *
        clamp(Math.abs(car.speed) / Math.max(1, car.topSpeed), 0.12, 1) *
        onRoadFactor;
      car.turnVelocity = Phaser.Math.Linear(car.turnVelocity, targetTurnVelocity, 0.14);
      car.angle += car.turnVelocity * deltaSeconds;
      car.speed = clamp(car.speed, -MAX_REVERSE_SPEED, car.topSpeed);
    }

    private updateAi(car: CarState, deltaSeconds: number) {
      const lookaheadIndex = (car.sampleIndex + Math.floor(car.aiLookahead + clamp(car.speed / 42, 0, 9))) % track.samplePoints.length;
      const targetPoint = pointForSample(track, lookaheadIndex, car.aiOffset);
      const desiredAngle = Phaser.Math.Angle.Between(car.x, car.y, targetPoint.x, targetPoint.y);
      const angleDelta = wrapAngle(desiredAngle - car.angle);
      const steer = clamp(angleDelta * 1.8, -1, 1);
      const cornerFactor = clamp(Math.abs(angleDelta) / 0.85, 0, 1);
      const desiredSpeed = car.topSpeed * (1 - cornerFactor * 0.34 * car.aiCornerBias) * (car.offroadRatio > 0.16 ? 0.76 : 1);
      if (car.speed < desiredSpeed) {
        car.speed += car.acceleration * deltaSeconds * (car.offroadRatio > 0.16 ? 0.74 : 1);
      } else {
        car.speed -= car.brakePower * deltaSeconds * 0.72;
      }
      car.turnVelocity = Phaser.Math.Linear(
        car.turnVelocity,
        steer * car.turnRate * clamp(Math.abs(car.speed) / Math.max(1, car.topSpeed), 0.16, 1),
        0.11
      );
      car.angle += car.turnVelocity * deltaSeconds;
      car.speed = clamp(car.speed, 0, car.topSpeed);
    }

    private applyCarPhysics(car: CarState, deltaSeconds: number) {
      const heading = new Phaser.Math.Vector2(Math.cos(car.angle), Math.sin(car.angle));
      const grip = car.offroadRatio > 0.1 ? car.grip * 0.64 : car.grip;
      car.vx = Phaser.Math.Linear(car.vx, heading.x * car.speed, clamp(grip * deltaSeconds, 0, 1));
      car.vy = Phaser.Math.Linear(car.vy, heading.y * car.speed, clamp(grip * deltaSeconds, 0, 1));
      car.x += car.vx * deltaSeconds;
      car.y += car.vy * deltaSeconds;
    }

    private resolveTrackContact(car: CarState, deltaSeconds: number) {
      const nearestSample = findNearestSample(track, car.x, car.y, car.sampleIndex);
      car.sampleIndex = nearestSample;
      const center = track.samplePoints[nearestSample];
      const toCar = new Phaser.Math.Vector2(car.x - center.x, car.y - center.y);
      const distance = toCar.length();
      const roadHalf = track.spec.roadWidth * 0.5;
      const offroadThreshold = roadHalf * TRACK_MARGIN_OFFROAD;
      const hitThreshold = roadHalf * TRACK_MARGIN_HIT;
      car.offroadRatio = clamp((distance - offroadThreshold) / Math.max(1, roadHalf - offroadThreshold), 0, 1);

      if (car.offroadRatio > 0.02) {
        const drag = OFFROAD_DRAG * car.offroadRatio;
        car.speed = car.speed > 0
          ? Math.max(0, car.speed - drag * deltaSeconds)
          : Math.min(0, car.speed + drag * deltaSeconds);
        if (Math.abs(car.speed) > 110 && this.time.now % 2 < 1) {
          car.smoke.emitParticleAt(car.x, car.y, 1);
        }
      }

      if (distance > hitThreshold) {
        const normal = distance > 0.001 ? toCar.normalize() : track.sampleNormals[nearestSample].clone();
        const overflow = distance - hitThreshold;
        car.x -= normal.x * overflow * 0.92;
        car.y -= normal.y * overflow * 0.92;
        const normalSpeed = car.vx * normal.x + car.vy * normal.y;
        car.vx -= normal.x * normalSpeed * 1.3;
        car.vy -= normal.y * normalSpeed * 1.3;
        car.speed *= 0.86;
        car.wobbleMs = 110;
        if (car.impactCooldownMs <= 0) {
          car.spark.emitParticleAt(car.x, car.y, 8);
          car.impactCooldownMs = 180;
          if (car.isPlayer) {
            this.cameras.main.shake(80, 0.0035);
            car.hudMessage = "Wall scrape. Reset the car and get back to full throttle.";
          }
        }
      }
    }

    private resolveCarContacts() {
      for (let i = 0; i < this.cars.length; i += 1) {
        for (let j = i + 1; j < this.cars.length; j += 1) {
          const a = this.cars[i];
          const b = this.cars[j];
          if (a.finished && b.finished) {
            continue;
          }
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const distance = Math.hypot(dx, dy);
          if (distance === 0 || distance > COLLISION_RADIUS * 2) {
            continue;
          }
          const overlap = COLLISION_RADIUS * 2 - distance;
          const nx = dx / distance;
          const ny = dy / distance;
          a.x -= nx * overlap * 0.5;
          a.y -= ny * overlap * 0.5;
          b.x += nx * overlap * 0.5;
          b.y += ny * overlap * 0.5;
          a.speed *= 0.95;
          b.speed *= 0.95;
          a.spark.emitParticleAt(a.x, a.y, 2);
          b.spark.emitParticleAt(b.x, b.y, 2);
          if (a.isPlayer || b.isPlayer) {
            this.cameras.main.shake(55, 0.0022);
            this.player.hudMessage = "Door bang. Keep it clean through traffic.";
          }
        }
      }
    }

    private updateProgress(car: CarState) {
      const currentRelative = relativeProgressForSample(track, car.sampleIndex);
      const previousRelative = car.totalDistance - Math.floor(car.totalDistance);
      let delta = currentRelative - previousRelative;
      if (delta < -0.5) {
        delta += 1;
      } else if (delta > 0.5) {
        delta -= 1;
      }
      if (delta > 0) {
        car.totalDistance += delta;
      } else if (delta < -0.12 && car.isPlayer) {
        car.hudMessage = "Wrong direction. Rejoin the flow.";
      }

      const lapFraction = car.totalDistance - Math.floor(car.totalDistance);
      while (
        car.nextCheckpoint < track.spec.checkpointFractions.length &&
        lapFraction >= track.spec.checkpointFractions[car.nextCheckpoint]
      ) {
        car.nextCheckpoint += 1;
        if (car.isPlayer) {
          car.hudMessage = car.nextCheckpoint === track.spec.checkpointFractions.length
            ? "Final sector clear. Bring it home."
            : `Checkpoint ${car.nextCheckpoint}/${track.spec.checkpointFractions.length}.`;
        }
      }

      const nextLap = Math.floor(car.totalDistance) + 1;
      if (nextLap > car.lap && car.nextCheckpoint >= track.spec.checkpointFractions.length) {
        const lapTime = this.raceClockMs - car.lapStartedAtMs;
        car.lastLapMs = lapTime;
        car.bestLapMs = car.bestLapMs == null ? lapTime : Math.min(car.bestLapMs, lapTime);
        car.lapStartedAtMs = this.raceClockMs;
        car.lap = nextLap;
        car.nextCheckpoint = 0;
        if (car.isPlayer) {
          car.hudMessage = nextLap > track.spec.laps
            ? "Flag down."
            : `Lap ${nextLap}/${track.spec.laps}. Keep the pressure on.`;
        }
      }

      if (!car.finished && car.totalDistance >= track.spec.laps) {
        car.finished = true;
        car.finishedAtMs = this.raceClockMs;
        const ranked = [...this.cars].filter((entry) => entry.finished).sort(
          (a, b) => (a.finishedAtMs ?? Number.MAX_SAFE_INTEGER) - (b.finishedAtMs ?? Number.MAX_SAFE_INTEGER)
        );
        car.finishPlace = ranked.findIndex((entry) => entry.id === car.id) + 1;
        car.speed *= 0.74;
        if (car.isPlayer) {
          car.hudMessage = car.finishPlace === 1 ? "Victory lane." : `Flag taken. P${car.finishPlace}.`;
        }
      }
    }

    private syncSprites(deltaSeconds: number) {
      this.cars.forEach((car) => {
        car.impactCooldownMs = Math.max(0, car.impactCooldownMs - deltaSeconds * 1000);
        car.wobbleMs = Math.max(0, car.wobbleMs - deltaSeconds * 1000);
        car.shadow.setPosition(car.x, car.y + 11);
        car.shadow.setAlpha(0.22 + Math.min(0.18, Math.abs(car.speed) / 1200));
        car.sprite.setPosition(car.x, car.y);
        car.sprite.setRotation(car.angle + (car.wobbleMs > 0 ? Math.sin(this.time.now * 0.035) * 0.04 : 0));
        updateEmitterPose(car.exhaust, car);
        updateEmitterPose(car.smoke, car);
        if (Math.abs(car.speed) > 120) {
          emitExhaust(car);
        }
      });
    }

    private updateCamera() {
      const lookAhead = new Phaser.Math.Vector2(Math.cos(this.player.angle), Math.sin(this.player.angle)).scale(
        clamp(this.player.speed * 0.45, 30, 95)
      );
      const targetX = this.player.x + lookAhead.x;
      const targetY = this.player.y + lookAhead.y;
      const camera = this.cameras.main;
      camera.scrollX = Phaser.Math.Linear(camera.scrollX, targetX - camera.width * 0.5, CAMERA_LERP);
      camera.scrollY = Phaser.Math.Linear(camera.scrollY, targetY - camera.height * 0.5, CAMERA_LERP);
      camera.setZoom(Phaser.Math.Linear(camera.zoom, this.player.offroadRatio > 0.14 ? 0.91 : 0.95, 0.04));
    }

    private redrawCheckpoints() {
      this.checkpointGraphics.clear();
      for (let index = 0; index < track.checkpointSamples.length; index += 1) {
        const sampleIndex = track.checkpointSamples[index];
        const point = track.samplePoints[sampleIndex];
        const normal = track.sampleNormals[sampleIndex];
        const color = index === this.player.nextCheckpoint ? track.spec.theme.accent : 0xffffff;
        const alpha = index === this.player.nextCheckpoint ? 0.34 : 0.12;
        this.checkpointGraphics.lineStyle(index === this.player.nextCheckpoint ? 10 : 7, color, alpha);
        this.checkpointGraphics.strokeLineShape(
          new Phaser.Geom.Line(
            point.x + normal.x * track.spec.roadWidth * 0.42,
            point.y + normal.y * track.spec.roadWidth * 0.42,
            point.x - normal.x * track.spec.roadWidth * 0.42,
            point.y - normal.y * track.spec.roadWidth * 0.42
          )
        );
      }
    }

    update(_time: number, deltaMs: number) {
      const deltaSeconds = Math.min(33, deltaMs) / 1000;
      this.redrawCheckpoints();

      if (this.countdownMs > 0) {
        this.countdownMs = Math.max(0, this.countdownMs - deltaMs);
        const countdownValue = getCountdownValue(this.countdownMs);
        this.countdownText.setText(countdownValue == null ? "GO!" : String(countdownValue));
        this.countdownText.setAlpha(this.countdownMs < 500 ? this.countdownMs / 500 : 1);
        this.messageText.setText(`READY ${track.spec.name.toUpperCase()}`);
      } else {
        this.countdownText.setVisible(false);
      }

      const raceLive = this.countdownMs <= 0 && !this.finished;
      if (raceLive) {
        this.started = true;
        this.raceClockMs += deltaMs;
      }

      this.cars.forEach((car) => {
        if (car.finished) {
          car.speed = Math.max(90, car.speed - 60 * deltaSeconds);
          this.applyCarPhysics(car, deltaSeconds);
          this.resolveTrackContact(car, deltaSeconds);
          this.updateProgress(car);
          return;
        }

        if (raceLive) {
          if (car.isPlayer) {
            if (options.playerMode === "autopilot") {
              this.updateAi(car, deltaSeconds);
            } else {
              this.updatePlayer(car, deltaSeconds);
            }
          } else {
            this.updateAi(car, deltaSeconds);
          }
        } else {
          car.speed = Math.max(0, car.speed - 180 * deltaSeconds);
        }

        this.applyCarPhysics(car, deltaSeconds);
        this.resolveTrackContact(car, deltaSeconds);
        this.updateProgress(car);
      });

      this.resolveCarContacts();
      this.syncSprites(deltaSeconds);
      this.updateCamera();

      if (this.player.finished && !this.finished) {
        this.finished = true;
        const result = createPlayerResult(track, this.cars, this.player, this.raceClockMs);
        options.onRaceEnd(result);
        options.onStatus(`${result.reason} ${result.won ? "P1 secured." : `Finished P${result.place}.`}`);
      }

      const hud = buildHudSnapshot(track, this.cars, this.player, this.raceClockMs, this.countdownMs);
      if (this.time.now - this.lastHudMs > 60 || hud.message !== this.lastMessage) {
        options.onHudChange(hud);
        options.onStatus(hud.message);
        this.lastHudMs = this.time.now;
        this.lastMessage = hud.message;
      }

      this.messageText.setText(
        this.countdownMs > 0
          ? `GRID ${track.spec.name.toUpperCase()}`
          : `${hud.message.toUpperCase().slice(0, 42)}`
      );
    }
  }

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    width: VIEW_WIDTH,
    height: VIEW_HEIGHT,
    parent: options.parent,
    backgroundColor: "#0b1324",
    render: {
      antialias: true,
      pixelArt: false,
      roundPixels: false
    },
    scene: ApexAsphaltScene
  });

  return () => {
    game.destroy(true);
  };
}
