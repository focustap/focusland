import React, { useContext, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AuthContext } from "../components/AuthProvider";
import NavBar from "../components/NavBar";
import { completeBrawlPveBoss, loadBrawlPveProgress } from "../lib/brawlPveProgress";
import { CHARACTER_CONFIGS, clamp, type CharacterId, drawBrawlCharacter, getDashProfile, normalizeVector } from "../lib/brawlShared";
import { recordArcadeResult } from "../lib/progression";

type BossDefinition = {
  id: string;
  name: string;
  nextBossId?: string;
  goldReward: number;
  maxHp: number;
  baseCooldownMs: number;
  style: "dragon" | "giant";
};
type PlayerState = {
  x: number; y: number; vx: number; vy: number; hp: number; onGround: boolean; coyoteMs: number; jumpLockMs: number;
  airJumpsRemaining: number; dashCooldownMs: number; attackCooldownMs: number; specialCooldownMs: number; invulnMs: number;
  ultimateCharge: number; facing: 1 | -1; attackFlashMs: number; dashReleased: boolean; specialReleased: boolean;
  selectedCharacter: CharacterId; assassinKnifeId: string | null;
};
type BossState = {
  x: number;
  y: number;
  vx: number;
  hp: number;
  maxHp: number;
  attackCooldownMs: number;
  phase: 1 | 2 | 3;
  weaknessMs: number;
  hitFlashMs: number;
  transitionMs: number;
};
type ProjectileKind = "fireball" | "dagger" | "arrow" | "ultimate";
type Projectile = { id: string; x: number; y: number; vx: number; vy: number; radius: number; damage: number; knockback: number; lift: number; color: string; kind: ProjectileKind; gravity: number; ttlMs: number; isUltimate: boolean; stuck?: boolean; spent?: boolean };
type Effect = { id: string; x: number; y: number; radius: number; color: string; ttlMs: number; x2?: number; y2?: number };
type Hazard = {
  id: string;
  kind: "slam-warning" | "slam-hit" | "orb" | "orb-warning" | "flame-warning" | "flame-wall" | "ember-warning" | "ember-hit" | "pillar";
  x: number;
  y: number;
  radius: number;
  ttlMs: number;
  vx?: number;
  vy?: number;
  width?: number;
  height?: number;
};

const WIDTH = 920;
const HEIGHT = 520;
const FLOOR_Y = 430;
const BOSS_X = WIDTH / 2;
const PLAYER_WIDTH = 28;
const PLAYER_HEIGHT = 44;
const BOSS_WIDTH = 110;
const BOSS_HEIGHT = 140;
const GRAVITY = 0.68;
const MAX_FALL_SPEED = 12;
const ULTIMATE_CHARGE_MAX = 100;
const COYOTE_MS = 110;
const JUMP_LOCK_MS = 180;
const FRAME_MS = 1000 / 60;
const PVE_VERSION = "2.0";
const BOSSES: Record<string, BossDefinition> = {
  "boss-1": {
    id: "boss-1",
    name: "Ashen Juggernaut",
    nextBossId: "boss-2",
    goldReward: 24,
    maxHp: 920,
    baseCooldownMs: 1200,
    style: "dragon"
  },
  "boss-2": {
    id: "boss-2",
    name: "Stonebreak Giant",
    nextBossId: "boss-3",
    goldReward: 38,
    maxHp: 1280,
    baseCooldownMs: 980,
    style: "giant"
  }
};

function createEffect(x: number, y: number, color: string, radius: number, ttlMs: number): Effect {
  return { id: `${Date.now()}-${Math.random()}`, x, y, color, radius, ttlMs };
}

function drawPolygon(
  ctx: CanvasRenderingContext2D,
  points: Array<[number, number]>,
  fillStyle: string | CanvasGradient,
  strokeStyle?: string | CanvasGradient
) {
  if (points.length === 0) return;
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let index = 1; index < points.length; index += 1) {
    ctx.lineTo(points[index][0], points[index][1]);
  }
  ctx.closePath();
  ctx.fillStyle = fillStyle;
  ctx.fill();
  if (strokeStyle) {
    ctx.strokeStyle = strokeStyle;
    ctx.stroke();
  }
}

function drawCaveBackdrop(ctx: CanvasRenderingContext2D) {
  const bg = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  bg.addColorStop(0, "#050608");
  bg.addColorStop(0.48, "#111827");
  bg.addColorStop(1, "#1f2937");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const caveGlow = ctx.createRadialGradient(BOSS_X, FLOOR_Y - 170, 30, BOSS_X, FLOOR_Y - 170, 260);
  caveGlow.addColorStop(0, "rgba(103,232,249,0.14)");
  caveGlow.addColorStop(0.55, "rgba(59,130,246,0.08)");
  caveGlow.addColorStop(1, "rgba(15,23,42,0)");
  ctx.fillStyle = caveGlow;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = "#2b2118";
  for (let x = 0; x < WIDTH; x += 72) {
    drawPolygon(
      ctx,
      [[x, 0], [x + 18, 46 + (x % 3) * 8], [x + 34, 0]],
      "rgba(55,65,81,0.9)"
    );
  }

  for (let ridge = 0; ridge < 4; ridge += 1) {
    const baseY = 120 + ridge * 46;
    ctx.fillStyle = `rgba(17,24,39,${0.22 + ridge * 0.08})`;
    drawPolygon(
      ctx,
      [
        [0, baseY + 44],
        [120, baseY - 8],
        [280, baseY + 34],
        [440, baseY - 14],
        [620, baseY + 26],
        [780, baseY - 10],
        [WIDTH, baseY + 36],
        [WIDTH, HEIGHT],
        [0, HEIGHT]
      ],
      `rgba(17,24,39,${0.2 + ridge * 0.08})`
    );
  }

  ctx.fillStyle = "#2f241c";
  ctx.fillRect(0, FLOOR_Y, WIDTH, HEIGHT - FLOOR_Y);
  ctx.fillStyle = "rgba(148,163,184,0.08)";
  for (let rock = 0; rock < WIDTH; rock += 54) {
    drawPolygon(
      ctx,
      [[rock, FLOOR_Y], [rock + 10, FLOOR_Y - 12], [rock + 26, FLOOR_Y - 4], [rock + 36, FLOOR_Y]],
      "rgba(148,163,184,0.08)"
    );
  }

  ctx.fillStyle = "rgba(103,232,249,0.18)";
  drawPolygon(ctx, [[118, FLOOR_Y], [132, FLOOR_Y - 34], [148, FLOOR_Y]], "rgba(103,232,249,0.18)");
  drawPolygon(ctx, [[774, FLOOR_Y], [790, FLOOR_Y - 42], [808, FLOOR_Y]], "rgba(125,211,252,0.16)");
}

