import Phaser from "phaser";
import {
  VOLLEYBALL_BALL_RADIUS,
  VOLLEYBALL_FLOOR_Y,
  VOLLEYBALL_HEIGHT,
  VOLLEYBALL_NET_X,
  VOLLEYBALL_NET_TOP,
  VOLLEYBALL_WIDTH,
  advanceVolleyballPlayer,
  getTeamLabel,
  type VolleyballInput,
  type VolleyballMatchState,
  type VolleyballPlayer
} from "../../lib/volleyball/logic";

type BeachBumpCallbacks = {
  getState: () => VolleyballMatchState;
  getLocalPlayerId: () => string;
  isLocalAuthoritative: () => boolean;
  onTick: (input: VolleyballInput, deltaMs: number) => void;
};

type Snapshot = {
  receivedAt: number;
  state: VolleyballMatchState;
};

const PLAYER_INTERPOLATION_DELAY_MS = 96;
const ACTION_VISUAL_GRACE_MS = 180;
const PLAYER_HARD_SNAP_DISTANCE = 132;
const BALL_HARD_SNAP_DISTANCE = 176;
const LOCAL_PLAYER_HARD_SNAP_DISTANCE = 168;
const LOCAL_PLAYER_SOFT_RECONCILE_DISTANCE = 44;
const LOCAL_PLAYER_ACTIVE_RECONCILE = 0.035;
const LOCAL_PLAYER_IDLE_RECONCILE = 0.22;
const STILL_VELOCITY_EPSILON = 8;

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
    predictedLocalPlayers = new Map<string, VolleyballPlayer>();
    snapshotBuffer: Snapshot[] = [];
    ballSprite!: Phaser.GameObjects.Image;
    scoreText!: Phaser.GameObjects.Text;
    messageText!: Phaser.GameObjects.Text;
    keys!: Record<"leftA" | "rightD" | "left" | "right" | "jumpW" | "jumpUp" | "jumpSpace" | "bump" | "set" | "spike" | "diveShift" | "diveI", Phaser.Input.Keyboard.Key>;
    latestInput: VolleyballInput = {};
    latestSequence = -1;
    latestPhase: VolleyballMatchState["phase"] | null = null;
    runFrameToggle = 0;
    spaceBlocker?: (event: KeyboardEvent) => void;

    preload() {
      const base = `${assetBase}assets/volleyball/`;
      this.load.image("volleyball-bg", `${base}beach-background-ai.png`);
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
      this.add.image(VOLLEYBALL_WIDTH / 2, VOLLEYBALL_HEIGHT / 2, "volleyball-bg")
        .setDisplaySize(VOLLEYBALL_WIDTH, VOLLEYBALL_HEIGHT)
        .setDepth(0);
      this.add.image(VOLLEYBALL_WIDTH / 2, VOLLEYBALL_FLOOR_Y + 40, "volleyball-court").setAlpha(0.42).setDepth(1);
      const netHeight = VOLLEYBALL_FLOOR_Y - VOLLEYBALL_NET_TOP + 22;
      this.add.image(VOLLEYBALL_NET_X, VOLLEYBALL_NET_TOP + netHeight / 2 - 8, "volleyball-net")
        .setDisplaySize(84, netHeight)
        .setDepth(5);
      this.add.rectangle(VOLLEYBALL_NET_X, VOLLEYBALL_NET_TOP + netHeight / 2 - 8, 3, netHeight - 18, 0x0f172a, 0.22).setDepth(6);

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

      this.spaceBlocker = (event: KeyboardEvent) => event.preventDefault();
      this.input.keyboard?.on("keydown-SPACE", this.spaceBlocker);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        if (this.spaceBlocker) {
          this.input.keyboard?.off("keydown-SPACE", this.spaceBlocker);
        }
      });
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

    private pushSnapshot(state: VolleyballMatchState) {
      const now = performance.now();
      const resetLikePhase = this.latestPhase !== null && this.latestPhase !== state.phase &&
        (state.phase === "countdown" || state.phase === "point" || state.phase === "gameOver");

      if (resetLikePhase) {
        this.snapshotBuffer = [];
        this.predictedLocalPlayers.clear();
      }

      if (state.sequence === this.latestSequence && !resetLikePhase) {
        return;
      }

      this.snapshotBuffer.push({
        receivedAt: now,
        state: cloneState(state)
      });
      this.snapshotBuffer = this.snapshotBuffer.slice(-12);
      this.latestSequence = state.sequence;
      this.latestPhase = state.phase;
    }

    private buildInterpolatedState(state: VolleyballMatchState, snap: boolean): VolleyballMatchState {
      this.pushSnapshot(state);
      const localAuthoritative = callbacks.isLocalAuthoritative();
      const frameDt = Math.min(0.034, this.game.loop.delta / 1000);
      if (snap || localAuthoritative || this.snapshotBuffer.length <= 1) {
        if (!localAuthoritative) {
          return this.withPredictedLocalPlayer(state, frameDt);
        }
        return state;
      }

      const now = performance.now();
      const renderAt = now - PLAYER_INTERPOLATION_DELAY_MS;
      let older = this.snapshotBuffer[0];
      let newer = this.snapshotBuffer[this.snapshotBuffer.length - 1];
      for (let index = 0; index < this.snapshotBuffer.length - 1; index += 1) {
        const current = this.snapshotBuffer[index];
        const next = this.snapshotBuffer[index + 1];
        if (renderAt >= current.receivedAt && renderAt <= next.receivedAt) {
          older = current;
          newer = next;
          break;
        }
        if (renderAt > next.receivedAt) {
          older = next;
          newer = next;
        }
      }

      const span = Math.max(1, newer.receivedAt - older.receivedAt);
      const alpha = newer === older ? 1 : Phaser.Math.Clamp((renderAt - older.receivedAt) / span, 0, 1);
      const olderPlayers = new Map(older.state.players.map((player) => [player.id, player]));
      const newerPlayers = new Map(newer.state.players.map((player) => [player.id, player]));
      const interpolatedPlayers = state.players.map((player) => {
        const start = olderPlayers.get(player.id) ?? player;
        const end = newerPlayers.get(player.id) ?? player;
        return interpolatePlayer(start, end, alpha, newer.receivedAt, now);
      });
      const interpolatedBall = interpolateBall(older.state.ball, newer.state.ball, alpha);
      return this.withPredictedLocalPlayer({
        ...state,
        players: interpolatedPlayers,
        ball: interpolatedBall
      }, frameDt);
    }

    private withPredictedLocalPlayer(state: VolleyballMatchState, dt: number): VolleyballMatchState {
      if (callbacks.isLocalAuthoritative()) {
        return state;
      }
      const localPlayerId = callbacks.getLocalPlayerId();
      if (!localPlayerId) {
        return state;
      }
      const authoritativeLocal = state.players.find((player) => player.id === localPlayerId);
      if (!authoritativeLocal) {
        this.predictedLocalPlayers.delete(localPlayerId);
        return state;
      }

      const predicted = this.predictedLocalPlayers.get(localPlayerId);
      const localInputActive = Boolean(
        this.latestInput.left ||
        this.latestInput.right ||
        this.latestInput.jump ||
        this.latestInput.bump ||
        this.latestInput.set ||
        this.latestInput.spike ||
        this.latestInput.dive
      );
      const needsSnap = !predicted ||
        state.phase !== "playing" ||
        Phaser.Math.Distance.Between(predicted.x, predicted.y, authoritativeLocal.x, authoritativeLocal.y) > LOCAL_PLAYER_HARD_SNAP_DISTANCE;
      const seeded = needsSnap ? { ...authoritativeLocal } : { ...predicted };
      let nextPredicted = dt > 0 ? advanceVolleyballPlayer(seeded, this.latestInput, dt) : seeded;
      const predictionError = Phaser.Math.Distance.Between(
        nextPredicted.x,
        nextPredicted.y,
        authoritativeLocal.x,
        authoritativeLocal.y
      );
      const shouldSoftReconcile = predictionError > LOCAL_PLAYER_SOFT_RECONCILE_DISTANCE;
      const reconcileFactor = shouldSoftReconcile
        ? (localInputActive || !nextPredicted.grounded ? LOCAL_PLAYER_ACTIVE_RECONCILE : LOCAL_PLAYER_IDLE_RECONCILE)
        : 0;

      nextPredicted = {
        ...nextPredicted,
        x: reconcileFactor > 0 ? Phaser.Math.Linear(nextPredicted.x, authoritativeLocal.x, reconcileFactor) : nextPredicted.x,
        y: reconcileFactor > 0 ? Phaser.Math.Linear(nextPredicted.y, authoritativeLocal.y, reconcileFactor) : nextPredicted.y,
        vx: reconcileFactor > 0 ? Phaser.Math.Linear(nextPredicted.vx, authoritativeLocal.vx, reconcileFactor * 1.15) : nextPredicted.vx,
        vy: reconcileFactor > 0 ? Phaser.Math.Linear(nextPredicted.vy, authoritativeLocal.vy, reconcileFactor * 1.15) : nextPredicted.vy,
        facing: this.latestInput.left ? -1 : this.latestInput.right ? 1 : authoritativeLocal.facing,
        grounded: authoritativeLocal.grounded ? nextPredicted.grounded : false,
        action: getPredictedAction(authoritativeLocal, nextPredicted, this.latestInput),
        actionMs: Math.max(nextPredicted.actionMs, authoritativeLocal.actionMs),
        recoveryMs: Math.max(nextPredicted.recoveryMs, authoritativeLocal.recoveryMs),
        contactCooldownMs: authoritativeLocal.contactCooldownMs
      };

      this.predictedLocalPlayers.set(localPlayerId, nextPredicted);
      return {
        ...state,
        players: state.players.map((player) => player.id === localPlayerId ? nextPredicted : player)
      };
    }

    private syncPlayerSprites(state: VolleyballMatchState, snap = false) {
      const activeIds = new Set(state.players.map((player) => player.id));
      state.players.forEach((player) => {
        const visualAction = getVisualAction(player);
        const texture = visualAction === "run" && this.runFrameToggle % 28 > 14
          ? "volleyball-player-run-2"
          : ACTION_TEXTURES[visualAction];
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
        sprite.setFlipX(player.facing < 0);
        const nextX = snap ? player.x : smoothCoordinate(sprite.x, player.x, player.vx);
        const nextY = snap ? player.y + 10 : smoothCoordinate(sprite.y, player.y + 10, player.vy);
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
      const state = this.buildInterpolatedState(callbacks.getState(), snap);
      this.syncPlayerSprites(state, snap);
      const ballSnap = snap ||
        Phaser.Math.Distance.Between(this.ballSprite.x, this.ballSprite.y, state.ball.x, state.ball.y) > BALL_HARD_SNAP_DISTANCE;
      const ballX = ballSnap ? state.ball.x : smoothCoordinate(this.ballSprite.x, state.ball.x, state.ball.vx, 0.3);
      const ballY = ballSnap ? state.ball.y : smoothCoordinate(this.ballSprite.y, state.ball.y, state.ball.vy, 0.32);
      this.ballSprite.setPosition(ballX, ballY);
      this.ballSprite.setRotation(this.ballSprite.rotation + state.ball.vx * 0.00045);
      this.scoreText.setText(`${getTeamLabel("sun")} ${state.score.sun}  -  ${state.score.tide} ${getTeamLabel("tide")}`);
      this.messageText.setText(state.message);
      this.publishDebugState(state);
    }

    update(_time: number, delta: number) {
      this.runFrameToggle += 1;
      this.latestInput = this.getInput();
      callbacks.onTick(this.latestInput, Math.min(34, delta));
      this.renderState();
    }

    private publishDebugState(state: VolleyballMatchState) {
      if (!import.meta.env.DEV) {
        return;
      }
        const debugWindow = window as typeof window & {
          __beachBumpRenderDebug?: {
            players: Array<{ id: string; x: number; y: number; action: VolleyballPlayer["action"]; grounded: boolean; facing: number }>;
          ball: { x: number; y: number; vx: number; vy: number };
          phase: VolleyballMatchState["phase"];
          sequence: number;
        };
      };
      debugWindow.__beachBumpRenderDebug = {
        players: state.players.map((player) => ({
          id: player.id,
          x: this.playerSprites.get(player.id)?.x ?? player.x,
          y: (this.playerSprites.get(player.id)?.y ?? (player.y + 10)) - 10,
          action: getVisualAction(player),
          grounded: player.grounded,
          facing: player.facing
        })),
        ball: {
          x: this.ballSprite.x,
          y: this.ballSprite.y,
          vx: state.ball.vx,
          vy: state.ball.vy
        },
        phase: state.phase,
        sequence: state.sequence
      };
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

function cloneState(state: VolleyballMatchState): VolleyballMatchState {
  return {
    ...state,
    players: state.players.map((player) => ({ ...player })),
    ball: { ...state.ball },
    score: { ...state.score }
  };
}

function interpolatePlayer(
  start: VolleyballPlayer,
  end: VolleyballPlayer,
  alpha: number,
  targetReceivedAt: number,
  now: number
): VolleyballPlayer {
  const immediateAction = end.action !== "idle" && end.action !== "run" && now - targetReceivedAt < ACTION_VISUAL_GRACE_MS;
  return {
    ...end,
    x: Phaser.Math.Linear(start.x, end.x, alpha),
    y: Phaser.Math.Linear(start.y, end.y, alpha),
    vx: Phaser.Math.Linear(start.vx, end.vx, alpha),
    vy: Phaser.Math.Linear(start.vy, end.vy, alpha),
    facing: immediateAction ? end.facing : alpha < 0.5 ? start.facing : end.facing,
    grounded: immediateAction ? end.grounded : alpha < 0.5 ? start.grounded : end.grounded,
    action: immediateAction ? end.action : pickAction(start.action, end.action, alpha),
    actionMs: Phaser.Math.Linear(start.actionMs, end.actionMs, alpha),
    recoveryMs: Phaser.Math.Linear(start.recoveryMs, end.recoveryMs, alpha),
    contactCooldownMs: Phaser.Math.Linear(start.contactCooldownMs, end.contactCooldownMs, alpha)
  };
}

function interpolateBall(start: VolleyballMatchState["ball"], end: VolleyballMatchState["ball"], alpha: number) {
  return {
    ...end,
    x: Phaser.Math.Linear(start.x, end.x, alpha),
    y: Phaser.Math.Linear(start.y, end.y, alpha),
    vx: Phaser.Math.Linear(start.vx, end.vx, alpha),
    vy: Phaser.Math.Linear(start.vy, end.vy, alpha)
  };
}

function smoothCoordinate(current: number, target: number, velocity: number, factor = 0.34) {
  if (Math.abs(target - current) < 0.8 && Math.abs(velocity) < STILL_VELOCITY_EPSILON) {
    return target;
  }
  return Phaser.Math.Linear(current, target, factor);
}

function pickAction(start: VolleyballPlayer["action"], end: VolleyballPlayer["action"], alpha: number) {
  if (end !== start && end !== "idle" && end !== "run") {
    return end;
  }
  return alpha < 0.5 ? start : end;
}

function getPredictedAction(
  authoritative: VolleyballPlayer,
  predicted: VolleyballPlayer,
  input: VolleyballInput
): VolleyballPlayer["action"] {
  if (authoritative.action !== "idle" && authoritative.action !== "run") {
    return authoritative.action;
  }
  if (input.dive) return "dive";
  if (input.spike) return "spike";
  if (input.set) return "set";
  if (input.bump) return "bump";
  if (input.jump || !predicted.grounded) return "jump";
  if (input.left || input.right) return "run";
  return authoritative.action;
}

function getVisualAction(player: VolleyballPlayer): VolleyballPlayer["action"] {
  if (!player.grounded && (player.action === "idle" || player.action === "run" || player.action === "jump")) {
    return "jump";
  }
  return player.action;
}
