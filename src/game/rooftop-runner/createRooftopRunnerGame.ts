import Phaser from "phaser";

export type RooftopPhase = "title" | "playing" | "paused" | "gameOver";

type DistrictId =
  | "apartments"
  | "construction"
  | "neon"
  | "industrial"
  | "billboard"
  | "glass"
  | "crane"
  | "storm";

type DistrictLabel = {
  name: string;
  accent: string;
  active: boolean;
};

export type RooftopHudSnapshot = {
  score: number;
  distance: number;
  combo: number;
  bestCombo: number;
  coins: number;
  guard: number;
  styleScore: number;
  districtName: string;
  districtDescription: string;
  districtRotation: DistrictLabel[];
  heatLabel: string;
  speedText: string;
};

export type RooftopRunSummary = {
  score: number;
  distance: number;
  coins: number;
  goldEarned: number;
  reason: string;
  bestCombo: number;
  districtName: string;
};

export const DEFAULT_HUD: RooftopHudSnapshot = {
  score: 0,
  distance: 0,
  combo: 0,
  bestCombo: 0,
  coins: 0,
  guard: 3,
  styleScore: 0,
  districtName: "Dense Apartment Blocks",
  districtDescription: "Long rooftops with umbrellas, skylights, and low walls to learn the flow.",
  districtRotation: [],
  heatLabel: "Street Heat",
  speedText: "Speed 0"
};

type Callbacks = {
  onHudChange: (hud: RooftopHudSnapshot, status: string) => void;
  onPhaseChange: (phase: RooftopPhase) => void;
  onRunComplete: (summary: RooftopRunSummary) => void;
};

type DistrictDefinition = {
  id: DistrictId;
  name: string;
  description: string;
  accent: number;
  accentCss: string;
  skyTop: number;
  skyBottom: number;
  haze: number;
  roofTop: number;
  roofFace: number;
  roofTrim: number;
  propBase: number;
  propAccent: number;
  windowColor: number;
  encounterMix: Array<{ kind: ObstacleKind; weight: number }>;
};

type Roof = {
  id: number;
  x: number;
  width: number;
  y: number;
  district: DistrictId;
  face: Phaser.GameObjects.Rectangle;
  top: Phaser.GameObjects.Rectangle;
  trim: Phaser.GameObjects.Rectangle;
  collider: Phaser.Physics.Arcade.Collider;
  decorations: Phaser.GameObjects.GameObject[];
};

type ObstacleKind =
  | "lowWall"
  | "vent"
  | "ac"
  | "skylight"
  | "guard"
  | "antenna"
  | "billboard"
  | "barrier"
  | "umbrella";

type ObstacleAction = "jump" | "slide" | "vault";

type Obstacle = {
  id: number;
  roofId: number;
  kind: ObstacleKind;
  action: ObstacleAction;
  x: number;
  y: number;
  width: number;
  height: number;
  sprite: Phaser.GameObjects.Image;
  tint: number;
  district: DistrictId;
  passed: boolean;
  disabled: boolean;
};

type Pickup = {
  id: number;
  x: number;
  y: number;
  sprite: Phaser.GameObjects.Arc;
  taken: boolean;
};

