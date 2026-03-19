export type CharacterId = "mage" | "fighter" | "archer" | "assassin" | "monk";

export type CharacterConfig = {
  id: CharacterId;
  name: string;
  title: string;
  color: string;
  accent: string;
  trim: string;
  moveSpeed: number;
  jumpVelocity: number;
  airJumps: number;
  meleeDamage: number;
  meleeRange: number;
  meleeKnockback: number;
  meleeLift: number;
  meleeLunge: number;
  specialDamage: number;
  specialRadius: number;
  specialSpeed: number;
  specialColor: string;
  specialGravity: number;
  specialCooldownMs: number;
  specialChargeGain: number;
  ultimateDamage: number;
  ultimateRadius: number;
  ultimateSpeed: number;
  ultimateColor: string;
  ultimateCooldownMs: number;
  ultimateChargeGain: number;
  ultimateShots: number;
};

export const CHARACTER_CONFIGS: Record<CharacterId, CharacterConfig> = {
  mage: {
    id: "mage",
    name: "Mage",
    title: "Control and burst",
    color: "#8b5cf6",
    accent: "#c4b5fd",
    trim: "#f97316",
    moveSpeed: 4,
    jumpVelocity: -11.5,
    airJumps: 1,
    meleeDamage: 6,
    meleeRange: 52,
    meleeKnockback: 6.8,
    meleeLift: 6.2,
    meleeLunge: 0,
    specialDamage: 0,
    specialRadius: 10,
    specialSpeed: 6,
    specialColor: "#fb923c",
    specialGravity: 0.03,
    specialCooldownMs: 5400,
    specialChargeGain: 8,
    ultimateDamage: 28,
    ultimateRadius: 18,
    ultimateSpeed: 7.2,
    ultimateColor: "#f97316",
    ultimateCooldownMs: 980,
    ultimateChargeGain: 16,
    ultimateShots: 1
  },
  fighter: {
    id: "fighter",
    name: "Fighter",
    title: "Pressure and lunge",
    color: "#ef4444",
    accent: "#fecaca",
    trim: "#f8fafc",
    moveSpeed: 4.35,
    jumpVelocity: -11.1,
    airJumps: 1,
    meleeDamage: 11,
    meleeRange: 62,
    meleeKnockback: 8.9,
    meleeLift: 6.1,
    meleeLunge: 2.8,
    specialDamage: 9,
    specialRadius: 7,
    specialSpeed: 8.4,
    specialColor: "#e2e8f0",
    specialGravity: 0,
    specialCooldownMs: 5200,
    specialChargeGain: 10,
    ultimateDamage: 22,
    ultimateRadius: 13,
    ultimateSpeed: 10.5,
    ultimateColor: "#f8fafc",
    ultimateCooldownMs: 950,
    ultimateChargeGain: 18,
    ultimateShots: 1
  },
  archer: {
    id: "archer",
    name: "Archer",
    title: "Spacing and volley",
    color: "#10b981",
    accent: "#a7f3d0",
    trim: "#fde68a",
    moveSpeed: 4.65,
    jumpVelocity: -11.9,
    airJumps: 1,
    meleeDamage: 5,
    meleeRange: 48,
    meleeKnockback: 8.1,
    meleeLift: 5.4,
    meleeLunge: 0,
    specialDamage: 0,
    specialRadius: 6,
    specialSpeed: 10.8,
    specialColor: "#fef08a",
    specialGravity: 0.008,
    specialCooldownMs: 5600,
    specialChargeGain: 7,
    ultimateDamage: 11,
    ultimateRadius: 9,
    ultimateSpeed: 8.8,
    ultimateColor: "#facc15",
    ultimateCooldownMs: 980,
    ultimateChargeGain: 14,
    ultimateShots: 5
  },
  assassin: {
    id: "assassin",
    name: "Assassin",
    title: "Mobility and burst",
    color: "#22c55e",
    accent: "#bbf7d0",
    trim: "#052e16",
    moveSpeed: 4.9,
    jumpVelocity: -11.8,
    airJumps: 1,
    meleeDamage: 7,
    meleeRange: 54,
    meleeKnockback: 7.1,
    meleeLift: 5.7,
    meleeLunge: 1.6,
    specialDamage: 6,
    specialRadius: 7,
    specialSpeed: 9.4,
    specialColor: "#4ade80",
    specialGravity: 0.18,
    specialCooldownMs: 5800,
    specialChargeGain: 9,
    ultimateDamage: 18,
    ultimateRadius: 18,
    ultimateSpeed: 0,
    ultimateColor: "#22c55e",
    ultimateCooldownMs: 1050,
    ultimateChargeGain: 18,
    ultimateShots: 1
  },
  monk: {
    id: "monk",
    name: "Monk",
    title: "Pressure and flurry",
    color: "#f59e0b",
    accent: "#fde68a",
    trim: "#7c2d12",
    moveSpeed: 4.55,
    jumpVelocity: -11.4,
    airJumps: 1,
    meleeDamage: 8,
    meleeRange: 56,
    meleeKnockback: 7.6,
    meleeLift: 5.8,
    meleeLunge: 1.9,
    specialDamage: 7,
    specialRadius: 10,
    specialSpeed: 8.2,
    specialColor: "#fbbf24",
    specialGravity: 0,
    specialCooldownMs: 5500,
    specialChargeGain: 10,
    ultimateDamage: 21,
    ultimateRadius: 20,
    ultimateSpeed: 0,
    ultimateColor: "#f97316",
    ultimateCooldownMs: 980,
    ultimateChargeGain: 18,
    ultimateShots: 1
  }
};

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function normalizeVector(dx: number, dy: number) {
  const length = Math.hypot(dx, dy) || 1;
  return { x: dx / length, y: dy / length, length };
}

