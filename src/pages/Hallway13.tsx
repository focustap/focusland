import React, { useEffect, useRef } from "react";
import NavBar from "../components/NavBar";
import Phaser from "phaser";

type Phase = "walking" | "judging" | "dead" | "won";

type AnomalyId =
  | "none"
  | "red-light"
  | "missing-light"
  | "door-number"
  | "trim-break"
  | "left-portrait"
  | "blood-text"
  | "door-eye"
  | "shadow-figure"
  | "floor-stain";

type HallSnapshot = {
  loop: number;
  anomaly: AnomalyId;
};

const GAME_WIDTH = 920;
const GAME_HEIGHT = 540;
const HALL_LENGTH = 960;
const PLAYER_STOP_DISTANCE = 140;
const CAMERA_FOCAL = 340;
const HALL_HALF_WIDTH = 310;
const HALL_HALF_HEIGHT = 184;
const TARGET_LOOPS = 6;
const MAX_MISTAKES = 3;
const ANOMALIES: AnomalyId[] = [
  "door-number",
  "trim-break",
  "red-light",
  "missing-light",
  "left-portrait",
  "blood-text",
  "door-eye",
  "shadow-figure",
  "floor-stain"
];

const randomAnomaly = (): AnomalyId => {
  if (Math.random() < 0.26) {
    return "none";
  }

  return Phaser.Utils.Array.GetRandom(ANOMALIES);
};