const GAME_WIDTH = 1280;
const GAME_HEIGHT = 720;
const PLAYER_X = 240;
const BASE_GROUND_Y = 562;
const RUNNER_SCALE = 1.14;
const BASE_SPEED = 330;
const MAX_SPEED = 610;
const JUMP_VELOCITY = -760;
const GRAVITY = 2140;
const COYOTE_MS = 110;
const JUMP_BUFFER_MS = 120;
const SLIDE_MS = 420;
const VAULT_MS = 260;
const SHORT_HOP_CLAMP = -280;
const DISTRICT_LENGTH = 800;
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
    name: "Dense Apartment Blocks",
    description: "Long rooftops with umbrellas, skylights, and low walls to learn the flow.",
    accent: 0xff6248,
    accentCss: "#ff6248",
    skyTop: 0x213453,
    skyBottom: 0xf0b078,
    haze: 0xffd6b8,
    roofTop: 0xdae1ea,
    roofFace: 0x3b4757,
    roofTrim: 0x97a8bd,
    propBase: 0x485667,
    propAccent: 0xff6248,
    windowColor: 0xf6d37f,
    encounterMix: [
      { kind: "umbrella", weight: 2 },
      { kind: "lowWall", weight: 4 },
      { kind: "skylight", weight: 3 },
      { kind: "vent", weight: 2 }
    ]
  },
  construction: {
    id: "construction",
    name: "Construction Roofline",
    description: "Tarps, barricades, AC stacks, and rougher roof material underfoot.",
    accent: 0xffab3d,
    accentCss: "#ffab3d",
    skyTop: 0x273244,
    skyBottom: 0xd98a5e,
    haze: 0xf8d7a3,
    roofTop: 0xe1dfd8,
    roofFace: 0x443e39,
    roofTrim: 0xb18b5a,
    propBase: 0x5b5045,
    propAccent: 0xffab3d,
    windowColor: 0xffcf7b,
    encounterMix: [
      { kind: "barrier", weight: 4 },
      { kind: "ac", weight: 3 },
      { kind: "vent", weight: 2 },
      { kind: "lowWall", weight: 2 }
    ]
  },
  neon: {
    id: "neon",
    name: "Neon Sign District",
    description: "Bright signage, guards in the lanes, and sharper rhythm changes.",
    accent: 0x63ecff,
    accentCss: "#63ecff",
    skyTop: 0x12192f,
    skyBottom: 0x7d3f7f,
    haze: 0xcf99ff,
    roofTop: 0xdce5f6,
    roofFace: 0x232c44,
    roofTrim: 0x70a8d7,
    propBase: 0x2f3550,
    propAccent: 0x63ecff,
    windowColor: 0x82f3ff,
    encounterMix: [
      { kind: "guard", weight: 4 },
      { kind: "billboard", weight: 3 },
      { kind: "skylight", weight: 2 },
      { kind: "lowWall", weight: 2 }
    ]
  },
  industrial: {
    id: "industrial",
    name: "Industrial Airworks",
    description: "Vent banks, antennas, and heavy roof machinery that break sightlines.",
    accent: 0xff835a,
    accentCss: "#ff835a",
    skyTop: 0x23262d,
    skyBottom: 0x986b56,
    haze: 0xe8b89d,
    roofTop: 0xcad0d8,
    roofFace: 0x343841,
    roofTrim: 0x7f8a97,
    propBase: 0x4e5460,
    propAccent: 0xff835a,
    windowColor: 0xf0b07e,
    encounterMix: [
      { kind: "vent", weight: 4 },
      { kind: "ac", weight: 4 },
      { kind: "antenna", weight: 3 },
      { kind: "guard", weight: 1 }
    ]
  },
  billboard: {
    id: "billboard",
    name: "Billboard Alley",
    description: "Sign structures carve the route and force cleaner reads across the roof.",
    accent: 0xffe36a,
    accentCss: "#ffe36a",
    skyTop: 0x24305a,
    skyBottom: 0xe2a06b,
    haze: 0xffe6b4,
    roofTop: 0xe4e7ee,
    roofFace: 0x384154,
    roofTrim: 0x7a8da7,
    propBase: 0x495164,
    propAccent: 0xffe36a,
    windowColor: 0xffdc80,
    encounterMix: [
      { kind: "billboard", weight: 4 },
      { kind: "guard", weight: 3 },
      { kind: "lowWall", weight: 2 },
      { kind: "umbrella", weight: 1 }
    ]
  },
  glass: {
    id: "glass",
    name: "Glass Tower Roofs",
    description: "Cleaner surfaces, longer sightlines, and skylight-heavy roof patterns.",
    accent: 0xa0e9ff,
    accentCss: "#a0e9ff",
    skyTop: 0x18344d,
    skyBottom: 0xcaa073,
    haze: 0xdaf6ff,
    roofTop: 0xf1f6fb,
    roofFace: 0x30506a,
    roofTrim: 0x8ab8cf,
    propBase: 0x456780,
    propAccent: 0xa0e9ff,
    windowColor: 0xb7f1ff,
    encounterMix: [
      { kind: "skylight", weight: 4 },
      { kind: "antenna", weight: 2 },
      { kind: "guard", weight: 2 },
      { kind: "lowWall", weight: 2 }
    ]
  },
  crane: {
    id: "crane",
    name: "Crane Scaffold Span",
    description: "Temporary railings, construction clutter, and more dramatic roof endings.",
    accent: 0xffc86e,
    accentCss: "#ffc86e",
    skyTop: 0x232b3e,
    skyBottom: 0xbf885c,
    haze: 0xffddb3,
    roofTop: 0xdbdde2,
    roofFace: 0x404451,
    roofTrim: 0x9a8c72,
    propBase: 0x595049,
    propAccent: 0xffc86e,
    windowColor: 0xffd48b,
    encounterMix: [
      { kind: "barrier", weight: 4 },
      { kind: "lowWall", weight: 3 },
      { kind: "ac", weight: 2 },
      { kind: "guard", weight: 2 }
    ]
  },
  storm: {
    id: "storm",
    name: "Stormline High-Rise",
    description: "Rain, guards, antennas, and darker sight reads at higher speed.",
    accent: 0x8fdcff,
    accentCss: "#8fdcff",
    skyTop: 0x0c1524,
    skyBottom: 0x48688d,
    haze: 0xb9e0ff,
    roofTop: 0xd2dae4,
    roofFace: 0x2b3444,
    roofTrim: 0x748ca8,
    propBase: 0x435063,
    propAccent: 0x8fdcff,
    windowColor: 0xb8e6ff,
    encounterMix: [
      { kind: "guard", weight: 3 },
      { kind: "antenna", weight: 3 },
      { kind: "vent", weight: 2 },
      { kind: "billboard", weight: 2 }
    ]
  }
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function lerp(from: number, to: number, amount: number) {
  return from + (to - from) * amount;
}

function randomRange(min: number, max: number) {
  return Phaser.Math.FloatBetween(min, max);
}

function weightedPick<T>(options: Array<{ value: T; weight: number }>) {
  const total = options.reduce((sum, option) => sum + option.weight, 0);
  let cursor = randomRange(0, total);
  for (const option of options) {
    cursor -= option.weight;
    if (cursor <= 0) return option.value;
  }
  return options[options.length - 1].value;
}

class RooftopRunnerScene extends Phaser.Scene {
  private callbacks: Callbacks;
  public phase: RooftopPhase = "title";
  private player!: Phaser.Physics.Arcade.Sprite;
  private shadow!: Phaser.GameObjects.Ellipse;
  private backgrounds: Phaser.GameObjects.Rectangle[] = [];
  private glowDiscs: Phaser.GameObjects.Arc[] = [];
  private skylineLayers: Phaser.GameObjects.Rectangle[][] = [];
  private rainLines: Phaser.GameObjects.Rectangle[] = [];
  private speedLines: Phaser.GameObjects.Rectangle[] = [];
  private overlayTitle!: Phaser.GameObjects.Text;
  private overlayBody!: Phaser.GameObjects.Text;
  private overlayPrompt!: Phaser.GameObjects.Text;
  private roofs: Roof[] = [];
  private obstacles: Obstacle[] = [];
  private pickups: Pickup[] = [];
  private roofId = 0;
  private obstacleId = 0;
  private pickupId = 0;
  private nextRoofX = -180;
  private currentRoofY = BASE_GROUND_Y;
  private activeDistrictId: DistrictId = "apartments";
  private currentRoofId = 0;
  private score = 0;
  private distance = 0;
  private combo = 0;
  private bestCombo = 0;
  private coins = 0;
  private styleScore = 0;
  private guard = 3;
  private speed = BASE_SPEED;
  private coyoteMs = 0;
  private jumpBufferMs = 0;
  private slideMs = 0;
  private vaultMs = 0;
  private invulnerableMs = 0;
  private lastGrounded = false;
  private statusText = "Built specifically for Rooftop Runner.";
  private gameOverReason = "";
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private jumpKey!: Phaser.Input.Keyboard.Key;
  private slideKey!: Phaser.Input.Keyboard.Key;
  private pauseKey!: Phaser.Input.Keyboard.Key;

  constructor(callbacks: Callbacks) {
    super("RooftopRunnerScene");
    this.callbacks = callbacks;
  }

  preload() {}

  create() {
    this.cameras.main.setRoundPixels(true);
    this.physics.world.gravity.y = GRAVITY;
    this.cameras.main.setBounds(0, 0, Number.MAX_SAFE_INTEGER, GAME_HEIGHT);

    this.buildArtTextures();
    this.createBackground();
    this.createPlayer();
    this.createOverlay();

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.jumpKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.slideKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    this.pauseKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);

