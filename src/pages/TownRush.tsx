import React, { useEffect, useRef, useState } from "react";
import Phaser from "phaser";
import NavBar from "../components/NavBar";
import { profileColorToNumber } from "../lib/profileColor";
import { recordArcadeResult } from "../lib/progression";
import { supabase } from "../lib/supabase";

type LaneKind = "start" | "road" | "park" | "rail";
type DistrictTier = 0 | 1 | 2 | 3;

type Obstacle = {
  x: number;
  width: number;
  speed: number;
  direction: 1 | -1;
  color: number;
  pattern: "cruiser" | "convoy" | "sprinter";
};

type LaneData = {
  index: number;
  kind: LaneKind;
  tier: DistrictTier;
  blockers: number[];
  coinColumn: number | null;
  obstacles: Obstacle[];
  trainDirection: 1 | -1;
  trainSpeed: number;
  trainOffset: number;
  trainCooldownMs: number;
  trainWarningMs: number;
  trainActiveMs: number;
  trainTimerMs: number;
  stripeOffset: number;
};

type MoveDirection = "up" | "down" | "left" | "right";

type FloatingLabel = {
  id: number;
  x: number;
  row: number;
  y: number;
  text: string;
  color: string;
  ttlMs: number;
};

type GameOverPayload = {
  score: number;
  distance: number;
  coins: number;
  goldEarned: number;
  reason: string;
};

const WIDTH = 520;
const HEIGHT = 720;
const COLS = 9;
const TILE_SIZE = 56;
const VISIBLE_ROWS = 12;
const PLAYER_BASELINE_ROW = 2;
const BOARD_PADDING_X = 8;
const BOARD_TOP = 68;
const BOARD_HEIGHT = TILE_SIZE * VISIBLE_ROWS;
const PLAYER_SIZE = 32;
const HOP_DURATION_MS = 105;
const TRAIN_TOTAL_WIDTH = WIDTH + 220;
const FEVER_CHARGE_MAX = 100;
const FEVER_DURATION_MS = 6000;
const FOCUS_DURATION_MS = 2600;
const TOWN_RUSH_LOCAL_BEST_KEY = "focusland-town-rush-best";
const DISTRICT_THRESHOLDS = [500, 1000, 1500] as const;
const DISTRICT_LABELS = [
  "Starter Strip",
  "Market Mile",
  "Signal Core",
  "Night Rush"
] as const;

type LocalBest = {
  score: number;
  distance: number;
};

function loadLocalBest(): LocalBest {
  if (typeof window === "undefined") {
    return { score: 0, distance: 0 };
  }

  try {
    const raw = window.localStorage.getItem(TOWN_RUSH_LOCAL_BEST_KEY);
    if (!raw) {
      return { score: 0, distance: 0 };
    }

    const parsed = JSON.parse(raw) as Partial<LocalBest>;
    return {
      score: Number(parsed.score ?? 0),
      distance: Number(parsed.distance ?? 0)
    };
  } catch {
    return { score: 0, distance: 0 };
  }
}

function saveLocalBest(best: LocalBest) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(TOWN_RUSH_LOCAL_BEST_KEY, JSON.stringify(best));
}

function getDistrictTier(score: number): DistrictTier {
  if (score >= DISTRICT_THRESHOLDS[2]) return 3;
  if (score >= DISTRICT_THRESHOLDS[1]) return 2;
  if (score >= DISTRICT_THRESHOLDS[0]) return 1;
  return 0;
}

function laneWorldY(row: number, cameraRow: number) {
  return BOARD_TOP + BOARD_HEIGHT - (row - cameraRow + 1) * TILE_SIZE;
}

function cellCenterX(column: number) {
  return BOARD_PADDING_X + column * TILE_SIZE + TILE_SIZE / 2;
}

function rectsOverlap(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number
) {
  return Math.abs(ax - bx) * 2 < aw + bw && Math.abs(ay - by) * 2 < ah + bh;
}

class TownRushRun {
  lanes = new Map<number, LaneData>();
  playerColumn = Math.floor(COLS / 2);
  playerRow = 0;
  startColumn = Math.floor(COLS / 2);
  furthestRow = 0;
  coins = 0;
  score = 0;
  rushStreak = 0;
  rushTimerMs = 0;
  feverCharge = 0;
  feverMs = 0;
  closeCallCooldownMs = 0;
  focusCharges = 0;
  focusMs = 0;
  districtTier: DistrictTier = 0;
  lastMilestoneScore = 0;
  alive = true;
  deathReason = "";
  hopElapsedMs = 0;
  hopFromColumn = this.playerColumn;
  hopFromRow = this.playerRow;
  hopToColumn = this.playerColumn;
  hopToRow = this.playerRow;
  hopping = false;
  floatingLabels: FloatingLabel[] = [];
  nextFloatingLabelId = 1;
  shakeMs = 0;
  minActiveRow = -8;
  maxActiveRow = 20;

  ensureLane(index: number) {
    if (!this.lanes.has(index)) {
      this.lanes.set(index, this.createLane(index));
    }

    return this.lanes.get(index)!;
  }