const Hallway13: React.FC = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const assetBase = import.meta.env.BASE_URL;

  useEffect(() => {
    if (!containerRef.current || gameRef.current) {
      return;
    }

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
      hallwayHistory: HallSnapshot[] = [];
      currentLoop = 1;
      mistakes = 0;
      progress = 0;
      lookDrift = 0;
      phase: Phase = "walking";
      currentAnomaly: AnomalyId = "none";
      ambientSound?: Phaser.Sound.BaseSound;
      creepySound?: Phaser.Sound.BaseSound;
      jumpscareSound?: Phaser.Sound.BaseSound;
      keys!: {
        forward: Phaser.Input.Keyboard.Key;
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

        this.keys = this.input.keyboard!.addKeys({
          forward: Phaser.Input.Keyboard.KeyCodes.W,
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
      }

      beginLoop(isFirstLoop = false) {
        this.phase = "walking";
        this.progress = 0;
        this.lookDrift = Phaser.Math.FloatBetween(-0.01, 0.01);
        this.currentAnomaly = isFirstLoop || this.currentLoop === 1 ? "none" : randomAnomaly();
        this.hallwayHistory.push({
          loop: this.currentLoop,
          anomaly: this.currentAnomaly
        });

        if (!isFirstLoop && this.currentAnomaly !== "none") {
          this.creepySound?.play();
        }

        this.cameras.main.fadeIn(260, 8, 8, 12);
        this.refreshHud("Walk to the end of the hall and inspect everything.");
      }

      refreshHud(message?: string) {
        this.loopText.setText(`Hallway 13  |  Loop ${this.currentLoop}/${TARGET_LOOPS}`);
        this.threatText.setText(`Mistakes ${this.mistakes}/${MAX_MISTAKES}`);

        if (this.phase === "walking") {
          this.phaseText.setText(this.currentAnomaly === "none" ? "The hallway looks familiar." : "Something feels wrong.");
          this.promptText.setText(message ?? "Hold W to move. Press E at the door.");
          this.footerText.setText("Q = anomaly present   |   R = no anomaly   |   E = open door");
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

        this.phaseText.setText("You made it through.");
        this.promptText.setText(message ?? "Press Space to run the hallway again.");
        this.footerText.setText("For now, the thing on the other side stayed behind the door.");
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
        this.graphics.fillStyle(0xffffff, 0.025);
        for (let index = 0; index < 80; index += 1) {
          const x = (index * 113 + Math.floor(this.time.now * 0.12)) % GAME_WIDTH;
          const y = (index * 57 + Math.floor(this.time.now * 0.19)) % GAME_HEIGHT;
          this.graphics.fillRect(x, y, 2, 2);
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

        const runnerDepths = this.getVisibleDistances([118, 252, 404, 572, 748], 36, 54);
        runnerDepths.forEach((distance, index) => {
          const point = this.projectPointAtDistance(distance, 0, 0.83);
          const width = 148 * point.scale;
          const height = 16 * point.scale;
          const color = this.currentAnomaly === "trim-break" && index === 2 ? 0x4a2f2f : 0x6f5b33;
          const alpha = this.currentAnomaly === "trim-break" && index === 2 ? 0.18 : 0.46;
          this.graphics.fillStyle(color, alpha);
          this.graphics.fillRoundedRect(point.x - width / 2, point.y - height / 2, width, height, 3);
          this.graphics.lineStyle(1, 0xa78b54, 0.14);
          this.graphics.strokeRoundedRect(point.x - width / 2, point.y - height / 2, width, height, 3);
        });
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
        this.graphics.fillStyle(0x18181b, 0.9);
        this.graphics.fillRoundedRect(plaqueX, plaqueY, plaqueWidth, plaqueHeight, 4);
        this.graphics.lineStyle(2, 0xcbd5e1, 0.38);
        this.graphics.strokeRoundedRect(plaqueX, plaqueY, plaqueWidth, plaqueHeight, 4);
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

        const knobX = doorX + doorWidth - 18;
        const knobY = doorY + doorHeight / 2;
        this.graphics.fillStyle(0x7c5f35, 1);
        this.graphics.fillCircle(knobX, knobY, 4 + doorRect.width * 0.008);

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
        [156, 322, 488, 654, 820].forEach((worldDistance, index) => {
          const distance = worldDistance - this.getPlayerDepth();
          if (distance <= 52 || distance >= this.getDoorDistance() - 80) {
            return;
          }
          if (this.currentAnomaly === "missing-light" && index === 2) {
            return;
          }

          const point = this.projectPointAtDistance(distance, 0, -0.92);
          const isRed = this.currentAnomaly === "red-light" && index === 2;
          const baseColor = isRed ? 0xdb2777 : 0xf8f3c9;
          const flicker = isRed ? 0.55 + Math.sin(this.time.now * 0.02) * 0.25 : 0.84;
          this.graphics.fillStyle(baseColor, 0.12 + flicker * 0.16);
          this.graphics.fillEllipse(point.x, point.y + 18 * point.scale, 160 * point.scale, 40 * point.scale);
          this.graphics.fillStyle(baseColor, flicker);
          this.graphics.fillRoundedRect(
            point.x - 34 * point.scale,
            point.y - 4 * point.scale,
            68 * point.scale,
            12 * point.scale,
            4
          );
          this.graphics.fillStyle(0x3f3f46, 0.4);
          this.graphics.fillRect(point.x - 8 * point.scale, point.y - 16 * point.scale, 16 * point.scale, 7 * point.scale);
        });
      }

      drawFrame(distance: number, side: "left" | "right", hasPortrait: boolean) {
        const nearRect = this.projectRectFromDistance(Math.max(18, distance - 22));
        const farRect = this.projectRectFromDistance(distance + 22);
        const nearX = side === "left" ? nearRect.left + 20 : nearRect.right - 20;
        const farX = side === "left" ? farRect.left + 14 : farRect.right - 14;
        const nearTop = nearRect.centerY - nearRect.height * 0.13;
        const nearBottom = nearRect.centerY + nearRect.height * 0.19;
        const farTop = farRect.centerY - farRect.height * 0.13;
        const farBottom = farRect.centerY + farRect.height * 0.19;

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
          const centerX = (nearX + farX) / 2;
          const centerY = (nearTop + nearBottom + farTop + farBottom) / 4;
          const scale = nearRect.width / (HALL_HALF_WIDTH * 2);
          const xInset = Math.abs(nearX - farX) * 0.18 + 3;
          const portraitWidth = Math.max(6, Math.abs(nearX - farX) * 0.32);
          const portraitHeight = Math.max(8, (nearBottom - nearTop) * 0.18);
          this.graphics.fillStyle(0x7f1d1d, 0.78);
          this.graphics.fillCircle(centerX + (side === "left" ? xInset : -xInset), centerY - 8 * scale, Math.max(3, 6 * scale));
          this.graphics.fillStyle(0xe2e8f0, 0.84);
          this.graphics.fillRect(
            centerX - portraitWidth / 2 + (side === "left" ? xInset * 0.45 : -xInset * 0.45),
            centerY + 6 * scale,
            portraitWidth,
            portraitHeight
          );
        }
      }

      drawDecor() {
        this.decorText.setVisible(false);
        this.decorShadowText.setVisible(false);

        [228, 536, 812].forEach((worldDistance, index) => {
          const distance = worldDistance - this.getPlayerDepth();
          if (distance <= 56 || distance >= this.getDoorDistance() - 92) {
            return;
          }
          const hasPortrait = !(this.currentAnomaly === "left-portrait" && index === 1);
          this.drawFrame(distance, "left", hasPortrait);
        });
        [344, 688].forEach((worldDistance) => {
          const distance = worldDistance - this.getPlayerDepth();
          if (distance <= 56 || distance >= this.getDoorDistance() - 92) {
            return;
          }
          this.drawFrame(distance, "right", true);
        });

        if (this.currentAnomaly === "left-portrait") {
          const portraitDistance = 536 - this.getPlayerDepth();
          if (portraitDistance > 56 && portraitDistance < this.getDoorDistance() - 92) {
            this.drawFrame(portraitDistance, "left", true);
          }
        }

        if (this.currentAnomaly === "blood-text") {
          const textDistance = 612 - this.getPlayerDepth();
          if (textDistance > 60 && textDistance < this.getDoorDistance() - 96) {
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
          if (stainDistance > 30 && stainDistance < this.getDoorDistance() - 70) {
            const point = this.projectPointAtDistance(stainDistance, -0.24, 0.78);
            this.graphics.fillStyle(0x0f172a, 0.28);
            this.graphics.fillEllipse(point.x, point.y, 108 * point.scale, 56 * point.scale);
            this.graphics.fillStyle(0x7f1d1d, 0.45);
            this.graphics.fillEllipse(point.x + 10 * point.scale, point.y - 4 * point.scale, 82 * point.scale, 38 * point.scale);
          }
        }

        [170, 274, 390, 512, 634, 756, 878].forEach((worldDistance, index) => {
          const distance = worldDistance - this.getPlayerDepth();
          if (distance <= 40 || distance >= this.getDoorDistance() - 76) {
            return;
          }
          if (this.currentAnomaly === "trim-break" && index === 4) {
            return;
          }

          const left = this.projectPointAtDistance(distance, -0.95, 0.56);
          const right = this.projectPointAtDistance(distance, 0.95, 0.56);
          this.graphics.lineStyle(2, 0x8b6e3f, 0.22);
          this.graphics.strokeLineShape(new Phaser.Geom.Line(left.x, left.y, left.x + 22 * left.scale, left.y));
          this.graphics.strokeLineShape(new Phaser.Geom.Line(right.x, right.y, right.x - 22 * right.scale, right.y));
        });

        const threatVisible = this.mistakes > 0 || this.currentAnomaly === "shadow-figure";
        if (threatVisible) {
          const distance =
            this.currentAnomaly === "shadow-figure"
              ? Math.max(126, 412 - this.getPlayerDepth())
              : Phaser.Math.Linear(620, 420, this.mistakes / MAX_MISTAKES);
          const xRatio = this.currentAnomaly === "shadow-figure" ? -0.72 : 0.78;
          const point = this.projectPointAtDistance(distance, xRatio, 0.24);
          const alpha = this.currentAnomaly === "shadow-figure" ? 0.72 : 0.22 + this.mistakes * 0.12;
          this.graphics.fillStyle(0x000000, alpha);
          this.graphics.fillCircle(point.x, point.y - 36 * point.scale, 15 * point.scale);
          this.graphics.fillEllipse(point.x, point.y + 4 * point.scale, 42 * point.scale, 86 * point.scale);
          this.graphics.fillRect(point.x - 26 * point.scale, point.y - 4 * point.scale, 10 * point.scale, 48 * point.scale);
          this.graphics.fillRect(point.x + 16 * point.scale, point.y - 4 * point.scale, 10 * point.scale, 48 * point.scale);
        }
      }

      drawHudEffects() {
        const nearDoor = Phaser.Math.Clamp((this.progress - 0.78) / 0.22, 0, 1);
        this.vignette.setFillStyle(0x000000, 0.16 + nearDoor * 0.16 + this.mistakes * 0.04);
        this.fadeOverlay.setAlpha(this.phase === "dead" ? 0.22 : 0);
      }

      handleWalking(deltaSeconds: number) {
        const forwardHeld = this.keys.forward.isDown || this.keys.up.isDown;
        if (forwardHeld) {
          this.progress = Phaser.Math.Clamp(this.progress + deltaSeconds * 0.32, 0, 1);
        } else {
          this.progress = Phaser.Math.Clamp(this.progress - deltaSeconds * 0.03, 0, 1);
        }

        if (this.progress >= 1 && Phaser.Input.Keyboard.JustDown(this.keys.open)) {
          this.phase = "judging";
          this.refreshHud("The next door is open. Decide what you saw before stepping through.");
        } else if (this.progress >= 0.95) {
          this.refreshHud("You're at the door. Press E and make your call.");
        }
      }

      resolveGuess(sawAnomaly: boolean) {
        const anomalyPresent = this.currentAnomaly !== "none";
        const wasCorrect = sawAnomaly === anomalyPresent;

        if (!wasCorrect) {
          this.mistakes += 1;
          this.cameras.main.shake(220, 0.0028);
        }

        if (this.mistakes >= MAX_MISTAKES) {
          this.phase = "dead";
          this.jumpscareSound?.play();
          this.cameras.main.flash(220, 255, 255, 255);
          this.refreshHud(wasCorrect ? "You were too late." : "Wrong again. It was waiting at the door.");
          return;
        }

        if (this.currentLoop >= TARGET_LOOPS) {
          this.phase = "won";
          this.cameras.main.flash(260, 240, 248, 255);
          this.refreshHud(wasCorrect ? "You caught enough of the lies to get out." : "You escaped, barely.");
          return;
        }

        this.currentLoop += 1;
        this.beginLoop();
      }

      restartRun() {
        this.currentLoop = 1;
        this.mistakes = 0;
        this.hallwayHistory = [];
        this.phase = "walking";
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
        } else if ((this.phase === "dead" || this.phase === "won") && Phaser.Input.Keyboard.JustDown(this.keys.restart)) {
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
          {["W / Up move", "E open door", "Q anomaly", "R clear hallway"].map((label) => (
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
      </div>
    </div>
  );
};

export default Hallway13;
