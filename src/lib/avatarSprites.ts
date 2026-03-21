import Phaser from "phaser";

export const AVATAR_STORAGE_KEY = "focusland-avatar-style";
export const AVATAR_SHEET_KEY = "focusland-avatar-sheet";
export const AVATAR_SHEET_PATH = "assets/avatar/charactermodels.png";
export const AVATAR_FRAME_WIDTH = 128;
export const AVATAR_FRAME_HEIGHT = 128;
export const AVATAR_SHEET_COLUMNS = 8;
export const DEFAULT_AVATAR_STYLE = 0;

type AvatarStyle = {
  id: number;
  label: string;
  frontFrame: number;
  backFrame: number;
};

const AVATAR_ROW_GROUPS = [
  { backRow: 4, frontRow: 5, label: "Wanderer" },
  { backRow: 6, frontRow: 7, label: "Adept" },
  { backRow: 8, frontRow: 9, label: "Scout" }
];

export const AVATAR_STYLES: AvatarStyle[] = AVATAR_ROW_GROUPS.flatMap((group, groupIndex) =>
  Array.from({ length: AVATAR_SHEET_COLUMNS }, (_, column) => ({
    id: groupIndex * AVATAR_SHEET_COLUMNS + column,
    label: `${group.label} ${column + 1}`,
    frontFrame: group.frontRow * AVATAR_SHEET_COLUMNS + column,
    backFrame: group.backRow * AVATAR_SHEET_COLUMNS + column
  }))
);

export type AvatarFacing = "front" | "back";

export function clampAvatarStyle(style?: number | null) {
  if (typeof style !== "number" || Number.isNaN(style)) {
    return DEFAULT_AVATAR_STYLE;
  }

  const normalized = Math.max(0, Math.min(AVATAR_STYLES.length - 1, Math.floor(style)));
  return normalized;
}

export function getStoredAvatarStyle() {
  if (typeof window === "undefined") {
    return DEFAULT_AVATAR_STYLE;
  }

  const value = Number(window.localStorage.getItem(AVATAR_STORAGE_KEY));
  return clampAvatarStyle(value);
}

export function storeAvatarStyle(style: number) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(AVATAR_STORAGE_KEY, String(clampAvatarStyle(style)));
}

export function getAvatarFrame(style: number, facing: AvatarFacing) {
  const avatar = AVATAR_STYLES[clampAvatarStyle(style)];
  return facing === "back" ? avatar.backFrame : avatar.frontFrame;
}

export function loadAvatarSpriteSheet(scene: Phaser.Scene, baseUrl: string) {
  if (scene.textures.exists(AVATAR_SHEET_KEY)) {
    return;
  }

  scene.load.spritesheet(AVATAR_SHEET_KEY, `${baseUrl}${AVATAR_SHEET_PATH}`, {
    frameWidth: AVATAR_FRAME_WIDTH,
    frameHeight: AVATAR_FRAME_HEIGHT
  });
}

export function createAvatarImage(
  scene: Phaser.Scene,
  x: number,
  y: number,
  style: number,
  facing: AvatarFacing,
  depth = 10,
  scale = 0.34
) {
  return scene.add
    .image(x, y, AVATAR_SHEET_KEY, getAvatarFrame(style, facing))
    .setOrigin(0.5, 1)
    .setScale(scale)
    .setDepth(depth);
}

export function updateAvatarImage(
  image: Phaser.GameObjects.Image,
  style: number,
  facing: AvatarFacing
) {
  image.setFrame(getAvatarFrame(style, facing));
}