  createLane(index: number): LaneData {
    if (index <= 0) {
      return {
        index,
        kind: "start",
        tier: 0,
        blockers: [],
        coinColumn: null,
        obstacles: [],
        trainDirection: 1,
        trainSpeed: 0,
        trainOffset: 0,
        trainCooldownMs: 0,
        trainWarningMs: 0,
        trainActiveMs: 0,
        trainTimerMs: 0,
        stripeOffset: 0
      };
    }

    const roll = Math.random();
    const tier = this.districtTier;
    let consecutiveRoads = 0;
    for (let previous = index - 1; previous >= Math.max(1, index - 3); previous -= 1) {
      const priorLane = this.lanes.get(previous);
      if (!priorLane || priorLane.kind !== "road") {
        break;
      }
      consecutiveRoads += 1;
    }
    let kind: LaneKind;
    if (index < 3) {
      kind = "park";
    } else if (consecutiveRoads >= 2) {
      kind = Math.random() < 0.58 ? "park" : "rail";
    } else if (roll < (tier >= 2 ? 0.14 : 0.18)) {
      kind = "park";
    } else if (roll < (tier >= 1 ? 0.38 : 0.34)) {
      kind = "rail";
    } else {
      kind = "road";
    }

    const lane: LaneData = {
      index,
      kind,
      tier,
      blockers: [],
      coinColumn: null,
      obstacles: [],
      trainDirection: Math.random() > 0.5 ? 1 : -1,
      trainSpeed: 420 + Math.random() * 140 + Math.min(180, index * 4.8),
      trainOffset: 0,
      trainCooldownMs: Math.max(1200, 2500 + Math.random() * 1800 - index * 18),
      trainWarningMs: 850,
      trainActiveMs: 1500,
      trainTimerMs: Math.random() * 3200,
      stripeOffset: Math.random() * TILE_SIZE
    };

    if (kind === "park") {
      const blockers = new Set<number>();
      const blockerCount =
        tier >= 3
          ? Phaser.Math.Between(2, 3)
          : Math.random() < 0.55
            ? 1
            : 2;
      while (blockers.size < blockerCount) {
        const value = Phaser.Math.Between(0, COLS - 1);
        if (value !== this.startColumn) {
          blockers.add(value);
        }
      }
      lane.blockers = Array.from(blockers.values());
      if (Math.random() < (tier >= 2 ? 0.72 : 0.55)) {
        const candidates = Array.from({ length: COLS }, (_, column) => column).filter(
          (column) => !blockers.has(column)
        );
        lane.coinColumn = Phaser.Utils.Array.GetRandom(candidates);
      }
    }

    if (kind === "road") {
      const direction: 1 | -1 = Math.random() > 0.5 ? 1 : -1;
      const patternRoll = Math.random();
      const pattern =
        tier >= 2 && patternRoll > 0.62
          ? "sprinter"
          : tier >= 1 && patternRoll > 0.3
            ? "convoy"
            : "cruiser";
      const speedBase =
        pattern === "sprinter"
          ? [185, 205, 225, 245]
          : pattern === "convoy"
            ? [135, 150, 165, 180]
            : [120, 135, 150, 165];
      const speed = speedBase[Math.min(tier, speedBase.length - 1)];
      const width =
        pattern === "sprinter"
          ? TILE_SIZE * 0.72
          : pattern === "convoy"
            ? TILE_SIZE * 0.94
            : TILE_SIZE * 1.16;
      const gapTiles =
        pattern === "sprinter"
          ? 4.2
          : pattern === "convoy"
            ? 3.5
            : 4.6;
      const cycle = width + TILE_SIZE * gapTiles;
      const startX = Phaser.Math.FloatBetween(-cycle * 0.35, cycle * 0.35);
      const obstacleCount = Math.max(2, Math.ceil((WIDTH + cycle) / cycle));
      for (let index = 0; index < obstacleCount; index += 1) {
        lane.obstacles.push({
          x: startX + index * cycle,
          width,
          speed,
          direction,
          color: Phaser.Display.Color.GetColor(
            Phaser.Math.Between(110, 255),
            Phaser.Math.Between(80, 180),
            Phaser.Math.Between(70, 120)
          ),
          pattern
        });
      }
    }

    return lane;
  }

  tryMove(direction: MoveDirection) {
    if (!this.alive || this.hopping) {
      return false;
    }

    const nextColumn =
      direction === "left"
        ? this.playerColumn - 1
        : direction === "right"
          ? this.playerColumn + 1
          : this.playerColumn;
    const nextRow =
      direction === "up"
        ? this.playerRow + 1
        : direction === "down"
          ? Math.max(0, this.playerRow - 1)
          : this.playerRow;

    if (nextColumn < 0 || nextColumn >= COLS) {
      return false;
    }

    const lane = this.ensureLane(nextRow);
    if (lane.blockers.includes(nextColumn)) {
      return false;
    }

    this.hopping = true;
    this.hopElapsedMs = 0;
    this.hopFromColumn = this.playerColumn;
    this.hopFromRow = this.playerRow;
    this.hopToColumn = nextColumn;
    this.hopToRow = nextRow;

    if (direction === "up") {
      if (this.rushTimerMs > 0) {
        this.rushStreak += 1;
      } else {
        this.rushStreak = 1;
      }
      this.rushTimerMs = 1350;
    } else if (direction === "down") {
      this.rushStreak = 0;
      this.rushTimerMs = 0;
    }

    return true;
  }

  activateFocus() {
    if (!this.alive || this.focusCharges <= 0 || this.focusMs > 0) {
      return false;
    }

    this.focusCharges -= 1;
    this.focusMs = FOCUS_DURATION_MS + this.districtTier * 250;
    this.addFloatingLabel(cellCenterX(this.playerColumn), this.playerRow, -8, "FOCUS", "#93c5fd");
    return true;
  }

