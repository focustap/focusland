import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import NavBar from "../components/NavBar";
import { completeBrawlPveBoss, getBrawlPveProgress } from "../lib/brawlPveProgress";
import { recordArcadeResult } from "../lib/progression";

type CharacterId = "mage" | "fighter" | "archer" | "assassin" | "monk";

type CharacterConfig = {
  id: CharacterId;
  name: string;
  color: string;
  accent: string;
  speed: number;
  jumpPower: number;
  dashPower: number;
  primaryDamage: number;
  primaryRange: number;
  primaryCooldownMs: number;
  specialCooldownMs: number;
  specialDamage: number;
  ultimateDamage: number;
};

type BossDefinition = {
  id: string;
  name: string;
  nextBossId?: string;
  goldReward: number;
};

type PlayerState = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  onGround: boolean;
  dashCooldownMs: number;
  attackCooldownMs: number;
  specialCooldownMs: number;
  invulnMs: number;
  ultimateCharge: number;
  facing: 1 | -1;
};

type BossState = {
  x: number;
  y: number;
  vx: number;
  hp: number;
  maxHp: number;
  attackCooldownMs: number;
  phase: 1 | 2;
};

type Hazard = {
  id: string;
  kind: "slam-warning" | "slam-hit" | "orb";
  x: number;
  y: number;
  radius: number;
  ttlMs: number;
  vx?: number;
  vy?: number;
};

const WIDTH = 920;
const HEIGHT = 520;
const FLOOR_Y = 430;
const PLAYER_SIZE = 34;
const BOSS_WIDTH = 110;
const BOSS_HEIGHT = 140;
const GRAVITY = 0.68;
const MAX_FALL_SPEED = 12;
const ULTIMATE_CHARGE_MAX = 100;
const PVE_VERSION = "0.2";

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function normalizeVector(dx: number, dy: number) {
  const length = Math.hypot(dx, dy) || 1;
  return { x: dx / length, y: dy / length, length };
}

const CHARACTERS: Record<CharacterId, CharacterConfig> = {
  mage: { id: "mage", name: "Mage", color: "#8b5cf6", accent: "#c4b5fd", speed: 4.1, jumpPower: -11.2, dashPower: 9.8, primaryDamage: 11, primaryRange: 160, primaryCooldownMs: 300, specialCooldownMs: 4400, specialDamage: 14, ultimateDamage: 30 },
  fighter: { id: "fighter", name: "Fighter", color: "#ef4444", accent: "#fecaca", speed: 4.4, jumpPower: -10.9, dashPower: 12.2, primaryDamage: 17, primaryRange: 72, primaryCooldownMs: 360, specialCooldownMs: 4800, specialDamage: 20, ultimateDamage: 34 },
  archer: { id: "archer", name: "Archer", color: "#10b981", accent: "#a7f3d0", speed: 4.65, jumpPower: -11.5, dashPower: 9.3, primaryDamage: 10, primaryRange: 190, primaryCooldownMs: 380, specialCooldownMs: 5000, specialDamage: 16, ultimateDamage: 28 },
  assassin: { id: "assassin", name: "Assassin", color: "#22c55e", accent: "#bbf7d0", speed: 4.9, jumpPower: -11.3, dashPower: 12.2, primaryDamage: 14, primaryRange: 78, primaryCooldownMs: 220, specialCooldownMs: 4600, specialDamage: 18, ultimateDamage: 30 },
  monk: { id: "monk", name: "Monk", color: "#f59e0b", accent: "#fde68a", speed: 4.55, jumpPower: -11.1, dashPower: 12.2, primaryDamage: 15, primaryRange: 82, primaryCooldownMs: 260, specialCooldownMs: 4700, specialDamage: 18, ultimateDamage: 32 }
};

