import Phaser from "phaser";
import {
  VOLLEYBALL_BALL_RADIUS,
  VOLLEYBALL_FLOOR_Y,
  VOLLEYBALL_HEIGHT,
  VOLLEYBALL_NET_X,
  VOLLEYBALL_WIDTH,
  getTeamLabel,
  type VolleyballInput,
  type VolleyballMatchState,
  type VolleyballPlayer
} from "../../lib/volleyball/logic";

type BeachBumpCallbacks = {
  getState: () => VolleyballMatchState;
  onTick: (input: VolleyballInput, deltaMs: number) => void;
};

const ACTION_TEXTURES: Record<VolleyballPlayer["action"], string> = {
  idle: "volleyball-player-idle",
  run: "volleyball-player-run-1",
  jump: "volleyball-player-jump",
  bump: "volleyball-player-bump",
  set: "volleyball-player-set",
  spike: "volleyball-player-spike",
  dive: "volleyball-player-dive"
};

export function createBeachBumpBashGame(
  parent: HTMLElement,
  assetBase: string,
  callbacks: BeachBumpCallbacks
) {
  class BeachBumpBashScene extends Phaser.Scene {
    playerSprites = new Map<string, Phaser.GameObjects.Sprite>();
    playerLabels = new Map<string, Phaser.GameObjects.Text>();
    ballSprite!: Phaser.GameObjects.Image;
    scoreText!: Phaser.GameObjects.Text;
    messageText!: Phaser.GameObjects.Text;
    keys!: Record<"leftA" | "rightD" | "left" | "right" | "jumpW" | "jumpUp" | "jumpSpace" | "bump" | "set" | "spike" | "diveShift" | "diveI", Phaser.Input.Keyboard.Key>;
    runFrameToggle = 0;

    preload() {
      const base = `${assetBase}assets/volleyball/`;
      this.load.svg("volleyball-bg", `${base}beach-background.svg`, { width: VOLLEYBALL_WIDTH, height: VOLLEYBALL_HEIGHT });
      this.load.svg("volleyball-court", `${base}sand-court.svg`, { width: VOLLEYBALL_WIDTH, height: 170 });
      this.load.svg("volleyball-net", `${base}net.svg`, { width: 96, height: 228 });
      this.load.svg("volleyball-ball", `${base}volleyball.svg`, { width: 40, height: 40 });
      this.load.svg("volleyball-player-idle", `${base}player-idle.svg`, { width: 64, height: 88 });
      this.load.svg("volleyball-player-run-1", `${base}player-run-1.svg`, { width: 64, height: 88 });
      this.load.svg("volleyball-player-run-2", `${base}player-run-2.svg`, { width: 64, height: 88 });
      this.load.svg("volleyball-player-jump", `${base}player-jump.svg`, { width: 64, height: 88 });
      this.load.svg("volleyball-player-bump", `${base}player-bump.svg`, { width: 64, height: 88 });
      this.load.svg("volleyball-player-set", `${base}player-set.svg`, { width: 64, height: 88 });
      this.load.svg("volleyball-player-spike", `${base}player-spike.svg`, { width: 64, height: 88 });
      this.load.svg("volleyball-player-dive", `${base}player-dive.svg`, { width: 64, height: 88 });
    }

    create() {
      this.add.image(VOLLEYBALL_WIDTH / 2, VOLLEYBALL_HEIGHT / 2, "volleyball-bg").setDepth(0);
      this.add.image(VOLLEYBALL_WIDTH / 2, VOLLEYBALL_FLOOR_Y + 40, "volleyball-court").setDepth(1);
      this.add.image(VOLLEYBALL_NET_X, VOLLEYBALL_FLOOR_Y - 114, "volleyball-net").setDepth(5);
      this.add.rectangle(VOLLEYBALL_NET_X, VOLLEYBALL_FLOOR_Y - 100, 3, 186, 0x0f172a, 0.22).setDepth(6);

      this.ballSprite = this.add.image(VOLLEYBALL_WIDTH / 2, 170, "volleyball-ball").setDepth(20);
      this.ballSprite.setDisplaySize(VOLLEYBALL_BALL_RADIUS * 2.35, VOLLEYBALL_BALL_RADIUS * 2.35);

      this.scoreText = this.add.text(VOLLEYBALL_WIDTH / 2, 26, "", {
        color: "#fff7ed",
        fontSize: "24px",
        fontStyle: "bold",
        stroke: "#0f172a",
        strokeThickness: 5
      }).setOrigin(0.5).setDepth(30);

      this.messageText = this.add.text(VOLLEYBALL_WIDTH / 2, 66, "", {
        color: "#fef3c7",
        fontSize: "16px",
        fontStyle: "bold",
        stroke: "#0f172a",
        strokeThickness: 4
      }).setOrigin(0.5).setDepth(30);

      this.keys = this.input.keyboard!.addKeys({
        leftA: Phaser.Input.Keyboard.KeyCodes.A,
        rightD: Phaser.Input.Keyboard.KeyCodes.D,
        left: Phaser.Input.Keyboard.KeyCodes.LEFT,
        right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
        jumpW: Phaser.Input.Keyboard.KeyCodes.W,
        jumpUp: Phaser.Input.Keyboard.KeyCodes.UP,
        jumpSpace: Phaser.Input.Keyboard.KeyCodes.SPACE,
        bump: Phaser.Input.Keyboard.KeyCodes.J,
        set: Phaser.Input.Keyboard.KeyCodes.K,
        spike: Phaser.Input.Keyboard.KeyCodes.L,
        diveShift: Phaser.Input.Keyboard.KeyCodes.SHIFT,
        diveI: Phaser.Input.Keyboard.KeyCodes.I
      }) as BeachBumpBashScene["keys"];

      this.input.keyboard?.on("keydown-SPACE", (event: KeyboardEvent) => event.preventDefault());
      this.renderState(true);
    }

    private getInput(): VolleyballInput {
      return {
        left: this.keys.leftA.isDown || this.keys.left.isDown,
        right: this.keys.rightD.isDown || this.keys.right.isDown,
        jump:
          Phaser.Input.Keyboard.JustDown(this.keys.jumpW) ||
          Phaser.Input.Keyboard.JustDown(this.keys.jumpUp) ||
          Phaser.Input.Keyboard.JustDown(this.keys.jumpSpace),
        bump: Phaser.Input.Keyboard.JustDown(this.keys.bump),
        set: Phaser.Input.Keyboard.JustDown(this.keys.set),
        spike: Phaser.Input.Keyboard.JustDown(this.keys.spike),
        dive: Phaser.Input.Keyboard.JustDown(this.keys.diveShift) || Phaser.Input.Keyboard.JustDown(this.keys.diveI)
      };
    }

    private syncPlayerSprites(state: VolleyballMatchState, snap = false) {
      const activeIds = new Set(state.players.map((player) => player.id));
      state.players.forEach((player) => {
        const texture = player.action === "run" && this.runFrameToggle % 28 > 14
          ? "volleyball-player-run-2"
          : ACTION_TEXTURES[player.action];
        let sprite = this.playerSprites.get(player.id);
        let label = this.playerLabels.get(player.id);
        if (!sprite) {
          sprite = this.add.sprite(player.x, player.y + 10, texture).setDepth(12);
          sprite.setDisplaySize(64, 88);
          this.playerSprites.set(player.id, sprite);
        }
        if (!label) {
          label = this.add.text(player.x, player.y - 58, "", {
            color: "#f8fafc",
            fontSize: "12px",
            fontStyle: "bold",
            stroke: "#0f172a",
            strokeThickness: 4
          }).setOrigin(0.5).setDepth(22);
          this.playerLabels.set(player.id, label);
        }

        sprite.setTexture(texture);
        sprite.setFlipX(player.team === "tide");
        const nextX = snap ? player.x : Phaser.Math.Linear(sprite.x, player.x, 0.34);
        const nextY = snap ? player.y + 10 : Phaser.Math.Linear(sprite.y, player.y + 10, 0.34);
        sprite.setPosition(nextX, nextY);
        sprite.setAlpha(player.recoveryMs > 0 ? 0.82 : 1);
        sprite.setTint(player.team === "sun" ? 0xfff1d0 : 0xdbeafe);
        label.setText(player.username.slice(0, 16));
        label.setPosition(nextX, nextY - 58);
      });

      this.playerSprites.forEach((sprite, id) => {
        if (!activeIds.has(id)) {
          sprite.destroy();
          this.playerSprites.delete(id);
        }
      });
      this.playerLabels.forEach((label, id) => {
        if (!activeIds.has(id)) {
          label.destroy();
          this.playerLabels.delete(id);
        }
      });
    }

    private renderState(snap = false) {
      const state = callbacks.getState();
      this.syncPlayerSprites(state, snap);
      const ballX = snap ? state.ball.x : Phaser.Math.Linear(this.ballSprite.x, state.ball.x, 0.42);
      const ballY = snap ? state.ball.y : Phaser.Math.Linear(this.ballSprite.y, state.ball.y, 0.42);
      this.ballSprite.setPosition(ballX, ballY);
      this.ballSprite.setRotation(this.ballSprite.rotation + state.ball.vx * 0.00045);
      this.scoreText.setText(`${getTeamLabel("sun")} ${state.score.sun}  -  ${state.score.tide} ${getTeamLabel("tide")}`);
      this.messageText.setText(state.message);
    }

    update(_time: number, delta: number) {
      this.runFrameToggle += 1;
      callbacks.onTick(this.getInput(), Math.min(34, delta));
      this.renderState();
    }
  }

  return new Phaser.Game({
    type: Phaser.AUTO,
    width: VOLLEYBALL_WIDTH,
    height: VOLLEYBALL_HEIGHT,
    parent,
    backgroundColor: "#7dd3fc",
    pixelArt: false,
    scene: BeachBumpBashScene,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH
    }
  });
}
