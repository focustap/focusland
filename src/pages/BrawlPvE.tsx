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
  dashPower: number;
  primaryDamage: number;
  primaryRange: number;
  primaryCooldownMs: number;
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
  dashCooldownMs: number;
  attackCooldownMs: number;
  invulnMs: number;
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

const CHARACTERS: Record<CharacterId, CharacterConfig> = {
  mage: { id: "mage", name: "Mage", color: "#8b5cf6", accent: "#c4b5fd", speed: 4.1, dashPower: 9.8, primaryDamage: 11, primaryRange: 160, primaryCooldownMs: 300 },
  fighter: { id: "fighter", name: "Fighter", color: "#ef4444", accent: "#fecaca", speed: 4.4, dashPower: 12.2, primaryDamage: 17, primaryRange: 72, primaryCooldownMs: 360 },
  archer: { id: "archer", name: "Archer", color: "#10b981", accent: "#a7f3d0", speed: 4.65, dashPower: 9.3, primaryDamage: 10, primaryRange: 190, primaryCooldownMs: 380 },
  assassin: { id: "assassin", name: "Assassin", color: "#22c55e", accent: "#bbf7d0", speed: 4.9, dashPower: 12.2, primaryDamage: 14, primaryRange: 78, primaryCooldownMs: 220 },
  monk: { id: "monk", name: "Monk", color: "#f59e0b", accent: "#fde68a", speed: 4.55, dashPower: 12.2, primaryDamage: 15, primaryRange: 82, primaryCooldownMs: 260 }
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
  const playerRef = useRef<PlayerState>({
    x: 180,
    y: FLOOR_Y,
    vx: 0,
    vy: 0,
    hp: 100,
    dashCooldownMs: 0,
    attackCooldownMs: 0,
    invulnMs: 0,
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

      if (!won && !lost) {
        player.attackCooldownMs = Math.max(0, player.attackCooldownMs - dt);
        player.dashCooldownMs = Math.max(0, player.dashCooldownMs - dt);
        player.invulnMs = Math.max(0, player.invulnMs - dt);
        boss.attackCooldownMs = Math.max(0, boss.attackCooldownMs - dt);

        let moveX = 0;
        if (keys.a || keys.arrowleft) moveX -= 1;
        if (keys.d || keys.arrowright) moveX += 1;
        player.vx = moveX * character.speed;
        if (moveX !== 0) {
          player.facing = moveX > 0 ? 1 : -1;
        }

        const dashPressed = Boolean(keys.shift);
        if (!dashPressed) {
          dashLatchRef.current = false;
        } else if (!dashLatchRef.current && player.dashCooldownMs === 0) {
          dashLatchRef.current = true;
          player.vx = player.facing * character.dashPower;
          player.dashCooldownMs = 440;
        }

        player.x = Math.max(34, Math.min(WIDTH - 34, player.x + player.vx));

        if ((keys[" "] || keys.enter) && player.attackCooldownMs === 0) {
          player.attackCooldownMs = character.primaryCooldownMs;
          const dx = boss.x - player.x;
          const dy = (boss.y - 36) - player.y;
          const inRange = Math.hypot(dx, dy) <= character.primaryRange;
          const aimingForward = Math.sign(dx || player.facing) === player.facing || Math.abs(dx) < 18;
          if (inRange && aimingForward) {
            boss.hp = Math.max(0, boss.hp - character.primaryDamage);
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
      ctx.fillRect(player.x + player.facing * 8, player.y - 24, 12, 8);
      ctx.restore();

      ctx.fillStyle = "#e2e8f0";
      ctx.fillRect(24, 20, 240, 16);
      ctx.fillStyle = "#ef4444";
      ctx.fillRect(24, 20, 240 * (boss.hp / boss.maxHp), 16);
      ctx.fillStyle = "#f8fafc";
      ctx.font = "bold 16px sans-serif";
      ctx.fillText(bossDef?.name ?? "Boss", 24, 16);

      ctx.fillStyle = "#1e293b";
      ctx.fillRect(WIDTH - 264, 20, 240, 16);
      ctx.fillStyle = character.color;
      ctx.fillRect(WIDTH - 264, 20, 240 * (player.hp / 100), 16);
      ctx.fillStyle = "#f8fafc";
      ctx.fillText(`${character.name} HP`, WIDTH - 264, 16);

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
      dashCooldownMs: 0,
      attackCooldownMs: 0,
      invulnMs: 0,
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
        <h2>{bossDef?.name ?? "Boss Arena"}</h2>
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
            <p className="score-display">Controls: `A/D` move, `Shift` dash, `Space` attack. This first PvE slice is singleplayer-focused; 1-4 player syncing is the next pass.</p>
          </>
        )}
      </div>
    </div>
  );
};

export default BrawlPvE;