    this.resetRun();
    this.setPhase("title");
  }

  private buildArtTextures() {
    if (!this.textures.exists("rr-run-0")) {
      this.buildRunnerTextures();
    }
    if (!this.textures.exists("rr-prop-lowWall")) {
      this.buildPropTextures();
    }
  }

  private buildRunnerTextures() {
    const drawRunner = (key: string, leftLeg: number, rightLeg: number, lean: number, slide = false, jump = false) => {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.clear();

      const bodyColor = 0xf2f5f7;
      const accentColor = 0xff5a4b;
      const dark = 0x1c2330;
      const sole = 0x43c6d7;

      const rootX = 48;
      const rootY = 76;

      g.fillStyle(bodyColor, 1);
      g.lineStyle(4, dark, 1);

      if (slide) {
        g.fillRoundedRect(16, 54, 56, 20, 8);
        g.strokeRoundedRect(16, 54, 56, 20, 8);
        g.fillRect(64, 42, 12, 10);
        g.strokeRect(64, 42, 12, 10);
        g.fillCircle(30, 40, 10);
        g.strokeCircle(30, 40, 10);
        g.fillStyle(accentColor, 1);
        g.fillTriangle(34, 48, 56, 52, 42, 64);
        g.fillStyle(dark, 1);
        g.fillRect(10, 66, 26, 8);
        g.fillRect(42, 66, 30, 8);
        g.fillStyle(sole, 1);
        g.fillRect(46, 70, 28, 5);
      } else {
        g.fillRoundedRect(34 + lean, 28, 20, 34, 8);
        g.strokeRoundedRect(34 + lean, 28, 20, 34, 8);
        g.fillCircle(46 + lean, 17, 11);
        g.strokeCircle(46 + lean, 17, 11);

        g.fillStyle(accentColor, 1);
        g.fillTriangle(56 + lean, 30, 76 + lean, 36, 57 + lean, 46);
        g.fillRect(40 + lean, 29, 6, 33);

        g.fillStyle(dark, 1);
        g.lineStyle(6, dark, 1);
        g.beginPath();
        g.moveTo(34 + lean, 40);
        g.lineTo(22 + lean, 52 + leftLeg * 0.35);
        g.strokePath();
        g.beginPath();
        g.moveTo(54 + lean, 40);
        g.lineTo(66 + lean, 52 + rightLeg * 0.25);
        g.strokePath();
        g.beginPath();
        g.moveTo(40 + lean, 61);
        g.lineTo(31 + lean, 80 + leftLeg);
        g.strokePath();
        g.beginPath();
        g.moveTo(50 + lean, 61);
        g.lineTo(62 + lean, 80 + rightLeg);
        g.strokePath();

        g.fillStyle(sole, 1);
        g.fillRect(23 + lean, 79 + leftLeg, 16, 5);
        g.fillRect(55 + lean, 79 + rightLeg, 16, 5);

        if (jump) {
          g.fillStyle(accentColor, 0.22);
          g.fillCircle(70, 28, 18);
        }
      }

      g.generateTexture(key, 96, 96);
      g.destroy();
    };

    drawRunner("rr-run-0", 0, -6, -3);
    drawRunner("rr-run-1", -7, 4, -1);
    drawRunner("rr-run-2", -2, 8, 1);
    drawRunner("rr-run-3", 8, -2, 3);
    drawRunner("rr-run-4", 4, -8, 1);
    drawRunner("rr-run-5", -5, 0, -2);
    drawRunner("rr-jump-0", -12, 6, 4, false, true);
    drawRunner("rr-jump-1", 6, -10, 6, false, true);
    drawRunner("rr-slide-0", 0, 0, 0, true);
    drawRunner("rr-slide-1", 0, 0, 0, true);
    drawRunner("rr-hit-0", -5, 10, -4, false, true);

    this.anims.create({
      key: "rr-run",
      frames: Array.from({ length: 6 }, (_, index) => ({ key: `rr-run-${index}` })),
      frameRate: 16,
      repeat: -1
    });
    this.anims.create({
      key: "rr-jump",
      frames: [{ key: "rr-jump-0" }, { key: "rr-jump-1" }],
      frameRate: 8,
      repeat: -1
    });
    this.anims.create({
      key: "rr-slide",
      frames: [{ key: "rr-slide-0" }, { key: "rr-slide-1" }],
      frameRate: 10,
      repeat: -1
    });
    this.anims.create({
      key: "rr-hit",
      frames: [{ key: "rr-hit-0" }, { key: "rr-jump-0" }],
      frameRate: 10,
      repeat: 0
    });
  }

  private buildPropTextures() {
    const build = (key: string, width: number, height: number, painter: (g: Phaser.GameObjects.Graphics) => void) => {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      painter(g);
      g.generateTexture(key, width, height);
      g.destroy();
    };

    build("rr-prop-lowWall", 64, 44, (g) => {
      g.fillStyle(0xf2f5f7, 1);
      g.fillRoundedRect(4, 14, 56, 18, 5);
      g.lineStyle(3, 0x202838, 1);
      g.strokeRoundedRect(4, 14, 56, 18, 5);
      g.fillStyle(0xff5a4b, 1);
      g.fillRect(7, 18, 50, 4);
    });

    build("rr-prop-vent", 56, 62, (g) => {
      g.fillStyle(0xd6dce4, 1);
      g.fillRoundedRect(8, 22, 40, 30, 6);
      g.lineStyle(3, 0x233041, 1);
      g.strokeRoundedRect(8, 22, 40, 30, 6);
      g.fillStyle(0x4dc6d9, 1);
      g.fillRect(14, 28, 28, 4);
      g.fillRect(14, 36, 28, 4);
      g.fillRect(14, 44, 28, 4);
      g.fillStyle(0x233041, 1);
      g.fillRect(18, 10, 20, 12);
    });

    build("rr-prop-ac", 72, 72, (g) => {
      g.fillStyle(0xe7edf4, 1);
      g.fillRoundedRect(6, 18, 60, 40, 6);
      g.lineStyle(3, 0x223143, 1);
      g.strokeRoundedRect(6, 18, 60, 40, 6);
      g.fillStyle(0x223143, 1);
      g.fillCircle(36, 38, 12);
      g.lineStyle(2, 0xe7edf4, 0.8);
      g.strokeCircle(36, 38, 12);
      g.lineBetween(24, 38, 48, 38);
      g.lineBetween(36, 26, 36, 50);
    });

    build("rr-prop-skylight", 88, 52, (g) => {
      g.fillStyle(0xa9ecff, 1);
      g.fillRoundedRect(6, 12, 76, 28, 8);
      g.lineStyle(3, 0x244155, 1);
      g.strokeRoundedRect(6, 12, 76, 28, 8);
      g.fillStyle(0xffffff, 0.45);
      g.fillRect(14, 18, 22, 8);
      g.fillRect(42, 18, 28, 8);
    });

    build("rr-prop-guard", 60, 92, (g) => {
      g.fillStyle(0x1d2430, 1);
      g.fillCircle(30, 18, 10);
      g.fillRoundedRect(20, 28, 20, 28, 8);
      g.fillRect(14, 32, 10, 6);
      g.fillRect(36, 32, 10, 6);
      g.fillRect(20, 54, 8, 28);
      g.fillRect(32, 54, 8, 28);
      g.fillStyle(0xff5a4b, 1);
      g.fillRect(23, 31, 14, 6);
      g.fillRect(10, 80, 18, 6);
      g.fillRect(32, 80, 18, 6);
    });

    build("rr-prop-antenna", 44, 108, (g) => {
      g.fillStyle(0x253042, 1);
      g.fillRect(18, 8, 8, 86);
      g.fillRect(10, 94, 24, 8);
      g.fillStyle(0xff5a4b, 1);
      g.fillCircle(22, 8, 6);
      g.lineStyle(3, 0x5dd8e8, 1);
      g.lineBetween(22, 22, 6, 54);
      g.lineBetween(22, 22, 38, 54);
    });

    build("rr-prop-billboard", 128, 120, (g) => {
      g.fillStyle(0x253042, 1);
      g.fillRect(22, 52, 12, 58);
      g.fillRect(94, 52, 12, 58);
      g.fillStyle(0xf4f7fb, 1);
      g.fillRoundedRect(8, 8, 112, 48, 12);
      g.lineStyle(4, 0x253042, 1);
      g.strokeRoundedRect(8, 8, 112, 48, 12);
      g.fillStyle(0xff5a4b, 1);
      g.fillRect(20, 18, 48, 12);
      g.fillStyle(0x4dd1e5, 1);
      g.fillRect(20, 34, 84, 8);
    });

    build("rr-prop-barrier", 96, 64, (g) => {
      g.fillStyle(0x222b39, 1);
      g.fillRect(6, 18, 84, 34);
      g.fillStyle(0xffaf37, 1);
      g.fillRect(10, 22, 76, 8);
      g.fillRect(10, 38, 76, 8);
      g.lineStyle(3, 0xf2f5f7, 1);
      g.lineBetween(14, 52, 26, 62);
      g.lineBetween(82, 52, 70, 62);
    });

    build("rr-prop-umbrella", 78, 92, (g) => {
      g.fillStyle(0xff5a4b, 1);
      g.fillTriangle(8, 34, 70, 34, 39, 8);
      g.lineStyle(3, 0x253042, 1);
      g.strokeTriangle(8, 34, 70, 34, 39, 8);
      g.fillStyle(0x253042, 1);
      g.fillRect(37, 34, 4, 42);
      g.fillCircle(39, 82, 10);
      g.fillStyle(0xffffff, 1);
      g.fillRect(20, 24, 14, 4);
      g.fillRect(44, 24, 14, 4);
    });
  }

  private createBackground() {
    const district = DISTRICTS.apartments;
    this.backgrounds = [
      this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, district.skyTop).setScrollFactor(0),
      this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT * 0.38, GAME_WIDTH, GAME_HEIGHT * 0.55, district.haze, 0.08).setScrollFactor(0),
      this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT - 90, GAME_WIDTH, 220, 0x08111c, 0.3).setScrollFactor(0)
    ];

    this.glowDiscs = [
      this.add.circle(184, 112, 72, district.accent, 0.18).setScrollFactor(0),
      this.add.circle(GAME_WIDTH - 188, 152, 132, 0xffffff, 0.06).setScrollFactor(0)
    ];

    const widths = [240, 180, 140];
    const bottom = [318, 430, 556];
    const factors = [0.12, 0.24, 0.4];

    this.skylineLayers = [[], [], []];
    widths.forEach((width, layerIndex) => {
      for (let i = 0; i < 15; i += 1) {
        const block = this.add
          .rectangle(i * (width + 30), bottom[layerIndex], width, 180 + ((i + layerIndex) % 4) * 54, 0x111926, 0.4)
          .setOrigin(0, 1)
          .setScrollFactor(0);
        block.setData("step", width + 30);
        block.setData("factor", factors[layerIndex]);
        this.skylineLayers[layerIndex].push(block);
      }
    });

    for (let i = 0; i < 10; i += 1) {
      const streak = this.add.rectangle(0, 0, 140 + (i % 3) * 40, 3, 0xffffff, 0.08).setScrollFactor(0);
      streak.setVisible(false);
      this.speedLines.push(streak);
    }

    for (let i = 0; i < 36; i += 1) {
      const rain = this.add.rectangle(0, 0, 2, 26, 0xcfe7ff, 0.12).setVisible(false).setScrollFactor(0);
      this.rainLines.push(rain);
    }
  }

  private createPlayer() {
    this.shadow = this.add.ellipse(PLAYER_X, BASE_GROUND_Y + 10, 80, 18, 0x000000, 0.22).setDepth(15);
    this.player = this.physics.add.sprite(PLAYER_X, BASE_GROUND_Y - 20, "rr-run-0");
    this.player.setDepth(22);
    this.player.setOrigin(0.5, 0.9);
    this.player.setScale(RUNNER_SCALE);
    this.player.body.setSize(28, 72, true);
    (this.player.body as Phaser.Physics.Arcade.Body).offset.set(34, 14);
    this.player.play("rr-run");
  }

  private createOverlay() {
    this.overlayTitle = this.add
      .text(GAME_WIDTH / 2, 196, "Rooftop Runner", {
        fontFamily: '"PublicPixel", monospace',
        fontSize: "26px",
        color: "#f6fbff",
        align: "center"
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(40);

    this.overlayBody = this.add
      .text(GAME_WIDTH / 2, 248, "", {
        fontFamily: "system-ui",
        fontSize: "21px",
        color: "#d8ebff",
        align: "center",
        wordWrap: { width: 640 }
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(40);

    this.overlayPrompt = this.add
      .text(GAME_WIDTH / 2, 318, "Press Space or use Start Run", {
        fontFamily: '"PublicPixel", monospace',
        fontSize: "14px",
        color: "#88e9ff"
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(40);
  }

  private resetRun() {
    this.roofs.forEach((roof) => {
      roof.collider.destroy();
      roof.face.destroy();
      roof.top.destroy();
      roof.trim.destroy();
      roof.decorations.forEach((item) => item.destroy());
    });
    this.obstacles.forEach((obstacle) => obstacle.sprite.destroy());
    this.pickups.forEach((pickup) => pickup.sprite.destroy());

    this.roofs = [];
    this.obstacles = [];
    this.pickups = [];
    this.roofId = 0;
    this.obstacleId = 0;
    this.pickupId = 0;
    this.nextRoofX = -260;
    this.currentRoofY = BASE_GROUND_Y;
    this.currentRoofId = 0;
    this.activeDistrictId = "apartments";
    this.score = 0;
    this.distance = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.coins = 0;
    this.styleScore = 0;
    this.guard = 3;
    this.speed = BASE_SPEED;
    this.coyoteMs = 0;
    this.jumpBufferMs = 0;
    this.slideMs = 0;
    this.vaultMs = 0;
    this.invulnerableMs = 0;
    this.lastGrounded = false;
    this.gameOverReason = "";
    this.statusText = "Sprint the roofline. Learn the route before the big transitions.";

    this.player.setPosition(PLAYER_X, BASE_GROUND_Y - 20);
    this.player.setVelocity(0, 0);
    this.player.play("rr-run");
    this.cameras.main.scrollX = 0;

    while (this.nextRoofX < GAME_WIDTH + 1500) {
      this.spawnRoof(this.roofId < 2);
    }

    this.applyDistrictPalette(true);
    this.pushHud();
  }

  private spawnRoof(isOpening: boolean) {
    const district = this.currentDistrict();
    const width = Math.floor(randomRange(isOpening ? 1320 : 980, isOpening ? 1680 : 1540));
    const gap = Math.floor(randomRange(isOpening ? 90 : 150, isOpening ? 130 : 280));

    if (!isOpening) {
      this.currentRoofY += weightedPick([
        { value: -22, weight: 2 },
        { value: 0, weight: 5 },
        { value: 20, weight: 2 }
      ]);
      this.currentRoofY = clamp(this.currentRoofY, 490, 586);
    }

    const x = this.nextRoofX + gap;
    const y = this.currentRoofY;
    const face = this.add.rectangle(x + width / 2, y + 88, width, 176, district.roofFace, 1).setDepth(10);
    const top = this.add.rectangle(x + width / 2, y, width, 16, district.roofTop, 1).setDepth(12);
    const trim = this.add.rectangle(x + width / 2, y - 8, width - 12, 4, district.roofTrim, 1).setDepth(13);

    this.physics.add.existing(face, true);
    const body = face.body as Phaser.Physics.Arcade.StaticBody;
    body.position.set(x, y);
    body.setSize(width, 176);
    body.updateFromGameObject();

    const collider = this.physics.add.collider(this.player, face);

    const roof: Roof = {
      id: this.roofId,
      x,
      width,
      y,
      district: district.id,
      face,
      top,
      trim,
      collider,
      decorations: []
    };
    this.roofs.push(roof);
    this.roofId += 1;
    this.currentRoofId = roof.id;

    this.decorateRoof(roof, district, isOpening);
    this.populateRoof(roof, district, isOpening);

    this.nextRoofX = x + width;
  }

  private decorateRoof(roof: Roof, district: DistrictDefinition, isOpening: boolean) {
    const windowRows = isOpening ? 2 : 3;
    for (let row = 0; row < windowRows; row += 1) {
      const count = Math.floor(roof.width / 150);
      for (let index = 0; index < count; index += 1) {
        const windowRect = this.add
          .rectangle(
            roof.x + 34 + index * 150 + ((row + index) % 3) * 12,
            roof.y + 32 + row * 42,
            22,
            14,
            district.windowColor,
            0.18 + row * 0.06
          )
          .setDepth(11);
        roof.decorations.push(windowRect);
      }
    }

    if (!isOpening) {
      const line = this.add
        .rectangle(roof.x + roof.width / 2, roof.y - 18, roof.width - 80, 2, district.propAccent, district.id === "neon" ? 0.32 : 0.14)
        .setDepth(13);
      roof.decorations.push(line);
    }

    const gravelCount = Math.max(6, Math.floor(roof.width / 180));
    for (let index = 0; index < gravelCount; index += 1) {
      const gravel = this.add
        .rectangle(
          roof.x + 44 + index * (roof.width / gravelCount) + randomRange(-18, 18),
          roof.y + 18 + randomRange(0, 58),
          randomRange(12, 22),
          randomRange(6, 10),
          district.roofTrim,
          0.3
        )
        .setDepth(11);
      roof.decorations.push(gravel);
    }

    if (randomRange(0, 1) > 0.45) {
      const cable = this.add
        .rectangle(roof.x + roof.width / 2, roof.y - 2, roof.width - 120, 3, district.propBase, 0.3)
        .setDepth(12);
      roof.decorations.push(cable);
    }
  }

  private populateRoof(roof: Roof, district: DistrictDefinition, isOpening: boolean) {
    const rhythm = isOpening ? 5 : Phaser.Math.Between(5, 7);
    const startOffset = 160;
    const usableWidth = roof.width - 220;
    const spacing = usableWidth / rhythm;

    for (let index = 0; index < rhythm; index += 1) {
      const x = roof.x + startOffset + index * spacing + randomRange(-30, 36);
      const kind = weightedPick(district.encounterMix.map((entry) => ({ value: entry.kind, weight: entry.weight })));
      this.addEncounter(roof, district, kind, x);

      if (!isOpening && randomRange(0, 1) > 0.64) {
        const partnerKind = weightedPick(district.encounterMix.map((entry) => ({ value: entry.kind, weight: entry.weight })));
        this.addEncounter(roof, district, partnerKind, x + randomRange(90, 132));
      }

      if (index < rhythm - 1 && randomRange(0, 1) > 0.55) {
        this.addPickupArc(x + 54, roof.y - 48, district.accent);
      }
    }

    if (randomRange(0, 1) > 0.48) {
      const accentX = roof.x + roof.width - randomRange(180, 260);
      this.addEncounter(roof, district, weightedPick(district.encounterMix.map((entry) => ({ value: entry.kind, weight: entry.weight }))), accentX);
    }
  }

  private addEncounter(roof: Roof, district: DistrictDefinition, kind: ObstacleKind, x: number) {
    const config = this.encounterConfig(kind);
    const sprite = this.add.image(x, roof.y - config.groundOffset, `rr-prop-${kind}`).setDepth(16);
    sprite.setTint(config.primaryTint ?? district.propBase, config.primaryTint ?? district.propBase, config.secondaryTint ?? district.propAccent, config.secondaryTint ?? district.propAccent);
    if (kind === "guard") {
      sprite.setTint(0x1f2835, 0x1f2835, district.propAccent, district.propAccent);
    }

    this.obstacles.push({
      id: this.obstacleId,
      roofId: roof.id,
      kind,
      action: config.action,
      x,
      y: roof.y - config.groundOffset,
      width: config.width,
      height: config.height,
      sprite,
      tint: district.propAccent,
      district: district.id,
      passed: false,
      disabled: false
    });
    this.obstacleId += 1;
  }

  private addPickupArc(x: number, y: number, tint: number) {
    for (let index = 0; index < 3; index += 1) {
      const pickup = this.add.circle(x + index * 26, y - Math.abs(index - 1) * 12, 8, tint, 0.18).setDepth(18);
      pickup.setStrokeStyle(3, 0xffffff, 0.84);
      this.pickups.push({
        id: this.pickupId,
        x: x + index * 26,
        y: y - Math.abs(index - 1) * 12,
        sprite: pickup,
        taken: false
      });
      this.pickupId += 1;
    }
  }

  private encounterConfig(kind: ObstacleKind) {
    switch (kind) {
      case "lowWall":
        return { width: 52, height: 24, action: "vault" as const, groundOffset: 12 };
      case "vent":
        return { width: 36, height: 32, action: "jump" as const, groundOffset: 20 };
      case "ac":
        return { width: 48, height: 42, action: "jump" as const, groundOffset: 24 };
      case "skylight":
        return { width: 62, height: 24, action: "jump" as const, groundOffset: 12 };
      case "guard":
        return { width: 28, height: 68, action: "slide" as const, groundOffset: 38 };
      case "antenna":
        return { width: 22, height: 82, action: "jump" as const, groundOffset: 44 };
      case "billboard":
        return { width: 72, height: 90, action: "slide" as const, groundOffset: 54 };
      case "barrier":
        return { width: 68, height: 30, action: "jump" as const, groundOffset: 14 };
      case "umbrella":
        return { width: 48, height: 72, action: "jump" as const, groundOffset: 40 };
      default:
        return { width: 40, height: 40, action: "jump" as const, groundOffset: 20 };
    }
  }

  public startRun() {
    this.resetRun();
    this.setPhase("playing");
    this.statusText = "Rooftop flow rebuilt. Read the roof before the gap.";
    this.pushHud();
  }

  public setPhase(nextPhase: RooftopPhase) {
    this.phase = nextPhase;
    this.callbacks.onPhaseChange(nextPhase);

    if (nextPhase === "title") {
      this.overlayTitle.setText("Rooftop Runner");
      this.overlayBody.setText(
        "A side-view parkour chase across real rooftop spaces. Flow across vents, guards, skylights, billboards, and construction clutter before the next big transition."
      );
      this.overlayPrompt.setVisible(true);
    } else if (nextPhase === "paused") {
      this.overlayTitle.setText("Pause");
      this.overlayBody.setText("Reset your line, then drop back into the roof flow.");
      this.overlayPrompt.setVisible(true);
    } else if (nextPhase === "gameOver") {
      this.overlayTitle.setText("Run Down");
      this.overlayBody.setText(this.gameOverReason);
      this.overlayPrompt.setVisible(true);
    } else {
      this.overlayTitle.setText("");
      this.overlayBody.setText("");
      this.overlayPrompt.setVisible(false);
    }
  }

  private currentDistrict() {
    return DISTRICTS[DISTRICT_ORDER[Math.floor(this.distance / DISTRICT_LENGTH) % DISTRICT_ORDER.length]];
  }

  private applyDistrictPalette(force = false) {
    const district = this.currentDistrict();
    if (!force && district.id === this.activeDistrictId) return;

    this.activeDistrictId = district.id;
    this.backgrounds[0].setFillStyle(district.skyTop, 1);
    this.backgrounds[1].setFillStyle(district.haze, 0.08);
    this.backgrounds[2].setFillStyle(district.roofFace, 0.28);
    this.glowDiscs[0].setFillStyle(district.accent, district.id === "neon" ? 0.22 : 0.15);
    this.glowDiscs[1].setFillStyle(district.haze, district.id === "storm" ? 0.11 : 0.06);
    this.statusText = `${district.name}: ${district.description}`;
  }

  private pushHud() {
    const district = this.currentDistrict();
    this.callbacks.onHudChange(
      {
        score: Math.floor(this.score),
        distance: Math.floor(this.distance),
        combo: this.combo,
        bestCombo: this.bestCombo,
        coins: this.coins,
        guard: this.guard,
        styleScore: Math.floor(this.styleScore),
        districtName: district.name,
        districtDescription: district.description,
        districtRotation: DISTRICT_ORDER.map((id, index) => ({
          name: DISTRICTS[id].name,
          accent: DISTRICTS[id].accentCss,
          active: index === Math.floor(this.distance / DISTRICT_LENGTH) % DISTRICT_ORDER.length
        })),
        heatLabel: this.score < 500 ? "Street Heat" : this.score < 1200 ? "Roof Heat" : this.score < 2200 ? "Chase Heat" : "Legend Heat",
        speedText: `Speed ${Math.round(this.speed)}`
      },
      this.statusText
    );
  }

  private collectPickup(pickup: Pickup) {
    pickup.taken = true;
    pickup.sprite.destroy();
    this.coins += 1;
    this.score += 18;
    this.combo += 1;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    this.styleScore += 14;
    this.statusText = "Clean line. Keep threading the roof.";
  }

  private hitObstacle(obstacle: Obstacle) {
    if (this.invulnerableMs > 0 || this.phase !== "playing") return;

    this.guard -= obstacle.kind === "guard" ? 2 : 1;
    this.invulnerableMs = 900;
    this.combo = Math.max(0, this.combo - 3);
    this.speed = Math.max(BASE_SPEED - 10, this.speed - 80);
    this.player.setVelocityY(-180);
    this.player.play("rr-hit", true);

    if (obstacle.kind === "guard") {
      this.statusText = "Guard clipped you. Stay lower or clear him cleanly.";
    } else if (obstacle.kind === "billboard") {
      this.statusText = "Billboard frame blocked the line.";
    } else {
      this.statusText = "Bad contact. Rebuild the rhythm.";
    }

    this.cameras.main.shake(110, 0.006);
    if (this.guard <= 0) {
      this.endRun("You lost the rooftop line after too many bad contacts.");
    }
  }

  private endRun(reason: string) {
    if (this.phase === "gameOver") return;
    this.gameOverReason = reason;
    this.player.play("rr-hit", true);
    this.setPhase("gameOver");

    const district = this.currentDistrict();
    const goldEarned =
      this.distance < 60
        ? 0
        : clamp(
            Math.floor(this.distance / 210) +
              Math.floor(this.score / 850) +
              Math.floor(this.bestCombo / 5) +
              Math.floor(this.coins / 5),
            1,
            16
          );

    this.callbacks.onRunComplete({
      score: Math.floor(this.score),
      distance: Math.floor(this.distance),
      coins: this.coins,
      goldEarned,
      reason,
      bestCombo: this.bestCombo,
      districtName: district.name
    });
    this.pushHud();
  }

  update(_time: number, delta: number) {
    const jumpPressed = Phaser.Input.Keyboard.JustDown(this.jumpKey) || Phaser.Input.Keyboard.JustDown(this.cursors.space!);
    const jumpReleased = Phaser.Input.Keyboard.JustUp(this.jumpKey) || Phaser.Input.Keyboard.JustUp(this.cursors.space!);

    if (jumpPressed) {
      if (this.phase === "title") {
        this.startRun();
        return;
      }
      this.jumpBufferMs = JUMP_BUFFER_MS;
    }

    if (Phaser.Input.Keyboard.JustDown(this.pauseKey) && this.phase !== "title" && this.phase !== "gameOver") {
      this.phase === "playing" ? this.setPhase("paused") : this.setPhase("playing");
    }

    if (this.phase !== "playing") {
      this.player.setVelocityX(0);
      return;
    }

    const dt = delta / 1000;
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const onFloor = body.blocked.down;

    this.speed = lerp(this.speed, clamp(BASE_SPEED + this.distance * 0.11 + this.combo * 6, BASE_SPEED, MAX_SPEED), 0.008 * delta);
    this.distance += this.speed * dt * 0.072;
    this.score += this.speed * dt * 0.17 + this.combo * 0.14;
    this.invulnerableMs = Math.max(0, this.invulnerableMs - delta);
    this.jumpBufferMs = Math.max(0, this.jumpBufferMs - delta);
    this.slideMs = Math.max(0, this.slideMs - delta);
    this.vaultMs = Math.max(0, this.vaultMs - delta);

    if (onFloor) {
      this.coyoteMs = COYOTE_MS;
      if (!this.lastGrounded) {
        this.landCleanly();
      }
    } else {
      this.coyoteMs = Math.max(0, this.coyoteMs - delta);
    }
    this.lastGrounded = onFloor;

    if (this.jumpBufferMs > 0 && this.coyoteMs > 0 && this.vaultMs <= 0) {
      this.player.setVelocityY(JUMP_VELOCITY);
      this.jumpBufferMs = 0;
      this.coyoteMs = 0;
      this.combo += 1;
      this.bestCombo = Math.max(this.bestCombo, this.combo);
      this.styleScore += 8;
      this.statusText = "Clean jump. Stay over the roof, not above it.";
    }

    if (jumpReleased && body.velocity.y < SHORT_HOP_CLAMP) {
      body.velocity.y = SHORT_HOP_CLAMP;
    }

    const wantsSlide = this.cursors.down?.isDown || this.slideKey.isDown;
    if (wantsSlide && onFloor && this.vaultMs <= 0) {
      this.slideMs = SLIDE_MS;
      body.setSize(28, 48, true);
      body.offset.set(34, 38);
      this.player.play("rr-slide", true);
      this.speed = Math.min(MAX_SPEED, this.speed + 0.32 * delta);
    } else if (this.vaultMs > 0) {
      body.setSize(28, 60, true);
      body.offset.set(34, 22);
      this.player.play("rr-jump", true);
      body.velocity.x = this.speed + 90;
    } else {
      body.setSize(28, 72, true);
      body.offset.set(34, 14);
      if (!onFloor) {
        this.player.play("rr-jump", true);
      } else {
        this.player.play("rr-run", true);
      }
    }

    body.setVelocityX(this.speed);
    this.shadow.setPosition(this.player.x + 4, BASE_GROUND_Y + 10);
    this.shadow.scaleX = onFloor ? 1 : 0.72;
    this.shadow.alpha = onFloor ? 0.22 : 0.11;

    if (this.player.y > GAME_HEIGHT + 120) {
      this.endRun("You missed the building transition and lost the roof.");
      return;
    }

    while (this.nextRoofX < this.cameras.main.scrollX + GAME_WIDTH + 1400) {
      this.spawnRoof(false);
    }

    this.cleanupBehind();
    this.handlePickups();
    this.handleObstacleInteractions();
    this.updateBackdrop();
    this.applyDistrictPalette();

    const cameraTarget = this.player.x - PLAYER_X;
    this.cameras.main.scrollX = lerp(this.cameras.main.scrollX, cameraTarget, 0.08);

    if (this.score > 520 && this.combo === 0) {
      this.statusText = "You are surviving, not flowing. Link the rooftop reads together.";
    }

    this.pushHud();
  }

  private landCleanly() {
    if (this.player.body.velocity.y > 180) {
      this.speed = Math.min(MAX_SPEED, this.speed + 22);
      this.styleScore += 6;
    }
  }

  private cleanupBehind() {
    const leftBound = this.cameras.main.scrollX - 280;

    this.roofs = this.roofs.filter((roof) => {
      const keep = roof.x + roof.width > leftBound;
      if (!keep) {
        roof.collider.destroy();
        roof.face.destroy();
        roof.top.destroy();
        roof.trim.destroy();
        roof.decorations.forEach((item) => item.destroy());
      }
      return keep;
    });

    this.obstacles = this.obstacles.filter((obstacle) => {
      const keep = obstacle.x + obstacle.width > leftBound && !obstacle.disabled;
      if (!keep) {
        obstacle.sprite.destroy();
      }
      return keep;
    });

    this.pickups = this.pickups.filter((pickup) => {
      const keep = pickup.x > leftBound && !pickup.taken;
      if (!keep && !pickup.taken) pickup.sprite.destroy();
      return keep;
    });
  }

  private handlePickups() {
    this.pickups.forEach((pickup) => {
      if (pickup.taken) return;
      if (Math.abs(this.player.x - pickup.x) < 24 && Math.abs(this.player.y - pickup.y) < 34) {
        this.collectPickup(pickup);
      } else {
        pickup.sprite.y += Math.sin((this.time.now + pickup.id * 45) / 180) * 0.4;
      }
    });
  }

  private handleObstacleInteractions() {
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const left = body.x;
    const right = body.x + body.width;
    const top = body.y;
    const bottom = body.y + body.height;

    this.obstacles.forEach((obstacle) => {
      if (obstacle.disabled) return;

      const obstacleLeft = obstacle.x - obstacle.width / 2;
      const obstacleRight = obstacle.x + obstacle.width / 2;
      const obstacleTop = obstacle.y - obstacle.height / 2;
      const obstacleBottom = obstacle.y + obstacle.height / 2;

      if (!obstacle.passed && obstacleRight < this.player.x - 8) {
        obstacle.passed = true;
        this.combo += 1;
        this.bestCombo = Math.max(this.bestCombo, this.combo);
        this.styleScore += obstacle.action === "vault" ? 18 : 12;
      }

      const nearFront = obstacleLeft - right;
      if (obstacle.action === "vault" && nearFront < 18 && nearFront > -8 && body.blocked.down && this.jumpBufferMs > 0) {
        this.startVault(obstacle);
        return;
      }

      const overlapping = right > obstacleLeft && left < obstacleRight && bottom > obstacleTop && top < obstacleBottom;
      if (!overlapping) return;

      if (obstacle.action === "slide") {
        if (this.slideMs > 0 || this.player.y + 18 < obstacleTop) {
          this.clearObstacle(obstacle, obstacle.kind === "guard" ? 20 : 14);
          this.statusText = obstacle.kind === "guard" ? "Guard evaded. Keep the pressure on." : "Low clearance threaded.";
          return;
        }
        this.hitObstacle(obstacle);
        return;
      }

      if (obstacle.action === "jump") {
        if (this.player.y + 12 < obstacleTop) {
          this.clearObstacle(obstacle, 12);
          return;
        }
        this.hitObstacle(obstacle);
        return;
      }

      if (obstacle.action === "vault") {
        if (this.vaultMs > 0 || this.player.y + 10 < obstacleTop) {
          this.clearObstacle(obstacle, 18);
          this.statusText = "Vault clean. Stay on that line.";
          return;
        }
        this.hitObstacle(obstacle);
      }
    });
  }

  private startVault(obstacle: Obstacle) {
    this.vaultMs = VAULT_MS;
    this.jumpBufferMs = 0;
    this.player.setVelocityY(-360);
    this.speed = Math.min(MAX_SPEED, this.speed + 28);
    this.clearObstacle(obstacle, 18);
    this.statusText = "Vault clean. Stay low and fast.";
  }

  private clearObstacle(obstacle: Obstacle, styleBonus: number) {
    if (obstacle.disabled) return;
    obstacle.disabled = true;
    obstacle.passed = true;
    obstacle.sprite.destroy();
    this.combo += 1;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    this.score += 12;
    this.styleScore += styleBonus;
  }

  private updateBackdrop() {
    const district = this.currentDistrict();
    const layerBottoms = [318, 430, 556];
    const factors = [0.12, 0.24, 0.4];

    this.glowDiscs[0].x = 184 + Math.sin(this.time.now / 3600) * 20;
    this.glowDiscs[0].y = 112 + Math.cos(this.time.now / 4200) * 18;
    this.glowDiscs[1].x = GAME_WIDTH - 188 + Math.sin(this.time.now / 2800) * 10;

    this.skylineLayers.forEach((layer, layerIndex) => {
      layer.forEach((rect, index) => {
        const factor = factors[layerIndex];
        const step = rect.getData("step") as number;
        const worldX = index * step;
        rect.x = (worldX - this.cameras.main.scrollX * factor) % (GAME_WIDTH + step);
        if (rect.x < -step) rect.x += GAME_WIDTH + step;
        rect.y = layerBottoms[layerIndex];
        rect.fillColor = district.roofFace;
        rect.alpha = 0.18 + layerIndex * 0.14;
      });
    });

    const streakAlpha = clamp((this.speed - 420) / 220, 0, 0.18);
    this.speedLines.forEach((streak, index) => {
      streak.setVisible(streakAlpha > 0.02);
      if (!streak.visible) return;
      streak.alpha = streakAlpha * (0.5 + (index % 3) * 0.24);
      streak.x = GAME_WIDTH - ((this.time.now * (0.76 + index * 0.08)) % (GAME_WIDTH + 220));
      streak.y = 144 + index * 34 + Math.sin((this.time.now + index * 90) / 240) * 8;
    });

    if (district.id === "storm") {
      this.rainLines.forEach((rain, index) => {
        rain.setVisible(true);
        rain.x = ((index * 38 + this.time.now * 0.78) % (GAME_WIDTH + 120)) - 40;
        rain.y = (index * 30 + this.time.now * 0.34) % (GAME_HEIGHT + 40) - 20;
        rain.rotation = -0.28;
        rain.alpha = 0.08 + Math.sin((this.time.now + index * 44) / 280) * 0.05;
      });
    } else {
      this.rainLines.forEach((rain) => rain.setVisible(false));
    }
  }
}

export function createRooftopRunnerGame(container: HTMLDivElement, callbacks: Callbacks) {
  const scene = new RooftopRunnerScene(callbacks);
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: container,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    transparent: true,
    physics: {
      default: "arcade",
      arcade: {
        debug: false,
        gravity: { y: 0 }
      }
    },
    scene: [scene],
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH
    },
    render: {
      antialias: true,
      pixelArt: false,
      roundPixels: true
    }
  });

  return {
    start() {
      scene.startRun();
    },
    pause() {
      if (scene.phase === "playing") scene.setPhase("paused");
    },
    resume() {
      if (scene.phase === "paused") scene.setPhase("playing");
    },
    restart() {
      scene.startRun();
    },
    destroy() {
      game.destroy(true);
    }
  };
}
