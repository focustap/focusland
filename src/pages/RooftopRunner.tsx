import React, { useEffect, useRef, useState } from "react";
import Phaser from "phaser";
import NavBar from "../components/NavBar";
import { recordArcadeResult } from "../lib/progression";

type GamePhase = "title" | "playing" | "gameOver";
type DistrictTier = 0 | 1 | 2 | 3;
type ObstacleKind = "gap" | "crate" | "sign" | "wall";

type HudState = {
  score: number;
  distance: number;
  coins: number;
  speed: number;
  districtTier: DistrictTier;
  focusCharges: number;
  focusActive: boolean;
};

type RunSummary = {
  score: number;
  distance: number;
  coins: number;
  goldEarned: number;
  reason: string;
};

type PatternEvent =
  | { kind: ObstacleKind; gap: number }
  | { kind: "coin"; gap: number; y?: number };

type RunnerObstacle = Phaser.Physics.Arcade.Image & {
  kind: ObstacleKind;
  cleared?: boolean;
};

type RunnerCoin = Phaser.Physics.Arcade.Image;

const WIDTH = 960;
const HEIGHT = 540;
const FLOOR_Y = 414;
const PLAYER_X = 188;
const LOCAL_BEST_KEY = "focusland-rooftop-runner-best";
const DISTRICT_THRESHOLDS = [500, 1000, 1500] as const;
const DISTRICT_NAMES = ["Sketch Block", "Studio Heights", "Inkline Mile", "Moonlight Reel"] as const;

const PATTERNS: Record<DistrictTier, PatternEvent[][]> = {
  0: [
    [{ kind: "coin", gap: 0, y: FLOOR_Y - 120 }, { kind: "crate", gap: 230 }],
    [{ kind: "sign", gap: 0 }],
    [{ kind: "gap", gap: 0 }],
    [{ kind: "crate", gap: 0 }, { kind: "coin", gap: 130, y: FLOOR_Y - 112 }]
  ],
  1: [
    [{ kind: "gap", gap: 0 }, { kind: "sign", gap: 290 }],
    [{ kind: "crate", gap: 0 }, { kind: "gap", gap: 285 }],
    [{ kind: "sign", gap: 0 }, { kind: "coin", gap: 125, y: FLOOR_Y - 146 }, { kind: "crate", gap: 235 }],
    [{ kind: "coin", gap: 0, y: FLOOR_Y - 155 }, { kind: "coin", gap: 72, y: FLOOR_Y - 122 }, { kind: "coin", gap: 72, y: FLOOR_Y - 92 }]
  ],
  2: [
    [{ kind: "wall", gap: 0 }, { kind: "coin", gap: 130, y: FLOOR_Y - 176 }],
    [{ kind: "gap", gap: 0 }, { kind: "crate", gap: 255 }, { kind: "sign", gap: 265 }],
    [{ kind: "crate", gap: 0 }, { kind: "wall", gap: 345 }],
    [{ kind: "sign", gap: 0 }, { kind: "gap", gap: 295 }]
  ],
  3: [
    [{ kind: "gap", gap: 0 }, { kind: "wall", gap: 285 }, { kind: "sign", gap: 275 }],
    [{ kind: "crate", gap: 0 }, { kind: "sign", gap: 260 }, { kind: "gap", gap: 260 }],
    [{ kind: "wall", gap: 0 }, { kind: "coin", gap: 118, y: FLOOR_Y - 168 }, { kind: "gap", gap: 250 }],
    [{ kind: "sign", gap: 0 }, { kind: "wall", gap: 285 }, { kind: "crate", gap: 240 }]
  ]
};

function getDistrictTier(score: number): DistrictTier {
  if (score >= DISTRICT_THRESHOLDS[2]) return 3;
  if (score >= DISTRICT_THRESHOLDS[1]) return 2;
  if (score >= DISTRICT_THRESHOLDS[0]) return 1;
  return 0;
}

function loadLocalBest() {
  if (typeof window === "undefined") {
    return 0;
  }

  const raw = window.localStorage.getItem(LOCAL_BEST_KEY);
  return raw ? Number(raw) || 0 : 0;
}

