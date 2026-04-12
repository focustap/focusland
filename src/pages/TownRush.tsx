import React, { useEffect, useRef, useState } from "react";
import Phaser from "phaser";
import NavBar from "../components/NavBar";
import { recordArcadeResult } from "../lib/progression";

type GamePhase = "title" | "playing" | "gameOver";
type DistrictTier = 0 | 1 | 2 | 3;
type ObstacleKind = "low" | "high" | "wall";

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
  | { kind: "low" | "high" | "wall"; gap: number }
  | { kind: "coin"; gap: number; y?: number };

type PhaserObstacle = Phaser.Physics.Arcade.Image & {
  kind: ObstacleKind;
  cleared?: boolean;
};

type PhaserCoin = Phaser.Physics.Arcade.Image;

const WIDTH = 960;
const HEIGHT = 540;
const FLOOR_Y = 420;
const PLAYER_X = 188;
const LOCAL_BEST_KEY = "focusland-town-rush-runner-best";
const DISTRICT_THRESHOLDS = [500, 1000, 1500] as const;
const DISTRICT_NAMES = [
  "Starter Strip",
  "Studio Row",
  "Ink Works",
  "Final Reel"
] as const;

const RUN_SHEET = "/assets/town-rush/runner-expressive-run-sheet.png";
const JUMP_SHEET = "/assets/town-rush/runner-expressive-jump-sheet.png";
const SLIDE_SHEET = "/assets/town-rush/runner-expressive-slide-sheet.png";
const WALLRUN_SHEET = "/assets/town-rush/runner-expressive-wallrun-sheet.png";

const TITLE_TRACK = "/assets/music/town-rush/SwinginSafari.wav";
const GAMEPLAY_TRACK = "/assets/music/town-rush/BourbonBlues.wav";
const BONUS_TRACK = "/assets/music/town-rush/BoogieWonderland.wav";
const RESULTS_TRACK = "/assets/music/town-rush/CoolCatCaper.wav";

