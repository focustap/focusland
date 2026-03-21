import Phaser from "phaser";

export const AVATAR_STORAGE_KEY = "focusland-avatar-customization";
export const TOWN_AVATAR_SCALE = 1.7;
export const PROFILE_AVATAR_PREVIEW_SIZE = 224;

export type AvatarFacing = "front" | "back" | "left" | "right";

export type AvatarCustomization = {
  skinId: number;
};

type SkinDefinition = {
  id: number;
  key: string;
  label: string;
  assetBaseName: string;
  scaleX?: number;
  scaleY?: number;
};

export const SKIN_OPTIONS: SkinDefinition[] = [
  { id: 0, key: "abigail", label: "Abigail", assetBaseName: "abigail" },
  { id: 1, key: "alex", label: "Alex", assetBaseName: "alex" },
  { id: 2, key: "caroline", label: "Caroline", assetBaseName: "caroline" },
  { id: 3, key: "demetrius", label: "Demetrius", assetBaseName: "demetrius" },
  { id: 4, key: "elliott", label: "Elliott", assetBaseName: "elliott" },
  { id: 5, key: "vincent", label: "Vincent", assetBaseName: "vincent", scaleY: 1.18 },
  { id: 6, key: "vincent-winter", label: "Vincent (Winter)", assetBaseName: "vincent-winter", scaleY: 1.18 }
];

export const DEFAULT_AVATAR_CUSTOMIZATION: AvatarCustomization = {
  skinId: 0
};

function clampSkinId(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return DEFAULT_AVATAR_CUSTOMIZATION.skinId;
  }

  return Math.max(0, Math.min(SKIN_OPTIONS.length - 1, Math.floor(value)));
}

export function normalizeAvatarCustomization(
  value?: Partial<AvatarCustomization> | null
): AvatarCustomization {
  return {
    skinId: clampSkinId(value?.skinId)
  };
}

export function getStoredAvatarCustomization() {
  if (typeof window === "undefined") {
    return DEFAULT_AVATAR_CUSTOMIZATION;
  }

  try {
    const raw = window.localStorage.getItem(AVATAR_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_AVATAR_CUSTOMIZATION;
    }

    return normalizeAvatarCustomization(JSON.parse(raw) as Partial<AvatarCustomization>);
  } catch {
    return DEFAULT_AVATAR_CUSTOMIZATION;
  }
}

export function storeAvatarCustomization(value: AvatarCustomization) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(AVATAR_STORAGE_KEY, JSON.stringify(normalizeAvatarCustomization(value)));
}

function getSkinDefinition(customization: AvatarCustomization) {
  return SKIN_OPTIONS[clampSkinId(customization.skinId)];
}

export function getAvatarScaleMultipliers(customization: AvatarCustomization) {
  const skin = getSkinDefinition(customization);
  return {
    scaleX: skin.scaleX ?? 1,
    scaleY: skin.scaleY ?? 1
  };
}

function getTextureKey(customization: AvatarCustomization, facing: AvatarFacing) {
  const skin = getSkinDefinition(customization);
  return `avatar-${skin.assetBaseName}-${facing}`;
}

function getAnimationKey(customization: AvatarCustomization, facing: AvatarFacing) {
  const skin = getSkinDefinition(customization);
  return `avatar-walk-${skin.assetBaseName}-${facing}`;
}

export function loadAvatarSpriteSheet(scene: Phaser.Scene, baseUrl: string) {
  SKIN_OPTIONS.forEach((skin) => {
    (["front", "back", "left", "right"] as AvatarFacing[]).forEach((facing) => {
      const key = getTextureKey({ skinId: skin.id }, facing);
      if (scene.textures.exists(key)) {
        return;
      }

      scene.load.spritesheet(key, `${baseUrl}assets/avatar/skins/${skin.assetBaseName}-${facing}-strip.png`, {
        frameWidth: 16,
        frameHeight: 32
      });
    });
  });
}

function ensureAvatarAnimations(scene: Phaser.Scene) {
  SKIN_OPTIONS.forEach((skin) => {
    (["front", "back", "left", "right"] as AvatarFacing[]).forEach((facing) => {
      const animationKey = getAnimationKey({ skinId: skin.id }, facing);
      if (scene.anims.exists(animationKey)) {
        return;
      }

      scene.anims.create({
        key: animationKey,
        frames: scene.anims.generateFrameNumbers(getTextureKey({ skinId: skin.id }, facing), {
          frames: [0, 1, 0, 2]
        }),
        frameRate: 8,
        repeat: -1
      });
    });
  });
}

export type AvatarRender = {
  container: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Sprite;
  customization: AvatarCustomization;
  facing: AvatarFacing;
  moving: boolean;
};

export function createAvatarRender(
  scene: Phaser.Scene,
  x: number,
  y: number,
  customization: AvatarCustomization,
  depth = 10,
  scale = TOWN_AVATAR_SCALE
): AvatarRender {
  ensureAvatarAnimations(scene);
  const resolved = normalizeAvatarCustomization(customization);
  const multipliers = getAvatarScaleMultipliers(resolved);
  const sprite = scene.add
    .sprite(0, 0, getTextureKey(resolved, "front"), 0)
    .setOrigin(0.5, 1)
    .setScale(scale * multipliers.scaleX, scale * multipliers.scaleY);
  const container = scene.add.container(x, y, [sprite]).setDepth(depth);
  return { container, sprite, customization: resolved, facing: "front", moving: false };
}

export function updateAvatarRender(
  render: AvatarRender,
  customization: AvatarCustomization,
  facing?: AvatarFacing,
  moving = false
) {
  const resolved = normalizeAvatarCustomization(customization);
  const nextFacing = facing ?? render.facing;
  const textureChanged =
    render.customization.skinId !== resolved.skinId || render.facing !== nextFacing;

  render.customization = resolved;
  render.facing = nextFacing;
  render.moving = moving;

  if (textureChanged) {
    render.sprite.setTexture(getTextureKey(resolved, render.facing), 0);
  }

  const multipliers = getAvatarScaleMultipliers(resolved);
  render.sprite.setScale(TOWN_AVATAR_SCALE * multipliers.scaleX, TOWN_AVATAR_SCALE * multipliers.scaleY);

  if (moving) {
    const animationKey = getAnimationKey(resolved, render.facing);
    if (render.sprite.anims.currentAnim?.key !== animationKey || !render.sprite.anims.isPlaying) {
      render.sprite.play(animationKey, true);
    }
  } else {
    render.sprite.stop();
    render.sprite.setFrame(0);
  }
}

export function setAvatarFacing(render: AvatarRender, facing: AvatarFacing) {
  updateAvatarRender(render, render.customization, facing, render.moving);
}