const BOSSES: Record<string, BossDefinition> = {
  "boss-1": {
    id: "boss-1",
    name: "Ashen Juggernaut",
    nextBossId: "boss-2",
    goldReward: 24
  }
};

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
  const jumpLatchRef = useRef(false);
  const specialLatchRef = useRef(false);
  const ultimateLatchRef = useRef(false);
  const playerRef = useRef<PlayerState>({
    x: 180,
    y: FLOOR_Y,
    vx: 0,
    vy: 0,
    hp: 100,
    onGround: true,
    dashCooldownMs: 0,
    attackCooldownMs: 0,
    specialCooldownMs: 0,
    invulnMs: 0,
    ultimateCharge: 0,
    facing: 1
  });
  const bossRef = useRef<BossState>({
    x: 700,
    y: FLOOR_Y,
    vx: 0,
    hp: 380,
    maxHp: 380,
    attackCooldownMs: 1800,
    phase: 1
  });
  const hazardsRef = useRef<Hazard[]>([]);
  const dashLatchRef = useRef(false);
  const bossDef = BOSSES[bossId];

  const isUnlocked = useMemo(() => getBrawlPveProgress().unlockedBosses.includes(bossId), [bossId]);

  useEffect(() => {
    if (!bossDef || !isUnlocked) {
      navigate("/arena/pve");
    }
  }, [bossDef, isUnlocked, navigate]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      keysRef.current[event.key.toLowerCase()] = true;
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      keysRef.current[event.key.toLowerCase()] = false;
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  useEffect(() => {
    if (!fightStarted || !selectedCharacter || !canvasRef.current) {
      return;
    }

    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) {
      return;
    }

    let lastTime = performance.now();

    const damagePlayer = (amount: number, message: string) => {
      const player = playerRef.current;
      if (player.invulnMs > 0 || won || lost) return;
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
      const boss = bossRef.current;
      const character = CHARACTERS[selectedCharacter];
      const keys = keysRef.current;
      const aimVector = normalizeVector(mouseRef.current.x - player.x, mouseRef.current.y - (player.y - 18));

      if (!won && !lost) {
        player.attackCooldownMs = Math.max(0, player.attackCooldownMs - dt);
        player.dashCooldownMs = Math.max(0, player.dashCooldownMs - dt);
        player.specialCooldownMs = Math.max(0, player.specialCooldownMs - dt);
        player.invulnMs = Math.max(0, player.invulnMs - dt);
        boss.attackCooldownMs = Math.max(0, boss.attackCooldownMs - dt);

        let moveX = 0;
        if (keys.a || keys.arrowleft) moveX -= 1;
        if (keys.d || keys.arrowright) moveX += 1;
        player.vx = moveX * character.speed;
        if (moveX !== 0) {
          player.facing = moveX > 0 ? 1 : -1;
        }

        const jumpPressed = Boolean(keys.w || keys.arrowup || keys[" "]);
        if (!jumpPressed) {
          jumpLatchRef.current = false;
        } else if (!jumpLatchRef.current && player.onGround) {
          jumpLatchRef.current = true;
          player.vy = character.jumpPower;
          player.onGround = false;
        }

        const dashPressed = Boolean(keys.shift);
        if (!dashPressed) {
          dashLatchRef.current = false;
        } else if (!dashLatchRef.current && player.dashCooldownMs === 0) {
          dashLatchRef.current = true;
          player.vx = player.facing * character.dashPower;
          player.dashCooldownMs = 440;
        }

        player.vy = Math.min(MAX_FALL_SPEED, player.vy + GRAVITY);
        player.x = clamp(player.x + player.vx, 34, WIDTH - 34);
        player.y += player.vy;
        if (player.y >= FLOOR_Y) {
          player.y = FLOOR_Y;
          player.vy = 0;
          player.onGround = true;
        }

        if (mouseDownRef.current && player.attackCooldownMs === 0) {
          player.attackCooldownMs = character.primaryCooldownMs;
          const dx = boss.x - player.x;
          const dy = (boss.y - 48) - (player.y - 18);
          const inRange = Math.hypot(dx, dy) <= character.primaryRange;
          const aimingForward = aimVector.x * Math.sign(dx || player.facing) > -0.15;
          if (inRange && aimingForward) {
            boss.hp = Math.max(0, boss.hp - character.primaryDamage);
            player.ultimateCharge = Math.min(ULTIMATE_CHARGE_MAX, player.ultimateCharge + 14);
            setStatus(`${character.name} landed a hit on ${bossDef?.name ?? "the boss"}.`);
            if (boss.hp <= boss.maxHp / 2) {
              boss.phase = 2;
            }
            if (boss.hp <= 0 && !won) {
              setWon(true);
              setStatus("Boss defeated. The next gate is open.");
              if (bossDef) {
                completeBrawlPveBoss(bossDef.id, bossDef.nextBossId);
                void recordArcadeResult({ goldEarned: bossDef.goldReward });
              }
            }
          }
        }

        const specialPressed = Boolean(keys.e);
        if (!specialPressed) {
          specialLatchRef.current = false;
        } else if (!specialLatchRef.current && player.specialCooldownMs === 0) {
          specialLatchRef.current = true;
          player.specialCooldownMs = character.specialCooldownMs;
          if (selectedCharacter === "mage") {
            player.x = clamp(player.x + (aimVector.x >= 0 ? 1 : -1) * 120, 34, WIDTH - 34);
            setStatus("Mage blinked through the arena.");
          } else if (selectedCharacter === "archer") {
            player.vy = character.jumpPower * 0.95;
            player.vx = -player.facing * 4.2;
            player.onGround = false;
            setStatus("Archer vaulted away.");
          } else if (selectedCharacter === "monk") {
            player.vx -= aimVector.x * 8.5;
            player.vy = Math.min(player.vy, -3.6);
            player.onGround = false;
            if (Math.hypot(boss.x - player.x, (boss.y - 40) - player.y) <= 92) {
              boss.hp = Math.max(0, boss.hp - character.specialDamage);
              player.ultimateCharge = Math.min(ULTIMATE_CHARGE_MAX, player.ultimateCharge + 18);
            }
            setStatus("Monk fired off a recoil kick.");
          } else {
            player.vx += aimVector.x * 4.4;
            player.vy = Math.min(player.vy, -2.6);
            if (Math.hypot(boss.x - player.x, (boss.y - 40) - player.y) <= 100) {
              boss.hp = Math.max(0, boss.hp - character.specialDamage);
              player.ultimateCharge = Math.min(ULTIMATE_CHARGE_MAX, player.ultimateCharge + 18);
            }
            setStatus(`${character.name} used a utility strike.`);
          }
        }

        const ultimatePressed = Boolean(keys.r);
        if (!ultimatePressed) {
          ultimateLatchRef.current = false;
        } else if (!ultimateLatchRef.current && player.ultimateCharge >= ULTIMATE_CHARGE_MAX) {
          ultimateLatchRef.current = true;
          player.ultimateCharge = 0;
          if (Math.hypot(boss.x - player.x, (boss.y - 46) - player.y) <= (selectedCharacter === "archer" ? 230 : 115)) {
            boss.hp = Math.max(0, boss.hp - character.ultimateDamage);
          }
          setStatus(`${character.name} unleashed their ultimate.`);
          if (boss.hp <= 0 && !won) {
            setWon(true);
            setStatus("Boss defeated. The next gate is open.");
            if (bossDef) {
              completeBrawlPveBoss(bossDef.id, bossDef.nextBossId);
              void recordArcadeResult({ goldEarned: bossDef.goldReward });
            }
          }
        }

        if (boss.hp > 0) {
          const bossDirection = Math.sign(player.x - boss.x) || 1;
          boss.vx = bossDirection * (boss.phase === 2 ? 1.5 : 1.05);
          boss.x = Math.max(90, Math.min(WIDTH - 90, boss.x + boss.vx));

          if (boss.attackCooldownMs === 0) {
            const roll = Math.random();
            if (roll < 0.38) {
              hazardsRef.current.push({
                id: `slam-warning-${timestamp}`,
                kind: "slam-warning",
                x: player.x,
                y: FLOOR_Y + 2,
                radius: 46,
                ttlMs: 720
              });
              setStatus("Juggernaut marks a slam. Dash out.");
            } else if (roll < 0.72) {
              const direction = Math.sign(player.x - boss.x) || 1;
              for (let shot = 0; shot < (boss.phase === 2 ? 7 : 5); shot += 1) {
                const angle = (-0.6 + (shot / Math.max(1, (boss.phase === 2 ? 6 : 4))) * 1.2);
                hazardsRef.current.push({
                  id: `orb-${timestamp}-${shot}`,
                  kind: "orb",
                  x: boss.x,
                  y: boss.y - 58,
                  radius: 12,
                  ttlMs: 2600,
                  vx: (direction * 3.2 + angle * 1.4) * (boss.phase === 2 ? 1.24 : 1),
                  vy: angle * 2.8
                });
              }
              setStatus("Orb burst. Find the gap.");
            } else {
              hazardsRef.current.push({
                id: `slam-warning-wide-${timestamp}`,
                kind: "slam-warning",
                x: player.x + bossDirection * 74,
                y: FLOOR_Y + 2,
                radius: 64,
                ttlMs: 540
              });
              setStatus("Rush follow-up incoming.");
            }
            boss.attackCooldownMs = boss.phase === 2 ? 1120 : 1550;
          }
        }

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
            if (Math.abs(player.x - next.x) < next.radius && Math.abs(player.y - next.y) < 60) {
              damagePlayer(22, "The slam connected.");
            }
            return [
              {
                id: hazard.id.replace("warning", "hit"),
                kind: "slam-hit",
                x: next.x,
                y: next.y,
                radius: next.radius,
                ttlMs: 180
              }
            ];
          }

          if (hazard.kind === "slam-hit" && Math.abs(player.x - next.x) < next.radius && Math.abs(player.y - next.y) < 60) {
            damagePlayer(18, "Shockwave hit.");
          }

          return next.ttlMs > 0 ? [next] : [];
        });
      }

      ctx.clearRect(0, 0, WIDTH, HEIGHT);
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      const bgGradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
      bgGradient.addColorStop(0, "#2b1608");
      bgGradient.addColorStop(1, "#5b2a07");
      ctx.fillStyle = bgGradient;
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
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(hazard.x, hazard.kind === "orb" ? hazard.y : FLOOR_Y - 8, hazard.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      });

      ctx.save();
      ctx.fillStyle = boss.phase === 2 ? "#ef4444" : "#9a3412";
      ctx.fillRect(boss.x - BOSS_WIDTH / 2, boss.y - BOSS_HEIGHT, BOSS_WIDTH, BOSS_HEIGHT);
      ctx.fillStyle = "#fcd34d";
      ctx.fillRect(boss.x - 20, boss.y - BOSS_HEIGHT + 24, 40, 14);
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = player.invulnMs > 0 ? 0.55 : 1;
      ctx.fillStyle = character.color;
      ctx.fillRect(player.x - PLAYER_SIZE / 2, player.y - PLAYER_SIZE, PLAYER_SIZE, PLAYER_SIZE);
      ctx.fillStyle = character.accent;
      ctx.fillRect(player.x + aimVector.x * 10, player.y - 24 + aimVector.y * 8, 12, 8);
      ctx.restore();

      ctx.fillStyle = "rgba(2, 6, 23, 0.72)";
      ctx.fillRect(18, 16, 228, 98);
      ctx.fillStyle = character.color;
      ctx.fillRect(18, 16, 10, 98);
      ctx.fillStyle = "#f8fafc";
      ctx.font = "15px monospace";
      ctx.fillText(character.name, 36, 36);
      ctx.fillStyle = character.accent;
      ctx.fillText("PvE Loadout", 36, 56);
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(36, 64, 150, 10);
      ctx.fillStyle = player.hp > 55 ? "#22c55e" : player.hp > 28 ? "#f59e0b" : "#ef4444";
      ctx.fillRect(36, 64, 150 * (player.hp / 100), 10);
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(36, 79, 150, 6);
      ctx.fillStyle = character.accent;
      ctx.fillRect(36, 79, 150 * (player.ultimateCharge / ULTIMATE_CHARGE_MAX), 6);
      ctx.fillStyle = "#f8fafc";
      ctx.font = "12px monospace";
      ctx.fillText(`HP ${player.hp.toFixed(0)}`, 194, 72);
      ctx.fillStyle = player.specialCooldownMs === 0 ? "#93c5fd" : "#94a3b8";
      ctx.fillText(
        player.specialCooldownMs === 0 ? "E READY" : `E ${(player.specialCooldownMs / 1000).toFixed(1)}s`,
        36,
        102
      );
      ctx.fillStyle = player.ultimateCharge >= ULTIMATE_CHARGE_MAX ? "#fcd34d" : "#94a3b8";
      ctx.fillText(player.ultimateCharge >= ULTIMATE_CHARGE_MAX ? "R READY" : "R CHARGING", 136, 102);

      ctx.fillStyle = "rgba(2, 6, 23, 0.78)";
      ctx.fillRect(WIDTH - 264, 16, 240, 54);
      ctx.fillStyle = "#e2e8f0";
      ctx.fillRect(WIDTH - 246, 38, 204, 14);
      ctx.fillStyle = "#ef4444";
      ctx.fillRect(WIDTH - 246, 38, 204 * (boss.hp / boss.maxHp), 14);
      ctx.fillStyle = "#f8fafc";
      ctx.font = "bold 16px sans-serif";
      ctx.fillText(bossDef?.name ?? "Boss", WIDTH - 246, 32);

      animationRef.current = window.requestAnimationFrame(update);
    };

    animationRef.current = window.requestAnimationFrame(update);
    return () => {
      if (animationRef.current) {
        window.cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [bossDef, bossId, fightStarted, lost, navigate, selectedCharacter, won]);

  const resetFight = () => {
    playerRef.current = {
      x: 180,
      y: FLOOR_Y,
      vx: 0,
      vy: 0,
      hp: 100,
      onGround: true,
      dashCooldownMs: 0,
      attackCooldownMs: 0,
      specialCooldownMs: 0,
      invulnMs: 0,
      ultimateCharge: 0,
      facing: 1
    };
    bossRef.current = {
      x: 700,
      y: FLOOR_Y,
      vx: 0,
      hp: 380,
      maxHp: 380,
      attackCooldownMs: 1800,
      phase: 1
    };
    hazardsRef.current = [];
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
        <p>First PvE slice. Pick a class, dodge telegraphed mechanics, and wear the boss down. Multiplayer support is the next layer after this prototype loop.</p>

        {!selectedCharacter && (
          <div className="brawl-pick-grid">
            {(Object.keys(CHARACTERS) as CharacterId[]).map((characterId) => {
              const character = CHARACTERS[characterId];
              return (
                <button
                  key={characterId}
                  type="button"
                  className="brawl-pick-card"
                  onClick={() => setSelectedCharacter(characterId)}
                  style={{ borderColor: character.color }}
                >
                  <strong>{character.name}</strong>
                  <span>{characterId === "archer" ? "Ranged spacing" : characterId === "mage" ? "Burst control" : characterId === "fighter" ? "Close pressure" : characterId === "assassin" ? "Mobility burst" : "Aggressive brawler"}</span>
                </button>
              );
            })}
          </div>
        )}

        {selectedCharacter && (
          <>
            <div className="button-row">
              <button className="primary-button" type="button" onClick={resetFight}>
                {fightStarted ? "Retry boss" : "Enter fight"}
              </button>
              <button className="secondary-button" type="button" onClick={() => navigate("/arena/pve")}>
                Back to world map
              </button>
            </div>
            <canvas
              ref={canvasRef}
              width={WIDTH}
              height={HEIGHT}
              onMouseDown={() => {
                mouseDownRef.current = true;
              }}
              onMouseUp={() => {
                mouseDownRef.current = false;
              }}
              onMouseLeave={() => {
                mouseDownRef.current = false;
              }}
              onMouseMove={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                mouseRef.current = {
                  x: ((event.clientX - rect.left) / rect.width) * WIDTH,
                  y: ((event.clientY - rect.top) / rect.height) * HEIGHT
                };
              }}
              style={{
                width: "100%",
                maxWidth: WIDTH,
                display: "block",
                margin: "1rem auto",
                borderRadius: "1rem",
                border: "1px solid #334155",
                background: "#0f172a"
              }}
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