const PATTERNS: Record<DistrictTier, PatternEvent[][]> = {
  0: [
    [{ kind: "coin", gap: 0, y: FLOOR_Y - 110 }, { kind: "low", gap: 240 }],
    [{ kind: "high", gap: 0 }],
    [{ kind: "coin", gap: 0, y: FLOOR_Y - 130 }, { kind: "coin", gap: 85, y: FLOOR_Y - 96 }],
    [{ kind: "low", gap: 0 }]
  ],
  1: [
    [{ kind: "low", gap: 0 }, { kind: "high", gap: 290 }],
    [{ kind: "high", gap: 0 }, { kind: "coin", gap: 145, y: FLOOR_Y - 145 }],
    [{ kind: "low", gap: 0 }, { kind: "coin", gap: 120, y: FLOOR_Y - 105 }, { kind: "low", gap: 240 }],
    [{ kind: "coin", gap: 0, y: FLOOR_Y - 160 }, { kind: "coin", gap: 76, y: FLOOR_Y - 120 }, { kind: "coin", gap: 76, y: FLOOR_Y - 88 }]
  ],
  2: [
    [{ kind: "wall", gap: 0 }, { kind: "coin", gap: 125, y: FLOOR_Y - 176 }],
    [{ kind: "high", gap: 0 }, { kind: "low", gap: 300 }],
    [{ kind: "low", gap: 0 }, { kind: "wall", gap: 340 }],
    [{ kind: "coin", gap: 0, y: FLOOR_Y - 170 }, { kind: "wall", gap: 210 }]
  ],
  3: [
    [{ kind: "low", gap: 0 }, { kind: "high", gap: 285 }, { kind: "wall", gap: 330 }],
    [{ kind: "wall", gap: 0 }, { kind: "high", gap: 275 }],
    [{ kind: "high", gap: 0 }, { kind: "coin", gap: 115, y: FLOOR_Y - 150 }, { kind: "wall", gap: 250 }],
    [{ kind: "low", gap: 0 }, { kind: "coin", gap: 105, y: FLOOR_Y - 110 }, { kind: "high", gap: 245 }]
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

const TownRush: React.FC = () => {
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
  const [status, setStatus] = useState("Build speed, clear patterns, and vault paper walls.");
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

  useEffect(() => {
    bestScoreRef.current = bestScore;
  }, [bestScore]);

  useEffect(() => {
    const titleTrack = new Audio(TITLE_TRACK);
    titleTrack.loop = true;
    titleTrack.volume = 0.34;

    const gameplayTrack = new Audio(GAMEPLAY_TRACK);
    gameplayTrack.loop = true;
    gameplayTrack.volume = 0.26;

    const bonusTrack = new Audio(BONUS_TRACK);
    bonusTrack.volume = 0.5;

    const resultsTrack = new Audio(RESULTS_TRACK);
    resultsTrack.volume = 0.38;

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
  }, []);

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

    class TownRushScene extends Phaser.Scene {
      cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
      jumpKey!: Phaser.Input.Keyboard.Key;
      slideKey!: Phaser.Input.Keyboard.Key;
      focusKey!: Phaser.Input.Keyboard.Key;
      player!: Phaser.Physics.Arcade.Sprite;
      obstacles!: Phaser.Physics.Arcade.Group;
      coins!: Phaser.Physics.Arcade.Group;
      skyline: Phaser.GameObjects.Rectangle[] = [];
      trackMarks: Phaser.GameObjects.Rectangle[] = [];
      score = 0;
      distance = 0;
      coinCount = 0;
      worldSpeed = 360;
      focusCharges = 1;
      focusMs = 0;
      slideMs = 0;
      wallrunMs = 0;
      districtTier: DistrictTier = 0;
      nextPatternDistance = 300;
      lastHudPush = 0;

      preload() {
        this.load.spritesheet("runner-run", RUN_SHEET, { frameWidth: 96, frameHeight: 96 });
        this.load.spritesheet("runner-jump", JUMP_SHEET, { frameWidth: 96, frameHeight: 96 });
        this.load.spritesheet("runner-slide", SLIDE_SHEET, { frameWidth: 96, frameHeight: 96 });
        this.load.spritesheet("runner-wallrun", WALLRUN_SHEET, { frameWidth: 96, frameHeight: 96 });
      }

      create() {
        this.cameras.main.setBackgroundColor("#f3ecd7");
        this.physics.world.gravity.y = 1700;

        this.makeTextures();
        this.drawWorld();
        this.createAnimations();

        this.player = this.physics.add.sprite(PLAYER_X, FLOOR_Y - 58, "runner-run", 0);
        this.player.setScale(1.5);
        this.player.setCollideWorldBounds(true);
        this.player.setDepth(4);
        this.player.body.setSize(42, 62).setOffset(28, 24);
        this.player.play("runner-run");

        this.obstacles = this.physics.add.group({ allowGravity: false, immovable: true });
        this.coins = this.physics.add.group({ allowGravity: false, immovable: true });

        this.cursors = this.input.keyboard!.createCursorKeys();
        this.jumpKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W);
        this.slideKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S);
        this.focusKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);

        this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
          if (pointer.x > WIDTH * 0.76) {
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
          this.score += 30;
        });

        this.physics.add.overlap(this.player, this.obstacles, (_player, obstacle) => {
          const target = obstacle as PhaserObstacle;
          if (target.cleared) {
            return;
          }

          if (target.kind === "wall" && this.canWallRun()) {
            this.triggerWallRun(target);
            return;
          }

          this.finishRun(`Face-planted into a ${target.kind === "high" ? "hanging sign" : target.kind === "wall" ? "paper wall" : "ink crate"}.`);
        });

        this.pushHud(true);
      }

      makeTextures() {
        const g = this.add.graphics();

        g.fillStyle(0x171717, 1);
        g.fillRoundedRect(0, 0, 66, 54, 14);
        g.fillStyle(0xffffff, 0.18);
        g.fillRoundedRect(10, 10, 16, 16, 4);
        g.fillRoundedRect(38, 8, 10, 20, 4);
        g.generateTexture("ink-crate", 66, 54);
        g.clear();

        g.fillStyle(0x111111, 1);
        g.fillRoundedRect(0, 12, 96, 28, 12);
        g.fillStyle(0xffffff, 0.14);
        g.fillRoundedRect(10, 18, 30, 8, 4);
        g.generateTexture("ink-sign", 96, 52);
        g.clear();

        g.fillStyle(0x101010, 1);
        g.fillRoundedRect(8, 0, 48, 138, 20);
        g.fillStyle(0xffffff, 0.1);
        g.fillRoundedRect(18, 18, 16, 96, 8);
        g.generateTexture("ink-wall", 64, 138);
        g.clear();

        g.fillStyle(0xf5c542, 1);
        g.fillCircle(14, 14, 12);
        g.fillStyle(0xfff5ba, 0.5);
        g.fillCircle(10, 10, 4);
        g.generateTexture("ink-coin", 28, 28);
        g.destroy();
      }

      drawWorld() {
        this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, 0xf3ecd7).setDepth(0);
        this.add.rectangle(WIDTH / 2, HEIGHT * 0.28, WIDTH, HEIGHT * 0.4, 0xe8debe).setDepth(0);
        this.add.rectangle(WIDTH / 2, FLOOR_Y + 38, WIDTH, HEIGHT - FLOOR_Y + 80, 0x2b241b).setDepth(0);
        this.add.rectangle(WIDTH / 2, FLOOR_Y + 2, WIDTH, 8, 0x131313).setDepth(1);

        for (let i = 0; i < 6; i += 1) {
          const skyline = this.add.rectangle(
            120 + i * 170,
            220 + Phaser.Math.Between(-18, 30),
            Phaser.Math.Between(70, 110),
            Phaser.Math.Between(140, 220),
            0x1f1a15,
            0.12
          ).setOrigin(0.5, 1).setDepth(0);
          this.skyline.push(skyline);
        }

        for (let i = 0; i < 9; i += 1) {
          const dash = this.add.rectangle(120 + i * 110, FLOOR_Y + 44, 64, 8, 0xf6f1df, 0.75).setDepth(1);
          this.trackMarks.push(dash);
        }
      }

      createAnimations() {
        if (!this.anims.exists("runner-run")) {
          this.anims.create({
            key: "runner-run",
            frames: this.anims.generateFrameNumbers("runner-run", { start: 0, end: 7 }),
            frameRate: 14,
            repeat: -1
          });
        }

        if (!this.anims.exists("runner-jump")) {
          this.anims.create({
            key: "runner-jump",
            frames: this.anims.generateFrameNumbers("runner-jump", { start: 0, end: 4 }),
            frameRate: 12,
            repeat: -1
          });
        }

        if (!this.anims.exists("runner-slide")) {
          this.anims.create({
            key: "runner-slide",
            frames: this.anims.generateFrameNumbers("runner-slide", { start: 0, end: 3 }),
            frameRate: 16,
            repeat: -1
          });
        }

        if (!this.anims.exists("runner-wallrun")) {
          this.anims.create({
            key: "runner-wallrun",
            frames: this.anims.generateFrameNumbers("runner-wallrun", { start: 0, end: 5 }),
            frameRate: 16,
            repeat: -1
          });
        }
      }

      tryJump() {
        const body = this.player.body as Phaser.Physics.Arcade.Body;
        if (body.blocked.down && this.slideMs <= 0) {
          body.setVelocityY(-760);
          this.player.play("runner-jump", true);
        }
      }

      trySlide() {
        const body = this.player.body as Phaser.Physics.Arcade.Body;
        if (!body.blocked.down || this.slideMs > 0) {
          return;
        }

        this.slideMs = 430;
        body.setSize(56, 36).setOffset(20, 52);
        this.player.y = FLOOR_Y - 34;
        this.player.play("runner-slide", true);
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
        return !body.blocked.down && body.velocity.y > -120 && this.player.y < FLOOR_Y - 8;
      }

      triggerWallRun(obstacle: PhaserObstacle) {
        obstacle.cleared = true;
        obstacle.disableBody(true, false);
        this.wallrunMs = 180;
        this.player.play("runner-wallrun", true);
        (this.player.body as Phaser.Physics.Arcade.Body).setVelocityY(-820);
        this.score += 70;
      }

      spawnPattern() {
        const source = PATTERNS[this.districtTier];
        const pattern = Phaser.Utils.Array.GetRandom(source);
        let spawnX = WIDTH + 120;

        pattern.forEach((event) => {
          spawnX += event.gap;
          if (event.kind === "coin") {
            this.spawnCoin(spawnX, event.y ?? FLOOR_Y - 110);
            return;
          }

          this.spawnObstacle(event.kind, spawnX);
        });

        this.nextPatternDistance = Phaser.Math.Between(300, 420) + this.districtTier * 26;
      }

      spawnObstacle(kind: ObstacleKind, x: number) {
        const texture = kind === "low" ? "ink-crate" : kind === "high" ? "ink-sign" : "ink-wall";
        const y = kind === "low" ? FLOOR_Y - 26 : kind === "high" ? FLOOR_Y - 106 : FLOOR_Y - 68;
        const obstacle = this.obstacles.create(x, y, texture) as PhaserObstacle;
        obstacle.kind = kind;
        obstacle.setDepth(3);
        obstacle.body.setAllowGravity(false);

        if (kind === "low") {
          obstacle.body.setSize(54, 42).setOffset(6, 8);
        } else if (kind === "high") {
          obstacle.body.setSize(88, 22).setOffset(4, 15);
        } else {
          obstacle.body.setSize(40, 124).setOffset(12, 8);
        }
      }

      spawnCoin(x: number, y: number) {
        const coin = this.coins.create(x, y, "ink-coin") as PhaserCoin;
        coin.setDepth(2);
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
          scoreGameName: "town_rush",
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
        const wantsJump = Phaser.Input.Keyboard.JustDown(this.cursors.up!) || Phaser.Input.Keyboard.JustDown(this.jumpKey) || Phaser.Input.Keyboard.JustDown(this.cursors.space!);
        const wantsSlide = Phaser.Input.Keyboard.JustDown(this.cursors.down!) || Phaser.Input.Keyboard.JustDown(this.slideKey);
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
            this.player.y = FLOOR_Y - 58;
          }
        }

        if (this.wallrunMs > 0) {
          this.wallrunMs -= delta;
        }

        const speedMultiplier = this.focusMs > 0 ? 0.68 : 1;
        const effectiveSpeed = this.worldSpeed * speedMultiplier;

        this.score += dt * (effectiveSpeed * 0.45);
        this.distance += dt * (effectiveSpeed * 0.12);
        this.worldSpeed = Math.min(610, this.worldSpeed + dt * 5.5);

        const nextTier = getDistrictTier(this.score);
        if (nextTier !== this.districtTier) {
          this.districtTier = nextTier;
          this.focusCharges = Math.min(3, this.focusCharges + 1);
          this.score += 80;
          setStatus(`${DISTRICT_NAMES[nextTier]} unlocked. Patterns tighten up, but you get an extra Focus.`);
          playAudio(bonusAudioRef.current, true);
        }

        this.nextPatternDistance -= effectiveSpeed * dt;
        if (this.nextPatternDistance <= 0) {
          this.spawnPattern();
        }

        this.skyline.forEach((shape, index) => {
          shape.x -= dt * (40 + index * 6);
          if (shape.x < -80) {
            shape.x = WIDTH + 100;
            shape.height = Phaser.Math.Between(140, 220);
            shape.y = 220 + Phaser.Math.Between(-18, 30);
          }
        });

        this.trackMarks.forEach((dash) => {
          dash.x -= effectiveSpeed * dt;
          if (dash.x < -50) {
            dash.x = WIDTH + 50;
          }
        });

        this.obstacles.children.each((child) => {
          const obstacle = child as PhaserObstacle;
          obstacle.setVelocityX(-effectiveSpeed);
          if (obstacle.x < -120) {
            obstacle.destroy();
          }
        });

        this.coins.children.each((child) => {
          const coin = child as PhaserCoin;
          coin.setVelocityX(-effectiveSpeed);
          if (coin.x < -40) {
            coin.destroy();
          }
        });

        if (body.blocked.down) {
          this.player.y = this.slideMs > 0 ? FLOOR_Y - 34 : FLOOR_Y - 58;
        }

        if (this.wallrunMs > 0) {
          this.player.play("runner-wallrun", true);
        } else if (this.slideMs > 0) {
          this.player.play("runner-slide", true);
        } else if (!body.blocked.down) {
          this.player.play("runner-jump", true);
        } else {
          this.player.play("runner-run", true);
        }

        if (this.player.y > HEIGHT + 80) {
          this.finishRun("Missed the beat and hit the floor hard.");
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
      backgroundColor: "#f3ecd7",
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
      scene: TownRushScene
    });

    gameRef.current = game;

    return () => {
      cancelled = true;
      game.destroy(true);
      gameRef.current = null;
    };
  }, [phase, runSeed]);

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
    setStatus("Starter Strip is live. Jump low ink crates, slide under hanging signs, and ride walls on late jumps.");
    setRunSeed((value) => value + 1);
    setPhase("playing");
  };

  return (
    <div className="page">
      <NavBar />
      <main className="content card townrush-shell">
        <div className="townrush-copy">
          <h1>Town Rush</h1>
          <p>
            Sprint left to right through a rubber-hose paper city. The run starts readable, then new
            tricks show up at 500, 1000, and 1500 score without turning the whole thing into RNG sludge.
          </p>
        </div>

        <div className="townrush-layout">
          <section className="townrush-stage">
            <div ref={containerRef} className="townrush-canvas" />

            <div className="townrush-hud townrush-hud--top">
              <div className="townrush-marquee">
                <span className="townrush-logo">Town Rush</span>
                <span className="townrush-district">{districtName}</span>
              </div>
              <div className="townrush-scoreboard">
                <span>Score {hud.score}</span>
                <span>{Math.round(hud.distance)}m</span>
                <span>Coins {hud.coins}</span>
              </div>
            </div>

            <div className="townrush-hud townrush-hud--bottom">
              <span>Jump `W` / `Up` / tap top</span>
              <span>Slide `S` / `Down` / tap bottom</span>
              <span>Focus `Shift` {hud.focusCharges}</span>
              <span>{hud.focusActive ? "Focus live" : `Speed ${hud.speed}`}</span>
            </div>

            {phase !== "playing" ? (
              <div className="townrush-overlay">
                <div className="townrush-overlay-card">
                  <p className="townrush-overlay-kicker">{phase === "title" ? "Rubber-Hose Runner" : "Cut. Reset. Again."}</p>
                  <h2>{phase === "title" ? "Run the reel" : `Score ${lastRun?.score ?? 0}`}</h2>
                  <p>
                    {phase === "title"
                      ? "Jump, slide, and wall-run through prebuilt obstacle strings that stay readable as the city escalates."
                      : `${lastRun?.reason ?? "Run over."} ${lastRun ? `Banked ${lastRun.goldEarned} gold and ${lastRun.coins} coins.` : ""}`}
                  </p>
                  <button className="primary-button" type="button" onClick={beginRun}>
                    {phase === "title" ? "Start Run" : "Run It Back"}
                  </button>
                </div>
              </div>
            ) : null}
          </section>

          <aside className="townrush-sidepanel">
            <div className="townrush-panel">
              <span className="townrush-panel-title">Controls</span>
              <p>Jump over ink crates.</p>
              <p>Slide under hanging signs.</p>
              <p>Hit walls from a late jump to vault them and score bonus style points.</p>
              <p>Focus slows the city for a short clutch window.</p>
            </div>

            <div className="townrush-panel">
              <span className="townrush-panel-title">Progression</span>
              <p>500 score: Studio Row adds cleaner combo strings.</p>
              <p>1000 score: Ink Works introduces wall vaults.</p>
              <p>1500 score: Final Reel chains patterns tighter, but still on purpose.</p>
            </div>

            <div className="townrush-panel townrush-status-panel">
              <span className="townrush-panel-title">Run Status</span>
              <p>{status}</p>
              <p>Best score on this device: {bestScore}</p>
              {lastRun ? (
                <p>
                  Last run: {lastRun.score} score, {lastRun.distance}m, {lastRun.coins} coins.
                </p>
              ) : (
                <p>No take yet. Hit Start Run and build a reel worth replaying.</p>
              )}
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
};

export default TownRush;
