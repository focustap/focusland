import Phaser from "phaser";
import {
  ELEVATOR_GAME_HEIGHT,
  ELEVATOR_GAME_WIDTH,
  FLOOR_Y,
  SHAFT_LEFT,
  SHAFT_RIGHT,
  createInitialRun,
  getHudSnapshot,
  getSectionForHeight,
  getSectionPalette,
  updateRun
} from "../run";
import type { RunState } from "../types";

type SceneCallbacks = {
  onHudChange: (hud: ReturnType<typeof getHudSnapshot>, status: string) => void;
  onRunOver: (summary: { score: number; height: number; bestCombo: number; goldEarned: number; reason: string }) => void;
};

export function createElevatorShaftScene(callbacks: SceneCallbacks) {
  return class ElevatorShaftScene extends Phaser.Scene {
    runState!: RunState;
    playerBody!: Phaser.GameObjects.Rectangle;
    collapseWave!: Phaser.GameObjects.Rectangle;
    sectionBackdrop!: Phaser.GameObjects.Rectangle;
    shaftGlow!: Phaser.GameObjects.Rectangle;
    platformSprites = new Map<number, Phaser.GameObjects.Rectangle>();
    anchorSprites = new Map<number, Phaser.GameObjects.Arc>();
    dustParticles!: Phaser.GameObjects.Particles.ParticleEmitter;
    sparkParticles!: Phaser.GameObjects.Particles.ParticleEmitter;
    grappleLine!: Phaser.GameObjects.Graphics;
    keys!: {
      left: Phaser.Input.Keyboard.Key;
      right: Phaser.Input.Keyboard.Key;
      jump: Phaser.Input.Keyboard.Key;
      altJump: Phaser.Input.Keyboard.Key;
      altJump2: Phaser.Input.Keyboard.Key;
      grapple: Phaser.Input.Keyboard.Key;
      restart: Phaser.Input.Keyboard.Key;
    };
    pointerWorldX = ELEVATOR_GAME_WIDTH / 2;
    pointerWorldY = FLOOR_Y - 200;
    gameFinished = false;

    create() {
      this.runState = createInitialRun(Date.now());
      this.cameras.main.setBounds(0, -120000, ELEVATOR_GAME_WIDTH, 121000);
      this.cameras.main.setBackgroundColor("#06070d");

      this.sectionBackdrop = this.add.rectangle(
        ELEVATOR_GAME_WIDTH / 2,
        ELEVATOR_GAME_HEIGHT / 2,
        ELEVATOR_GAME_WIDTH,
        ELEVATOR_GAME_HEIGHT,
        0x0f172a,
        1
      ).setScrollFactor(0);
      this.sectionBackdrop.setDepth(-10);

      this.add.rectangle(SHAFT_LEFT / 2, ELEVATOR_GAME_HEIGHT / 2, SHAFT_LEFT, ELEVATOR_GAME_HEIGHT, 0x05070e, 0.98)
        .setScrollFactor(0)
        .setDepth(-9);
      this.add.rectangle(
        SHAFT_RIGHT + (ELEVATOR_GAME_WIDTH - SHAFT_RIGHT) / 2,
        ELEVATOR_GAME_HEIGHT / 2,
        ELEVATOR_GAME_WIDTH - SHAFT_RIGHT,
        ELEVATOR_GAME_HEIGHT,
        0x05070e,
        0.98
      ).setScrollFactor(0).setDepth(-9);

      this.shaftGlow = this.add.rectangle(
        ELEVATOR_GAME_WIDTH / 2,
        ELEVATOR_GAME_HEIGHT / 2,
        SHAFT_RIGHT - SHAFT_LEFT,
        ELEVATOR_GAME_HEIGHT,
        0x60a5fa,
        0.08
      ).setScrollFactor(0).setDepth(-8);

      this.add.rectangle(SHAFT_LEFT, ELEVATOR_GAME_HEIGHT / 2, 8, ELEVATOR_GAME_HEIGHT, 0x334155, 0.9)
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(-7);
      this.add.rectangle(SHAFT_RIGHT, ELEVATOR_GAME_HEIGHT / 2, 8, ELEVATOR_GAME_HEIGHT, 0x334155, 0.9)
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(-7);

      for (let i = 0; i < 18; i += 1) {
        const x = i % 2 === 0 ? SHAFT_LEFT + 10 : SHAFT_RIGHT - 10;
        const marker = this.add.rectangle(x, i * 64, 6, 32, 0x94a3b8, 0.12);
        marker.setScrollFactor(0.2, 0.2);
        marker.setDepth(-6);
      }

      this.collapseWave = this.add.rectangle(
        ELEVATOR_GAME_WIDTH / 2,
        FLOOR_Y + 200,
        SHAFT_RIGHT - SHAFT_LEFT,
        320,
        0xf97316,
        0.32
      );
      this.collapseWave.setDepth(20);

      const particleTexture = this.add.graphics();
      particleTexture.fillStyle(0xffffff, 1);
      particleTexture.fillCircle(3, 3, 3);
      particleTexture.generateTexture("elevator-particle", 6, 6);
      particleTexture.destroy();

      this.dustParticles = this.add.particles(0, 0, "elevator-particle", {
        lifespan: 1200,
        quantity: 2,
        speedY: { min: -30, max: 40 },
        speedX: { min: -16, max: 16 },
        scale: { start: 0.9, end: 0 },
        alpha: { start: 0.22, end: 0 },
        tint: [0xf8fafc, 0xfde68a, 0xcbd5e1]
      });
      this.dustParticles.setDepth(19);

      this.sparkParticles = this.add.particles(0, 0, "elevator-particle", {
        lifespan: 420,
        quantity: 0,
        speed: { min: 20, max: 90 },
        angle: { min: 250, max: 290 },
        scale: { start: 0.75, end: 0 },
        alpha: { start: 0.7, end: 0 },
        tint: [0xf59e0b, 0xf87171, 0xfacc15]
      });
      this.sparkParticles.setDepth(22);

      this.grappleLine = this.add.graphics();
      this.grappleLine.setDepth(24);

      this.playerBody = this.add.rectangle(
        this.runState.player.x,
        this.runState.player.y,
        this.runState.player.width,
        this.runState.player.height,
        0xe2e8f0,
        1
      );
      this.playerBody.setStrokeStyle(3, 0x38bdf8, 1);
      this.playerBody.setDepth(25);

      this.keys = this.input.keyboard!.addKeys({
        left: Phaser.Input.Keyboard.KeyCodes.A,
        right: Phaser.Input.Keyboard.KeyCodes.D,
        jump: Phaser.Input.Keyboard.KeyCodes.W,
        altJump: Phaser.Input.Keyboard.KeyCodes.UP,
        altJump2: Phaser.Input.Keyboard.KeyCodes.SPACE,
        grapple: Phaser.Input.Keyboard.KeyCodes.E,
        restart: Phaser.Input.Keyboard.KeyCodes.R
      }) as ElevatorShaftScene["keys"];

      this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
        this.pointerWorldX = pointer.worldX;
        this.pointerWorldY = pointer.worldY;
      });
      this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
        this.pointerWorldX = pointer.worldX;
        this.pointerWorldY = pointer.worldY;
      });

      callbacks.onHudChange(getHudSnapshot(this.runState), this.runState.statusText);
    }

    private syncPlatforms() {
      const activeIds = new Set<number>();
      this.runState.platforms.forEach((platform) => {
        activeIds.add(platform.id);
        let sprite = this.platformSprites.get(platform.id);
        if (!sprite) {
          sprite = this.add.rectangle(platform.x, platform.y, platform.width, platform.height, 0x94a3b8, 1);
          sprite.setDepth(10);
          this.platformSprites.set(platform.id, sprite);
        }
        sprite.setPosition(platform.x, platform.y);
        sprite.width = platform.width;
        sprite.height = platform.height;
        const fill =
          platform.kind === "breakable"
            ? 0xf97316
            : platform.kind === "moving"
              ? 0x38bdf8
              : 0xe2e8f0;
        sprite.setFillStyle(fill, platform.broken ? 0.12 : 0.95);
        sprite.setStrokeStyle(2, 0x0f172a, platform.broken ? 0.1 : 0.9);
        sprite.setVisible(!platform.broken);
      });

      this.platformSprites.forEach((sprite, id) => {
        if (!activeIds.has(id)) {
          sprite.destroy();
          this.platformSprites.delete(id);
        }
      });
    }

    private syncAnchors() {
      const activeIds = new Set<number>();
      this.runState.anchors.forEach((anchor) => {
        activeIds.add(anchor.id);
        let sprite = this.anchorSprites.get(anchor.id);
        if (!sprite) {
          sprite = this.add.circle(anchor.x, anchor.y, 8, 0xf8fafc, 1).setStrokeStyle(3, 0x38bdf8, 1);
          sprite.setDepth(14);
          this.anchorSprites.set(anchor.id, sprite);
        }
        sprite.setPosition(anchor.x, anchor.y);
      });

      this.anchorSprites.forEach((sprite, id) => {
        if (!activeIds.has(id)) {
          sprite.destroy();
          this.anchorSprites.delete(id);
        }
      });
    }

    private updateBackdrop() {
      const section = getSectionForHeight(this.runState.topHeight);
      const palette = getSectionPalette(section);
      this.sectionBackdrop.setFillStyle(palette.bg, 1);
      this.shaftGlow.setFillStyle(palette.accent, 0.09);
      this.collapseWave.setFillStyle(palette.hazard, 0.3);
    }

    private drawGrappleLine() {
      this.grappleLine.clear();
      if (this.runState.player.grappleLineMs <= 0) {
        return;
      }

      const anchor = this.runState.anchors.find((item) => item.id === this.runState.player.grappleAnchorId);
      const targetX = anchor?.x ?? this.pointerWorldX;
      const targetY = anchor?.y ?? this.pointerWorldY;
      this.grappleLine.lineStyle(3, 0xf8fafc, 0.85);
      this.grappleLine.beginPath();
      this.grappleLine.moveTo(this.runState.player.x, this.runState.player.y - 4);
      this.grappleLine.lineTo(targetX, targetY);
      this.grappleLine.strokePath();
    }

    private finishRun() {
      if (this.gameFinished) {
        return;
      }

      this.gameFinished = true;
      const goldEarned = Math.max(
        2,
        Math.min(
          24,
          Math.floor(this.runState.topHeight / 260) +
            Math.floor(this.runState.score / 450) +
            Math.floor(this.runState.bestCombo / 2) +
            2
        )
      );

      callbacks.onRunOver({
        score: this.runState.score,
        height: Math.floor(this.runState.topHeight / 10),
        bestCombo: this.runState.bestCombo,
        goldEarned,
        reason: this.runState.reason
      });
    }

    update(_time: number, delta: number) {
      if (this.runState.gameOver) {
        if (Phaser.Input.Keyboard.JustDown(this.keys.restart)) {
          this.scene.restart();
          this.gameFinished = false;
          return;
        }
        this.finishRun();
        return;
      }

      const move =
        (this.keys.right.isDown ? 1 : 0) -
        (this.keys.left.isDown ? 1 : 0);
      const jumpPressed =
        Phaser.Input.Keyboard.JustDown(this.keys.jump) ||
        Phaser.Input.Keyboard.JustDown(this.keys.altJump) ||
        Phaser.Input.Keyboard.JustDown(this.keys.altJump2);
      const jumpHeld = this.keys.jump.isDown || this.keys.altJump.isDown || this.keys.altJump2.isDown;
      const grapplePressed = Phaser.Input.Keyboard.JustDown(this.keys.grapple) || this.input.activePointer.leftButtonDown();

      updateRun(
        this.runState,
        {
          move,
          jumpPressed,
          jumpHeld,
          grapplePressed,
          pointerX: this.pointerWorldX,
          pointerY: this.pointerWorldY,
          cameraY: this.cameras.main.scrollY
        },
        Math.min(33, delta)
      );

      this.playerBody.setPosition(this.runState.player.x, this.runState.player.y);
      this.playerBody.setAngle(Phaser.Math.Clamp(this.runState.player.vx * 0.045, -16, 16));

      const targetCameraY = this.runState.player.y - ELEVATOR_GAME_HEIGHT * 0.62;
      this.cameras.main.scrollY = Phaser.Math.Linear(this.cameras.main.scrollY, targetCameraY, 0.11);

      const collapseWorldY = FLOOR_Y - this.runState.collapseHeight;
      this.collapseWave.setPosition(ELEVATOR_GAME_WIDTH / 2, collapseWorldY + 160);
      this.dustParticles.setPosition(ELEVATOR_GAME_WIDTH / 2, collapseWorldY + 28);
      if (this.runState.player.grappleLineMs > 0) {
        this.sparkParticles.emitParticleAt(this.runState.player.x, this.runState.player.y + 10, 1);
      }

      this.syncPlatforms();
      this.syncAnchors();
      this.updateBackdrop();
      this.drawGrappleLine();

      callbacks.onHudChange(getHudSnapshot(this.runState), this.runState.statusText);
    }
  };
}
