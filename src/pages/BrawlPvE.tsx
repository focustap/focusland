import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import NavBar from "../components/NavBar";
import { completeBrawlPveBoss, getBrawlPveProgress } from "../lib/brawlPveProgress";
import { CHARACTER_CONFIGS, clamp, type CharacterId, drawBrawlCharacter, getDashProfile, normalizeVector } from "../lib/brawlShared";
import { recordArcadeResult } from "../lib/progression";

type BossDefinition = { id: string; name: string; nextBossId?: string; goldReward: number };
type PlayerState = {
  x: number; y: number; vx: number; vy: number; hp: number; onGround: boolean; coyoteMs: number; jumpLockMs: number;
  airJumpsRemaining: number; dashCooldownMs: number; attackCooldownMs: number; specialCooldownMs: number; invulnMs: number;
  ultimateCharge: number; facing: 1 | -1; attackFlashMs: number; dashReleased: boolean; specialReleased: boolean;
  selectedCharacter: CharacterId; assassinKnifeId: string | null;
};
type BossState = { x: number; y: number; vx: number; hp: number; maxHp: number; attackCooldownMs: number; phase: 1 | 2; weaknessMs: number; hitFlashMs: number };
type ProjectileKind = "fireball" | "dagger" | "arrow" | "ultimate";
type Projectile = { id: string; x: number; y: number; vx: number; vy: number; radius: number; damage: number; knockback: number; lift: number; color: string; kind: ProjectileKind; gravity: number; ttlMs: number; isUltimate: boolean; stuck?: boolean };
type Effect = { id: string; x: number; y: number; radius: number; color: string; ttlMs: number; x2?: number; y2?: number };
type Hazard = { id: string; kind: "slam-warning" | "slam-hit" | "orb"; x: number; y: number; radius: number; ttlMs: number; vx?: number; vy?: number };

const WIDTH = 920;
const HEIGHT = 520;
const FLOOR_Y = 430;
const PLAYER_WIDTH = 28;
const PLAYER_HEIGHT = 44;
const BOSS_WIDTH = 110;
const BOSS_HEIGHT = 140;
const GRAVITY = 0.68;
const MAX_FALL_SPEED = 12;
const ULTIMATE_CHARGE_MAX = 100;
const COYOTE_MS = 110;
const JUMP_LOCK_MS = 180;
const PVE_VERSION = "0.4";
const BOSSES: Record<string, BossDefinition> = { "boss-1": { id: "boss-1", name: "Ashen Juggernaut", nextBossId: "boss-2", goldReward: 24 } };

function createEffect(x: number, y: number, color: string, radius: number, ttlMs: number): Effect {
  return { id: `${Date.now()}-${Math.random()}`, x, y, color, radius, ttlMs };
}

function makePlayerState(characterId: CharacterId): PlayerState {
  return {
    x: 180, y: FLOOR_Y, vx: 0, vy: 0, hp: 100, onGround: true, coyoteMs: 0, jumpLockMs: 0, airJumpsRemaining: CHARACTER_CONFIGS[characterId].airJumps,
    dashCooldownMs: 0, attackCooldownMs: 0, specialCooldownMs: 0, invulnMs: 0, ultimateCharge: 0, facing: 1, attackFlashMs: 0, dashReleased: true,
    specialReleased: true, selectedCharacter: characterId, assassinKnifeId: null
  };
}