function drawGiantBoss(ctx: CanvasRenderingContext2D, boss: BossState, now: number, swinging: boolean) {
  const giantFill = boss.hitFlashMs > 0 ? "#f8fafc" : boss.weaknessMs > 0 ? "#86efac" : "#6b7280";
  const giantTrim = boss.phase === 3 ? "#e5e7eb" : "#cbd5e1";
  const armorDark = "#374151";
  const leather = "#7c5a3b";
  const clubSwing = swinging ? Math.sin(now / 70) * 0.34 + 0.24 : Math.sin(now / 260) * 0.08 - 0.1;
  const bob = Math.sin(now / 220) * 3;

  ctx.save();
  ctx.translate(0, bob);
  ctx.fillStyle = "rgba(15,23,42,0.28)";
  ctx.beginPath();
  ctx.ellipse(0, 126, 96, 20, 0, 0, Math.PI * 2);
  ctx.fill();

  drawPolygon(ctx, [[-66, 110], [-80, 12], [-40, -42], [12, -62], [64, -26], [86, 24], [72, 112]], giantFill, "rgba(255,255,255,0.1)");
  drawPolygon(ctx, [[-48, -20], [-6, -92], [34, -46], [28, 8], [-24, 8]], armorDark);
  drawPolygon(ctx, [[-12, -102], [14, -132], [42, -116], [34, -88], [0, -84]], "#9ca3af");
  drawPolygon(ctx, [[-22, -112], [-8, -132], [8, -110], [-4, -92]], "#d1d5db");
  drawPolygon(ctx, [[14, -114], [26, -132], [46, -114], [32, -92]], "#d1d5db");

  drawPolygon(ctx, [[-94, 4], [-134, 36], [-120, 58], [-72, 22]], giantTrim);

  ctx.save();
  ctx.translate(74, 12);
  ctx.rotate(clubSwing);
  drawPolygon(ctx, [[-8, -8], [8, -8], [12, 76], [-10, 76]], leather);
  drawPolygon(ctx, [[-24, 70], [24, 66], [30, 116], [-30, 120]], "#4b5563");
  drawPolygon(ctx, [[-30, 90], [32, 84], [42, 126], [-40, 132]], "#6b7280");
  for (let band = 0; band < 3; band += 1) {
    ctx.fillStyle = "#d6d3d1";
    ctx.fillRect(-12, 72 + band * 16, 24, 4);
  }
  ctx.restore();

  drawPolygon(ctx, [[-58, 108], [-86, 190], [-48, 190], [-20, 114]], "#4b5563");
  drawPolygon(ctx, [[24, 108], [2, 192], [40, 192], [64, 114]], "#4b5563");
  ctx.fillStyle = "#111827";
  ctx.fillRect(-28, -18, 14, 10);
  ctx.fillRect(12, -18, 14, 10);
  ctx.fillStyle = boss.phase === 3 ? "#67e8f9" : "#f8fafc";
  ctx.fillRect(-24, -14, 5, 5);
  ctx.fillRect(16, -14, 5, 5);
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.beginPath();
  ctx.arc(0, 30, 28, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = boss.phase === 3 ? "#22d3ee" : "#cbd5e1";
  ctx.beginPath();
  ctx.arc(0, 30, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function makePlayerState(characterId: CharacterId): PlayerState {
  return {
    x: 180, y: FLOOR_Y, vx: 0, vy: 0, hp: 100, onGround: true, coyoteMs: 0, jumpLockMs: 0, airJumpsRemaining: CHARACTER_CONFIGS[characterId].airJumps,
    dashCooldownMs: 0, attackCooldownMs: 0, specialCooldownMs: 0, invulnMs: 0, ultimateCharge: 0, facing: 1, attackFlashMs: 0, dashReleased: true,
    specialReleased: true, selectedCharacter: characterId, assassinKnifeId: null
  };
}

function makeBossState(definition: BossDefinition): BossState {
  return {
    x: BOSS_X,
    y: FLOOR_Y,
    vx: 0,
    hp: definition.maxHp,
    maxHp: definition.maxHp,
    attackCooldownMs: definition.baseCooldownMs,
    phase: 1,
    weaknessMs: 0,
    hitFlashMs: 0,
    transitionMs: 0
  };
}

const BrawlPvE: React.FC = () => {
  const { bossId = "boss-1" } = useParams();
  const navigate = useNavigate();
  const { session } = useContext(AuthContext);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const [selectedCharacter, setSelectedCharacter] = useState<CharacterId | null>(null);
  const [fightStarted, setFightStarted] = useState(false);
  const [status, setStatus] = useState("Choose a class and enter the arena.");
  const [won, setWon] = useState(false);
  const [lost, setLost] = useState(false);
  const keysRef = useRef<Record<string, boolean>>({});
  const mouseRef = useRef({ x: WIDTH / 2, y: HEIGHT / 2 });
  const mouseDownRef = useRef(false);
  const playerRef = useRef<PlayerState | null>(null);
  const bossRef = useRef<BossState>(makeBossState(BOSSES["boss-1"]));
  const hazardsRef = useRef<Hazard[]>([]);
  const projectilesRef = useRef<Projectile[]>([]);
  const effectsRef = useRef<Effect[]>([]);
  const bossDeathStartedAtRef = useRef<number | null>(null);
  const winOverlayStartedAtRef = useRef<number | null>(null);
  const bossDef = BOSSES[bossId];
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [progressLoading, setProgressLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void loadBrawlPveProgress(session?.user.id).then((progress) => {
      if (!active) return;
      setIsUnlocked(progress.unlockedBosses.includes(bossId));
      setProgressLoading(false);
    });
    return () => {
      active = false;
    };
  }, [bossId, session?.user.id]);

  useEffect(() => {
    if (!progressLoading && (!bossDef || !isUnlocked)) navigate("/arena/pve");
  }, [bossDef, isUnlocked, navigate, progressLoading]);

  useEffect(() => {
    const onDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright", "shift", "e", "r", "w", "a", "d", "s"].includes(key)) event.preventDefault();
      keysRef.current[key] = true;
    };
    const onUp = (event: KeyboardEvent) => { keysRef.current[event.key.toLowerCase()] = false; };
    window.addEventListener("keydown", onDown, { passive: false });
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, []);

  useEffect(() => {
    if (!fightStarted || !selectedCharacter || !canvasRef.current || !playerRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;
    let lastTime = performance.now();

    const finishWin = () => {
      if (won) return;
      const now = performance.now();
      bossDeathStartedAtRef.current = now;
      winOverlayStartedAtRef.current = now + 450;
      effectsRef.current.push(createEffect(BOSS_X, FLOOR_Y - 88, "#fff7ed", 96, 420));
      effectsRef.current.push(createEffect(BOSS_X, FLOOR_Y - 88, "#fb923c", 148, 620));
      for (let burst = 0; burst < 8; burst += 1) {
        const angle = (burst / 8) * Math.PI * 2;
        effectsRef.current.push(
          createEffect(
            BOSS_X + Math.cos(angle) * 44,
            FLOOR_Y - 92 + Math.sin(angle) * 28,
            burst % 2 === 0 ? "#f97316" : "#fde68a",
            20 + burst * 4,
            260 + burst * 50
          )
        );
      }
      setWon(true);
      setStatus("Boss defeated. The next gate is open.");
      if (bossDef) {
        void completeBrawlPveBoss(session?.user.id, bossDef.id, bossDef.nextBossId);
        void recordArcadeResult({ goldEarned: bossDef.goldReward });
      }
    };

    const damageBoss = (amount: number, knockback: number, lift: number, hitX: number, hitY: number, color: string, weaknessMs = 0, chargeGain = 0) => {
      const player = playerRef.current;
      if (!player) return;
      const boss = bossRef.current;
      if (boss.transitionMs > 0) return;
      const adjusted = boss.weaknessMs > 0 ? amount * 1.5 : amount;
      boss.hp = Math.max(0, boss.hp - adjusted);
      boss.hitFlashMs = 120;
      if (weaknessMs > 0) boss.weaknessMs = Math.max(boss.weaknessMs, weaknessMs);
      player.ultimateCharge = clamp(player.ultimateCharge + chargeGain, 0, ULTIMATE_CHARGE_MAX);
      effectsRef.current.push(createEffect(hitX, hitY, bossDef?.style === "giant" ? "#cbd5e1" : color, 20, 180));
      if (bossDef?.id === "boss-2" && boss.hp <= boss.maxHp * 0.5 && boss.phase === 1) {
        boss.phase = 2;
        boss.transitionMs = 5200;
        boss.attackCooldownMs = 360;
        hazardsRef.current = [];
        projectilesRef.current = [];
        effectsRef.current.push(createEffect(BOSS_X, FLOOR_Y - 110, "#e2e8f0", 110, 500));
        effectsRef.current.push(createEffect(BOSS_X, FLOOR_Y - 90, "#67e8f9", 170, 760));
        setStatus("The giant leaps away. Survive the arena collapse.");
      } else if (boss.hp <= boss.maxHp * 0.58 && boss.phase === 1) {
        boss.phase = 2;
        effectsRef.current.push(createEffect(BOSS_X, FLOOR_Y - 84, "#fb923c", 86, 420));
        effectsRef.current.push(createEffect(BOSS_X, FLOOR_Y - 90, "#fef08a", 52, 280));
        setStatus("The dragon enrages. The arena ignites.");
      }
      if (boss.hp <= 0) finishWin();
      boss.x = BOSS_X;
      boss.y = clamp(boss.y - lift * 0.25, FLOOR_Y - 6, FLOOR_Y);
    };

    const damagePlayer = (amount: number, message: string) => {
      const player = playerRef.current;
      if (!player || player.invulnMs > 0 || won || lost) return;
      player.hp = Math.max(0, player.hp - amount);
      player.invulnMs = 700;
      setStatus(message);
      if (player.hp <= 0) {
        setLost(true);
        setStatus("The Juggernaut crushed the run.");
      }
    };

    const update = (timestamp: number) => {
      const dt = Math.min(33, timestamp - lastTime);
      lastTime = timestamp;
      const scale = dt / FRAME_MS;
      const player = playerRef.current;
      if (!player) return;
      const boss = bossRef.current;
      const config = CHARACTER_CONFIGS[player.selectedCharacter];
      const keys = keysRef.current;
      const rawAim = normalizeVector(mouseRef.current.x - player.x, mouseRef.current.y - (player.y - 18));
      const aim = rawAim.length < 10 ? { x: player.facing, y: 0, length: 1 } : rawAim;
      const toBoss = normalizeVector(boss.x - player.x, (boss.y - 48) - (player.y - 18));

      if (!won && !lost) {
        player.attackCooldownMs = Math.max(0, player.attackCooldownMs - dt);
        player.dashCooldownMs = Math.max(0, player.dashCooldownMs - dt);
        player.specialCooldownMs = Math.max(0, player.specialCooldownMs - dt);
        player.invulnMs = Math.max(0, player.invulnMs - dt);
        player.jumpLockMs = Math.max(0, player.jumpLockMs - dt);
        player.coyoteMs = Math.max(0, player.coyoteMs - dt);
        player.attackFlashMs = Math.max(0, player.attackFlashMs - dt);
        boss.attackCooldownMs = Math.max(0, boss.attackCooldownMs - dt);
        boss.weaknessMs = Math.max(0, boss.weaknessMs - dt);
        boss.hitFlashMs = Math.max(0, boss.hitFlashMs - dt);
        boss.transitionMs = Math.max(0, boss.transitionMs - dt);

        if (bossDef?.id === "boss-2" && boss.phase === 2 && boss.transitionMs === 0) {
          boss.phase = 3;
          boss.attackCooldownMs = 760;
          effectsRef.current.push(createEffect(BOSS_X, FLOOR_Y - 90, "#f8fafc", 110, 420));
          effectsRef.current.push(createEffect(BOSS_X, FLOOR_Y - 82, "#22d3ee", 70, 300));
          setStatus("The giant crashes back in. Phase 3 begins.");
        }

        let moveX = 0;
        if (keys.a || keys.arrowleft) moveX -= 1;
        if (keys.d || keys.arrowright) moveX += 1;
        player.vx = moveX * config.moveSpeed;
        if (moveX !== 0) player.facing = moveX > 0 ? 1 : -1;

        if (!keys.shift) {
          player.dashReleased = true;
        } else if (player.dashReleased && player.dashCooldownMs === 0) {
          const dashDirection = Math.abs(aim.x) > 0.18 ? (aim.x > 0 ? 1 : -1) : player.facing;
          const dashProfile = getDashProfile(player.selectedCharacter);
          player.vx = dashDirection * dashProfile.power;
          player.vy = player.onGround ? Math.min(player.vy, -0.5) : player.vy * 0.72;
          player.facing = dashDirection;
          player.dashCooldownMs = dashProfile.cooldownMs;
          player.dashReleased = false;
          effectsRef.current.push(createEffect(player.x, player.y + 8, config.accent, 14, 140));
        }

        if (!keys.e) player.specialReleased = true;
        if (player.onGround) player.coyoteMs = COYOTE_MS;

        if ((keys.w || keys.arrowup || keys[" "]) && player.jumpLockMs === 0) {
          if (player.onGround || player.coyoteMs > 0) {
            player.vy = config.jumpVelocity;
            player.onGround = false;
            player.jumpLockMs = JUMP_LOCK_MS;
            player.coyoteMs = 0;
          } else if (player.airJumpsRemaining > 0) {
            player.vy = config.jumpVelocity * 0.96;
            player.airJumpsRemaining -= 1;
            player.jumpLockMs = JUMP_LOCK_MS;
          }
        }

        player.vy = Math.min(MAX_FALL_SPEED, player.vy + GRAVITY * scale);
        player.x = clamp(player.x + player.vx * scale, 34, WIDTH - 34);
        player.y += player.vy * scale;
        if (player.y >= FLOOR_Y) {
          player.y = FLOOR_Y;
          player.vy = 0;
          player.onGround = true;
          player.airJumpsRemaining = config.airJumps;
        } else {
          player.onGround = false;
        }

        if (mouseDownRef.current && player.attackCooldownMs === 0) {
          if (player.selectedCharacter === "fighter" || player.selectedCharacter === "assassin" || player.selectedCharacter === "monk") {
            if (Math.hypot(boss.x - player.x, (boss.y - 48) - (player.y - 18)) <= config.meleeRange + BOSS_WIDTH * 0.35 && aim.x * toBoss.x + aim.y * toBoss.y > -0.05) {
              damageBoss(config.meleeDamage, config.meleeKnockback, config.meleeLift, (player.x + boss.x) / 2, (player.y + boss.y) / 2, config.color, 0, player.selectedCharacter === "assassin" ? 7 : 8);
            }
            player.vx += config.meleeLunge * aim.x;
            player.vy += config.meleeLunge * 0.35 * aim.y;
            player.attackCooldownMs = player.selectedCharacter === "assassin" ? 190 : player.selectedCharacter === "monk" ? 220 : 280;
          } else {
            projectilesRef.current.push({
              id: `attack-${Date.now()}-${Math.random()}`, x: player.x + aim.x * 24, y: player.y - 10 + aim.y * 10, vx: (player.selectedCharacter === "archer" ? 9.4 : 7.1) * aim.x,
              vy: (player.selectedCharacter === "archer" ? 9.4 : 7.1) * aim.y, radius: player.selectedCharacter === "archer" ? 5 : 9, damage: player.selectedCharacter === "archer" ? 5 : 6,
              knockback: player.selectedCharacter === "archer" ? 8.2 : 6.9, lift: player.selectedCharacter === "archer" ? 5.4 : 5.8, color: player.selectedCharacter === "archer" ? "#fef08a" : "#fb923c",
              kind: player.selectedCharacter === "archer" ? "arrow" : "fireball", gravity: player.selectedCharacter === "archer" ? 0.01 : 0.015, ttlMs: player.selectedCharacter === "archer" ? 1280 : 1350, isUltimate: false
            });
            player.attackCooldownMs = player.selectedCharacter === "archer" ? 360 : 320;
          }
          player.attackFlashMs = 130;
        }

        if (keys.e && player.specialReleased && (player.specialCooldownMs === 0 || (player.selectedCharacter === "assassin" && Boolean(player.assassinKnifeId)))) {
          player.specialReleased = false;
          if (player.selectedCharacter === "fighter") {
            const startX = player.x + aim.x * 18;
            const startY = player.y - 4 + aim.y * 10;
            effectsRef.current.push({ id: `chain-${Date.now()}`, x: startX, y: startY, x2: clamp(startX + aim.x * 132, 16, WIDTH - 16), y2: clamp(startY + aim.y * 132, 18, FLOOR_Y - 12), radius: 3, color: config.specialColor, ttlMs: 120 });
            if (Math.hypot(boss.x - player.x, boss.y - player.y) <= 150 && aim.x * toBoss.x + aim.y * toBoss.y > 0.15) {
              damageBoss(config.specialDamage, 6.4, 4.2, (player.x + boss.x) / 2, (player.y + boss.y) / 2, config.specialColor, 0, config.specialChargeGain);
            }
          } else if (player.selectedCharacter === "mage") {
            const dir = Math.abs(aim.x) > 0.12 ? Math.sign(aim.x) : player.facing;
            const startX = player.x;
            player.x = clamp(startX + dir * 120, 24, WIDTH - 24);
            player.vx = 0;
            player.vy = Math.min(player.vy, 0);
            player.onGround = false;
            player.invulnMs = Math.max(player.invulnMs, 220);
            player.facing = dir > 0 ? 1 : -1;
            effectsRef.current.push(createEffect(startX, player.y + 4, config.specialColor, 24, 180));
            effectsRef.current.push(createEffect(player.x, player.y + 4, config.accent, 26, 220));
          } else if (player.selectedCharacter === "archer") {
            player.vy = config.jumpVelocity * 1.05;
            player.vx = -player.facing * 3.2;
            player.onGround = false;
            effectsRef.current.push(createEffect(player.x, player.y + 8, config.specialColor, 18, 180));
          } else if (player.selectedCharacter === "monk") {
            player.vx -= aim.x * 8.8;
            player.vy -= Math.max(1.2, Math.abs(aim.y) * 2);
            player.onGround = false;
            effectsRef.current.push(createEffect(player.x + aim.x * 28, player.y + aim.y * 14, config.specialColor, 26, 220));
            effectsRef.current.push(createEffect(player.x + aim.x * 40, player.y + aim.y * 18, config.trim, 14, 160));
            if (Math.hypot(boss.x - player.x, boss.y - player.y) <= 84 && aim.x * toBoss.x + aim.y * toBoss.y > 0.05) {
              damageBoss(config.specialDamage, 13.6, 3.2, (player.x + boss.x) / 2, (player.y + boss.y) / 2, config.specialColor, 0, config.specialChargeGain);
            }
          } else {
            const existingKnife = projectilesRef.current.find((projectile) => projectile.id === player.assassinKnifeId && projectile.kind === "dagger");
            if (existingKnife) {
              player.x = clamp(existingKnife.x, 24, WIDTH - 24);
              player.y = clamp(existingKnife.y, 80, FLOOR_Y);
              player.vx = 0;
              player.vy = 0;
              player.onGround = false;
              player.invulnMs = Math.max(player.invulnMs, 180);
              effectsRef.current.push(createEffect(existingKnife.x, existingKnife.y, config.specialColor, 24, 180));
              projectilesRef.current = projectilesRef.current.filter((projectile) => projectile.id !== existingKnife.id);
              player.assassinKnifeId = null;
              player.specialCooldownMs = config.specialCooldownMs;
            } else {
              const knifeId = `knife-${Date.now()}-${Math.random()}`;
              projectilesRef.current.push({
                id: knifeId, x: player.x + aim.x * 22, y: player.y - 8 + aim.y * 8, vx: config.specialSpeed * aim.x, vy: config.specialSpeed * aim.y, radius: config.specialRadius,
              damage: config.specialDamage, knockback: 6.9, lift: 5.4, color: config.specialColor, kind: "dagger", gravity: config.specialGravity, ttlMs: 1000, isUltimate: false
              });
              player.assassinKnifeId = knifeId;
              player.specialCooldownMs = 0;
            }
          }
          if (player.selectedCharacter !== "assassin") player.specialCooldownMs = config.specialCooldownMs;
        }

        if (keys.r && player.ultimateCharge >= ULTIMATE_CHARGE_MAX) {
          player.ultimateCharge = 0;
          if (player.selectedCharacter === "fighter") {
            effectsRef.current.push(createEffect(player.x, player.y, config.ultimateColor, 42, 260));
            effectsRef.current.push(createEffect(player.x, player.y, config.trim, 58, 320));
            if (Math.abs(boss.x - player.x) <= 82 && Math.abs(boss.y - player.y) <= 64) damageBoss(config.ultimateDamage, 11.6, 7.2, (player.x + boss.x) / 2, (player.y + boss.y) / 2, config.ultimateColor);
          } else if (player.selectedCharacter === "monk") {
            for (let punch = 0; punch < 6; punch += 1) effectsRef.current.push(createEffect(player.x + aim.x * (24 + punch * 12) + (punch % 2 === 0 ? -aim.y : aim.y) * 12, player.y + aim.y * (8 + punch * 7) + (punch % 2 === 0 ? aim.x : -aim.x) * 8, punch % 2 === 0 ? config.ultimateColor : "#fff7ed", 18 + punch * 3, 180 + punch * 40));
            if (Math.hypot(boss.x - player.x, boss.y - player.y) <= 104 && aim.x * toBoss.x + aim.y * toBoss.y > -0.05) damageBoss(config.ultimateDamage, 10.8, 7.2, (player.x + boss.x) / 2, (player.y + boss.y) / 2, config.ultimateColor);
          } else if (player.selectedCharacter === "assassin") {
            effectsRef.current.push(createEffect(player.x + aim.x * 30, player.y + aim.y * 12, config.ultimateColor, 40, 240));
            effectsRef.current.push(createEffect(player.x + aim.x * 48, player.y + aim.y * 16, "#86efac", 22, 180));
            if (Math.hypot(boss.x - player.x, boss.y - player.y) <= 110 && aim.x * toBoss.x + aim.y * toBoss.y > -0.08) damageBoss(config.ultimateDamage, 9.4, 6.1, (player.x + boss.x) / 2, (player.y + boss.y) / 2, config.ultimateColor, 3200);
          } else if (player.selectedCharacter === "archer") {
            for (let shot = 0; shot < config.ultimateShots; shot += 1) {
              const spread = -0.32 + (shot / Math.max(1, config.ultimateShots - 1)) * 0.64;
              const dir = normalizeVector(aim.x + -aim.y * spread, aim.y + aim.x * spread);
              projectilesRef.current.push({ id: `ult-arrow-${Date.now()}-${shot}-${Math.random()}`, x: player.x + dir.x * 28, y: player.y - 12 + dir.y * 12, vx: config.ultimateSpeed * dir.x, vy: config.ultimateSpeed * dir.y, radius: config.ultimateRadius, damage: config.ultimateDamage, knockback: 10.6, lift: 5.5, color: config.ultimateColor, kind: "ultimate", gravity: 0.006, ttlMs: 1100, isUltimate: true });
            }
          } else {
            projectilesRef.current.push({ id: `ult-orb-${Date.now()}-${Math.random()}`, x: player.x + aim.x * 24, y: player.y - 12 + aim.y * 10, vx: config.ultimateSpeed * aim.x, vy: config.ultimateSpeed * aim.y, radius: config.ultimateRadius, damage: config.ultimateDamage, knockback: 10.8, lift: 7.2, color: config.ultimateColor, kind: "ultimate", gravity: 0.01, ttlMs: 1400, isUltimate: true });
          }
        }

        if (boss.hp > 0) {
          boss.x = BOSS_X;
          boss.vx = 0;
          if (bossDef?.id === "boss-2" && boss.phase === 2) {
            if (boss.attackCooldownMs === 0) {
              const safeLane = 140 + Math.random() * (WIDTH - 280);
              const safeWidth = 120;
              hazardsRef.current.push({
                id: `collapse-left-${timestamp}`,
                kind: "flame-warning",
                x: 0,
                y: FLOOR_Y - 210,
                radius: 0,
                width: Math.max(0, safeLane - safeWidth / 2),
                height: 210,
                ttlMs: 2500
              });
              hazardsRef.current.push({
                id: `collapse-right-${timestamp}`,
                kind: "flame-warning",
                x: safeLane + safeWidth / 2,
                y: FLOOR_Y - 210,
                radius: 0,
                width: Math.max(0, WIDTH - (safeLane + safeWidth / 2)),
                height: 210,
                ttlMs: 2500
              });
              for (let quake = 0; quake < 4; quake += 1) {
                hazardsRef.current.push({
                  id: `quake-${timestamp}-${quake}`,
                  kind: "ember-warning",
                  x: 120 + quake * 220 + Math.random() * 60,
                  y: FLOOR_Y + 2,
                  radius: 46,
                  ttlMs: 620 + quake * 90
                });
              }
              boss.attackCooldownMs = 1140;
              setStatus("Arena collapse. Read the lane early and rotate before the cave seals.");
            }
          } else if (boss.attackCooldownMs === 0) {
            const roll = Math.random();
            if (bossDef?.id === "boss-2") {
              if (roll < 0.28) {
                hazardsRef.current.push({ id: `giant-center-${timestamp}`, kind: "slam-warning", x: BOSS_X, y: FLOOR_Y + 2, radius: boss.phase === 3 ? 104 : 86, ttlMs: 760 });
                hazardsRef.current.push({ id: `giant-player-${timestamp}`, kind: "slam-warning", x: player.x, y: FLOOR_Y + 2, radius: 54, ttlMs: 620 });
                setStatus("Titan smash. Bait the hit, then punish the center.");
              } else if (roll < 0.54) {
                const shotCount = boss.phase === 3 ? 12 : 8;
                const warningRadius = boss.phase === 3 ? 138 : 116;
                const spawnRadius = boss.phase === 3 ? 184 : 156;
                hazardsRef.current.push({
                  id: `giant-orb-warning-${timestamp}`,
                  kind: "orb-warning",
                  x: BOSS_X,
                  y: boss.y - 76,
                  radius: warningRadius,
                  ttlMs: 560
                });
                for (let shot = 0; shot < shotCount; shot += 1) {
                  const angle = (-Math.PI / 2) + (shot / shotCount) * Math.PI * 2;
                  hazardsRef.current.push({
                    id: `giant-orb-${timestamp}-${shot}`,
                    kind: "orb",
                    x: BOSS_X + Math.cos(angle) * spawnRadius,
                    y: boss.y - 76 + Math.sin(angle) * spawnRadius * 0.52,
                    radius: boss.phase === 3 ? 16 : 13,
                    ttlMs: 3000,
                    vx: Math.cos(angle) * (boss.phase === 3 ? 5.1 : 4),
                    vy: Math.sin(angle) * (boss.phase === 3 ? 4.4 : 3.5),
                    width: 560
                  });
                }
                setStatus("Shard burst. The ring blooms first, then breaks outward.");
              } else if (roll < 0.76) {
                const gapX = 180 + Math.random() * (WIDTH - 360);
                hazardsRef.current.push({ id: `giant-lane-left-${timestamp}`, kind: "flame-warning", x: 0, y: FLOOR_Y - 150, radius: 0, width: gapX - 70, height: 150, ttlMs: 500 });
                hazardsRef.current.push({ id: `giant-lane-right-${timestamp}`, kind: "flame-warning", x: gapX + 70, y: FLOOR_Y - 150, radius: 0, width: WIDTH - (gapX + 70), height: 150, ttlMs: 500 });
                setStatus("Rockfall lanes. Commit to the gap.");
              } else if (roll < 0.9) {
                const pillarCount = boss.phase === 3 ? 3 : 2;
                for (let pillar = 0; pillar < pillarCount; pillar += 1) {
                  const pillarX = 150 + Math.random() * (WIDTH - 300);
                  hazardsRef.current.push({
                    id: `giant-pillar-${timestamp}-${pillar}`,
                    kind: "pillar",
                    x: pillarX,
                    y: -160 - pillar * 34,
                    radius: boss.phase === 3 ? 34 : 30,
                    ttlMs: boss.phase === 3 ? 2550 : 2300,
                    width: boss.phase === 3 ? 52 : 46,
                    height: 0,
                    vy: boss.phase === 3 ? 1.35 : 1.15
                  });
                }
                setStatus("Ceiling pillars break loose. Move before they crush the floor.");
              } else {
                const emberCount = boss.phase === 3 ? 7 : 5;
                for (let ember = 0; ember < emberCount; ember += 1) {
                  hazardsRef.current.push({
                    id: `giant-ember-${timestamp}-${ember}`,
                    kind: "ember-warning",
                    x: 110 + Math.random() * (WIDTH - 220),
                    y: FLOOR_Y + 2,
                    radius: boss.phase === 3 ? 58 : 46,
                    ttlMs: 560 + ember * 60
                  });
                }
                setStatus("The giant rains rubble across the floor.");
              }
              boss.attackCooldownMs = boss.phase === 3 ? 680 : 900;
            } else if (roll < 0.34) {
              hazardsRef.current.push({ id: `slam-warning-${timestamp}`, kind: "slam-warning", x: player.x, y: FLOOR_Y + 2, radius: 46, ttlMs: 720 });
              hazardsRef.current.push({ id: `slam-center-${timestamp}`, kind: "slam-warning", x: BOSS_X, y: FLOOR_Y + 2, radius: boss.phase === 2 ? 82 : 68, ttlMs: 860 });
              setStatus("Core slam incoming. Punish the heart, then get clear.");
            } else if (roll < 0.68) {
              const shotCount = boss.phase === 2 ? 10 : 7;
              const spawnRadius = boss.phase === 2 ? 116 : 92;
              hazardsRef.current.push({
                id: `orb-warning-${timestamp}`,
                kind: "orb-warning",
                x: BOSS_X,
                y: boss.y - 70,
                radius: boss.phase === 2 ? 104 : 88,
                ttlMs: 520
              });
              for (let shot = 0; shot < shotCount; shot += 1) {
                const angle = (-Math.PI / 2) + (shot / shotCount) * Math.PI * 2;
                hazardsRef.current.push({
                  id: `orb-${timestamp}-${shot}`,
                  kind: "orb",
                  x: BOSS_X + Math.cos(angle) * spawnRadius,
                  y: boss.y - 70 + Math.sin(angle) * spawnRadius * 0.55,
                  radius: boss.phase === 2 ? 14 : 12,
                  ttlMs: boss.phase === 2 ? 3100 : 2700,
                  vx: Math.cos(angle) * (boss.phase === 2 ? 4.6 : 3.5),
                  vy: Math.sin(angle) * (boss.phase === 2 ? 4 : 3.1),
                  width: 520
                });
              }
              setStatus("Starburst. The core flares first, then the ring pushes out.");
            } else if (roll < 0.86) {
              const laneOffset = boss.phase === 2 ? 180 : 155;
              hazardsRef.current.push({ id: `lane-left-${timestamp}`, kind: "slam-warning", x: BOSS_X - laneOffset, y: FLOOR_Y + 2, radius: boss.phase === 2 ? 74 : 64, ttlMs: 560 });
              hazardsRef.current.push({ id: `lane-right-${timestamp}`, kind: "slam-warning", x: BOSS_X + laneOffset, y: FLOOR_Y + 2, radius: boss.phase === 2 ? 74 : 64, ttlMs: 560 });
              if (boss.phase === 2) {
                hazardsRef.current.push({ id: `lane-mid-${timestamp}`, kind: "slam-warning", x: BOSS_X, y: FLOOR_Y + 2, radius: 58, ttlMs: 700 });
              }
              setStatus("Blast lanes marked. Read the safe pocket.");
            } else if (roll < 0.94) {
              const flameWidth = boss.phase === 2 ? 340 : 250;
              const flameHeight = boss.phase === 2 ? 96 : 72;
              const flameLeft = player.x < BOSS_X ? BOSS_X - 22 : BOSS_X - flameWidth + 22;
              hazardsRef.current.push({
                id: `flame-warning-${timestamp}`,
                kind: "flame-warning",
                x: flameLeft,
                y: FLOOR_Y - 144,
                radius: 0,
                width: flameWidth,
                height: flameHeight,
                ttlMs: boss.phase === 2 ? 480 : 560
              });
              setStatus("Inferno breath charging. Hard commit to one side.");
            } else {
              const emberCount = boss.phase === 2 ? 6 : 4;
              for (let ember = 0; ember < emberCount; ember += 1) {
                const emberX = 140 + Math.random() * (WIDTH - 280);
                hazardsRef.current.push({
                  id: `ember-warning-${timestamp}-${ember}`,
                  kind: "ember-warning",
                  x: emberX,
                  y: FLOOR_Y + 2,
                  radius: boss.phase === 2 ? 52 : 38,
                  ttlMs: 620 + ember * 70
                });
              }
              setStatus("Meteor rain. Never stop moving.");
            }
            boss.attackCooldownMs = boss.phase === 2 ? 860 : 1260;
          }
        }

        projectilesRef.current = projectilesRef.current.flatMap((projectile) => {
          const next = { ...projectile, ttlMs: projectile.ttlMs - dt };
          if (!next.stuck) {
            next.x += next.vx * scale;
            next.y += next.vy * scale;
            next.vy += next.gravity * scale;
          }
          const hitBoss = Math.abs(next.x - boss.x) <= BOSS_WIDTH / 2 + next.radius && Math.abs(next.y - (boss.y - BOSS_HEIGHT / 2)) <= BOSS_HEIGHT / 2 + next.radius;
          if (hitBoss) {
            if (next.kind === "dagger" && player.assassinKnifeId === next.id) {
              if (next.spent) {
                return [next];
              }
              next.vx = 0;
              next.vy = 0;
              next.stuck = true;
              next.spent = true;
              next.ttlMs = Math.min(next.ttlMs, 900);
              damageBoss(next.damage, next.knockback, next.lift, next.x, next.y, next.color, 0, config.specialChargeGain);
              return [next];
            }
            damageBoss(
              next.damage,
              next.knockback,
              next.lift,
              next.x,
              next.y,
              next.color,
              0,
              next.isUltimate ? 0 : next.kind === "arrow" ? 7 : 8
            );
            return [];
          }
          if (next.ttlMs <= 0 || next.x < -20 || next.x > WIDTH + 20 || next.y < -20 || next.y > HEIGHT + 40) {
            if (next.id === player.assassinKnifeId) {
              player.assassinKnifeId = null;
              player.specialCooldownMs = config.specialCooldownMs;
            }
            return [];
          }
          return [next];
        });

        hazardsRef.current = hazardsRef.current.flatMap((hazard) => {
          const next = { ...hazard, ttlMs: hazard.ttlMs - dt };
          if (hazard.kind === "pillar") {
            const pillarWidth = next.width ?? 48;
            const descendEnd = 1150;
            const crushEnd = 1650;
            const baseY = FLOOR_Y - 190;
            if (next.ttlMs > descendEnd) {
              const descendProgress = 1 - (next.ttlMs - descendEnd) / Math.max(1, (hazard.ttlMs - descendEnd));
              next.height = 210 * clamp(descendProgress, 0, 1);
              next.y = -170 + (baseY + 170) * clamp(descendProgress, 0, 1);
            } else if (next.ttlMs > crushEnd) {
              next.height = 210;
              next.y = baseY;
              if (Math.abs(player.x - next.x) < pillarWidth * 0.7 && player.y > FLOOR_Y - 56) {
                damagePlayer(32, "A cave pillar crushed you.");
              }
            } else {
              const retractProgress = 1 - next.ttlMs / crushEnd;
              next.height = 210 * Math.max(0, 1 - retractProgress);
              next.y = baseY - 190 * retractProgress;
            }
            if (next.ttlMs <= 0 || (next.height ?? 0) <= 0) {
              return [];
            }
            return [next];
          }
          if (hazard.kind === "orb-warning" && next.ttlMs <= 0) {
            return [];
          }
          if (hazard.kind === "orb") {
            const launchDelayMs = next.width ?? 0;
            if (launchDelayMs > 0) {
              next.width = Math.max(0, launchDelayMs - dt);
              return [next];
            }
            next.x += (next.vx ?? 0) * scale;
            next.y += (next.vy ?? 0) * scale;
            if (Math.hypot(next.x - player.x, next.y - (player.y - 24)) < next.radius + 16) {
              damagePlayer(14, "An orb clipped you.");
              return [];
            }
          }
          if (hazard.kind === "flame-wall" && typeof next.width === "number" && typeof next.height === "number") {
            if (
              player.x + PLAYER_WIDTH / 2 > next.x &&
              player.x - PLAYER_WIDTH / 2 < next.x + next.width &&
              player.y > next.y &&
              player.y - PLAYER_HEIGHT < next.y + next.height
            ) {
              damagePlayer(24, "Dragonfire scorched you.");
              return [];
            }
          }
          if (hazard.kind === "slam-warning" && next.ttlMs <= 0) {
            effectsRef.current.push(createEffect(next.x, FLOOR_Y - 22, bossDef?.style === "giant" ? "#cbd5e1" : "#fb923c", next.radius * 0.95, 220));
            effectsRef.current.push(createEffect(next.x, FLOOR_Y - 24, bossDef?.style === "giant" ? "#67e8f9" : "#fff7ed", next.radius * 0.48, 120));
            if (Math.abs(player.x - next.x) < next.radius && Math.abs(player.y - next.y) < 60) damagePlayer(28, "The slam connected.");
            return [{ id: hazard.id.replace("warning", "hit"), kind: "slam-hit", x: next.x, y: next.y, radius: next.radius, ttlMs: 180 }];
          }
          if (hazard.kind === "ember-warning" && next.ttlMs <= 0) {
            effectsRef.current.push(createEffect(next.x, FLOOR_Y - 28, bossDef?.style === "giant" ? "#94a3b8" : "#f97316", next.radius * 0.85, 220));
            effectsRef.current.push(createEffect(next.x, FLOOR_Y - 34, bossDef?.style === "giant" ? "#e2e8f0" : "#fef08a", next.radius * 0.42, 140));
            if (Math.abs(player.x - next.x) < next.radius && Math.abs(player.y - next.y) < 92) damagePlayer(20, "A falling ember blasted you.");
            return [{ id: hazard.id.replace("warning", "hit"), kind: "ember-hit", x: next.x, y: next.y, radius: next.radius + 10, ttlMs: 220 }];
          }
          if (hazard.kind === "flame-warning" && next.ttlMs <= 0) {
            effectsRef.current.push(createEffect(BOSS_X + ((next.x + (next.width ?? 0) / 2 < BOSS_X) ? -24 : 24), FLOOR_Y - 118, bossDef?.style === "giant" ? "#67e8f9" : "#fb923c", 38, 180));
            return [{
              id: hazard.id.replace("warning", "wall"),
              kind: "flame-wall",
              x: next.x,
              y: next.y,
              radius: 0,
              width: next.width,
              height: next.height,
              ttlMs: boss.phase === 2 ? 520 : 420
            }];
          }
          if (hazard.kind === "slam-hit" && Math.abs(player.x - next.x) < next.radius && Math.abs(player.y - next.y) < 60) damagePlayer(22, "Shockwave hit.");
          if (hazard.kind === "ember-hit" && Math.abs(player.x - next.x) < next.radius && Math.abs(player.y - next.y) < 84) damagePlayer(18, "The blast zone caught you.");
          return next.ttlMs > 0 ? [next] : [];
        });

        effectsRef.current = effectsRef.current.flatMap((effect) => {
          const next = { ...effect, ttlMs: effect.ttlMs - dt };
          return next.ttlMs > 0 ? [next] : [];
        });
      }

      ctx.clearRect(0, 0, WIDTH, HEIGHT);
      const deathProgress = bossDeathStartedAtRef.current
        ? clamp((performance.now() - bossDeathStartedAtRef.current) / 1200, 0, 1)
        : 0;
      if (bossDef?.style === "giant") {
        drawCaveBackdrop(ctx);
      } else {
        const bg = ctx.createLinearGradient(0, 0, 0, HEIGHT);
        bg.addColorStop(0, "#16080a");
        bg.addColorStop(0.45, "#311115");
        bg.addColorStop(1, "#6f2a10");
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        const skyGlow = ctx.createRadialGradient(BOSS_X, FLOOR_Y - 210, 20, BOSS_X, FLOOR_Y - 210, 260);
        skyGlow.addColorStop(0, "rgba(251,146,60,0.28)");
        skyGlow.addColorStop(1, "rgba(15,23,42,0)");
        ctx.fillStyle = skyGlow;
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        ctx.fillStyle = "#3b1a0a";
        ctx.fillRect(0, FLOOR_Y, WIDTH, HEIGHT - FLOOR_Y);
        ctx.fillStyle = "rgba(255,255,255,0.04)";
        for (let spike = 0; spike < WIDTH; spike += 60) {
          drawPolygon(ctx, [[spike, FLOOR_Y], [spike + 16, FLOOR_Y - 22], [spike + 32, FLOOR_Y]], "rgba(255,255,255,0.04)");
        }
      }

      hazardsRef.current.forEach((hazard) => {
        ctx.save();
        const pulse = 0.55 + Math.sin((performance.now() + hazard.x) / 80) * 0.18;
        const giantEncounter = bossDef?.style === "giant";
        if (hazard.kind === "slam-warning") {
          ctx.fillStyle = giantEncounter ? `rgba(148,163,184,${0.12 + pulse * 0.18})` : `rgba(251,146,60,${0.12 + pulse * 0.18})`;
          ctx.strokeStyle = giantEncounter ? "rgba(226,232,240,0.9)" : "rgba(254,215,170,0.9)";
        } else if (hazard.kind === "pillar") {
          ctx.fillStyle = giantEncounter ? `rgba(71,85,105,${0.26 + pulse * 0.12})` : `rgba(120,53,15,${0.22 + pulse * 0.12})`;
          ctx.strokeStyle = giantEncounter ? "rgba(203,213,225,0.84)" : "rgba(254,215,170,0.84)";
        } else if (hazard.kind === "orb-warning") {
          ctx.fillStyle = giantEncounter ? `rgba(103,232,249,${0.08 + pulse * 0.12})` : `rgba(251,191,36,${0.08 + pulse * 0.12})`;
          ctx.strokeStyle = giantEncounter ? "rgba(186,230,253,0.84)" : "rgba(254,240,138,0.84)";
        } else if (hazard.kind === "flame-warning") {
          ctx.fillStyle = giantEncounter ? `rgba(103,232,249,${0.12 + pulse * 0.16})` : `rgba(251,146,60,${0.14 + pulse * 0.16})`;
          ctx.strokeStyle = giantEncounter ? "rgba(186,230,253,0.92)" : "rgba(253,186,116,0.92)";
        } else if (hazard.kind === "flame-wall") {
          ctx.fillStyle = giantEncounter ? `rgba(71,85,105,${0.28 + pulse * 0.16})` : `rgba(249,115,22,${0.28 + pulse * 0.16})`;
          ctx.strokeStyle = giantEncounter ? "rgba(224,242,254,0.88)" : "rgba(255,237,213,0.9)";
        } else if (hazard.kind === "ember-warning") {
          ctx.fillStyle = giantEncounter ? `rgba(156,163,175,${0.12 + pulse * 0.14})` : `rgba(253,224,71,${0.12 + pulse * 0.14})`;
          ctx.strokeStyle = giantEncounter ? "rgba(229,231,235,0.85)" : "rgba(254,240,138,0.85)";
        } else if (hazard.kind === "ember-hit") {
          ctx.fillStyle = giantEncounter ? `rgba(34,211,238,${0.18 + pulse * 0.1})` : `rgba(239,68,68,${0.22 + pulse * 0.12})`;
          ctx.strokeStyle = giantEncounter ? "rgba(224,242,254,0.8)" : "rgba(254,202,202,0.85)";
        } else if (hazard.kind === "slam-hit") {
          ctx.fillStyle = giantEncounter ? `rgba(56,189,248,${0.2 + pulse * 0.14})` : `rgba(239,68,68,${0.25 + pulse * 0.16})`;
          ctx.strokeStyle = giantEncounter ? "rgba(224,242,254,0.82)" : "rgba(254,202,202,0.85)";
        } else {
          ctx.fillStyle = giantEncounter ? "#67e8f9" : "#fb923c";
          ctx.strokeStyle = giantEncounter ? "#ecfeff" : "#fff7ed";
        }
        ctx.lineWidth = 2;
        if (hazard.kind === "pillar" && typeof hazard.width === "number" && typeof hazard.height === "number") {
          const pillarWidth = hazard.width;
          const pillarHeight = hazard.height;
          const left = hazard.x - pillarWidth / 2;
          const top = hazard.y;
          const pillarGradient = ctx.createLinearGradient(left, top, left + pillarWidth, top);
          pillarGradient.addColorStop(0, giantEncounter ? "rgba(30,41,59,0.96)" : "rgba(120,53,15,0.94)");
          pillarGradient.addColorStop(0.5, giantEncounter ? "rgba(100,116,139,0.98)" : "rgba(180,83,9,0.96)");
          pillarGradient.addColorStop(1, giantEncounter ? "rgba(30,41,59,0.96)" : "rgba(120,53,15,0.94)");
          ctx.fillStyle = pillarGradient;
          drawPolygon(
            ctx,
            [
              [left, top + 8],
              [left + pillarWidth * 0.18, top],
              [left + pillarWidth * 0.82, top],
              [left + pillarWidth, top + 8],
              [left + pillarWidth, top + pillarHeight],
              [left, top + pillarHeight]
            ],
            pillarGradient
          );
          ctx.strokeRect(left, top, pillarWidth, pillarHeight);
          ctx.fillStyle = giantEncounter ? "rgba(226,232,240,0.16)" : "rgba(254,215,170,0.14)";
          ctx.fillRect(left + pillarWidth * 0.22, top + 8, pillarWidth * 0.12, Math.max(0, pillarHeight - 16));
          ctx.fillStyle = giantEncounter ? "rgba(15,23,42,0.34)" : "rgba(67,20,7,0.34)";
          ctx.beginPath();
          ctx.ellipse(hazard.x, FLOOR_Y + 8, pillarWidth * 0.8, 14, 0, 0, Math.PI * 2);
          ctx.fill();
        } else if ((hazard.kind === "flame-warning" || hazard.kind === "flame-wall") && typeof hazard.width === "number" && typeof hazard.height === "number") {
          if (hazard.kind === "flame-wall") {
            const flameGradient = ctx.createLinearGradient(hazard.x, hazard.y, hazard.x, hazard.y + hazard.height);
            if (giantEncounter) {
              flameGradient.addColorStop(0, "rgba(224,242,254,0.12)");
              flameGradient.addColorStop(0.4, "rgba(71,85,105,0.72)");
              flameGradient.addColorStop(1, "rgba(17,24,39,0.4)");
            } else {
              flameGradient.addColorStop(0, "rgba(255,237,213,0.18)");
              flameGradient.addColorStop(0.4, "rgba(249,115,22,0.72)");
              flameGradient.addColorStop(1, "rgba(127,29,29,0.34)");
            }
            ctx.fillStyle = flameGradient;
          }
          ctx.fillRect(hazard.x, hazard.y, hazard.width, hazard.height);
          ctx.strokeRect(hazard.x, hazard.y, hazard.width, hazard.height);
          if (hazard.kind === "flame-wall") {
            for (let flame = 0; flame < 6; flame += 1) {
              const flameX = hazard.x + (hazard.width / 5) * flame + ((performance.now() / 45) % 12);
              drawPolygon(ctx, [
                [flameX, hazard.y + hazard.height],
                [flameX + 10, hazard.y + hazard.height - 24 - flame * 2],
                [flameX + 22, hazard.y + hazard.height]
              ], giantEncounter ? "rgba(224,242,254,0.18)" : "rgba(255,237,213,0.22)");
            }
          }
        } else {
          ctx.beginPath();
          ctx.arc(hazard.x, hazard.kind === "orb" || hazard.kind === "orb-warning" ? hazard.y : FLOOR_Y - 10, hazard.radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          if (hazard.kind === "slam-warning" || hazard.kind === "ember-warning") {
            ctx.globalAlpha = 0.35;
            ctx.beginPath();
            ctx.arc(hazard.x, FLOOR_Y - 10, hazard.radius * 0.62, 0, Math.PI * 2);
            ctx.stroke();
          }
          if (hazard.kind === "orb-warning") {
            ctx.globalAlpha = 0.52;
            ctx.beginPath();
            ctx.arc(hazard.x, hazard.y, hazard.radius * 1.28, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(hazard.x, hazard.y, hazard.radius * 0.52, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
        ctx.restore();
      });

      effectsRef.current.forEach((effect) => {
        ctx.save();
        const giantEncounter = bossDef?.style === "giant";
        ctx.globalAlpha = Math.max(0.16, effect.ttlMs / 260);
        ctx.strokeStyle = effect.color;
        ctx.fillStyle = effect.color;
        ctx.lineWidth = effect.radius > 10 ? 3 : 2;
        if (typeof effect.x2 === "number" && typeof effect.y2 === "number") {
          ctx.beginPath();
          ctx.moveTo(effect.x, effect.y);
          ctx.lineTo(effect.x2, effect.y2);
          ctx.stroke();
        } else {
          if (giantEncounter && effect.radius >= 18) {
            drawPolygon(
              ctx,
              [
                [effect.x - effect.radius * 0.9, effect.y + effect.radius * 0.2],
                [effect.x - effect.radius * 0.3, effect.y - effect.radius],
                [effect.x + effect.radius * 0.35, effect.y - effect.radius * 0.5],
                [effect.x + effect.radius, effect.y + effect.radius * 0.18],
                [effect.x + effect.radius * 0.08, effect.y + effect.radius],
                [effect.x - effect.radius * 0.72, effect.y + effect.radius * 0.72]
              ],
              effect.color
            );
          } else {
            ctx.beginPath();
            ctx.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.restore();
      });

      projectilesRef.current.forEach((projectile) => {
        ctx.save();
        ctx.shadowBlur = projectile.kind === "ultimate" ? 18 : 10;
        ctx.shadowColor = projectile.color;
        ctx.fillStyle = projectile.color;
        if (projectile.kind === "arrow" || projectile.kind === "dagger") {
          ctx.translate(projectile.x, projectile.y);
          ctx.rotate(Math.atan2(projectile.vy || 0.001, projectile.vx || 1));
          ctx.fillRect(-2, -2, projectile.kind === "arrow" ? 18 : 14, 4);
          ctx.fillRect(projectile.kind === "arrow" ? 10 : 6, projectile.kind === "arrow" ? -5 : -8, 4, projectile.kind === "arrow" ? 10 : 16);
        } else {
          ctx.beginPath();
          ctx.arc(projectile.x, projectile.y, projectile.radius, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      });

      const dragonBreathing = hazardsRef.current.some((hazard) => hazard.kind === "flame-warning" || hazard.kind === "flame-wall");
      const giantSwinging = hazardsRef.current.some((hazard) =>
        hazard.kind === "slam-warning" || hazard.kind === "slam-hit" || hazard.id.includes("giant-center") || hazard.id.includes("giant-player")
      );
      const bossVisible = !(bossDef?.style === "giant" && boss.phase === 2 && boss.transitionMs > 0);
      if (bossVisible) {
        ctx.save();
        ctx.translate(boss.x, boss.y - 98 + deathProgress * 120);
        ctx.globalAlpha = 1 - deathProgress * 0.92;
        ctx.rotate(deathProgress * 0.18);
        if (bossDef?.style === "giant") {
          drawGiantBoss(ctx, boss, performance.now(), giantSwinging);
        } else {
          const wingLift = 12 + Math.sin(performance.now() / 180) * 6;
          const bodyFill = boss.hitFlashMs > 0 ? "#fff7ed" : boss.weaknessMs > 0 ? "#86efac" : "#5a1f18";
          const scaleRidge = boss.phase === 2 ? "#f97316" : "#ef4444";
          drawPolygon(ctx, [[-34, 70], [-90, 52], [-120, 12], [-98, -8], [-44, 8], [-14, 46]], "rgba(88,28,22,0.96)");
          drawPolygon(ctx, [[22, 64], [86, 46], [122, 4], [98, -12], [38, 2], [8, 40]], "rgba(88,28,22,0.96)");
          drawPolygon(ctx, [[-32, 64], [-12, 14], [22, -4], [72, 2], [88, 36], [54, 82], [-4, 94]], bodyFill, "rgba(255,255,255,0.08)");
          drawPolygon(ctx, [[-82, 28], [-156, -18 - wingLift], [-90, 8], [-54, 30]], "rgba(127,29,29,0.92)");
          drawPolygon(ctx, [[30, 18], [138, -28 - wingLift], [78, 18], [40, 30]], "rgba(127,29,29,0.92)");
          drawPolygon(ctx, [[46, 14], [82, -12], [116, 0], [134, 18], [106, 34], [72, 30]], "rgba(55,65,81,0.95)");
          drawPolygon(ctx, [[-12, -2], [8, -36], [34, -48], [52, -30], [58, -2], [30, 18], [-6, 16]], bodyFill, "rgba(255,255,255,0.08)");
          drawPolygon(ctx, [[-6, 10], [12, -18], [26, -10], [14, 16]], scaleRidge);
          drawPolygon(ctx, [[16, 6], [34, -24], [44, -14], [30, 20]], scaleRidge);
          drawPolygon(ctx, [[4, -18], [14, -54], [26, -18]], "#fca5a5");
          drawPolygon(ctx, [[26, -22], [40, -64], [50, -20]], "#fca5a5");
          drawPolygon(ctx, [[-18, 92], [-86, 116], [-138, 136], [-70, 128], [-22, 108]], "rgba(127,29,29,0.85)");
          ctx.fillStyle = dragonBreathing ? "#fb923c" : "#111827";
          ctx.beginPath();
          ctx.arc(34, -8, dragonBreathing ? 8 : 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = dragonBreathing ? "#fef08a" : "#f59e0b";
          ctx.beginPath();
          ctx.arc(34, -8, 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "rgba(255,255,255,0.16)";
          ctx.beginPath();
          ctx.arc(-2, 34, 28, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = boss.phase === 2 ? "#fb923c" : "#fca5a5";
          ctx.beginPath();
          ctx.arc(-2, 34, 18, 0, Math.PI * 2);
          ctx.fill();
          if (dragonBreathing) {
            drawPolygon(ctx, [[54, 0], [74, -10], [92, 0], [74, 10]], "rgba(255,237,213,0.55)");
          }
        }
        ctx.restore();
      } else {
        ctx.save();
        ctx.globalAlpha = 0.18 + Math.sin(performance.now() / 120) * 0.05;
        ctx.fillStyle = "rgba(226,232,240,0.25)";
        ctx.beginPath();
        ctx.ellipse(BOSS_X, FLOOR_Y + 14, 118, 24, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      if (deathProgress > 0 && deathProgress < 1) {
        ctx.save();
        ctx.globalAlpha = 0.22 * (1 - deathProgress);
        ctx.fillStyle = "#fff7ed";
        ctx.beginPath();
        ctx.ellipse(BOSS_X, FLOOR_Y + 12, 110 + deathProgress * 24, 24 + deathProgress * 10, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      drawBrawlCharacter({
        ctx,
        characterId: player.selectedCharacter,
        x: player.x,
        y: player.y,
        facing: player.facing,
        aimX: mouseRef.current.x,
        aimY: mouseRef.current.y,
        attackFlashMs: player.attackFlashMs,
        invulnMs: player.invulnMs,
        username: "You",
        width: PLAYER_WIDTH,
        height: PLAYER_HEIGHT
      });

      const bossBarWidth = 320;
      ctx.fillStyle = "rgba(15,23,42,0.84)";
      ctx.fillRect(WIDTH / 2 - bossBarWidth / 2 - 8, 18, bossBarWidth + 16, 32);
      ctx.fillStyle = "#7f1d1d";
      ctx.fillRect(WIDTH / 2 - bossBarWidth / 2, 26, bossBarWidth, 16);
      ctx.fillStyle = boss.weaknessMs > 0 ? "#86efac" : "#fb7185";
      ctx.fillRect(WIDTH / 2 - bossBarWidth / 2, 26, bossBarWidth * (boss.hp / boss.maxHp), 16);
      ctx.fillStyle = "#fff7ed";
      ctx.font = "14px monospace";
      ctx.textAlign = "center";
      ctx.fillText(`${bossDef?.name ?? "Boss"}${boss.weaknessMs > 0 ? "  WEAK" : ""}`, WIDTH / 2, 22);

      ctx.fillStyle = "rgba(15,23,42,0.86)";
      ctx.fillRect(18, 18, 184, 86);
      ctx.fillStyle = "#e2e8f0";
      ctx.font = "13px monospace";
      ctx.textAlign = "left";
      ctx.fillText(`${config.name}  HP ${Math.round(player.hp)}`, 28, 38);
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(28, 46, 160, 12);
      ctx.fillStyle = "#22c55e";
      ctx.fillRect(28, 46, 160 * (player.hp / 100), 12);
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(28, 68, 160, 10);
      ctx.fillStyle = config.ultimateColor;
      ctx.fillRect(28, 68, 160 * (player.ultimateCharge / ULTIMATE_CHARGE_MAX), 10);
      ctx.fillStyle = "#fff7ed";
      ctx.fillText(player.specialCooldownMs === 0 ? "E READY" : `E ${(player.specialCooldownMs / 1000).toFixed(1)}s`, 28, 96);
      ctx.textAlign = "right";
      ctx.fillText(player.ultimateCharge >= ULTIMATE_CHARGE_MAX ? "R READY" : "R CHARGING", 188, 96);

      if (won && winOverlayStartedAtRef.current) {
        const overlayProgress = clamp((performance.now() - winOverlayStartedAtRef.current) / 420, 0, 1);
        const overlayAlpha = overlayProgress * 0.96;
        ctx.save();
        ctx.globalAlpha = overlayAlpha;
        ctx.fillStyle = "rgba(2,6,23,0.82)";
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        drawPolygon(ctx, [[0, 0], [WIDTH * 0.54, 0], [WIDTH * 0.33, HEIGHT], [0, HEIGHT]], "rgba(245,158,11,0.24)");
        drawPolygon(ctx, [[WIDTH * 0.48, 0], [WIDTH, 0], [WIDTH, HEIGHT], [WIDTH * 0.66, HEIGHT]], "rgba(251,146,60,0.2)");
        const dividerGlow = ctx.createLinearGradient(WIDTH * 0.47, 0, WIDTH * 0.37, HEIGHT);
        dividerGlow.addColorStop(0, "rgba(255,237,213,0)");
        dividerGlow.addColorStop(0.45, "rgba(255,237,213,0.14)");
        dividerGlow.addColorStop(1, "rgba(255,237,213,0)");
        ctx.fillStyle = dividerGlow;
        drawPolygon(ctx, [[WIDTH * 0.49, 0], [WIDTH * 0.52, 0], [WIDTH * 0.4, HEIGHT], [WIDTH * 0.37, HEIGHT]], dividerGlow as unknown as string);
        ctx.textAlign = "center";
        ctx.fillStyle = "#fff7ed";
        ctx.font = "bold 42px monospace";
        ctx.fillText("YOU WON", WIDTH / 2, HEIGHT * 0.32);
        ctx.font = "18px monospace";
        ctx.fillText(config.name, WIDTH * 0.24, HEIGHT * 0.6);
        ctx.fillText(bossDef?.name ?? "Dragon", WIDTH * 0.76, HEIGHT * 0.6);
        ctx.font = "14px monospace";
        ctx.fillStyle = "#fed7aa";
        ctx.fillText("The gate to the next hunt opens.", WIDTH / 2, HEIGHT * 0.72);
        ctx.restore();
      }

      animationRef.current = window.requestAnimationFrame(update);
    };

    animationRef.current = window.requestAnimationFrame(update);

    return () => {
      if (animationRef.current) {
        window.cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [bossDef, fightStarted, lost, navigate, selectedCharacter, won]);

  const resetFight = () => {
    if (!selectedCharacter) return;
    playerRef.current = makePlayerState(selectedCharacter);
    bossRef.current = makeBossState(bossDef ?? BOSSES["boss-1"]);
    hazardsRef.current = [];
    projectilesRef.current = [];
    effectsRef.current = [];
    bossDeathStartedAtRef.current = null;
    winOverlayStartedAtRef.current = null;
    setWon(false);
    setLost(false);
    setFightStarted(true);
    setStatus(`${bossDef?.name ?? "Boss"} awakens. Survive the telegraphs and punish the gaps.`);
  };

  return (
    <div className="page">
      <NavBar />
      <div className="content card" style={{ maxWidth: 980 }}>
        <h2>{bossDef?.name ?? "Boss Arena"} PvE v{PVE_VERSION}</h2>
        <p>Boss rooms now use the same class stats, dash profile, visuals, and core class abilities as PvP, with the boss acting as the target instead of another player.</p>
        {!selectedCharacter && (
          <div className="brawl-pick-grid">
            {(Object.keys(CHARACTER_CONFIGS) as CharacterId[]).map((characterId) => {
              const character = CHARACTER_CONFIGS[characterId];
              return (
                <button key={characterId} type="button" className="brawl-pick-card" onClick={() => setSelectedCharacter(characterId)} style={{ borderColor: character.color }}>
                  <strong>{character.name}</strong>
                  <span>{character.title}</span>
                </button>
              );
            })}
          </div>
        )}
        {selectedCharacter && (
          <>
            <div className="button-row">
              <button className="primary-button" type="button" onClick={resetFight}>{fightStarted ? "Retry boss" : "Enter fight"}</button>
              <button className="secondary-button" type="button" onClick={() => navigate("/arena/pve")}>Back to world map</button>
            </div>
            <canvas
              ref={canvasRef}
              width={WIDTH}
              height={HEIGHT}
              onMouseDown={() => { mouseDownRef.current = true; }}
              onMouseUp={() => { mouseDownRef.current = false; }}
              onMouseLeave={() => { mouseDownRef.current = false; }}
              onMouseMove={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                mouseRef.current = { x: ((event.clientX - rect.left) / rect.width) * WIDTH, y: ((event.clientY - rect.top) / rect.height) * HEIGHT };
              }}
              style={{ width: "100%", maxWidth: WIDTH, display: "block", margin: "1rem auto", borderRadius: "1rem", border: "1px solid #334155", background: "#0f172a" }}
            />
            <p className="info">{status}</p>
            <p className="score-display">Controls: `A/D` move, `W/Space` jump, `Shift` dash, mouse aim, left click primary, `E` utility, `R` ultimate.</p>
          </>
        )}
      </div>
    </div>
  );
};

export default BrawlPvE;