  update(deltaMs: number) {
    if (this.shakeMs > 0) {
      this.shakeMs = Math.max(0, this.shakeMs - deltaMs);
    }

    this.focusMs = Math.max(0, this.focusMs - deltaMs);
    this.closeCallCooldownMs = Math.max(0, this.closeCallCooldownMs - deltaMs);
    this.rushTimerMs = Math.max(0, this.rushTimerMs - deltaMs);
    this.feverMs = Math.max(0, this.feverMs - deltaMs);
    const worldDelta = this.focusMs > 0 ? deltaMs * 0.42 : deltaMs;
    if (this.rushTimerMs === 0 && !this.hopping) {
      this.rushStreak = 0;
    }

    const minRow = this.playerRow + this.minActiveRow;
    const maxRow = this.playerRow + this.maxActiveRow;

    this.lanes.forEach((lane, key) => {
      if (key < minRow || key > maxRow) {
        this.lanes.delete(key);
        return;
      }

      if (lane.kind === "road") {
        lane.obstacles.forEach((obstacle) => {
          obstacle.x += obstacle.speed * obstacle.direction * (worldDelta / 1000);
          const wrapBuffer = 90;
          if (obstacle.direction === 1 && obstacle.x - obstacle.width / 2 > WIDTH + wrapBuffer) {
            obstacle.x = -obstacle.width / 2 - wrapBuffer;
          } else if (obstacle.direction === -1 && obstacle.x + obstacle.width / 2 < -wrapBuffer) {
            obstacle.x = WIDTH + obstacle.width / 2 + wrapBuffer;
          }
        });
        lane.stripeOffset = (lane.stripeOffset + worldDelta * 0.08) % TILE_SIZE;
      }

      if (lane.kind === "rail") {
        lane.trainTimerMs += worldDelta;
        const cycle = lane.trainCooldownMs + lane.trainWarningMs + lane.trainActiveMs;
        if (lane.trainTimerMs > cycle) {
          lane.trainTimerMs -= cycle;
        }
        const activeStart = lane.trainCooldownMs + lane.trainWarningMs;
        if (lane.trainTimerMs < activeStart) {
          lane.trainOffset =
            lane.trainDirection === 1
              ? -TRAIN_TOTAL_WIDTH
              : WIDTH + TRAIN_TOTAL_WIDTH;
        } else {
          const progress = (lane.trainTimerMs - activeStart) / lane.trainActiveMs;
          lane.trainOffset =
            lane.trainDirection === 1
              ? -TRAIN_TOTAL_WIDTH + progress * (WIDTH + TRAIN_TOTAL_WIDTH * 2)
              : WIDTH + TRAIN_TOTAL_WIDTH - progress * (WIDTH + TRAIN_TOTAL_WIDTH * 2);
        }
      }
    });

    if (this.hopping) {
      this.hopElapsedMs += deltaMs;
      if (this.hopElapsedMs >= HOP_DURATION_MS) {
        this.playerColumn = this.hopToColumn;
        this.playerRow = this.hopToRow;
        this.hopping = false;
        this.hopElapsedMs = 0;

        if (this.playerRow > this.furthestRow) {
          this.furthestRow = this.playerRow;
          const stepScore = this.feverMs > 0 ? 20 : 10;
          this.score += stepScore;
          if (this.rushStreak >= 4 && this.rushStreak % 2 === 0) {
            const rushBonus = Math.min(20, this.rushStreak);
            this.score += rushBonus;
            this.addFloatingLabel(cellCenterX(this.playerColumn), this.playerRow, 0, `RUSH +${rushBonus}`, "#fde047");
          }
          this.addFeverCharge(6);
          if (this.playerRow % 15 === 0) {
            const milestoneBonus = this.feverMs > 0 ? 80 : 40;
            this.score += milestoneBonus;
            this.addFloatingLabel(
              cellCenterX(this.playerColumn),
              this.playerRow,
              0,
              `CHECKPOINT +${milestoneBonus}`,
              "#c4b5fd"
            );
          }
        }

        const lane = this.ensureLane(this.playerRow);
        if (lane.coinColumn === this.playerColumn) {
          lane.coinColumn = null;
          this.coins += 1;
          const coinScore = this.feverMs > 0 ? 50 : 25;
          this.score += coinScore;
          this.addFeverCharge(10);
          this.addFloatingLabel(cellCenterX(this.playerColumn), this.playerRow, 0, `+${coinScore}`, "#86efac");
        }

        this.checkDistrictMilestones();
      }
    }

    this.floatingLabels = this.floatingLabels
      .map((label) => ({
        ...label,
        ttlMs: label.ttlMs - deltaMs,
        y: label.y - deltaMs * 0.04
      }))
      .filter((label) => label.ttlMs > 0);

    if (this.alive) {
      this.checkCollisions();
    }

    for (let row = minRow; row <= maxRow; row += 1) {
      this.ensureLane(row);
    }
  }

  getPlayerRenderPosition() {
    const progress = this.hopping ? this.hopElapsedMs / HOP_DURATION_MS : 1;
    const eased = this.hopping ? Phaser.Math.Easing.Cubic.Out(progress) : 1;
    const column = Phaser.Math.Linear(this.hopFromColumn, this.hopToColumn, eased);
    const row = Phaser.Math.Linear(this.hopFromRow, this.hopToRow, eased);
    return { column, row };
  }

  getCameraRow() {
    const player = this.getPlayerRenderPosition();
    return Math.max(0, player.row - PLAYER_BASELINE_ROW);
  }