export function getDashProfile(characterId: CharacterId | null) {
  void characterId;
  return { power: 12.4, cooldownMs: 300 };
}

type DrawCharacterArgs = {
  ctx: CanvasRenderingContext2D;
  characterId: CharacterId;
  x: number;
  y: number;
  facing: 1 | -1;
  aimX: number;
  aimY: number;
  attackFlashMs?: number;
  invulnMs?: number;
  username?: string;
  width?: number;
  height?: number;
};

export function drawBrawlCharacter({
  ctx,
  characterId,
  x,
  y,
  facing,
  aimX,
  aimY,
  attackFlashMs = 0,
  invulnMs = 0,
  username,
  width = 28,
  height = 44
}: DrawCharacterArgs) {
  const config = CHARACTER_CONFIGS[characterId];
  const bodyX = x - width / 2;
  const bodyY = y - height / 2;
  const rawAimVector = normalizeVector(aimX - x, aimY - y);
  const aimVector = rawAimVector.length < 10 ? { x: facing, y: 0, length: 1 } : rawAimVector;

  ctx.save();
  if (invulnMs > 0 && Math.floor(invulnMs / 90) % 2 === 0) {
    ctx.globalAlpha = 0.45;
  }

  ctx.fillStyle = "rgba(2, 6, 23, 0.22)";
  ctx.beginPath();
  ctx.ellipse(x, y + height / 2 + 6, 18, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 1.5;
  ctx.fillStyle = config.color;
  ctx.fillRect(bodyX, bodyY, width, height);
  ctx.strokeRect(bodyX, bodyY, width, height);
  ctx.fillStyle = config.accent;
  ctx.fillRect(bodyX + 5, bodyY - 8, width - 10, 8);
  ctx.fillStyle = config.trim;

  if (characterId === "mage") {
    ctx.beginPath();
    ctx.moveTo(x, bodyY - 18);
    ctx.lineTo(x - 10, bodyY - 2);
    ctx.lineTo(x + 10, bodyY - 2);
    ctx.closePath();
    ctx.fill();
    ctx.save();
    ctx.translate(x + aimVector.x * 12, y - 10 + aimVector.y * 8);
    ctx.rotate(Math.atan2(aimVector.y, aimVector.x));
    ctx.fillRect(0, -2, 18, 4);
    ctx.restore();
  } else if (characterId === "fighter") {
    ctx.save();
    ctx.translate(x + aimVector.x * 14, y - 6 + aimVector.y * 10);
    ctx.rotate(Math.atan2(aimVector.y, aimVector.x));
    ctx.fillRect(0, -3, 24, 6);
    ctx.fillRect(20, -7, 6, 14);
    ctx.restore();
  } else if (characterId === "assassin") {
    ctx.save();
    ctx.translate(x + aimVector.x * 10, y - 6 + aimVector.y * 8);
    ctx.rotate(Math.atan2(aimVector.y, aimVector.x));
    ctx.fillRect(0, -2, 16, 4);
    ctx.fillRect(6, -9, 4, 18);
    ctx.fillRect(-6, -5, 12, 3);
    ctx.restore();
    ctx.save();
    ctx.translate(x - aimVector.x * 8, y + 2 - aimVector.y * 4);
    ctx.rotate(Math.atan2(-aimVector.y, -aimVector.x));
    ctx.fillRect(0, -2, 14, 4);
    ctx.fillRect(5, -8, 4, 16);
    ctx.restore();
  } else if (characterId === "monk") {
    ctx.fillRect(bodyX + 6, bodyY + 6, 5, 16);
    ctx.fillRect(bodyX + width - 11, bodyY + 6, 5, 16);
    ctx.save();
    ctx.translate(x + aimVector.x * 12, y - 4 + aimVector.y * 8);
    ctx.rotate(Math.atan2(aimVector.y, aimVector.x));
    ctx.beginPath();
    ctx.arc(8, -5, 5, 0, Math.PI * 2);
    ctx.arc(18, 5, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    ctx.arc(x - aimVector.x * 6, y + 4 - aimVector.y * 4, 4, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.arc(x, bodyY + 5, 12, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = config.trim;
    ctx.lineWidth = 2;
    ctx.save();
    ctx.translate(x, y - 2);
    ctx.rotate(Math.atan2(aimVector.y, aimVector.x));
    ctx.beginPath();
    ctx.arc(8, 0, 11, -0.9, 0.9);
    ctx.stroke();
    ctx.restore();
  }

  if (attackFlashMs > 0) {
    ctx.fillStyle = "#fff7ed";
    ctx.save();
    ctx.translate(x + aimVector.x * 16, y - 8 + aimVector.y * 10);
    ctx.rotate(Math.atan2(aimVector.y, aimVector.x));
    ctx.fillRect(0, -4, 18, 8);
    ctx.restore();
  }

  if (username) {
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#020617";
    ctx.font = "12px monospace";
    ctx.textAlign = "center";
    ctx.fillText(username, x, bodyY - 16);
  }

  ctx.restore();
}