const BrawlPvE: React.FC = () => {
  const { bossId = "boss-1" } = useParams();
  const navigate = useNavigate();
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
  const bossRef = useRef<BossState>({ x: 700, y: FLOOR_Y, vx: 0, hp: 380, maxHp: 380, attackCooldownMs: 1800, phase: 1, weaknessMs: 0, hitFlashMs: 0 });
  const hazardsRef = useRef<Hazard[]>([]);
  const projectilesRef = useRef<Projectile[]>([]);
  const effectsRef = useRef<Effect[]>([]);
  const bossDef = BOSSES[bossId];
  const isUnlocked = useMemo(() => getBrawlPveProgress().unlockedBosses.includes(bossId), [bossId]);

  useEffect(() => {
    if (!bossDef || !isUnlocked) navigate("/arena/pve");
  }, [bossDef, isUnlocked, navigate]);

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
      setWon(true);
      setStatus("Boss defeated. The next gate is open.");
      if (bossDef) {
        completeBrawlPveBoss(bossDef.id, bossDef.nextBossId);
        void recordArcadeResult({ goldEarned: bossDef.goldReward });
      }
    };

    const damageBoss = (amount: number, knockback: number, lift: number, hitX: number, hitY: number, color: string, weaknessMs = 0, chargeGain = 0) => {
      const player = playerRef.current;
      if (!player) return;
      const boss = bossRef.current;
      const adjusted = boss.weaknessMs > 0 ? amount * 1.5 : amount;
      boss.hp = Math.max(0, boss.hp - adjusted);
      boss.vx += Math.sign(boss.x - player.x || player.facing) * knockback;
      boss.hitFlashMs = 120;
      if (weaknessMs > 0) boss.weaknessMs = Math.max(boss.weaknessMs, weaknessMs);
      player.ultimateCharge = clamp(player.ultimateCharge + chargeGain, 0, ULTIMATE_CHARGE_MAX);
      effectsRef.current.push(createEffect(hitX, hitY, color, 20, 180));
      if (boss.hp <= boss.maxHp / 2) boss.phase = 2;
      if (boss.hp <= 0) finishWin();
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

        player.vy = Math.min(MAX_FALL_SPEED, player.vy + GRAVITY);
        player.x = clamp(player.x + player.vx, 34, WIDTH - 34);
        player.y += player.vy;
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
              const pull = normalizeVector(player.x - boss.x, player.y - boss.y);
              boss.x = clamp(player.x - pull.x * 48, 90, WIDTH - 90);
              boss.vx = pull.x * 7.8;
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
          const dir = Math.sign(player.x - boss.x) || 1;
          boss.vx = boss.vx * 0.92 + dir * (boss.phase === 2 ? 0.78 : 0.56);
          boss.x = clamp(boss.x + boss.vx, 90, WIDTH - 90);
          if (boss.attackCooldownMs === 0) {
            const roll = Math.random();
            if (roll < 0.38) {
              hazardsRef.current.push({ id: `slam-warning-${timestamp}`, kind: "slam-warning", x: player.x, y: FLOOR_Y + 2, radius: 46, ttlMs: 720 });
              setStatus("Juggernaut marks a slam. Dash out.");
            } else if (roll < 0.72) {
              for (let shot = 0; shot < (boss.phase === 2 ? 7 : 5); shot += 1) {
                const angle = -0.6 + (shot / Math.max(1, (boss.phase === 2 ? 6 : 4))) * 1.2;
                hazardsRef.current.push({ id: `orb-${timestamp}-${shot}`, kind: "orb", x: boss.x, y: boss.y - 58, radius: 12, ttlMs: 2600, vx: (dir * 3.2 + angle * 1.4) * (boss.phase === 2 ? 1.24 : 1), vy: angle * 2.8 });
              }
              setStatus("Orb burst. Find the gap.");
            } else {
              hazardsRef.current.push({ id: `slam-warning-wide-${timestamp}`, kind: "slam-warning", x: player.x + dir * 74, y: FLOOR_Y + 2, radius: 64, ttlMs: 540 });
              setStatus("Rush follow-up incoming.");
            }
            boss.attackCooldownMs = boss.phase === 2 ? 1120 : 1550;
          }
        }

        projectilesRef.current = projectilesRef.current.flatMap((projectile) => {
          const next = { ...projectile, ttlMs: projectile.ttlMs - dt };
          if (!next.stuck) {
            next.x += next.vx;
            next.y += next.vy;
            next.vy += next.gravity;
          }
          const hitBoss = Math.abs(next.x - boss.x) <= BOSS_WIDTH / 2 + next.radius && Math.abs(next.y - (boss.y - BOSS_HEIGHT / 2)) <= BOSS_HEIGHT / 2 + next.radius;
          if (hitBoss) {
            if (next.kind === "dagger" && player.assassinKnifeId === next.id) {
              next.vx = 0;
              next.vy = 0;
              next.stuck = true;
              next.ttlMs = Math.min(next.ttlMs, 900);
              damageBoss(next.damage, next.knockback, next.lift, next.x, next.y, next.color, 0, config.specialChargeGain);
              return [next];
            }
            damageBoss(next.damage, next.knockback, next.lift, next.x, next.y, next.color, 0, next.isUltimate ? config.ultimateChargeGain : config.specialChargeGain);
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
          if (hazard.kind === "orb") {
            next.x += next.vx ?? 0;
            next.y += next.vy ?? 0;
            if (Math.hypot(next.x - player.x, next.y - (player.y - 24)) < next.radius + 16) {
              damagePlayer(14, "An orb clipped you.");
              return [];
            }
          }
          if (hazard.kind === "slam-warning" && next.ttlMs <= 0) {
            if (Math.abs(player.x - next.x) < next.radius && Math.abs(player.y - next.y) < 60) damagePlayer(22, "The slam connected.");
            return [{ id: hazard.id.replace("warning", "hit"), kind: "slam-hit", x: next.x, y: next.y, radius: next.radius, ttlMs: 180 }];
          }
          if (hazard.kind === "slam-hit" && Math.abs(player.x - next.x) < next.radius && Math.abs(player.y - next.y) < 60) damagePlayer(18, "Shockwave hit.");
          return next.ttlMs > 0 ? [next] : [];
        });

        effectsRef.current = effectsRef.current.flatMap((effect) => {
          const next = { ...effect, ttlMs: effect.ttlMs - dt };
          return next.ttlMs > 0 ? [next] : [];
        });
      }

      ctx.clearRect(0, 0, WIDTH, HEIGHT);
      const bg = ctx.createLinearGradient(0, 0, 0, HEIGHT);
      bg.addColorStop(0, "#2b1608");
      bg.addColorStop(1, "#5b2a07");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.fillStyle = "#3b1a0a";
      ctx.fillRect(0, FLOOR_Y, WIDTH, HEIGHT - FLOOR_Y);

      hazardsRef.current.forEach((hazard) => {
        ctx.save();
        if (hazard.kind === "slam-warning") {
          ctx.fillStyle = "rgba(251,146,60,0.28)";
          ctx.strokeStyle = "rgba(254,215,170,0.8)";
        } else if (hazard.kind === "slam-hit") {
          ctx.fillStyle = "rgba(239,68,68,0.35)";
          ctx.strokeStyle = "rgba(254,202,202,0.85)";
        } else {
          ctx.fillStyle = "#fb923c";
          ctx.strokeStyle = "#fff7ed";
        }
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(hazard.x, hazard.kind === "orb" ? hazard.y : FLOOR_Y - 10, hazard.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      });

      effectsRef.current.forEach((effect) => {
        ctx.save();
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
          ctx.beginPath();
          ctx.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      });

      projectilesRef.current.forEach((projectile) => {
        ctx.save();
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

      ctx.save();
      ctx.translate(boss.x, boss.y - BOSS_HEIGHT / 2);
      ctx.fillStyle = boss.hitFlashMs > 0 ? "#fff7ed" : boss.weaknessMs > 0 ? "#86efac" : "#7c2d12";
      ctx.fillRect(-BOSS_WIDTH / 2, 0, BOSS_WIDTH, BOSS_HEIGHT);
      ctx.fillStyle = "#fca5a5";
      ctx.fillRect(-BOSS_WIDTH / 2 + 14, -14, BOSS_WIDTH - 28, 16);
      ctx.fillStyle = "#fde68a";
      ctx.fillRect(-BOSS_WIDTH / 2 + 22, 36, BOSS_WIDTH - 44, 20);
      ctx.fillStyle = "#111827";
      ctx.fillRect(-18, 54, 12, 12);
      ctx.fillRect(6, 54, 12, 12);
      ctx.restore();

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
    bossRef.current = { x: 700, y: FLOOR_Y, vx: 0, hp: 380, maxHp: 380, attackCooldownMs: 1800, phase: 1, weaknessMs: 0, hitFlashMs: 0 };
    hazardsRef.current = [];
    projectilesRef.current = [];
    effectsRef.current = [];
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
