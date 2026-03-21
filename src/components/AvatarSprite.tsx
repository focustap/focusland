import React from "react";
import {
  AVATAR_FRAME_HEIGHT,
  AVATAR_FRAME_WIDTH,
  AVATAR_SHEET_COLUMNS,
  AVATAR_SHEET_PATH,
  clampAvatarStyle,
  getAvatarFrame,
  type AvatarFacing
} from "../lib/avatarSprites";

type Props = {
  styleIndex: number;
  facing?: AvatarFacing;
  size?: number;
  className?: string;
};

const AvatarSprite: React.FC<Props> = ({
  styleIndex,
  facing = "front",
  size = 84,
  className
}) => {
  const assetBase = import.meta.env.BASE_URL;
  const frame = getAvatarFrame(clampAvatarStyle(styleIndex), facing);
  const column = frame % AVATAR_SHEET_COLUMNS;
  const row = Math.floor(frame / AVATAR_SHEET_COLUMNS);

  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: 14,
        backgroundImage: `url(${assetBase}${AVATAR_SHEET_PATH})`,
        backgroundRepeat: "no-repeat",
        backgroundSize: `${AVATAR_SHEET_COLUMNS * size}px auto`,
        backgroundPosition: `-${column * size}px -${row * size}px`,
        imageRendering: "pixelated"
      }}
    />
  );
};

export default AvatarSprite;