function saveLocalBest(score: number) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(LOCAL_BEST_KEY, String(score));
  }
}

function playAudio(audio: HTMLAudioElement | null, reset = false) {
  if (!audio) {
    return;
  }

  if (reset) {
    audio.currentTime = 0;
  }

  void audio.play().catch(() => undefined);
}

function pauseAudio(audio: HTMLAudioElement | null) {
  audio?.pause();
}

const RooftopRunner: React.FC = () => {
  const assetBase = import.meta.env.BASE_URL;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const bestScoreRef = useRef(loadLocalBest());
  const titleAudioRef = useRef<HTMLAudioElement | null>(null);
  const gameplayAudioRef = useRef<HTMLAudioElement | null>(null);
  const bonusAudioRef = useRef<HTMLAudioElement | null>(null);
  const resultsAudioRef = useRef<HTMLAudioElement | null>(null);

  const [phase, setPhase] = useState<GamePhase>("title");
  const [runSeed, setRunSeed] = useState(0);
  const [bestScore, setBestScore] = useState(() => loadLocalBest());
  const [status, setStatus] = useState("Sprint across rooftops, read the obstacle strings, and stay ahead of the skyline.");
  const [hud, setHud] = useState<HudState>({
    score: 0,
    distance: 0,
    coins: 0,
    speed: 0,
    districtTier: 0,
    focusCharges: 1,
    focusActive: false
  });
  const [lastRun, setLastRun] = useState<RunSummary | null>(null);

  const runSheet = `${assetBase}assets/town-rush/runner-expressive-run-sheet.png`;
  const jumpSheet = `${assetBase}assets/town-rush/runner-expressive-jump-sheet.png`;
  const slideSheet = `${assetBase}assets/town-rush/runner-expressive-slide-sheet.png`;
  const wallrunSheet = `${assetBase}assets/town-rush/runner-expressive-wallrun-sheet.png`;
  const titleTrackPath = `${assetBase}assets/music/town-rush/SwinginSafari.wav`;
  const gameplayTrackPath = `${assetBase}assets/music/town-rush/BourbonBlues.wav`;
  const bonusTrackPath = `${assetBase}assets/music/town-rush/BoogieWonderland.wav`;
  const resultsTrackPath = `${assetBase}assets/music/town-rush/CoolCatCaper.wav`;

  useEffect(() => {
    bestScoreRef.current = bestScore;
  }, [bestScore]);

  useEffect(() => {
    const titleTrack = new Audio(titleTrackPath);
    titleTrack.loop = true;
    titleTrack.volume = 0.34;

    const gameplayTrack = new Audio(gameplayTrackPath);
    gameplayTrack.loop = true;
    gameplayTrack.volume = 0.25;

    const bonusTrack = new Audio(bonusTrackPath);
    bonusTrack.volume = 0.5;

    const resultsTrack = new Audio(resultsTrackPath);
    resultsTrack.volume = 0.4;

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
      pauseAudio(gameplayAudioRef.current);
      pauseAudio(resultsAudioRef.current);
      playAudio(titleAudioRef.current);
    } else if (phase === "playing") {
      pauseAudio(titleAudioRef.current);
      pauseAudio(resultsAudioRef.current);
      playAudio(gameplayAudioRef.current);
    } else {
      pauseAudio(gameplayAudioRef.current);
      pauseAudio(titleAudioRef.current);
      playAudio(resultsAudioRef.current, true);
    }
  }, [phase]);

  useEffect(() => {
    if (phase !== "playing" || !containerRef.current) {
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
      return;
    }

    let cancelled = false;
    let finished = false;

    class RooftopRunnerScene extends Phaser.Scene {
      cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
      jumpKey!: Phaser.Input.Keyboard.Key;
      slideKey!: Phaser.Input.Keyboard.Key;
      focusKey!: Phaser.Input.Keyboard.Key;
      player!: Phaser.Physics.Arcade.Sprite;
      obstacles!: Phaser.Physics.Arcade.Group;
      coins!: Phaser.Physics.Arcade.Group;
      skyline: Phaser.GameObjects.Rectangle[] = [];
      clouds: Phaser.GameObjects.Ellipse[] = [];
      rooftopMarks: Phaser.GameObjects.Rectangle[] = [];
      score = 0;
      distance = 0;
      coinCount = 0;
      worldSpeed = 360;
      focusCharges = 1;
      focusMs = 0;
      slideMs = 0;
      wallrunMs = 0;
      districtTier: DistrictTier = 0;
      nextPatternDistance = 280;
      lastHudPush = 0;
      rooftopHeight = 0;

      preload() {
        this.load.spritesheet("runner-run", runSheet, { frameWidth: 96, frameHeight: 96 });
        this.load.spritesheet("runner-jump", jumpSheet, { frameWidth: 96, frameHeight: 96 });
        this.load.spritesheet("runner-slide", slideSheet, { frameWidth: 96, frameHeight: 96 });
        this.load.spritesheet("runner-wallrun", wallrunSheet, { frameWidth: 96, frameHeight: 96 });
      }

      create() {
        this.cameras.main.setBackgroundColor("#e9dcc2");
        this.physics.world.gravity.y = 1750;
        this.physics.world.setBounds(0, 0, WIDTH, HEIGHT + 200);

        this.makeTextures();
        this.drawWorld();
        this.createAnimations();

        this.player = this.physics.add.sprite(PLAYER_X, FLOOR_Y - 60, "runner-run", 0);
        this.player.setScale(1.5);
        this.player.setCollideWorldBounds(false);
        this.player.setDepth(7);
        this.player.body.setSize(42, 62).setOffset(28, 24);
        this.player.play("runner-run");

        this.obstacles = this.physics.add.group({ allowGravity: false, immovable: true });
        this.coins = this.physics.add.group({ allowGravity: false, immovable: true });

        this.cursors = this.input.keyboard!.createCursorKeys();
        this.jumpKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W);
        this.slideKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S);
        this.focusKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);

        this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
          if (pointer.x > WIDTH * 0.77) {
            this.tryFocus();
          } else if (pointer.y < HEIGHT * 0.58) {
            this.tryJump();
          } else {
            this.trySlide();
          }
        });

        this.physics.add.overlap(this.player, this.coins, (_player, coin) => {
          coin.destroy();
          this.coinCount += 1;
          this.score += 35;
        });

        this.physics.add.overlap(this.player, this.obstacles, (_player, obstacle) => {
          const target = obstacle as RunnerObstacle;
          if (target.cleared) {
            return;
          }

          if (target.kind === "wall" && this.canWallRun()) {
            this.triggerWallRun(target);
            return;
          }

          this.finishRun(
            target.kind === "gap"
              ? "Did not clear the rooftop gap."
              : target.kind === "sign"
                ? "Smacked into a hanging billboard."
                : target.kind === "wall"
                  ? "A brick wall shut the scene down."
                  : "Clipped an ink crate and lost momentum."
          );
        });

        this.spawnPattern();
        this.spawnPattern();
        this.pushHud(true);
      }

      makeTextures() {
        const g = this.add.graphics();

        g.fillStyle(0x171717, 1);
        g.fillRoundedRect(0, 0, 66, 54, 14);
        g.fillStyle(0xffffff, 0.15);
        g.fillRoundedRect(8, 8, 18, 18, 4);
        g.fillRoundedRect(38, 12, 12, 12, 4);
        g.generateTexture("roof-crate", 66, 54);
        g.clear();

        g.fillStyle(0x121212, 1);
        g.fillRoundedRect(0, 10, 110, 30, 12);
        g.fillStyle(0xffffff, 0.13);
        g.fillRoundedRect(12, 18, 36, 8, 4);
        g.generateTexture("roof-sign", 110, 50);
        g.clear();

        g.fillStyle(0x101010, 1);
        g.fillRoundedRect(8, 0, 52, 138, 18);
        g.fillStyle(0xffffff, 0.1);
        g.fillRoundedRect(18, 18, 18, 94, 8);
        g.generateTexture("roof-wall", 68, 138);
        g.clear();

        g.fillStyle(0xf4c542, 1);
        g.fillCircle(14, 14, 12);
        g.fillStyle(0xfff5ba, 0.5);
        g.fillCircle(10, 10, 4);
        g.generateTexture("roof-coin", 28, 28);
        g.clear();

        g.fillStyle(0x2a221a, 1);
        g.fillRect(0, 0, 180, 28);
        g.fillStyle(0x48382a, 1);
        g.fillRect(0, 24, 180, 8);
        g.generateTexture("roof-segment", 180, 32);
        g.clear();

        g.fillStyle(0x111111, 1);
        g.fillRect(0, 0, 80, 14);
        g.generateTexture("gap-shadow", 80, 14);
        g.destroy();
      }

      drawWorld() {
        this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, 0xe9dcc2).setDepth(0);
        this.add.rectangle(WIDTH / 2, 110, WIDTH, 180, 0xf4ebd2).setDepth(0);
        this.add.rectangle(WIDTH / 2, HEIGHT - 38, WIDTH, 120, 0xc8b08c, 0.25).setDepth(0);

        for (let i = 0; i < 5; i += 1) {
          const cloud = this.add.ellipse(
            100 + i * 200,
            104 + Phaser.Math.Between(-12, 16),
            Phaser.Math.Between(90, 130),
            Phaser.Math.Between(28, 42),
            0xffffff,
            0.35
          ).setDepth(0);
          this.clouds.push(cloud);
        }

        for (let i = 0; i < 6; i += 1) {
          const skyline = this.add.rectangle(
            80 + i * 170,
            278 + Phaser.Math.Between(-16, 28),
            Phaser.Math.Between(70, 120),
            Phaser.Math.Between(150, 230),
            0x241d16,
            0.18
          ).setOrigin(0.5, 1).setDepth(1);
          this.skyline.push(skyline);
        }

        for (let i = 0; i < 9; i += 1) {
          const mark = this.add.rectangle(90 + i * 120, FLOOR_Y + 14, 52, 4, 0xf8f4e5, 0.42).setDepth(3);
          this.rooftopMarks.push(mark);
        }

        for (let i = 0; i < 7; i += 1) {
          this.add.image(40 + i * 160, FLOOR_Y + 4, "roof-segment").setOrigin(0, 0).setDepth(2);
        }
      }

      createAnimations() {
        if (!this.anims.exists("roof-run")) {
          this.anims.create({
            key: "roof-run",
            frames: this.anims.generateFrameNumbers("runner-run", { start: 0, end: 7 }),
            frameRate: 14,
            repeat: -1
          });
        }

        if (!this.anims.exists("roof-jump")) {
          this.anims.create({
            key: "roof-jump",
            frames: this.anims.generateFrameNumbers("runner-jump", { start: 0, end: 4 }),
            frameRate: 12,
            repeat: -1
          });
        }

        if (!this.anims.exists("roof-slide")) {
          this.anims.create({
            key: "roof-slide",
            frames: this.anims.generateFrameNumbers("runner-slide", { start: 0, end: 3 }),
            frameRate: 16,
            repeat: -1
          });
        }

        if (!this.anims.exists("roof-wallrun")) {
          this.anims.create({
            key: "roof-wallrun",
            frames: this.anims.generateFrameNumbers("runner-wallrun", { start: 0, end: 5 }),
            frameRate: 16,
            repeat: -1
          });
        }
      }

      tryJump() {
        const body = this.player.body as Phaser.Physics.Arcade.Body;
        if ((body.blocked.down || this.player.y >= FLOOR_Y - 61) && this.slideMs <= 0) {
          body.setVelocityY(-790);
          this.player.play("roof-jump", true);
        }
      }

      trySlide() {
        const body = this.player.body as Phaser.Physics.Arcade.Body;
        if (!(body.blocked.down || this.player.y >= FLOOR_Y - 61) || this.slideMs > 0) {
          return;
        }

        this.slideMs = 430;
        body.setSize(56, 36).setOffset(20, 52);
        this.player.y = FLOOR_Y - 34;
        this.player.play("roof-slide", true);
      }

      tryFocus() {
        if (this.focusCharges <= 0 || this.focusMs > 0) {
          return;
        }

        this.focusCharges -= 1;
        this.focusMs = 1700;
      }

      canWallRun() {
        const body = this.player.body as Phaser.Physics.Arcade.Body;
        return this.player.y < FLOOR_Y - 10 && body.velocity.y > -180;
      }

      triggerWallRun(obstacle: RunnerObstacle) {
        obstacle.cleared = true;
        obstacle.disableBody(true, false);
        this.wallrunMs = 170;
        this.player.play("roof-wallrun", true);
        (this.player.body as Phaser.Physics.Arcade.Body).setVelocityY(-820);
        this.score += 85;
      }

      spawnPattern() {
        const pattern = Phaser.Utils.Array.GetRandom(PATTERNS[this.districtTier]);
        let spawnX = WIDTH + 120;

        pattern.forEach((entry) => {
          spawnX += entry.gap;
          if (entry.kind === "coin") {
            this.spawnCoin(spawnX, entry.y ?? FLOOR_Y - 120);
          } else {
            this.spawnObstacle(entry.kind, spawnX);
          }
        });

        this.nextPatternDistance = Phaser.Math.Between(300, 420) + this.districtTier * 24;
      }

      spawnObstacle(kind: ObstacleKind, x: number) {
        if (kind === "gap") {
          const gap = this.obstacles.create(x, FLOOR_Y + 10, "gap-shadow") as RunnerObstacle;
          gap.kind = kind;
          gap.setDepth(4);
          gap.body.setAllowGravity(false);
          gap.body.setSize(74, 120).setOffset(3, -106);
          return;
        }

        const texture =
          kind === "crate" ? "roof-crate" : kind === "sign" ? "roof-sign" : "roof-wall";
        const y =
          kind === "crate" ? FLOOR_Y - 26 : kind === "sign" ? FLOOR_Y - 108 : FLOOR_Y - 68;
        const obstacle = this.obstacles.create(x, y, texture) as RunnerObstacle;
        obstacle.kind = kind;
        obstacle.setDepth(5);
        obstacle.body.setAllowGravity(false);

        if (kind === "crate") {
          obstacle.body.setSize(54, 42).setOffset(6, 8);
        } else if (kind === "sign") {
          obstacle.body.setSize(100, 22).setOffset(5, 14);
        } else {
          obstacle.body.setSize(42, 124).setOffset(13, 8);
        }
      }

      spawnCoin(x: number, y: number) {
        const coin = this.coins.create(x, y, "roof-coin") as RunnerCoin;
        coin.setDepth(6);
        coin.body.setAllowGravity(false);
        coin.body.setCircle(12, 2, 2);
      }

      pushHud(force = false) {
        const now = this.time.now;
        if (!force && now - this.lastHudPush < 90) {
          return;
        }

        this.lastHudPush = now;
        setHud({
          score: Math.floor(this.score),
          distance: Math.floor(this.distance),
          coins: this.coinCount,
          speed: Math.round(this.worldSpeed),
          districtTier: this.districtTier,
          focusCharges: this.focusCharges,
          focusActive: this.focusMs > 0
        });
      }

      finishRun(reason: string) {
        if (finished) {
          return;
        }

        finished = true;
        const finalScore = Math.floor(this.score);
        const distance = Math.floor(this.distance);
        const goldEarned = Math.max(24, Math.floor(finalScore / 18) + this.coinCount * 8);
        const nextBest = Math.max(bestScoreRef.current, finalScore);

        setStatus(reason);
        setLastRun({
          score: finalScore,
          distance,
          coins: this.coinCount,
          goldEarned,
          reason
        });
        setBestScore(nextBest);
        saveLocalBest(nextBest);
        pauseAudio(gameplayAudioRef.current);
        this.cameras.main.shake(180, 0.008);

        void recordArcadeResult({
          scoreGameName: "rooftop_runner",
          score: finalScore,
          goldEarned
        }).catch(() => undefined);

        this.time.delayedCall(280, () => {
          if (!cancelled) {
            setPhase("gameOver");
          }
        });
      }

      update(_time: number, delta: number) {
        if (finished) {
          return;
        }

        const dt = delta / 1000;
        const body = this.player.body as Phaser.Physics.Arcade.Body;
        const wantsJump =
          Phaser.Input.Keyboard.JustDown(this.cursors.up!) ||
          Phaser.Input.Keyboard.JustDown(this.jumpKey) ||
          Phaser.Input.Keyboard.JustDown(this.cursors.space!);
        const wantsSlide =
          Phaser.Input.Keyboard.JustDown(this.cursors.down!) ||
          Phaser.Input.Keyboard.JustDown(this.slideKey);
        const wantsFocus = Phaser.Input.Keyboard.JustDown(this.focusKey);

        if (wantsJump) {
          this.tryJump();
        }
        if (wantsSlide) {
          this.trySlide();
        }
        if (wantsFocus) {
          this.tryFocus();
        }

        if (this.focusMs > 0) {
          this.focusMs -= delta;
        }

        if (this.slideMs > 0) {
          this.slideMs -= delta;
          if (this.slideMs <= 0) {
            body.setSize(42, 62).setOffset(28, 24);
            this.player.y = FLOOR_Y - 60;
          }
        }

        if (this.wallrunMs > 0) {
          this.wallrunMs -= delta;
        }

        const speedMultiplier = this.focusMs > 0 ? 0.68 : 1;
        const effectiveSpeed = this.worldSpeed * speedMultiplier;

        this.score += dt * (effectiveSpeed * 0.45);
        this.distance += dt * (effectiveSpeed * 0.115);
        this.worldSpeed = Math.min(620, this.worldSpeed + dt * 5.5);

        const nextTier = getDistrictTier(this.score);
        if (nextTier !== this.districtTier) {
          this.districtTier = nextTier;
          this.focusCharges = Math.min(3, this.focusCharges + 1);
          this.score += 80;
          setStatus(`${DISTRICT_NAMES[nextTier]} unlocked. The rooftops get meaner, but you earned another Focus.`);
          playAudio(bonusAudioRef.current, true);
        }

        this.nextPatternDistance -= effectiveSpeed * dt;
        if (this.nextPatternDistance <= 0) {
          this.spawnPattern();
        }

        this.clouds.forEach((cloud, index) => {
          cloud.x -= dt * (18 + index * 3);
          if (cloud.x < -80) {
            cloud.x = WIDTH + 100;
            cloud.y = 104 + Phaser.Math.Between(-12, 16);
          }
        });

        this.skyline.forEach((shape, index) => {
          shape.x -= dt * (50 + index * 6);
          if (shape.x < -80) {
            shape.x = WIDTH + 100;
            shape.height = Phaser.Math.Between(150, 230);
            shape.y = 278 + Phaser.Math.Between(-16, 28);
          }
        });

        this.rooftopMarks.forEach((mark) => {
          mark.x -= effectiveSpeed * dt;
          if (mark.x < -40) {
            mark.x = WIDTH + 50;
          }
        });

        this.obstacles.children.each((child) => {
          const obstacle = child as RunnerObstacle;
          obstacle.setVelocityX(-effectiveSpeed);
          if (obstacle.x < -160) {
            obstacle.destroy();
          }
        });

        this.coins.children.each((child) => {
          const coin = child as RunnerCoin;
          coin.setVelocityX(-effectiveSpeed);
          if (coin.x < -40) {
            coin.destroy();
          }
        });

        if (this.player.y >= FLOOR_Y - 60 && body.velocity.y >= 0) {
          this.player.y = this.slideMs > 0 ? FLOOR_Y - 34 : FLOOR_Y - 60;
          body.setVelocityY(0);
        }

        if (this.wallrunMs > 0) {
          this.player.play("roof-wallrun", true);
        } else if (this.slideMs > 0) {
          this.player.play("roof-slide", true);
        } else if (this.player.y < FLOOR_Y - 61 || body.velocity.y < 0) {
          this.player.play("roof-jump", true);
        } else {
          this.player.play("roof-run", true);
        }

        if (this.player.y > HEIGHT + 80) {
          this.finishRun("Missed the rooftop landing and vanished into the alley.");
          return;
        }

        this.pushHud();
      }
    }

    const game = new Phaser.Game({
      type: Phaser.CANVAS,
      width: WIDTH,
      height: HEIGHT,
      parent: containerRef.current,
      backgroundColor: "#e9dcc2",
      pixelArt: true,
      roundPixels: true,
      render: {
        antialias: false,
        pixelArt: true,
        roundPixels: true
      },
      physics: {
        default: "arcade",
        arcade: {
          debug: false,
          gravity: { x: 0, y: 0 }
        }
      },
      scene: RooftopRunnerScene
    });

    gameRef.current = game;

    return () => {
      cancelled = true;
      game.destroy(true);
      gameRef.current = null;
    };
  }, [jumpSheet, phase, runSeed, runSheet, slideSheet, wallrunSheet]);

  const districtName = DISTRICT_NAMES[hud.districtTier];

  const beginRun = () => {
    setHud({
      score: 0,
      distance: 0,
      coins: 0,
      speed: 360,
      districtTier: 0,
      focusCharges: 1,
      focusActive: false
    });
    setLastRun(null);
    setStatus("Sketch Block is live. Jump gaps, slide under signs, and late-jump into walls to vault them.");
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
            A side-scrolling rooftop dash in a rubber-hose cartoon city. Clear readable obstacle strings,
            bank coins, and hit milestones at 500, 1000, and 1500 without stepping on Town Rush&apos;s toes.
          </p>
        </div>

        <div className="rooftop-layout">
          <section className="rooftop-stage">
            <div ref={containerRef} className="rooftop-canvas" />

            <div className="rooftop-hud rooftop-hud--top">
              <div className="rooftop-marquee">
                <span className="rooftop-logo">Rooftop Runner</span>
                <span className="rooftop-district">{districtName}</span>
              </div>
              <div className="rooftop-scoreboard">
                <span>Score {hud.score}</span>
                <span>{Math.round(hud.distance)}m</span>
                <span>Coins {hud.coins}</span>
              </div>
            </div>

            <div className="rooftop-hud rooftop-hud--bottom">
              <span>Jump `W` / `Up` / tap top</span>
              <span>Slide `S` / `Down` / tap bottom</span>
              <span>Focus `Shift` {hud.focusCharges}</span>
              <span>{hud.focusActive ? "Focus live" : `Speed ${hud.speed}`}</span>
            </div>

            {phase !== "playing" ? (
              <div className="rooftop-overlay">
                <div className="rooftop-overlay-card">
                  <p className="rooftop-overlay-kicker">
                    {phase === "title" ? "Rubber-Hose Rooftops" : "Another Take"}
                  </p>
                  <h2>{phase === "title" ? "Hit the skyline" : `Score ${lastRun?.score ?? 0}`}</h2>
                  <p>
                    {phase === "title"
                      ? "Run left to right, jump rooftop gaps, and wall-vault past billboard stacks."
                      : `${lastRun?.reason ?? "Run over."} ${lastRun ? `Banked ${lastRun.goldEarned} gold and ${lastRun.coins} coins.` : ""}`}
                  </p>
                  <button className="primary-button" type="button" onClick={beginRun}>
                    {phase === "title" ? "Start Run" : "Run It Back"}
                  </button>
                </div>
              </div>
            ) : null}
          </section>

          <aside className="rooftop-sidepanel">
            <div className="rooftop-panel">
              <span className="rooftop-panel-title">Controls</span>
              <p>Jump over rooftop gaps and crates.</p>
              <p>Slide under hanging signs.</p>
              <p>Late-jump into walls to vault them and pocket bonus score.</p>
              <p>Focus slows the whole skyline for clutch recoveries.</p>
            </div>

            <div className="rooftop-panel">
              <span className="rooftop-panel-title">Progression</span>
              <p>500 score: Studio Heights adds tighter gap-and-sign combos.</p>
              <p>1000 score: Inkline Mile introduces wall vault strings.</p>
              <p>1500 score: Moonlight Reel stacks patterns faster without becoming unreadable.</p>
            </div>

            <div className="rooftop-panel">
              <span className="rooftop-panel-title">Run Status</span>
              <p>{status}</p>
              <p>Best score on this device: {bestScore}</p>
              {lastRun ? (
                <p>
                  Last run: {lastRun.score} score, {lastRun.distance}m, {lastRun.coins} coins.
                </p>
              ) : (
                <p>No clean take yet. Start a run and chase the skyline.</p>
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
