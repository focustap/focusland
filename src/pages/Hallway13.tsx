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
        this.currentAnomaly = randomAnomaly();
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

      projectRect(z: number) {
        const eased = Phaser.Math.Clamp(z, 0.02, 1);
        const width = Phaser.Math.Linear(690, 120, eased);
        const height = Phaser.Math.Linear(420, 86, eased);
        const sway = Math.sin(this.time.now * 0.0006) * 10 + this.lookDrift * 140;
        const centerX = GAME_WIDTH / 2 + sway;
        const centerY = GAME_HEIGHT / 2 + 24 + Math.cos(this.time.now * 0.0007) * 4;

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

      projectPoint(z: number, xRatio: number, yRatio: number) {
        const rect = this.projectRect(z);
        return {
          x: rect.centerX + xRatio * (rect.width / 2),
          y: rect.centerY + yRatio * (rect.height / 2),
          scale: Phaser.Math.Linear(2.1, 0.48, z),
          rect
        };
      }

      wrapDepth(rawDepth: number, min = 0.12, max = 0.98) {
        const range = max - min;
        let depth = rawDepth;

        while (depth < min) {
          depth += range;
        }
        while (depth > max) {
          depth -= range;
        }

        return depth;
      }

      getTravelDepths(baseDepths: number[]) {
        return baseDepths
          .map((baseDepth) => this.wrapDepth(baseDepth - this.progress * 0.94))
          .sort((left, right) => left - right);
      }

      getDoorZ() {
        return Phaser.Math.Linear(0.96, 0.22, this.progress);
      }

      drawBackground() {
        this.graphics.fillStyle(0x04030a, 1);
        this.graphics.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
        this.graphics.fillStyle(0x120f17, 1);
        this.graphics.fillRect(0, 0, GAME_WIDTH, 92);
        this.graphics.fillStyle(0x07070a, 1);
        this.graphics.fillRect(0, GAME_HEIGHT - 118, GAME_WIDTH, 118);
      }

      drawHallway() {
        const slices = this.getTravelDepths([0.12, 0.22, 0.32, 0.42, 0.54, 0.66, 0.78, 0.9]);
        let previous = this.projectRect(0.03);

        for (const slice of slices) {
          const current = this.projectRect(slice);

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

        const runnerDepths = this.getTravelDepths([0.16, 0.31, 0.46, 0.62, 0.79]);
        runnerDepths.forEach((depth, index) => {
          const point = this.projectPoint(depth, 0, 0.83);
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
        const doorZ = this.getDoorZ();
        const doorRect = this.projectRect(doorZ);
        const doorWidth = doorRect.width * 0.24;
        const doorHeight = doorRect.height * 0.58;
        const doorX = doorRect.centerX - doorWidth / 2;
        const doorY = doorRect.bottom - doorHeight;
        const reachedDoor = this.progress >= 0.97;

        this.graphics.fillStyle(0xddd4b3, 1);
        this.graphics.fillRect(doorX - 12, doorY - 12, doorWidth + 24, doorHeight + 18);
        this.graphics.fillStyle(0xeee4c1, 1);
        this.graphics.fillRect(doorX, doorY, doorWidth, doorHeight);
        this.graphics.fillStyle(0xddcf9c, 0.65);
        this.graphics.fillRect(doorX + doorWidth * 0.18, doorY + 12, doorWidth * 0.05, doorHeight - 24);
        this.graphics.fillRect(doorX + doorWidth * 0.77, doorY + 12, doorWidth * 0.05, doorHeight - 24);
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
          .setFontSize(`${Math.max(10, Math.round(16 + (1 - doorZ) * 16))}px`)
          .setVisible(true);
        this.plaqueText
          .setText(this.currentAnomaly === "door-number" ? "14" : "13")
          .setPosition(doorRect.centerX, plaqueY + plaqueHeight / 2)
          .setFontSize(`${Math.max(10, Math.round(16 + (1 - doorZ) * 16))}px`)
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
        const lightDepths = this.getTravelDepths([0.18, 0.34, 0.5, 0.66, 0.82]);
        lightDepths.forEach((depth, index) => {
          if (this.currentAnomaly === "missing-light" && index === 1) {
            return;
          }

          const point = this.projectPoint(depth, 0, -0.92);
          const isRed = this.currentAnomaly === "red-light" && index === 1;
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

      drawFrame(depth: number, side: "left" | "right", hasPortrait: boolean) {
        const point = this.projectPoint(depth, side === "left" ? -0.77 : 0.77, -0.04);
        const width = 38 * point.scale;
        const height = 56 * point.scale;
        this.graphics.fillStyle(0x1c1917, 0.95);
        this.graphics.fillRect(point.x - width / 2, point.y - height / 2, width, height);
        this.graphics.lineStyle(3, 0xd6c08d, 0.9);
        this.graphics.strokeRect(point.x - width / 2, point.y - height / 2, width, height);
        if (hasPortrait) {
          this.graphics.fillStyle(0x7f1d1d, 0.78);
          this.graphics.fillCircle(point.x, point.y - 5 * point.scale, 7 * point.scale);
          this.graphics.fillStyle(0xe2e8f0, 0.84);
          this.graphics.fillRect(point.x - 9 * point.scale, point.y + 10 * point.scale, 18 * point.scale, 10 * point.scale);
        }
      }

      drawDecor() {
        this.decorText.setVisible(false);
        this.decorShadowText.setVisible(false);

        const leftFrameDepths = this.getTravelDepths([0.24, 0.56, 0.84]);
        const rightFrameDepths = this.getTravelDepths([0.39, 0.71]);
        leftFrameDepths.forEach((depth) => {
          const hasPortrait = !(this.currentAnomaly === "left-portrait" && Math.abs(depth - leftFrameDepths[1]) < 0.001);
          this.drawFrame(depth, "left", hasPortrait);
        });
        rightFrameDepths.forEach((depth) => {
          this.drawFrame(depth, "right", true);
        });

        if (this.currentAnomaly === "left-portrait") {
          this.drawFrame(this.wrapDepth(0.49 - this.progress * 0.94), "left", true);
        }

        if (this.currentAnomaly === "blood-text") {
          const point = this.projectPoint(0.56, 0, 0.06);
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

        if (this.currentAnomaly === "floor-stain") {
          const point = this.projectPoint(0.34, -0.24, 0.78);
          this.graphics.fillStyle(0x0f172a, 0.28);
          this.graphics.fillEllipse(point.x, point.y, 108 * point.scale, 56 * point.scale);
          this.graphics.fillStyle(0x7f1d1d, 0.45);
          this.graphics.fillEllipse(point.x + 10 * point.scale, point.y - 4 * point.scale, 82 * point.scale, 38 * point.scale);
        }

        const panelDepths = this.getTravelDepths([0.18, 0.29, 0.41, 0.53, 0.64, 0.76, 0.88]);
        panelDepths.forEach((depth, index) => {
          if (this.currentAnomaly === "trim-break" && index === 4) {
            return;
          }

          const left = this.projectPoint(depth, -0.95, 0.56);
          const right = this.projectPoint(depth, 0.95, 0.56);
          this.graphics.lineStyle(2, 0x8b6e3f, 0.22);
          this.graphics.strokeLineShape(new Phaser.Geom.Line(left.x, left.y, left.x + 22 * left.scale, left.y));
          this.graphics.strokeLineShape(new Phaser.Geom.Line(right.x, right.y, right.x - 22 * right.scale, right.y));
        });

        const threatVisible = this.mistakes > 0 || this.currentAnomaly === "shadow-figure";
        if (threatVisible) {
          const z = this.currentAnomaly === "shadow-figure" ? 0.63 : Phaser.Math.Linear(0.94, 0.7, this.mistakes / MAX_MISTAKES);
          const point = this.projectPoint(z, 0.1, 0.28);
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
      <div className="content card" style={{ maxWidth: 980 }}>
        <h2>Hallway 13</h2>
        <p>
          Walk the loop, study the corridor, and decide whether the hallway changed before it catches up to you.
        </p>
        <div ref={containerRef} style={{ width: "100%", maxWidth: GAME_WIDTH, margin: "1rem auto" }} />
      </div>
    </div>
  );
};

export default Hallway13;
