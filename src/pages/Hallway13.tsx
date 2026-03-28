import React, { useEffect, useRef } from "react";
import NavBar from "../components/NavBar";
import Phaser from "phaser";

type Phase = "walking" | "judging" | "dead" | "won";

type AnomalyId =
  | "none"
  | "red-light"
  | "missing-light"
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
  "red-light",
  "missing-light",
  "left-portrait",
  "blood-text",
  "door-eye",
  "shadow-figure",
  "floor-stain"
];

const randomAnomaly = (): AnomalyId => {
  if (Math.random() < 0.32) {
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

      drawBackground() {
        this.graphics.fillStyle(0x04030a, 1);
        this.graphics.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
        this.graphics.fillStyle(0x120f17, 1);
        this.graphics.fillRect(0, 0, GAME_WIDTH, 92);
      }

      drawHallway() {
        const slices = [0.08, 0.18, 0.28, 0.4, 0.55, 0.7, 0.86];
        let previous = this.projectRect(slices[0]);

        for (let index = 1; index < slices.length; index += 1) {
          const current = this.projectRect(slices[index]);

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
          previous = current;
        }
      }

      drawDoor() {
        const doorZ = Phaser.Math.Linear(0.94, 0.2, this.progress);
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
        this.graphics.lineStyle(3, 0xb39b6b, 0.85);
        this.graphics.strokeRect(doorX, doorY, doorWidth, doorHeight);

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
        const lightDepths = [0.22, 0.43, 0.68];
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
        });
      }

      drawDecor() {
        this.decorText.setVisible(false);
        this.decorShadowText.setVisible(false);

        if (this.currentAnomaly === "left-portrait") {
          const point = this.projectPoint(0.46, -0.78, -0.05);
          this.graphics.fillStyle(0x1c1917, 0.95);
          this.graphics.fillRect(point.x - 20 * point.scale, point.y - 28 * point.scale, 40 * point.scale, 56 * point.scale);
          this.graphics.lineStyle(3, 0xd6c08d, 0.9);
          this.graphics.strokeRect(point.x - 20 * point.scale, point.y - 28 * point.scale, 40 * point.scale, 56 * point.scale);
          this.graphics.fillStyle(0x7f1d1d, 0.9);
          this.graphics.fillCircle(point.x, point.y - 3 * point.scale, 7 * point.scale);
          this.graphics.fillStyle(0xe2e8f0, 0.9);
          this.graphics.fillRect(point.x - 9 * point.scale, point.y + 10 * point.scale, 18 * point.scale, 10 * point.scale);
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
