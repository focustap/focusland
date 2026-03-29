import React, { useEffect, useRef, useState } from "react";
import NavBar from "../components/NavBar";
import Phaser from "phaser";
import { recordArcadeResult } from "../lib/progression";

type Phase = "walking" | "judging" | "dead";

type AnomalyId =
  | "none"
  | "red-light"
  | "missing-light"
  | "cold-light"
  | "flicker-light"
  | "extra-light"
  | "low-light"
  | "door-number"
  | "door-glow"
  | "missing-plaque"
  | "tilted-plaque"
  | "missing-knob"
  | "knob-left"
  | "door-scratches"
  | "left-portrait"
  | "extra-frame-left"
  | "extra-frame-right"
  | "painting-color-shift"
  | "upside-down-left"
  | "upside-down-right"
  | "crooked-frame-left"
  | "eye-in-painting"
  | "portrait-bleed"
  | "runner-symbol"
  | "vent-missing-left"
  | "vent-open-right"
  | "wall-crack-left"
  | "wall-crack-right"
  | "blood-text"
  | "door-eye"
  | "floor-stain"
  | "blackout-scare";

type HallSnapshot = {
  loop: number;
  anomaly: AnomalyId;
};

type MistakeDetail = {
  loop: number;
  anomaly: AnomalyId;
  guessedAnomaly: boolean;
};

const GAME_WIDTH = 920;
const GAME_HEIGHT = 540;
const HALL_LENGTH = 960;
const PLAYER_STOP_DISTANCE = 140;
const CAMERA_FOCAL = 340;
const HALL_HALF_WIDTH = 310;
const HALL_HALF_HEIGHT = 184;
const MAX_MISTAKES = 3;
const LIGHT_WORLD_DISTANCES = [132, 272, 430, 596, 760, 908];
const LEFT_FRAME_WORLD_DISTANCES = [220, 460, 708];
const RIGHT_FRAME_WORLD_DISTANCES = [332, 612];
const PANEL_WORLD_DISTANCES = [166, 270, 386, 508, 630, 752, 874];
const LEFT_VENT_WORLD_DISTANCES = [438];
const ANOMALIES: AnomalyId[] = [
  "door-number",
  "door-glow",
  "red-light",
  "missing-light",
  "cold-light",
  "flicker-light",
  "extra-light",
  "low-light",
  "missing-plaque",
  "tilted-plaque",
  "missing-knob",
  "knob-left",
  "door-scratches",
  "left-portrait",
  "extra-frame-left",
  "extra-frame-right",
  "painting-color-shift",
  "upside-down-left",
  "upside-down-right",
  "crooked-frame-left",
  "eye-in-painting",
  "portrait-bleed",
  "runner-symbol",
  "vent-missing-left",
  "vent-open-right",
  "wall-crack-left",
  "wall-crack-right",
  "blood-text",
  "door-eye",
  "floor-stain",
  "blackout-scare"
];

const randomAnomaly = (): AnomalyId => {
  if (Math.random() < 0.26) {
    return "none";
  }

  return Phaser.Utils.Array.GetRandom(ANOMALIES);
};

