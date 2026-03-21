import React from "react";
import {
  AVATAR_FRAME_HEIGHT,
  AVATAR_FRAME_WIDTH,
  AVATAR_SHEET_COLUMNS,
  AVATAR_SHEET_PATH,
  AVATAR_SHEET_ROWS,
  getAvatarFrame,
  normalizeAvatarCustomization,
  type AvatarCustomization
} from "../lib/avatarSprites";

type LayerProps = {
  frame: number | null;
  size: number;
  baseUrl: string;
};

const Layer: React.FC<LayerProps> = ({ frame, size, baseUrl }) => {
  if (frame == null) {
    return null;
  }

  const column = frame % AVATAR_SHEET_COLUMNS;
  const row = Math.floor(frame / AVATAR_SHEET_COLUMNS);
  const width = AVATAR_SHEET_COLUMNS * size;
  const height = AVATAR_SHEET_ROWS * size;

  return (
    <img
      src={`${baseUrl}${AVATAR_SHEET_PATH}`}
      alt=""
      aria-hidden="true"
      style={{
        position: "absolute",
        left: `-${column * size}px`,
        top: `-${row * size}px`,
        width,
        height,
        imageRendering: "pixelated",
        pointerEvents: "none"
      }}
    />
  );
};

type Props = {
  customization: AvatarCustomization;
  size?: number;
  className?: string;
};

const AvatarSprite: React.FC<Props> = ({
  customization,
  size = 84,
  className
}) => {
  const assetBase = import.meta.env.BASE_URL;
  const resolved = normalizeAvatarCustomization(customization);

  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: 14,
        overflow: "hidden",
        position: "relative",
        background: "rgba(15, 23, 42, 0.08)"
      }}
    >
      <Layer frame={getAvatarFrame(resolved, "body")} size={size} baseUrl={assetBase} />
      <Layer frame={getAvatarFrame(resolved, "outfit")} size={size} baseUrl={assetBase} />
      <Layer frame={getAvatarFrame(resolved, "headwear")} size={size} baseUrl={assetBase} />
    </div>
  );
};

export default AvatarSprite;