  addFloatingLabel(x: number, row: number, y: number, text: string, color: string) {
    this.floatingLabels.push({
      id: this.nextFloatingLabelId,
      x,
      row,
      y,
      text,
      color,
      ttlMs: 760
    });
    this.nextFloatingLabelId += 1;
  }

  addFeverCharge(amount: number) {
    if (this.feverMs > 0) {
      this.feverMs = Math.min(FEVER_DURATION_MS, this.feverMs + amount * 18);
      return;
    }

    this.feverCharge = Math.min(FEVER_CHARGE_MAX, this.feverCharge + amount);
    if (this.feverCharge >= FEVER_CHARGE_MAX) {
      this.feverCharge = 0;
      this.feverMs = FEVER_DURATION_MS;
      this.addFloatingLabel(cellCenterX(this.playerColumn), this.playerRow, -4, "FEVER!", "#fb7185");
    }
  }

  checkDistrictMilestones() {
    const nextTier = getDistrictTier(this.score);
    if (nextTier <= this.districtTier) {
      return;
    }

    for (let tier = this.districtTier + 1; tier <= nextTier; tier += 1) {
      this.districtTier = tier as DistrictTier;
      this.focusCharges += 1;
      this.addFeverCharge(18);
      this.addFloatingLabel(
        cellCenterX(this.playerColumn),
        this.playerRow,
        -16,
        DISTRICT_LABELS[tier as DistrictTier].toUpperCase(),
        tier >= 3 ? "#fb7185" : "#93c5fd"
      );
      this.lastMilestoneScore = DISTRICT_THRESHOLDS[tier - 1];
    }
  }

  awardCloseCall(row: number, amount: number, color = "#fca5a5") {
    if (this.closeCallCooldownMs > 0 || !this.alive) {
      return;
    }

    this.closeCallCooldownMs = 320;
    this.score += amount;
    this.addFeverCharge(14);
    this.addFloatingLabel(cellCenterX(this.playerColumn), row, -8, `CLOSE +${amount}`, color);
  }

  checkCollisions() {
    const player = this.getPlayerRenderPosition();
    const playerX = cellCenterX(player.column);
    const lane = this.ensureLane(Math.round(player.row));
    if (lane.kind === "road") {
      let nearMiss = false;
      const collision = lane.obstacles.some((obstacle) =>
        rectsOverlap(
          playerX,
          0,
          PLAYER_SIZE,
          PLAYER_SIZE,
          obstacle.x,
          0,
          obstacle.width,
          TILE_SIZE * 0.62
        )
      );
      nearMiss = lane.obstacles.some(
        (obstacle) =>
          Math.abs(playerX - obstacle.x) < obstacle.width / 2 + 18
          && Math.abs(playerX - obstacle.x) > obstacle.width / 2 + 2
      );
      if (collision) {
        this.kill("Flattened by traffic");
      } else if (nearMiss) {
        this.awardCloseCall(lane.index, this.feverMs > 0 ? 24 : 12);
      }
    }

    if (lane.kind === "rail") {
      const activeStart = lane.trainCooldownMs + lane.trainWarningMs;
      const activeEnd = activeStart + lane.trainActiveMs;
      if (lane.trainTimerMs >= activeStart && lane.trainTimerMs <= activeEnd) {
        const trainCenter = lane.trainOffset;
        const nearMiss =
          Math.abs(playerX - trainCenter) < TRAIN_TOTAL_WIDTH / 2 + 30
          && Math.abs(playerX - trainCenter) > TRAIN_TOTAL_WIDTH / 2 + 4;
        if (
          rectsOverlap(
            playerX,
            0,
            PLAYER_SIZE,
            PLAYER_SIZE,
            trainCenter,
            0,
            TRAIN_TOTAL_WIDTH,
            TILE_SIZE * 0.72
          )
        ) {
          this.kill("Clipped by the express");
        } else if (nearMiss) {
          this.awardCloseCall(lane.index, this.feverMs > 0 ? 30 : 15, "#fdba74");
        }
      }
    }
  }

  kill(reason: string) {
    if (!this.alive) {
      return;
    }
    this.alive = false;
    this.deathReason = reason;
    this.rushStreak = 0;
    this.rushTimerMs = 0;
    this.shakeMs = 260;
  }
}

