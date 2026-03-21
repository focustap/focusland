import Phaser from "phaser";

export const AVATAR_STORAGE_KEY = "focusland-avatar-customization";
export const AVATAR_SHEET_KEY = "focusland-avatar-sheet";
export const AVATAR_SHEET_PATH = "assets/avatar/charactermodels.png";
export const AVATAR_FRAME_WIDTH = 128;
export const AVATAR_FRAME_HEIGHT = 128;
export const AVATAR_SHEET_COLUMNS = 8;
export const AVATAR_SHEET_ROWS = 12;

const BODY_FRONT_ROWS = [1, 2];
const OUTFIT_ROWS = [8, 9];
const HEADWEAR_ROWS = [10, 11];

export type AvatarFacing = "front" | "back";

export type AvatarCustomization = {
  body: number;
  outfit: number;
  headwear: number;
};

type AvatarOption = {
  id: number;
  label: string;
  frame: number;
};

function buildOptions(rows: number[], label: string) {
  return rows.flatMap((row, rowIndex) =>
    Array.from({ length: AVATAR_SHEET_COLUMNS }, (_, column) => ({
      id: rowIndex * AVATAR_SHEET_COLUMNS + column,
      label: `${label} ${rowIndex * AVATAR_SHEET_COLUMNS + column + 1}`,
      frame: row * AVATAR_SHEET_COLUMNS + column
    }))
  );
}

export const BODY_OPTIONS = buildOptions(BODY_FRONT_ROWS, "Body");
export const OUTFIT_OPTIONS = buildOptions(OUTFIT_ROWS, "Outfit");
export const HEADWEAR_OPTIONS = buildOptions(HEADWEAR_ROWS, "Headwear");

export const DEFAULT_AVATAR_CUSTOMIZATION: AvatarCustomization = {
  body: 0,
  outfit: -1,
  headwear: -1
};

function clampLayer(value: number | null | undefined, max: number, allowNone = false) {
  if (allowNone && (value == null || value < 0 || Number.isNaN(value))) {
    return -1;
  }

  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0;
  }

  return Math.max(0, Math.min(max - 1, Math.floor(value)));
}

export function normalizeAvatarCustomization(
  value?: Partial<AvatarCustomization> | null
): AvatarCustomization {
  return {
    body: clampLayer(value?.body, BODY_OPTIONS.length, false),
    outfit: clampLayer(value?.outfit, OUTFIT_OPTIONS.length, true),
    headwear: clampLayer(value?.headwear, HEADWEAR_OPTIONS.length, true)
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

function getFrameFromOption(options: AvatarOption[], id: number) {
  return options[clampLayer(id, options.length, false)].frame;
}

export function getAvatarFrame(customization: AvatarCustomization, layer: "body" | "outfit" | "headwear") {
  if (layer === "body") {
    return getFrameFromOption(BODY_OPTIONS, customization.body);
  }

  if (layer === "outfit") {
    return customization.outfit < 0 ? null : getFrameFromOption(OUTFIT_OPTIONS, customization.outfit);
  }

  return customization.headwear < 0 ? null : getFrameFromOption(HEADWEAR_OPTIONS, customization.headwear);
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

export type AvatarRender = {
  container: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Image;
  outfit?: Phaser.GameObjects.Image;
  headwear?: Phaser.GameObjects.Image;
  customization: AvatarCustomization;
};

export function createAvatarRender(
  scene: Phaser.Scene,
  x: number,
  y: number,
  customization: AvatarCustomization,
  depth = 10,
  scale = 0.34
): AvatarRender {
  const resolved = normalizeAvatarCustomization(customization);
  const body = scene.add.image(0, 0, AVATAR_SHEET_KEY, getAvatarFrame(resolved, "body") ?? 0).setOrigin(0.5, 1).setScale(scale);
  const children: Phaser.GameObjects.GameObject[] = [body];
  const outfitFrame = getAvatarFrame(resolved, "outfit");
  const headwearFrame = getAvatarFrame(resolved, "headwear");
  let outfit: Phaser.GameObjects.Image | undefined;
  let headwear: Phaser.GameObjects.Image | undefined;

  if (outfitFrame != null) {
    outfit = scene.add.image(0, 0, AVATAR_SHEET_KEY, outfitFrame).setOrigin(0.5, 1).setScale(scale);
    children.push(outfit);
  }

  if (headwearFrame != null) {
    headwear = scene.add.image(0, 0, AVATAR_SHEET_KEY, headwearFrame).setOrigin(0.5, 1).setScale(scale);
    children.push(headwear);
  }

  const container = scene.add.container(x, y, children).setDepth(depth);
  return { container, body, outfit, headwear, customization: resolved };
}

export function updateAvatarRender(render: AvatarRender, customization: AvatarCustomization) {
  const resolved = normalizeAvatarCustomization(customization);
  render.customization = resolved;
  render.body.setFrame(getAvatarFrame(resolved, "body") ?? 0);

  const outfitFrame = getAvatarFrame(resolved, "outfit");
  if (outfitFrame == null) {
    render.outfit?.setVisible(false);
  } else if (render.outfit) {
    render.outfit.setVisible(true).setFrame(outfitFrame);
  }

  const headwearFrame = getAvatarFrame(resolved, "headwear");
  if (headwearFrame == null) {
    render.headwear?.setVisible(false);
  } else if (render.headwear) {
    render.headwear.setVisible(true).setFrame(headwearFrame);
  }
}