const formatAnomalyLabel = (anomaly: AnomalyId) => {
  if (anomaly === "none") {
    return "No anomaly";
  }

  return anomaly
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

const Hallway13: React.FC = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const [lastRun, setLastRun] = useState<number | null>(null);
  const [mistakeReport, setMistakeReport] = useState<MistakeDetail[] | null>(null);
  const [status, setStatus] = useState("Endless corridor. Three mistakes and it gets you.");
  const assetBase = import.meta.env.BASE_URL;

  useEffect(() => {
    if (!containerRef.current || gameRef.current) {
      return;
    }

    const handleRunOver = (completedLoops: number, mistakes: MistakeDetail[]) => {
      setLastRun(completedLoops);
      setMistakeReport(mistakes);
      setStatus("Run over. Saving hallway score...");

      void (async () => {
        try {
          const goldEarned = Math.max(2, Math.min(28, Math.floor(completedLoops / 2) + 2));
          await recordArcadeResult({
            scoreGameName: "hallway13",
            score: completedLoops,
            goldEarned
          });
          setStatus(`Run over. Best hallway score saved. +${goldEarned} gold.`);
        } catch {
          setStatus("Run over. Hallway score could not be saved.");
        }
      })();
    };

    class HallwayScene extends Phaser.Scene {
      graphics!: Phaser.GameObjects.Graphics;
      loopText!: Phaser.GameObjects.Text;
      threatText!: Phaser.GameObjects.Text;
      promptText!: Phaser.GameObjects.Text;
      phaseText!: Phaser.GameObjects.Text;
      footerText!: Phaser.GameObjects.Text;
      plaqueText!: Phaser.GameObjects.Text;
      plaqueShadowText!: Phaser.GameObjects.Text;
      decorText!: Phaser.GameObjects.Text;
      decorShadowText!: Phaser.GameObjects.Text;
      vignette!: Phaser.GameObjects.Rectangle;
      fadeOverlay!: Phaser.GameObjects.Rectangle;
      rushFace!: Phaser.GameObjects.Image;
      loseFace!: Phaser.GameObjects.Image;
      hallwayHistory: HallSnapshot[] = [];
      mistakeLog: MistakeDetail[] = [];
      currentLoop = 1;
      mistakes = 0;
      progress = 0;
      lookDrift = 0;
      phase: Phase = "walking";
      currentAnomaly: AnomalyId = "none";
      lastNonNoneAnomaly: AnomalyId = "none";
      blackoutScarePlayed = false;
      ambientSound?: Phaser.Sound.BaseSound;
      creepySound?: Phaser.Sound.BaseSound;
      jumpscareSound?: Phaser.Sound.BaseSound;
      loseJumpscareSound?: Phaser.Sound.BaseSound;
      keys!: {
        forward: Phaser.Input.Keyboard.Key;
        backward: Phaser.Input.Keyboard.Key;
        up: Phaser.Input.Keyboard.Key;
        open: Phaser.Input.Keyboard.Key;
        anomaly: Phaser.Input.Keyboard.Key;
        clear: Phaser.Input.Keyboard.Key;
        restart: Phaser.Input.Keyboard.Key;
      };

      preload() {
        this.load.audio("hallway-ambience", `${assetBase}audio/hallway/ambient_horror_0.ogg`);
        this.load.audio("hallway-creepy", `${assetBase}audio/hallway/creepy-hit.mp3`);
        this.load.audio("hallway-jumpscare", `${assetBase}audio/hallway/jumpscare.mp3`);
        this.load.audio("hallway-lose-jumpscare", `${assetBase}audio/hallway/hallway-lose-jumpscare.mp3`);
        this.load.image("hallway-rush-face", `${assetBase}assets/hallway/scaryface.png`);
        this.load.image("hallway-lose-face", `${assetBase}assets/hallway/scaryfacefull.jpg`);
      }

      create() {
        this.graphics = this.add.graphics();
        this.loopText = this.add.text(24, 18, "", {
          color: "#f8fafc",
          fontFamily: "Georgia, serif",
          fontSize: "22px",
          fontStyle: "bold"
        });
        this.threatText = this.add.text(24, 50, "", {
          color: "#cbd5e1",
          fontFamily: "Georgia, serif",
          fontSize: "16px"
        });
        this.phaseText = this.add.text(GAME_WIDTH / 2, 26, "", {
          color: "#fef2f2",
          fontFamily: "Georgia, serif",
          fontSize: "18px",
          fontStyle: "bold",
          align: "center"
        }).setOrigin(0.5, 0);
        this.promptText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 78, "", {
          color: "#e2e8f0",
          fontFamily: "Georgia, serif",
          fontSize: "18px",
          align: "center",
          wordWrap: { width: 740 }
        }).setOrigin(0.5);
        this.footerText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 30, "", {
          color: "#94a3b8",
          fontFamily: "Georgia, serif",
          fontSize: "15px",
          align: "center"
        }).setOrigin(0.5);
        this.plaqueShadowText = this.add.text(0, 0, "", {
          color: "#020617",
          fontFamily: "Georgia, serif",
          fontSize: "18px",
          fontStyle: "bold"
        }).setOrigin(0.5);
        this.plaqueText = this.add.text(0, 0, "", {
          color: "#f8fafc",
          fontFamily: "Georgia, serif",
          fontSize: "18px",
          fontStyle: "bold"
        }).setOrigin(0.5);
        this.decorShadowText = this.add.text(0, 0, "", {
          color: "#020617",
          fontFamily: "Georgia, serif",
          fontSize: "18px",
          fontStyle: "bold"
        }).setOrigin(0.5);
        this.decorText = this.add.text(0, 0, "", {
          color: "#7f1d1d",
          fontFamily: "Georgia, serif",
          fontSize: "18px",
          fontStyle: "bold"
        }).setOrigin(0.5);
        this.plaqueShadowText.setVisible(false);
        this.plaqueText.setVisible(false);
        this.decorShadowText.setVisible(false);
        this.decorText.setVisible(false);

        this.vignette = this.add.rectangle(
          GAME_WIDTH / 2,
          GAME_HEIGHT / 2,
          GAME_WIDTH,
          GAME_HEIGHT,
          0x000000,
          0
        ).setStrokeStyle(0);
        this.vignette.setBlendMode(Phaser.BlendModes.MULTIPLY);

        this.fadeOverlay = this.add.rectangle(
          GAME_WIDTH / 2,
          GAME_HEIGHT / 2,
          GAME_WIDTH,
          GAME_HEIGHT,
          0x09090b,
          0
        );
        this.fadeOverlay.setDepth(30);
        this.rushFace = this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, "hallway-rush-face");
        this.rushFace.setDepth(34).setAlpha(0).setScale(0.1);
        this.loseFace = this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, "hallway-lose-face");
        this.loseFace.setDepth(35).setAlpha(0);
        this.loseFace.setDisplaySize(GAME_WIDTH, GAME_HEIGHT);

        this.keys = this.input.keyboard!.addKeys({
          forward: Phaser.Input.Keyboard.KeyCodes.W,
          backward: Phaser.Input.Keyboard.KeyCodes.S,
          up: Phaser.Input.Keyboard.KeyCodes.UP,
          open: Phaser.Input.Keyboard.KeyCodes.E,
          anomaly: Phaser.Input.Keyboard.KeyCodes.Q,
          clear: Phaser.Input.Keyboard.KeyCodes.R,
          restart: Phaser.Input.Keyboard.KeyCodes.SPACE
        }) as HallwayScene["keys"];

        this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.UP);
        this.input.on("pointerdown", () => {
          this.sound.context.resume().catch(() => undefined);
          this.startAmbience();
        });

        this.startAmbience();
        this.beginLoop(true);
      }

      startAmbience() {
        if (!this.ambientSound) {
          this.ambientSound = this.sound.add("hallway-ambience", { loop: true, volume: 0.38 });
        }
        if (!this.ambientSound.isPlaying) {
          this.ambientSound.play();
        }
        this.creepySound ??= this.sound.add("hallway-creepy", { volume: 0.35 });
        this.jumpscareSound ??= this.sound.add("hallway-jumpscare", { volume: 0.85 });
        this.loseJumpscareSound ??= this.sound.add("hallway-lose-jumpscare", { volume: 1.15 });
      }

      pickLoopAnomaly(isFirstLoop: boolean) {
        if (isFirstLoop || this.currentLoop === 1) {
          return "none" as AnomalyId;
        }

        let anomaly = randomAnomaly();
        let attempts = 0;
        while (anomaly !== "none" && anomaly === this.lastNonNoneAnomaly && attempts < 4) {
          anomaly = randomAnomaly();
          attempts += 1;
        }
        if (anomaly !== "none") {
          this.lastNonNoneAnomaly = anomaly;
        }
        return anomaly;
      }

      triggerRushFace() {
        this.rushFace.setPosition(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 12).setScale(0.08).setAlpha(0);
        this.tweens.killTweensOf(this.rushFace);
        this.tweens.add({
          targets: this.rushFace,
          alpha: { from: 0.08, to: 0.95 },
          scale: { from: 0.08, to: 1.9 },
          y: { from: GAME_HEIGHT / 2 + 16, to: GAME_HEIGHT / 2 },
          duration: 300,
          ease: "Cubic.In",
          yoyo: false,
          onUpdate: () => {
            this.cameras.main.shake(28, 0.0024);
          },
          onComplete: () => {
            this.rushFace.setAlpha(0).setScale(0.08);
          }
        });
      }

      triggerLoseFace() {
        this.loseFace.setAlpha(1);
        this.rushFace.setAlpha(0);
        this.time.delayedCall(900, () => {
          if (this.phase === "dead") {
            this.tweens.add({
              targets: this.loseFace,
              alpha: 0.18,
              duration: 420
            });
          }
        });
      }

      beginLoop(isFirstLoop = false) {
        this.phase = "walking";
        this.progress = 0;
        this.lookDrift = Phaser.Math.FloatBetween(-0.01, 0.01);
        this.blackoutScarePlayed = false;
        this.loseFace.setAlpha(0);
        this.rushFace.setAlpha(0);
        this.currentAnomaly = this.pickLoopAnomaly(isFirstLoop);
        console.info(
          `[Hallway 13] Loop ${this.currentLoop}: ${this.currentAnomaly === "none" ? "no anomaly" : this.currentAnomaly}`
        );
        this.hallwayHistory.push({
          loop: this.currentLoop,
          anomaly: this.currentAnomaly
        });

        if (!isFirstLoop && this.currentAnomaly !== "none") {
          this.creepySound?.play();
        }

        this.cameras.main.fadeIn(260, 8, 8, 12);
        this.refreshHud(
          this.currentLoop === 1
            ? "Baseline loop. Memorize the hallway. This first pass is clean."
            : "Exactly one thing may be wrong this loop. Find it before you open the door."
        );
      }

      refreshHud(message?: string) {
        this.loopText.setText("Hallway 13");
        this.threatText.setText(`Mistakes ${this.mistakes}/${MAX_MISTAKES}`);

        if (this.phase === "walking") {
          this.phaseText.setText(this.currentAnomaly === "none" ? "The hallway looks familiar." : "Something feels wrong.");
          this.promptText.setText(message ?? "Hold W to move up the hall. Hold S to back up and re-check.");
          this.footerText.setText("One anomaly max per loop   |   W/S move   |   Q = anomaly   |   R = clear hallway   |   E = open door");
          return;
        }

        if (this.phase === "judging") {
          this.phaseText.setText("Did this hallway change?");
          this.promptText.setText(message ?? "Q if something changed. R if the hallway was clean.");
          this.footerText.setText("Trust your eye. Three misses and it gets in.");
          return;
        }

        if (this.phase === "dead") {
          this.phaseText.setText("It found you.");
          this.promptText.setText(message ?? "Press Space to try again.");
          this.footerText.setText("The door was never locked. You just kept choosing wrong.");
          return;
        }
      }

      getPlayerDepth() {
        return this.progress * (HALL_LENGTH - PLAYER_STOP_DISTANCE);
      }

      getDoorDistance() {
        return HALL_LENGTH - this.getPlayerDepth();
      }

      projectRectFromDistance(distance: number) {
        const safeDistance = Math.max(18, distance);
        const scale = CAMERA_FOCAL / (safeDistance + CAMERA_FOCAL);
        const sway = Math.sin(this.time.now * 0.0006) * 10 + this.lookDrift * 140;
        const centerX = GAME_WIDTH / 2 + sway;
        const centerY = GAME_HEIGHT / 2 + 24 + Math.cos(this.time.now * 0.0007) * 4;
        const width = HALL_HALF_WIDTH * 2 * scale;
        const height = HALL_HALF_HEIGHT * 2 * scale;

        return {
          left: centerX - width / 2,
          right: centerX + width / 2,
          top: centerY - height / 2,
          bottom: centerY + height / 2,
          width,
          height,
          centerX,
          centerY
        };
      }

      projectPointAtDistance(distance: number, xRatio: number, yRatio: number) {
        const rect = this.projectRectFromDistance(distance);
        return {
          x: rect.centerX + xRatio * (rect.width / 2),
          y: rect.centerY + yRatio * (rect.height / 2),
          scale: rect.width / (HALL_HALF_WIDTH * 2),
          rect
        };
      }

      getVisibleDistances(worldPositions: number[], frontMargin = 10, backMargin = 24) {
        const playerDepth = this.getPlayerDepth();
        const doorDistance = this.getDoorDistance();

        return worldPositions
          .map((worldPosition) => worldPosition - playerDepth)
          .filter((distance) => distance > frontMargin && distance < doorDistance - backMargin)
          .sort((left, right) => left - right);
      }

      drawFilmGrain() {
        this.graphics.fillStyle(0xffffff, 0.022);
        for (let y = 0; y < GAME_HEIGHT; y += 4) {
          this.graphics.fillRect(0, y, GAME_WIDTH, 1);
        }
        this.graphics.fillStyle(0xffffff, 0.025);
        for (let index = 0; index < 80; index += 1) {
          const x = (index * 113 + Math.floor(this.time.now * 0.12)) % GAME_WIDTH;
          const y = (index * 57 + Math.floor(this.time.now * 0.19)) % GAME_HEIGHT;
          this.graphics.fillRect(x, y, 2, 2);
        }
        this.graphics.fillStyle(0xffffff, 0.018);
        for (let index = 0; index < 5; index += 1) {
          const scratchX = (index * 187 + Math.floor(this.time.now * 0.04)) % GAME_WIDTH;
          this.graphics.fillRect(scratchX, 0, 1, GAME_HEIGHT);
        }
      }

      drawBackground() {
        this.graphics.fillStyle(0x04030a, 1);
        this.graphics.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
        this.graphics.fillGradientStyle(0x140f17, 0x140f17, 0x06070a, 0x06070a, 1);
        this.graphics.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
        this.graphics.fillStyle(0x201620, 0.38);
        this.graphics.fillRect(0, 0, GAME_WIDTH, 98);
        this.graphics.fillStyle(0x050507, 0.74);
        this.graphics.fillRect(0, GAME_HEIGHT - 124, GAME_WIDTH, 124);
        this.graphics.lineStyle(4, 0x000000, 0.55);
        this.graphics.strokeRect(8, 8, GAME_WIDTH - 16, GAME_HEIGHT - 16);
      }

      drawHallway() {
        const slices = this.getVisibleDistances([84, 178, 286, 404, 536, 680, 836, 912], 18, 24);
        let previous = this.projectRectFromDistance(18);

        for (const distance of slices) {
          const current = this.projectRectFromDistance(distance);

          this.graphics.fillStyle(0x232624, 1);
          this.graphics.beginPath();
          this.graphics.moveTo(previous.left, previous.top);
          this.graphics.lineTo(current.left, current.top);
          this.graphics.lineTo(current.left, current.bottom);
          this.graphics.lineTo(previous.left, previous.bottom);
          this.graphics.closePath();
          this.graphics.fillPath();

          this.graphics.fillStyle(0x242020, 1);
          this.graphics.beginPath();
          this.graphics.moveTo(previous.right, previous.top);
          this.graphics.lineTo(current.right, current.top);
          this.graphics.lineTo(current.right, current.bottom);
          this.graphics.lineTo(previous.right, previous.bottom);
          this.graphics.closePath();
          this.graphics.fillPath();

          this.graphics.fillStyle(0x5f4e2c, 1);
          this.graphics.beginPath();
          this.graphics.moveTo(previous.left, previous.bottom);
          this.graphics.lineTo(previous.right, previous.bottom);
          this.graphics.lineTo(current.right, current.bottom);
          this.graphics.lineTo(current.left, current.bottom);
          this.graphics.closePath();
          this.graphics.fillPath();

          this.graphics.fillStyle(0x151318, 1);
          this.graphics.beginPath();
          this.graphics.moveTo(previous.left, previous.top);
          this.graphics.lineTo(previous.right, previous.top);
          this.graphics.lineTo(current.right, current.top);
          this.graphics.lineTo(current.left, current.top);
          this.graphics.closePath();
          this.graphics.fillPath();

          this.graphics.lineStyle(2, 0x000000, 0.28);
          this.graphics.strokeRectShape(
            new Phaser.Geom.Rectangle(current.left, current.top, current.width, current.height)
          );

          this.graphics.lineStyle(1.5, 0x4e3b1f, 0.34);
          this.graphics.strokeLineShape(new Phaser.Geom.Line(current.left, current.bottom - 18, current.right, current.bottom - 18));
          this.graphics.lineStyle(1.5, 0x8b7b55, 0.14);
          this.graphics.strokeLineShape(new Phaser.Geom.Line(current.left + 22, current.top + 18, current.left + 22, current.bottom - 18));
          this.graphics.strokeLineShape(new Phaser.Geom.Line(current.right - 22, current.top + 18, current.right - 22, current.bottom - 18));

          previous = current;
        }

        [118, 252, 404, 572, 748].forEach((worldDistance) => {
          const distance = worldDistance - this.getPlayerDepth();
          if (distance <= 18 || distance >= this.getDoorDistance() - 38) {
            return;
          }
          const point = this.projectPointAtDistance(distance, 0, 0.83);
          const width = 148 * point.scale;
          const height = 16 * point.scale;
          this.graphics.fillStyle(0x6f5b33, 0.46);
          this.graphics.fillRoundedRect(point.x - width / 2, point.y - height / 2, width, height, 3);
          this.graphics.lineStyle(1, 0xa78b54, 0.14);
          this.graphics.strokeRoundedRect(point.x - width / 2, point.y - height / 2, width, height, 3);
        });

        if (this.currentAnomaly === "runner-symbol") {
          const distance = 466 - this.getPlayerDepth();
          if (distance > 20 && distance < this.getDoorDistance() - 50) {
            const point = this.projectPointAtDistance(distance, 0, 0.8);
            const radius = 20 * point.scale;
            this.graphics.lineStyle(Math.max(1, 2 * point.scale), 0xc1121f, 0.75);
            this.graphics.strokeCircle(point.x, point.y, radius);
            this.graphics.strokeLineShape(new Phaser.Geom.Line(point.x - radius * 0.6, point.y, point.x + radius * 0.6, point.y));
            this.graphics.strokeLineShape(new Phaser.Geom.Line(point.x, point.y - radius * 0.6, point.x, point.y + radius * 0.6));
          }
        }
      }

      drawDoor() {
        const doorDistance = this.getDoorDistance();
        const doorRect = this.projectRectFromDistance(doorDistance);
        const wallRect = this.projectRectFromDistance(doorDistance + 24);
        const doorWidth = doorRect.width * 0.24;
        const doorHeight = doorRect.height * 0.58;
        const doorX = doorRect.centerX - doorWidth / 2;
        const doorY = doorRect.bottom - doorHeight;
        const reachedDoor = this.progress >= 0.97;

        this.graphics.fillStyle(0x2b2624, 1);
        this.graphics.fillRect(wallRect.left, wallRect.top, wallRect.width, wallRect.height);
        this.graphics.fillStyle(0x1d1a18, 0.85);
        this.graphics.fillRect(wallRect.left, wallRect.bottom - wallRect.height * 0.16, wallRect.width, wallRect.height * 0.16);
        this.graphics.lineStyle(2, 0x5c4e34, 0.32);
        this.graphics.strokeRect(wallRect.left, wallRect.top, wallRect.width, wallRect.height);

        const frameOuterX = doorX - 18;
        const frameOuterY = doorY - 18;
        const frameOuterWidth = doorWidth + 36;
        const frameOuterHeight = doorHeight + 30;
        this.graphics.fillStyle(0xcbb489, 0.98);
        this.graphics.fillRect(frameOuterX, frameOuterY, frameOuterWidth, frameOuterHeight);
        this.graphics.fillStyle(0x9d7d49, 0.55);
        this.graphics.fillRect(frameOuterX + 8, frameOuterY + 8, frameOuterWidth - 16, frameOuterHeight - 16);

        this.graphics.fillStyle(0xeee4c1, 1);
        this.graphics.fillRect(doorX, doorY, doorWidth, doorHeight);
        if (this.currentAnomaly === "door-glow") {
          const pulse = 0.72 + Math.sin(this.time.now * 0.012) * 0.18;
          this.graphics.fillStyle(0x9dd6ff, 0.16 * pulse);
          this.graphics.fillRoundedRect(doorX - 12, doorY - 12, doorWidth + 24, doorHeight + 24, 8);
          this.graphics.fillStyle(0xb9e6ff, 0.32 * pulse);
          this.graphics.fillRect(doorX + 4, doorY + doorHeight - 10, doorWidth - 8, 10);
          this.graphics.fillStyle(0xb9e6ff, 0.2 * pulse);
          this.graphics.fillRect(doorX + 3, doorY + 5, 8, doorHeight - 10);
          this.graphics.fillRect(doorX + doorWidth - 11, doorY + 5, 8, doorHeight - 10);
          this.graphics.fillStyle(0x9dd6ff, 0.18 * pulse);
          this.graphics.fillEllipse(doorRect.centerX, doorY + doorHeight + 8, doorWidth * 1.28, doorHeight * 0.16);
          this.graphics.fillStyle(0x9dd6ff, 0.1 * pulse);
          this.graphics.fillEllipse(doorRect.centerX, doorY + doorHeight + 16, doorWidth * 1.7, doorHeight * 0.24);
        }
        this.graphics.fillStyle(0xddcf9c, 0.65);
        this.graphics.fillRect(doorX + doorWidth * 0.18, doorY + 12, doorWidth * 0.05, doorHeight - 24);
        this.graphics.fillRect(doorX + doorWidth * 0.77, doorY + 12, doorWidth * 0.05, doorHeight - 24);
        this.graphics.fillStyle(0xffffff, 0.1);
        this.graphics.fillRect(doorX + 8, doorY + 8, doorWidth * 0.18, doorHeight - 16);
        this.graphics.lineStyle(3, 0xb39b6b, 0.85);
        this.graphics.strokeRect(doorX, doorY, doorWidth, doorHeight);

        const plaqueWidth = doorWidth * 0.26;
        const plaqueHeight = doorHeight * 0.12;
        const plaqueX = doorRect.centerX - plaqueWidth / 2;
        const plaqueY = doorY - plaqueHeight - 12;
        if (this.currentAnomaly !== "missing-plaque") {
          if (this.currentAnomaly === "tilted-plaque") {
            this.graphics.fillStyle(0x18181b, 0.92);
            this.graphics.beginPath();
            this.graphics.moveTo(plaqueX, plaqueY + 2);
            this.graphics.lineTo(plaqueX + plaqueWidth, plaqueY - 2);
            this.graphics.lineTo(plaqueX + plaqueWidth, plaqueY + plaqueHeight - 4);
            this.graphics.lineTo(plaqueX, plaqueY + plaqueHeight + 4);
            this.graphics.closePath();
            this.graphics.fillPath();
            this.graphics.lineStyle(2, 0xcbd5e1, 0.38);
            this.graphics.beginPath();
            this.graphics.moveTo(plaqueX, plaqueY + 2);
            this.graphics.lineTo(plaqueX + plaqueWidth, plaqueY - 2);
            this.graphics.lineTo(plaqueX + plaqueWidth, plaqueY + plaqueHeight - 4);
            this.graphics.lineTo(plaqueX, plaqueY + plaqueHeight + 4);
            this.graphics.closePath();
            this.graphics.strokePath();
          } else {
            this.graphics.fillStyle(0x18181b, 0.9);
            this.graphics.fillRoundedRect(plaqueX, plaqueY, plaqueWidth, plaqueHeight, 4);
            this.graphics.lineStyle(2, 0xcbd5e1, 0.38);
            this.graphics.strokeRoundedRect(plaqueX, plaqueY, plaqueWidth, plaqueHeight, 4);
          }
          this.plaqueShadowText
            .setText(this.currentAnomaly === "door-number" ? "14" : "13")
            .setPosition(doorRect.centerX + 1, plaqueY + plaqueHeight / 2 + 1)
            .setFontSize(`${Math.max(10, Math.round(16 + (CAMERA_FOCAL / (doorDistance + CAMERA_FOCAL)) * 18))}px`)
            .setVisible(true);
          this.plaqueText
            .setText(this.currentAnomaly === "door-number" ? "14" : "13")
            .setPosition(doorRect.centerX, plaqueY + plaqueHeight / 2)
            .setFontSize(`${Math.max(10, Math.round(16 + (CAMERA_FOCAL / (doorDistance + CAMERA_FOCAL)) * 18))}px`)
            .setVisible(true);
        }

        const knobX = this.currentAnomaly === "knob-left" ? doorX + 18 : doorX + doorWidth - 18;
        const knobY = doorY + doorHeight / 2;
        if (this.currentAnomaly !== "missing-knob") {
          this.graphics.fillStyle(0x7c5f35, 1);
          this.graphics.fillCircle(knobX, knobY, 4 + doorRect.width * 0.008);
        }

        if (this.currentAnomaly === "door-scratches") {
          this.graphics.lineStyle(Math.max(1, 2 * doorRect.width / 180), 0x4a1d1d, 0.78);
          this.graphics.strokeLineShape(new Phaser.Geom.Line(doorX + doorWidth * 0.58, doorY + doorHeight * 0.24, doorX + doorWidth * 0.46, doorY + doorHeight * 0.58));
          this.graphics.strokeLineShape(new Phaser.Geom.Line(doorX + doorWidth * 0.64, doorY + doorHeight * 0.26, doorX + doorWidth * 0.52, doorY + doorHeight * 0.62));
          this.graphics.strokeLineShape(new Phaser.Geom.Line(doorX + doorWidth * 0.7, doorY + doorHeight * 0.22, doorX + doorWidth * 0.58, doorY + doorHeight * 0.56));
        }

        if (this.currentAnomaly === "door-eye") {
          const eyeY = doorY + doorHeight * 0.34;
          this.graphics.fillStyle(0x09090b, 0.95);
          this.graphics.fillEllipse(doorRect.centerX, eyeY, doorWidth * 0.28, doorHeight * 0.1);
          this.graphics.fillStyle(0xcbd5e1, 1);
          this.graphics.fillCircle(doorRect.centerX, eyeY, doorWidth * 0.07);
          this.graphics.fillStyle(0x1d4ed8, 1);
          this.graphics.fillCircle(doorRect.centerX + Math.sin(this.time.now * 0.005) * 3, eyeY, doorWidth * 0.03);
        }

        if (reachedDoor) {
          this.graphics.lineStyle(3, 0xffffff, 0.18);
          this.graphics.strokeRect(doorX - 16, doorY - 16, doorWidth + 32, doorHeight + 26);
        }
      }

      drawLights() {
        const drawFixture = (distance: number, index: number, options: { lowered?: boolean } = {}) => {
          if (distance <= 20 || distance >= this.getDoorDistance() - 72) {
            return;
          }

          const nearRect = this.projectRectFromDistance(Math.max(22, distance - 20));
          const farRect = this.projectRectFromDistance(distance + 20);
          const dropRatio = options.lowered ? 0.18 : 0.08;
          const nearY = nearRect.top + nearRect.height * dropRatio;
          const farY = farRect.top + farRect.height * dropRatio;
          const nearHalfWidth = Math.max(12, nearRect.width * 0.07);
          const farHalfWidth = Math.max(7, farRect.width * 0.07);
          const isRed = this.currentAnomaly === "red-light" && index === 2;
          const isCold = this.currentAnomaly === "cold-light" && index === 1;
          const isFlicker = this.currentAnomaly === "flicker-light" && index === 4;
          const baseColor = isRed ? 0xdb2777 : isCold ? 0x93c5fd : 0xf8f3c9;
          const flicker = isFlicker
            ? Phaser.Math.Clamp(0.28 + Math.sin(this.time.now * 0.06) * 0.42, 0.06, 0.85)
            : isRed
              ? 0.56 + Math.sin(this.time.now * 0.02) * 0.22
              : 0.82;
          const glowCenterX = (nearRect.centerX + farRect.centerX) / 2;
          const glowCenterY = (nearY + farY) / 2;

          this.graphics.fillStyle(baseColor, 0.06 + flicker * 0.12);
          this.graphics.fillEllipse(glowCenterX, glowCenterY + 12, nearHalfWidth * 2.4, 24 * nearRect.width / (HALL_HALF_WIDTH * 2));

          this.graphics.fillStyle(baseColor, flicker);
          this.graphics.beginPath();
          this.graphics.moveTo(nearRect.centerX - nearHalfWidth, nearY);
          this.graphics.lineTo(farRect.centerX - farHalfWidth, farY);
          this.graphics.lineTo(farRect.centerX + farHalfWidth, farY);
          this.graphics.lineTo(nearRect.centerX + nearHalfWidth, nearY);
          this.graphics.closePath();
          this.graphics.fillPath();

          this.graphics.lineStyle(2, 0x3f3f46, 0.45);
          this.graphics.beginPath();
          this.graphics.moveTo(nearRect.centerX - nearHalfWidth, nearY);
          this.graphics.lineTo(farRect.centerX - farHalfWidth, farY);
          this.graphics.lineTo(farRect.centerX + farHalfWidth, farY);
          this.graphics.lineTo(nearRect.centerX + nearHalfWidth, nearY);
          this.graphics.closePath();
          this.graphics.strokePath();

          const stemHeight = options.lowered ? 18 : 12;
          this.graphics.fillStyle(0x3f3f46, 0.38);
          this.graphics.fillRect(
            nearRect.centerX - 5,
            nearY - stemHeight * nearRect.width / (HALL_HALF_WIDTH * 2),
            10,
            7
          );
        };

        LIGHT_WORLD_DISTANCES.forEach((worldDistance, index) => {
          if (this.currentAnomaly === "missing-light" && index === 2) {
            return;
          }

          drawFixture(worldDistance - this.getPlayerDepth(), index, {
            lowered: this.currentAnomaly === "low-light" && index === 3
          });
        });

        if (this.currentAnomaly === "extra-light") {
          drawFixture(486 - this.getPlayerDepth(), 99);
        }
      }

      drawFrame(
        distance: number,
        side: "left" | "right",
        hasPortrait: boolean,
        palette: { head: number; body: number } = { head: 0x7f1d1d, body: 0xe2e8f0 },
        options: { upsideDown?: boolean; crookedOffset?: number; eye?: boolean; bleed?: boolean } = {}
      ) {
        const nearRect = this.projectRectFromDistance(Math.max(18, distance - 22));
        const farRect = this.projectRectFromDistance(distance + 22);
        const nearInset = Math.max(6, nearRect.width * 0.022);
        const farInset = Math.max(4, farRect.width * 0.022);
        const tilt = options.crookedOffset ?? 0;
        const nearX = side === "left" ? nearRect.left + nearInset : nearRect.right - nearInset;
        const farX = side === "left" ? farRect.left + farInset : farRect.right - farInset;
        const nearTop = nearRect.centerY - nearRect.height * 0.13 + tilt;
        const nearBottom = nearRect.centerY + nearRect.height * 0.19 + tilt * 0.28;
        const farTop = farRect.centerY - farRect.height * 0.13 + tilt * 0.42;
        const farBottom = farRect.centerY + farRect.height * 0.19 + tilt * 0.18;
        const innerNearX = nearX + (side === "left" ? 10 : -10);
        const innerFarX = farX + (side === "left" ? 7 : -7);
        const innerNearTop = nearTop + 10;
        const innerNearBottom = nearBottom - 10;
        const innerFarTop = farTop + 8;
        const innerFarBottom = farBottom - 8;

        this.graphics.fillStyle(0x1c1917, 0.95);
        this.graphics.beginPath();
        this.graphics.moveTo(nearX, nearTop);
        this.graphics.lineTo(farX, farTop);
        this.graphics.lineTo(farX, farBottom);
        this.graphics.lineTo(nearX, nearBottom);
        this.graphics.closePath();
        this.graphics.fillPath();

        this.graphics.lineStyle(3, 0xd6c08d, 0.9);
        this.graphics.beginPath();
        this.graphics.moveTo(nearX, nearTop);
        this.graphics.lineTo(farX, farTop);
        this.graphics.lineTo(farX, farBottom);
        this.graphics.lineTo(nearX, nearBottom);
        this.graphics.closePath();
        this.graphics.strokePath();

        if (hasPortrait) {
          this.graphics.fillStyle(0x2a241d, 0.98);
          this.graphics.beginPath();
          this.graphics.moveTo(innerNearX, innerNearTop);
          this.graphics.lineTo(innerFarX, innerFarTop);
          this.graphics.lineTo(innerFarX, innerFarBottom);
          this.graphics.lineTo(innerNearX, innerNearBottom);
          this.graphics.closePath();
          this.graphics.fillPath();

          const scale = nearRect.width / (HALL_HALF_WIDTH * 2);
          const portraitCenterX = Phaser.Math.Linear(innerNearX, innerFarX, 0.5);
          const portraitTop = Phaser.Math.Linear(innerNearTop, innerFarTop, 0.4);
          const portraitBottom = Phaser.Math.Linear(innerNearBottom, innerFarBottom, 0.64);
          const frameSpan = Math.abs(innerNearX - innerFarX);
          const portraitWidth = Math.max(5, frameSpan * 0.14);
          const portraitHeight = Math.max(8, (portraitBottom - portraitTop) * 0.34);
          const portraitX = portraitCenterX - portraitWidth / 2;
          const portraitY = options.upsideDown ? portraitBottom - portraitHeight : portraitTop;
          const headX = portraitCenterX;
          const headY = options.upsideDown
            ? portraitY + portraitHeight * 0.72
            : portraitY + portraitHeight * 0.28;
          const bodyY = options.upsideDown
            ? portraitY + portraitHeight * 0.08
            : portraitY + portraitHeight * 0.42;

          this.graphics.fillStyle(0x4a4234, 0.92);
          this.graphics.fillRect(portraitX, portraitY, portraitWidth, portraitHeight);
          this.graphics.fillStyle(0x6f6654, 0.35);
          this.graphics.fillRect(portraitX + 1, portraitY + 1, Math.max(2, portraitWidth * 0.28), Math.max(4, portraitHeight - 2));
          this.graphics.fillStyle(palette.head, 0.88);
          this.graphics.fillCircle(headX, headY, Math.max(2, 3.1 * scale));
          this.graphics.fillStyle(palette.body, 0.9);
          this.graphics.fillRect(
            portraitCenterX - portraitWidth * 0.14,
            bodyY,
            portraitWidth * 0.28,
            portraitHeight * 0.22
          );

          if (options.eye) {
            const eyeY = portraitY + portraitHeight * 0.34;
            this.graphics.fillStyle(0x09090b, 0.92);
            this.graphics.fillEllipse(portraitCenterX, eyeY, portraitWidth * 1.6, portraitHeight * 0.78);
            this.graphics.fillStyle(0xf8fafc, 0.95);
            this.graphics.fillCircle(portraitCenterX, eyeY, Math.max(2, 3.8 * scale));
            this.graphics.fillStyle(0x0f172a, 0.95);
            this.graphics.fillCircle(portraitCenterX, eyeY, Math.max(1, 1.8 * scale));
          }

          if (options.bleed) {
            this.graphics.lineStyle(Math.max(1, 1.4 * scale), 0x991b1b, 0.76);
            this.graphics.strokeLineShape(
              new Phaser.Geom.Line(
                portraitCenterX,
                portraitY + portraitHeight * 0.78,
                portraitCenterX,
                innerNearBottom - 2
              )
            );
          }
        }
      }

      drawVent(distance: number, side: "left" | "right", open = false) {
        const nearRect = this.projectRectFromDistance(Math.max(18, distance - 18));
        const farRect = this.projectRectFromDistance(distance + 18);
        const nearX = side === "left" ? nearRect.left + nearRect.width * 0.08 : nearRect.right - nearRect.width * 0.08;
        const farX = side === "left" ? farRect.left + farRect.width * 0.08 : farRect.right - farRect.width * 0.08;
        const nearTop = nearRect.top + nearRect.height * 0.14;
        const nearBottom = nearRect.top + nearRect.height * 0.24;
        const farTop = farRect.top + farRect.height * 0.14;
        const farBottom = farRect.top + farRect.height * 0.24;

        this.graphics.fillStyle(open ? 0x09090b : 0x4b5563, 0.92);
        this.graphics.beginPath();
        this.graphics.moveTo(nearX, nearTop);
        this.graphics.lineTo(farX, farTop);
        this.graphics.lineTo(farX, farBottom);
        this.graphics.lineTo(nearX, nearBottom);
        this.graphics.closePath();
        this.graphics.fillPath();

        this.graphics.lineStyle(2, 0x94a3b8, 0.3);
        this.graphics.beginPath();
        this.graphics.moveTo(nearX, nearTop);
        this.graphics.lineTo(farX, farTop);
        this.graphics.lineTo(farX, farBottom);
        this.graphics.lineTo(nearX, nearBottom);
        this.graphics.closePath();
        this.graphics.strokePath();

        if (!open) {
          const slatCount = 3;
          for (let index = 1; index <= slatCount; index += 1) {
            const t = index / (slatCount + 1);
            const y1 = Phaser.Math.Linear(nearTop, nearBottom, t);
            const y2 = Phaser.Math.Linear(farTop, farBottom, t);
            this.graphics.lineStyle(1, 0x1f2937, 0.55);
            this.graphics.strokeLineShape(new Phaser.Geom.Line(nearX, y1, farX, y2));
          }
        } else {
          const centerX = (nearX + farX) / 2;
          const centerY = (nearTop + nearBottom + farTop + farBottom) / 4;
          const scale = nearRect.width / (HALL_HALF_WIDTH * 2);
          this.graphics.fillStyle(0xf8fafc, 0.88);
          this.graphics.fillCircle(centerX - 5 * scale, centerY, Math.max(1.8, 2.6 * scale));
          this.graphics.fillCircle(centerX + 5 * scale, centerY, Math.max(1.8, 2.6 * scale));
          this.graphics.fillStyle(0x09090b, 0.95);
          this.graphics.fillCircle(centerX - 5 * scale, centerY, Math.max(0.8, 1.3 * scale));
          this.graphics.fillCircle(centerX + 5 * scale, centerY, Math.max(0.8, 1.3 * scale));
        }
      }

      drawDecor() {
        this.decorText.setVisible(false);
        this.decorShadowText.setVisible(false);

        LEFT_FRAME_WORLD_DISTANCES.forEach((worldDistance, index) => {
          const distance = worldDistance - this.getPlayerDepth();
          if (distance <= 10 || distance >= this.getDoorDistance() - 26) {
            return;
          }
          const hasPortrait = !(this.currentAnomaly === "left-portrait" && index === 1);
          const palette =
            this.currentAnomaly === "painting-color-shift" && index === 1
              ? { head: 0x0ea5e9, body: 0xfef08a }
              : { head: 0x7f1d1d, body: 0xe2e8f0 };
          this.drawFrame(distance, "left", hasPortrait, palette, {
            upsideDown: this.currentAnomaly === "upside-down-left" && index === 2,
            crookedOffset:
              this.currentAnomaly === "crooked-frame-left" && index === 1
                ? 10 * Math.max(0.5, distance / HALL_LENGTH)
                : 0
            ,
            eye: this.currentAnomaly === "eye-in-painting" && index === 0,
            bleed: this.currentAnomaly === "portrait-bleed" && index === 1
          });
        });
        RIGHT_FRAME_WORLD_DISTANCES.forEach((worldDistance, index) => {
          const distance = worldDistance - this.getPlayerDepth();
          if (distance <= 10 || distance >= this.getDoorDistance() - 26) {
            return;
          }
          const palette =
            this.currentAnomaly === "painting-color-shift" && index === 1
              ? { head: 0x38bdf8, body: 0xf0abfc }
              : { head: 0x7f1d1d, body: 0xe2e8f0 };
          this.drawFrame(distance, "right", true, palette, {
            upsideDown: this.currentAnomaly === "upside-down-right" && index === 0
          });
        });

        LEFT_VENT_WORLD_DISTANCES.forEach((worldDistance, index) => {
          const distance = worldDistance - this.getPlayerDepth();
          if (distance <= 12 || distance >= this.getDoorDistance() - 54) {
            return;
          }
          if (this.currentAnomaly === "vent-missing-left" && index === 0) {
            return;
          }
          if (this.currentAnomaly === "vent-open-right") {
            return;
          }
          this.drawVent(distance, "left");
        });

        if (this.currentAnomaly === "vent-open-right") {
          const distance = LEFT_VENT_WORLD_DISTANCES[0] - this.getPlayerDepth();
          if (distance > 12 && distance < this.getDoorDistance() - 54) {
            this.drawVent(distance, "right", true);
          }
        }

        if (this.currentAnomaly === "extra-frame-left") {
          const portraitDistance = 346 - this.getPlayerDepth();
          if (portraitDistance > 10 && portraitDistance < this.getDoorDistance() - 26) {
            this.drawFrame(portraitDistance, "left", true);
          }
        }

        if (this.currentAnomaly === "extra-frame-right") {
          const portraitDistance = 494 - this.getPlayerDepth();
          if (portraitDistance > 10 && portraitDistance < this.getDoorDistance() - 26) {
            this.drawFrame(portraitDistance, "right", true);
          }
        }

        if (this.currentAnomaly === "blood-text") {
          const textDistance = 612 - this.getPlayerDepth();
          if (textDistance > 20 && textDistance < this.getDoorDistance() - 52) {
            const point = this.projectPointAtDistance(textDistance, 0, 0.06);
            const fontSize = `${Math.max(12, Math.round(18 * point.scale))}px`;
            this.decorShadowText
              .setText("TURN AROUND")
              .setPosition(point.x + 2, point.y + 2)
              .setFontSize(fontSize)
              .setVisible(true);
            this.decorText
              .setText("TURN AROUND")
              .setPosition(point.x, point.y)
              .setFontSize(fontSize)
              .setVisible(true);
          }
        }

        if (this.currentAnomaly === "floor-stain") {
          const stainDistance = 266 - this.getPlayerDepth();
          if (stainDistance > 8 && stainDistance < this.getDoorDistance() - 34) {
            const point = this.projectPointAtDistance(stainDistance, -0.24, 0.78);
            this.graphics.fillStyle(0x0f172a, 0.28);
            this.graphics.fillEllipse(point.x, point.y, 108 * point.scale, 56 * point.scale);
            this.graphics.fillStyle(0x7f1d1d, 0.45);
            this.graphics.fillEllipse(point.x + 10 * point.scale, point.y - 4 * point.scale, 82 * point.scale, 38 * point.scale);
          }
        }

        if (this.currentAnomaly === "wall-crack-left" || this.currentAnomaly === "wall-crack-right") {
          const crackDistance = 418 - this.getPlayerDepth();
          if (crackDistance > 20 && crackDistance < this.getDoorDistance() - 80) {
            const side = this.currentAnomaly === "wall-crack-left" ? "left" : "right";
            const anchor = this.projectPointAtDistance(
              crackDistance,
              side === "left" ? -0.9 : 0.9,
              0.04
            );
            const direction = side === "left" ? 1 : -1;
            const scale = Math.max(0.45, anchor.scale);
            const startX = anchor.x;
            const startY = anchor.y;
            const crackPoints = [
              [startX, startY],
              [startX + direction * 12 * scale, startY + 10 * scale],
              [startX + direction * 4 * scale, startY + 22 * scale],
              [startX + direction * 16 * scale, startY + 34 * scale],
              [startX + direction * 7 * scale, startY + 48 * scale]
            ];

            this.graphics.lineStyle(Math.max(1, 2 * scale), 0x09090b, 0.9);
            for (let index = 0; index < crackPoints.length - 1; index += 1) {
              const [x1, y1] = crackPoints[index];
              const [x2, y2] = crackPoints[index + 1];
              this.graphics.strokeLineShape(new Phaser.Geom.Line(x1, y1, x2, y2));
            }

            this.graphics.lineStyle(Math.max(1, 1.2 * scale), 0x3f1d1d, 0.45);
            this.graphics.strokeLineShape(
              new Phaser.Geom.Line(
                startX + direction * 8 * scale,
                startY + 20 * scale,
                startX + direction * 22 * scale,
                startY + 16 * scale
              )
            );
            this.graphics.strokeLineShape(
              new Phaser.Geom.Line(
                startX + direction * 10 * scale,
                startY + 38 * scale,
                startX + direction * 24 * scale,
                startY + 46 * scale
              )
            );
          }
        }

        PANEL_WORLD_DISTANCES.forEach((worldDistance) => {
          const distance = worldDistance - this.getPlayerDepth();
          if (distance <= 10 || distance >= this.getDoorDistance() - 28) {
            return;
          }

          const left = this.projectPointAtDistance(distance, -0.95, 0.56);
          const right = this.projectPointAtDistance(distance, 0.95, 0.56);
          this.graphics.lineStyle(2, 0x8b6e3f, 0.22);
          this.graphics.strokeLineShape(new Phaser.Geom.Line(left.x, left.y, left.x + 22 * left.scale, left.y));
          this.graphics.strokeLineShape(new Phaser.Geom.Line(right.x, right.y, right.x - 22 * right.scale, right.y));
        });

        if (this.mistakes > 0) {
          const pressure = this.mistakes / MAX_MISTAKES;
          const smearDistance = Phaser.Math.Linear(680, 470, pressure);
          const leftSmear = this.projectPointAtDistance(smearDistance, -0.92, 0.12);
          const rightSmear = this.projectPointAtDistance(smearDistance - 84, 0.92, 0.08);
          this.graphics.fillStyle(0x000000, 0.08 + pressure * 0.12);
          this.graphics.fillEllipse(leftSmear.x, leftSmear.y, 52 * leftSmear.scale, 126 * leftSmear.scale);
          this.graphics.fillEllipse(rightSmear.x, rightSmear.y, 42 * rightSmear.scale, 108 * rightSmear.scale);
        }
      }

      drawHudEffects() {
        const nearDoor = Phaser.Math.Clamp((this.progress - 0.78) / 0.22, 0, 1);
        this.vignette.setFillStyle(0x000000, 0.16 + nearDoor * 0.16 + this.mistakes * 0.04);
        let overlayAlpha = this.phase === "dead" ? 0.22 : 0;

        if (this.currentAnomaly === "blackout-scare" && this.phase === "walking") {
          const scareWindow = Phaser.Math.Clamp((this.progress - 0.76) / 0.18, 0, 1);
          if (scareWindow > 0) {
            overlayAlpha = Math.max(
              overlayAlpha,
              Phaser.Math.Clamp(0.42 + scareWindow * 0.5 + Math.sin(this.time.now * 0.11) * 0.2, 0, 0.98)
            );
          }
        }

        this.fadeOverlay.setAlpha(overlayAlpha);
      }

      handleWalking(deltaSeconds: number) {
        const forwardHeld = this.keys.forward.isDown || this.keys.up.isDown;
        const backwardHeld = this.keys.backward.isDown;
        if (forwardHeld && !backwardHeld) {
          this.progress = Phaser.Math.Clamp(this.progress + deltaSeconds * 0.32, 0, 1);
        } else if (backwardHeld && !forwardHeld) {
          this.progress = Phaser.Math.Clamp(this.progress - deltaSeconds * 0.24, 0, 1);
        } else {
          this.progress = Phaser.Math.Clamp(this.progress - deltaSeconds * 0.03, 0, 1);
        }

        if (this.currentAnomaly === "blackout-scare" && !this.blackoutScarePlayed && this.progress >= 0.84) {
          this.creepySound?.play();
          this.jumpscareSound?.play();
          this.cameras.main.flash(90, 255, 255, 255);
          this.cameras.main.shake(260, 0.012);
          this.triggerRushFace();
          this.blackoutScarePlayed = true;
        }

        if (this.progress >= 1 && Phaser.Input.Keyboard.JustDown(this.keys.open)) {
          this.phase = "judging";
          this.refreshHud("The next door is open. Decide what you saw before stepping through.");
        } else if (this.progress >= 0.95) {
          this.refreshHud("You're at the door. Press E and make your call.");
        } else if (this.progress <= 0.12 && backwardHeld) {
          this.refreshHud("Back at the start. Walk forward when you're ready to check again.");
        }
      }

      resolveGuess(sawAnomaly: boolean) {
        const anomalyPresent = this.currentAnomaly !== "none";
        const wasCorrect = sawAnomaly === anomalyPresent;
        let updatedMistakeLog = this.mistakeLog;

        if (!wasCorrect) {
          updatedMistakeLog = [
            ...this.mistakeLog,
            {
              loop: this.currentLoop,
              anomaly: this.currentAnomaly,
              guessedAnomaly: sawAnomaly
            }
          ];
          this.mistakeLog = updatedMistakeLog;
          this.mistakes += 1;
          this.cameras.main.shake(220, 0.0028);
        }

        if (this.mistakes >= MAX_MISTAKES) {
          this.phase = "dead";
          this.loseJumpscareSound?.play();
          this.cameras.main.flash(220, 255, 255, 255);
          this.triggerLoseFace();
          handleRunOver(Math.max(0, this.currentLoop - 1), updatedMistakeLog);
          this.refreshHud(wasCorrect ? "You were too late." : "Wrong again. It was waiting at the door.");
          return;
        }

        this.currentLoop += 1;
        this.beginLoop();
      }

      restartRun() {
        this.currentLoop = 1;
        this.mistakes = 0;
        this.hallwayHistory = [];
        this.mistakeLog = [];
        this.lastNonNoneAnomaly = "none";
        this.phase = "walking";
        setMistakeReport(null);
        setStatus("Endless corridor. Three mistakes and it gets you.");
        this.beginLoop(true);
      }

      update(_time: number, delta: number) {
        this.graphics.clear();
        this.plaqueText.setVisible(false);
        this.plaqueShadowText.setVisible(false);
        this.drawBackground();
        this.drawHallway();
        this.drawLights();
        this.drawDoor();
        this.drawDecor();
        this.drawHudEffects();
        this.drawFilmGrain();

        const deltaSeconds = delta / 1000;

        if (this.phase === "walking") {
          this.handleWalking(deltaSeconds);
        } else if (this.phase === "judging") {
          if (Phaser.Input.Keyboard.JustDown(this.keys.anomaly)) {
            this.resolveGuess(true);
          }
          if (Phaser.Input.Keyboard.JustDown(this.keys.clear)) {
            this.resolveGuess(false);
          }
        } else if (this.phase === "dead" && Phaser.Input.Keyboard.JustDown(this.keys.restart)) {
          this.restartRun();
        }
      }
    }

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      width: GAME_WIDTH,
      height: GAME_HEIGHT,
      parent: containerRef.current,
      backgroundColor: "#04030a",
      scene: HallwayScene
    });

    gameRef.current = game;

    return () => {
      game.destroy(true);
      gameRef.current = null;
    };
  }, [assetBase]);

  return (
    <div className="page">
      <NavBar />
      <div
        className="content card"
        style={{
          maxWidth: 1040,
          background:
            "radial-gradient(circle at top, rgba(120, 28, 28, 0.18), transparent 32%), linear-gradient(180deg, rgba(12, 10, 14, 0.98), rgba(6, 5, 8, 0.98))",
          color: "#f8fafc",
          border: "1px solid rgba(148, 163, 184, 0.16)",
          boxShadow: "0 24px 70px rgba(0, 0, 0, 0.42)"
        }}
      >
        <div style={{ display: "grid", gap: "0.35rem", marginBottom: "0.9rem" }}>
          <span style={{ color: "#fca5a5", fontSize: "0.82rem", letterSpacing: "0.2em", textTransform: "uppercase" }}>
            Arcade Experiment
          </span>
          <h2 style={{ margin: 0, color: "#fff7ed" }}>Hallway 13</h2>
          <p style={{ margin: 0, color: "#cbd5e1", maxWidth: 760 }}>
            Walk the corridor, inspect the details, and decide whether the loop changed before the thing in the walls reaches the door with you.
          </p>
        </div>
        <div
          style={{
            display: "flex",
            gap: "0.6rem",
            flexWrap: "wrap",
            marginBottom: "0.9rem"
          }}
        >
          {["W / Up forward", "S back up", "E open door", "Q anomaly", "R clear hallway"].map((label) => (
            <span
              key={label}
              style={{
                padding: "0.42rem 0.72rem",
                borderRadius: 999,
                background: "rgba(15, 23, 42, 0.48)",
                border: "1px solid rgba(248, 250, 252, 0.12)",
                color: "#e2e8f0",
                fontSize: "0.92rem"
              }}
            >
              {label}
            </span>
          ))}
        </div>
        <div
          style={{
            width: "100%",
            maxWidth: GAME_WIDTH,
            margin: "0 auto",
            padding: 12,
            borderRadius: 24,
            background: "linear-gradient(180deg, rgba(20, 20, 26, 0.9), rgba(5, 5, 8, 0.96))",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.03), 0 18px 40px rgba(0,0,0,0.38)"
          }}
        >
          <div ref={containerRef} style={{ width: "100%", maxWidth: GAME_WIDTH, margin: "0 auto", borderRadius: 16, overflow: "hidden" }} />
        </div>
        <p className="score-display">
          {lastRun !== null ? `Last hallway run: ${lastRun}` : "Survive as many loops as you can."}
        </p>
        <p className="info">{status}</p>
        {mistakeReport?.length ? (
          <div
            style={{
              marginTop: "1rem",
              padding: "1rem",
              borderRadius: 18,
              background: "linear-gradient(180deg, rgba(18, 12, 16, 0.96), rgba(8, 6, 9, 0.98))",
              border: "1px solid rgba(248, 250, 252, 0.08)",
              boxShadow: "0 16px 40px rgba(0,0,0,0.32)"
            }}
          >
            <h3 style={{ margin: "0 0 0.45rem", color: "#fff7ed" }}>Where It Got You</h3>
            <p style={{ margin: "0 0 0.75rem", color: "#cbd5e1" }}>
              Your last run ended after {lastRun ?? 0} completed loops. These were the calls that cost you.
            </p>
            <div style={{ display: "grid", gap: "0.55rem" }}>
              {mistakeReport.map((mistake, index) => (
                <div
                  key={`${mistake.loop}-${mistake.anomaly}-${index}`}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "1rem",
                    alignItems: "center",
                    padding: "0.7rem 0.8rem",
                    borderRadius: 14,
                    background: "rgba(15, 23, 42, 0.34)",
                    border: "1px solid rgba(248,250,252,0.06)"
                  }}
                >
                  <strong style={{ color: "#fef2f2" }}>Loop {mistake.loop}</strong>
                  <span style={{ color: "#fca5a5" }}>
                    You guessed {mistake.guessedAnomaly ? "anomaly" : "clear"}
                  </span>
                  <span style={{ color: "#e2e8f0" }}>
                    Actual: {formatAnomalyLabel(mistake.anomaly)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default Hallway13;