const TownRush: React.FC = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const [status, setStatus] = useState("Dash forward, dodge traffic, and beat your best run.");
  const [canRestart, setCanRestart] = useState(false);
  const [restartCount, setRestartCount] = useState(0);
  const [lastRun, setLastRun] = useState<{ score: number; distance: number; coins: number } | null>(null);
  const [bestRun, setBestRun] = useState<LocalBest>(() => loadLocalBest());

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    let isUnmounted = false;
    let cleanup: (() => void) | undefined;

    const setup = async () => {
      let playerColor = profileColorToNumber(null);
      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (session) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("color")
          .eq("id", session.user.id)
          .maybeSingle();
        playerColor = profileColorToNumber((profile?.color as string | null) ?? null);
      }

      if (isUnmounted || !containerRef.current) {
        return;
      }

      const handleGameOver = (payload: GameOverPayload) => {
        setCanRestart(true);
        setLastRun({
          score: payload.score,
          distance: payload.distance,
          coins: payload.coins
        });
        const nextBest = {
          score: Math.max(bestRun.score, payload.score),
          distance: Math.max(bestRun.distance, payload.distance)
        };
        if (nextBest.score !== bestRun.score || nextBest.distance !== bestRun.distance) {
          saveLocalBest(nextBest);
          setBestRun(nextBest);
        }
        setStatus(`${payload.reason}. Saving score...`);

        void (async () => {
          try {
            await recordArcadeResult({
              scoreGameName: "town_rush",
              score: payload.score,
              goldEarned: payload.goldEarned
            });
            setStatus(
              `${payload.reason}. Score saved at ${payload.score}. +${payload.goldEarned} gold.`
            );
          } catch {
            setStatus(`${payload.reason}. Local run finished, but score could not be saved.`);
          }
        })();
      };

      class TownRushScene extends Phaser.Scene {
        run = new TownRushRun();
        cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
        wasd?: Record<"up" | "down" | "left" | "right", Phaser.Input.Keyboard.Key>;
        graphics!: Phaser.GameObjects.Graphics;
        playerShadow!: Phaser.GameObjects.Ellipse;
        playerBody!: Phaser.GameObjects.Rectangle;
        playerTrim!: Phaser.GameObjects.Rectangle;
        headerText!: Phaser.GameObjects.Text;
        scoreText!: Phaser.GameObjects.Text;
        coinText!: Phaser.GameObjects.Text;
        rushText!: Phaser.GameObjects.Text;
        feverText!: Phaser.GameObjects.Text;
        bestText!: Phaser.GameObjects.Text;
        districtText!: Phaser.GameObjects.Text;
        focusText!: Phaser.GameObjects.Text;
        topHudPanel!: Phaser.GameObjects.Rectangle;
        bottomHudPanel!: Phaser.GameObjects.Rectangle;
        focusButtonLabel!: Phaser.GameObjects.Text;
        floatingTextPool = new Map<number, Phaser.GameObjects.Text>();
        finished = false;

        create() {
          this.cameras.main.setBackgroundColor("#0b1324");
          this.graphics = this.add.graphics();
          this.playerShadow = this.add.ellipse(0, 0, 34, 16, 0x020617, 0.45).setDepth(30);
          this.playerBody = this.add.rectangle(0, 0, PLAYER_SIZE, PLAYER_SIZE, playerColor, 1)
            .setStrokeStyle(3, 0xf8fafc, 0.95)
            .setDepth(31);
          this.playerTrim = this.add.rectangle(0, 0, 16, 8, 0xffffff, 0.9).setDepth(32);

          this.topHudPanel = this.add.rectangle(WIDTH / 2, 36, WIDTH - 18, 56, 0x09111f, 0.88)
            .setStrokeStyle(1, 0x334155, 0.9)
            .setDepth(38);

          this.bottomHudPanel = this.add.rectangle(WIDTH / 2, HEIGHT - 34, WIDTH - 18, 44, 0x09111f, 0.84)
            .setStrokeStyle(1, 0x334155, 0.9)
            .setDepth(38);

          this.headerText = this.add.text(20, 22, "TOWN RUSH", {
            fontSize: "20px",
            fontStyle: "bold",
            color: "#f8fafc",
            fontFamily: "\"PublicPixel\", monospace"
          }).setDepth(40);

          this.scoreText = this.add.text(WIDTH - 22, 18, "2234", {
            fontSize: "24px",
            fontStyle: "bold",
            color: "#fde68a",
            fontFamily: "\"PublicPixel\", monospace"
          }).setOrigin(1, 0).setDepth(40);

          this.coinText = this.add.text(WIDTH - 22, 45, "COINS 0", {
            fontSize: "11px",
            color: "#86efac"
          }).setOrigin(1, 0).setDepth(40);

          this.bestText = this.add.text(20, 46, `BEST ${bestRun.score}`, {
            fontSize: "11px",
            color: "#c4b5fd"
          }).setDepth(40);

          this.rushText = this.add.text(20, HEIGHT - 42, "RUSH READY", {
            fontSize: "11px",
            color: "#7dd3fc"
          }).setDepth(40);

          this.districtText = this.add.text(WIDTH / 2, 22, DISTRICT_LABELS[0].toUpperCase(), {
            fontSize: "11px",
            fontStyle: "bold",
            color: "#93c5fd",
            fontFamily: "\"PublicPixel\", monospace"
          }).setOrigin(0.5, 0).setDepth(40);

          this.feverText = this.add.text(WIDTH / 2, HEIGHT - 42, "FEVER 0%", {
            fontSize: "11px",
            fontStyle: "bold",
            color: "#fda4af"
          }).setOrigin(0.5).setDepth(40);

          this.focusText = this.add.text(WIDTH - 20, HEIGHT - 42, "FOCUS 0", {
            fontSize: "11px",
            fontStyle: "bold",
            color: "#bfdbfe"
          }).setOrigin(1, 0.5).setDepth(40);

          this.focusButtonLabel = this.add.text(WIDTH - 64, HEIGHT - 26, "SHIFT", {
            fontSize: "10px",
            fontStyle: "bold",
            color: "#e2e8f0"
          }).setOrigin(0.5).setDepth(40);

          this.cursors = this.input.keyboard?.createCursorKeys();
          if (this.input.keyboard) {
            this.wasd = {
              up: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
              down: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
              left: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
              right: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D)
            };
          }

          this.input.keyboard?.on("keydown-UP", () => this.handleMove("up"));
          this.input.keyboard?.on("keydown-DOWN", () => this.handleMove("down"));
          this.input.keyboard?.on("keydown-LEFT", () => this.handleMove("left"));
          this.input.keyboard?.on("keydown-RIGHT", () => this.handleMove("right"));
          this.input.keyboard?.on("keydown-W", () => this.handleMove("up"));
          this.input.keyboard?.on("keydown-S", () => this.handleMove("down"));
          this.input.keyboard?.on("keydown-A", () => this.handleMove("left"));
          this.input.keyboard?.on("keydown-D", () => this.handleMove("right"));
          this.input.keyboard?.on("keydown-SHIFT", () => this.handleFocus());
          this.input.keyboard?.on("keydown-SPACE", () => this.handleFocus());

          this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
            if (!this.run.alive) {
              return;
            }

            if (pointer.y > HEIGHT - 88 && pointer.x > WIDTH - 128) {
              this.handleFocus();
              return;
            }

            const playerPosition = this.run.getPlayerRenderPosition();
            const playerCenterX = cellCenterX(playerPosition.column);
            const playerCenterY = laneWorldY(playerPosition.row, this.run.getCameraRow()) + TILE_SIZE / 2 - 2;
            const dx = pointer.x - playerCenterX;
            const dy = pointer.y - playerCenterY;
            if (Math.abs(dx) > Math.abs(dy)) {
              this.handleMove(dx < 0 ? "left" : "right");
            } else {
              this.handleMove(dy < 0 ? "up" : "down");
            }
          });
        }

        handleMove(direction: MoveDirection) {
          const moved = this.run.tryMove(direction);
          if (moved) {
            this.tweens.add({
              targets: this.playerBody,
              scaleX: { from: 1.04, to: 1 },
              scaleY: { from: 0.92, to: 1 },
              duration: 110
            });
          }
        }

        handleFocus() {
          const activated = this.run.activateFocus();
          if (activated) {
            this.tweens.add({
              targets: this.playerBody,
              scaleX: { from: 1.18, to: 1 },
              scaleY: { from: 1.18, to: 1 },
              duration: 220
            });
          }
        }

        update(_time: number, delta: number) {
          this.run.update(delta);

          if (!this.run.alive && !this.finished) {
            this.finished = true;
            this.cameras.main.shake(180, 0.008);
            const goldEarned = Math.max(3, Math.min(36, Math.floor(this.run.score / 35) + this.run.coins));
            handleGameOver({
              score: this.run.score,
              distance: this.run.furthestRow,
              coins: this.run.coins,
              goldEarned,
              reason: this.run.deathReason
            });
          }

          this.renderBoard();
          this.syncHud();
        }

        renderBoard() {
          const cameraRow = this.run.getCameraRow();
          const graphics = this.graphics;
          graphics.clear();

          graphics.fillStyle(0x0b1324, 1);
          graphics.fillRect(0, 0, WIDTH, HEIGHT);
          graphics.fillStyle(0x111c33, 1);
          graphics.fillRect(0, BOARD_TOP - 4, WIDTH, BOARD_HEIGHT + 8);
          if (this.run.feverMs > 0) {
            graphics.fillStyle(0xfb7185, 0.08 + 0.08 * Math.sin(this.time.now / 120));
            graphics.fillRect(0, 0, WIDTH, HEIGHT);
          }

          if (this.run.focusMs > 0) {
            graphics.fillStyle(0x38bdf8, 0.06 + 0.04 * Math.sin(this.time.now / 110));
            graphics.fillRect(0, BOARD_TOP - 4, WIDTH, BOARD_HEIGHT + 8);
          }

          for (let row = Math.floor(cameraRow) - 1; row < Math.floor(cameraRow) + VISIBLE_ROWS + 2; row += 1) {
            const lane = this.run.ensureLane(row);
            const laneY = laneWorldY(row, cameraRow);

            if (laneY < BOARD_TOP - TILE_SIZE || laneY > BOARD_TOP + BOARD_HEIGHT) {
              continue;
            }

            if (lane.kind === "road") {
              graphics.fillStyle(0x1f2937, 1);
              graphics.fillRect(0, laneY, WIDTH, TILE_SIZE);
              graphics.fillStyle(lane.obstacles[0]?.direction === 1 ? 0x34d399 : 0xf97316, 0.18);
              graphics.fillRect(0, laneY + 3, WIDTH, 6);
              graphics.fillStyle(0xf8fafc, 0.75);
              for (let x = -TILE_SIZE; x < WIDTH + TILE_SIZE; x += TILE_SIZE * 1.5) {
                graphics.fillRect(x + lane.stripeOffset, laneY + TILE_SIZE / 2 - 3, 28, 6);
              }
            } else if (lane.kind === "rail") {
              graphics.fillStyle(0x362510, 1);
              graphics.fillRect(0, laneY, WIDTH, TILE_SIZE);
              graphics.fillStyle(0x7c5a34, 1);
              for (let x = 18; x < WIDTH; x += 44) {
                graphics.fillRect(x, laneY + 10, 20, TILE_SIZE - 20);
              }
              graphics.fillStyle(0x9ca3af, 1);
              graphics.fillRect(0, laneY + 14, WIDTH, 6);
              graphics.fillRect(0, laneY + TILE_SIZE - 20, WIDTH, 6);

              const activeStart = lane.trainCooldownMs + lane.trainWarningMs;
              const warning = lane.trainTimerMs >= lane.trainCooldownMs && lane.trainTimerMs < activeStart;
              graphics.fillStyle(warning ? 0xf87171 : 0x334155, 0.95);
              graphics.fillCircle(18, laneY + TILE_SIZE / 2, 7);
              graphics.fillCircle(WIDTH - 18, laneY + TILE_SIZE / 2, 7);

              if (lane.trainTimerMs >= activeStart && lane.trainTimerMs <= activeStart + lane.trainActiveMs) {
                graphics.fillStyle(0xdc2626, 1);
                graphics.fillRect(
                  lane.trainOffset - TRAIN_TOTAL_WIDTH / 2,
                  laneY + 6,
                  TRAIN_TOTAL_WIDTH,
                  TILE_SIZE - 12
                );
                graphics.fillStyle(0xfca5a5, 1);
                graphics.fillRect(
                  lane.trainOffset - TRAIN_TOTAL_WIDTH / 2,
                  laneY + TILE_SIZE / 2 - 4,
                  TRAIN_TOTAL_WIDTH,
                  8
                );
              }
            } else {
              const grassColor = lane.kind === "start" ? 0x166534 : 0x15803d;
              graphics.fillStyle(grassColor, 1);
              graphics.fillRect(0, laneY, WIDTH, TILE_SIZE);

              lane.blockers.forEach((column) => {
                const centerX = cellCenterX(column);
                graphics.fillStyle(0x14532d, 1);
                graphics.fillCircle(centerX, laneY + TILE_SIZE / 2 + 4, 16);
                graphics.fillCircle(centerX - 9, laneY + TILE_SIZE / 2 + 2, 12);
                graphics.fillCircle(centerX + 10, laneY + TILE_SIZE / 2 + 1, 13);
                graphics.fillStyle(0x713f12, 1);
                graphics.fillRect(centerX - 4, laneY + TILE_SIZE / 2 + 10, 8, 14);
              });
            }

            if (lane.coinColumn != null) {
              const coinX = cellCenterX(lane.coinColumn);
              graphics.fillStyle(0xfacc15, 1);
              graphics.fillCircle(coinX, laneY + TILE_SIZE / 2, 10);
              graphics.lineStyle(2, 0xfffbeb, 0.9);
              graphics.strokeCircle(coinX, laneY + TILE_SIZE / 2, 10);
            }

            lane.obstacles.forEach((obstacle) => {
              if (lane.kind !== "road") {
                return;
              }

              graphics.fillStyle(obstacle.color, 1);
              graphics.fillRoundedRect(
                obstacle.x - obstacle.width / 2,
                laneY + 10,
                obstacle.width,
                TILE_SIZE - 20,
                10
              );
              graphics.fillStyle(0xe5e7eb, 0.9);
              graphics.fillRect(obstacle.x - obstacle.width / 2 + 8, laneY + 18, 10, 10);
              graphics.fillRect(obstacle.x + obstacle.width / 2 - 18, laneY + 18, 10, 10);
              if (obstacle.pattern === "sprinter") {
                graphics.fillStyle(0xffffff, 0.28);
                graphics.fillRect(obstacle.x - 8, laneY + 8, 16, 4);
              }
            });
          }

          graphics.lineStyle(3, 0xffffff, 0.12);
          graphics.strokeRoundedRect(6, BOARD_TOP - 4, WIDTH - 12, BOARD_HEIGHT + 8, 14);

          graphics.fillStyle(0x020617, 0.78);
          graphics.fillRoundedRect(16, HEIGHT - 28, 110, 8, 999);
          graphics.fillStyle(this.run.rushTimerMs > 0 ? 0x38bdf8 : 0x475569, 0.95);
          const rushFill = this.run.rushTimerMs > 0 ? (this.run.rushTimerMs / 1350) * 110 : 28;
          graphics.fillRoundedRect(16, HEIGHT - 28, rushFill, 8, 999);

          graphics.fillStyle(0x020617, 0.78);
          graphics.fillRoundedRect(WIDTH / 2 - 55, HEIGHT - 28, 110, 8, 999);
          graphics.fillStyle(this.run.feverMs > 0 ? 0xfb7185 : 0x38bdf8, 0.95);
          const feverFill = this.run.feverMs > 0
            ? (this.run.feverMs / FEVER_DURATION_MS) * 110
            : (this.run.feverCharge / FEVER_CHARGE_MAX) * 110;
          if (feverFill > 0) {
            graphics.fillRoundedRect(WIDTH / 2 - 55, HEIGHT - 28, feverFill, 8, 999);
          }

          graphics.fillStyle(this.run.focusMs > 0 ? 0x38bdf8 : 0x1e293b, 0.92);
          graphics.fillRoundedRect(WIDTH - 112, HEIGHT - 46, 96, 22, 11);
          graphics.lineStyle(2, 0xbfdbfe, this.run.focusCharges > 0 ? 0.95 : 0.28);
          graphics.strokeRoundedRect(WIDTH - 112, HEIGHT - 46, 96, 22, 11);

          const player = this.run.getPlayerRenderPosition();
          const playerX = cellCenterX(player.column);
          const playerY = laneWorldY(player.row, cameraRow) + TILE_SIZE / 2;
          this.playerShadow.setPosition(playerX, playerY + 18);
          this.playerBody.setPosition(playerX, playerY - 2);
          this.playerTrim.setPosition(playerX, playerY - 3);
          this.playerBody.rotation = this.run.hopping ? Math.sin((this.run.hopElapsedMs / HOP_DURATION_MS) * Math.PI) * 0.08 : 0;
          this.playerTrim.rotation = this.playerBody.rotation;

          if (this.run.shakeMs > 0) {
            this.playerBody.setFillStyle(0xf87171, 1);
          } else {
            this.playerBody.setFillStyle(playerColor, 1);
          }

          this.run.floatingLabels.forEach((label) => {
            const text =
              this.floatingTextPool.get(label.id)
              ?? this.add.text(0, 0, label.text, {
                fontSize: "18px",
                fontStyle: "bold",
                color: label.color
              }).setOrigin(0.5).setDepth(45);
            text.setText(label.text);
            text.setColor(label.color);
            text.setPosition(label.x, laneWorldY(label.row, cameraRow) + TILE_SIZE / 2 - 42 + label.y);
            text.setAlpha(Math.min(1, label.ttlMs / 280));
            this.floatingTextPool.set(label.id, text);
          });

          Array.from(this.floatingTextPool.keys()).forEach((id) => {
            if (!this.run.floatingLabels.some((label) => label.id === id)) {
              this.floatingTextPool.get(id)?.destroy();
              this.floatingTextPool.delete(id);
            }
          });
        }

        syncHud() {
          this.scoreText.setText(`Score ${this.run.score}`);
          this.coinText.setText(`Coins ${this.run.coins}`);
          this.bestText.setText(`Best ${bestRun.score}`);
          this.districtText.setText(DISTRICT_LABELS[this.run.districtTier].toUpperCase());
          this.districtText.setColor(this.run.districtTier >= 3 ? "#fb7185" : "#93c5fd");
          this.rushText.setText(
            this.run.rushTimerMs > 0 ? `RUSH x${Math.max(1, this.run.rushStreak)}` : "RUSH READY"
          );
          this.rushText.setColor(this.run.rushTimerMs > 0 ? "#7dd3fc" : "#94a3b8");
          this.feverText.setText(
            this.run.feverMs > 0
              ? `FEVER ${Math.ceil(this.run.feverMs / 1000)}s`
              : `Fever ${Math.round((this.run.feverCharge / FEVER_CHARGE_MAX) * 100)}%`
          );
          this.feverText.setColor(this.run.feverMs > 0 ? "#fb7185" : "#93c5fd");
          this.focusText.setText(
            this.run.focusMs > 0
              ? `Focus ${Math.ceil(this.run.focusMs / 1000)}s`
              : `Focus ${this.run.focusCharges}`
          );
          this.focusText.setColor(this.run.focusCharges > 0 || this.run.focusMs > 0 ? "#dbeafe" : "#64748b");
          this.focusButtonLabel.setText(this.run.focusMs > 0 ? "ACTIVE" : "SHIFT");
          this.focusButtonLabel.setColor(this.run.focusMs > 0 ? "#0f172a" : "#e2e8f0");
        }
      }

      const game = new Phaser.Game({
        type: Phaser.AUTO,
        width: WIDTH,
        height: HEIGHT,
        parent: containerRef.current,
        backgroundColor: "#0b1324",
        scene: TownRushScene
      });

      gameRef.current = game;
      cleanup = () => {
        game.destroy(true);
        gameRef.current = null;
      };
    };

    void setup();

    return () => {
      isUnmounted = true;
      cleanup?.();
    };
  }, [restartCount]);

  return (
    <div className="page">
      <NavBar />
      <div className="content card townrush-shell" style={{ maxWidth: 940 }}>
        <h2>Town Rush</h2>
        <p className="townrush-copy">
          Push deeper into town one block at a time. Roads are pure timing, park rows give you a breather,
          and rail crossings will absolutely punish greedy hops.
        </p>
        <div
          className="townrush-layout"
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 520px) minmax(260px, 1fr)",
            gap: "1rem",
            alignItems: "start"
          }}
        >
          <div className="townrush-stage">
            <div ref={containerRef} style={{ width: "100%", maxWidth: WIDTH, margin: "0 auto" }} />
          </div>
          <div
            className="townrush-sidepanel"
            style={{
              display: "grid",
              gap: "0.85rem"
            }}
          >
            <div
              className="townrush-panel"
              style={{
                padding: "0.95rem",
                paddingTop: "1.1rem"
              }}
            >
              <strong className="townrush-panel-title">Controls</strong>
              <div className="info">`WASD` or arrow keys to hop.</div>
              <div className="info">Tap above, below, left, or right of your runner on mobile.</div>
              <div className="info">Press `Shift` or `Space` to spend Focus and slow the city for a clutch escape.</div>
              <div className="info">Chain fast forward moves to build Rush and cash in bonus points.</div>
              <div className="info">Near-misses charge Fever. Fever doubles row and coin scoring for a short burst.</div>
              <div className="info">Districts unlock at 500, 1000, and 1500 score with new traffic patterns and extra Focus charges.</div>
            </div>
            <div
              className="townrush-panel townrush-status-panel"
              style={{
                padding: "0.95rem",
                paddingTop: "1.1rem"
              }}
            >
              <strong className="townrush-panel-title">Run Status</strong>
              <p className="info" style={{ marginBottom: "0.65rem" }}>{status}</p>
              {lastRun ? (
                <p className="info" style={{ marginBottom: "0.65rem" }}>
                  Last run: <strong>{lastRun.score}</strong> score, <strong>{lastRun.distance}</strong> blocks,
                  {" "}and <strong>{lastRun.coins}</strong> coins.
                </p>
              ) : null}
              <p className="info" style={{ marginBottom: "0.65rem" }}>
                Best run on this device: <strong>{bestRun.score}</strong> score across <strong>{bestRun.distance}</strong> blocks.
              </p>
              <button
                className="primary-button"
                type="button"
                onClick={() => {
                  setCanRestart(false);
                  setStatus("Fresh streets. Fresh mistakes.");
                  setRestartCount((count) => count + 1);
                }}
                disabled={!canRestart}
              >
                {canRestart ? "Run It Back" : "In Progress"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TownRush;
