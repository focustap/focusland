import React from "react";
import {
  type AvatarFacing,
  getAvatarScaleMultipliers,
  normalizeAvatarCustomization,
  PROFILE_AVATAR_PREVIEW_SIZE,
  SKIN_OPTIONS,
  type AvatarCustomization
} from "../lib/avatarSprites";

type Props = {
  customization: AvatarCustomization;
  size?: number;
  className?: string;
  facing?: AvatarFacing;
  moving?: boolean;
  animationTick?: number;
};

const AvatarSprite: React.FC<Props> = ({
  customization,
  size = PROFILE_AVATAR_PREVIEW_SIZE,
  className,
  facing = "front",
  moving = false,
  animationTick = 0
}) => {
  const assetBase = import.meta.env.BASE_URL;
  const resolved = normalizeAvatarCustomization(customization);
  const skin = SKIN_OPTIONS[resolved.skinId];
  const multipliers = getAvatarScaleMultipliers(resolved);
  const frame = moving ? [0, 1, 0, 2][animationTick % 4] : 0;
  const backgroundImage = moving
    ? `url(${assetBase}assets/avatar/skins/${skin.assetBaseName}-${facing}-strip.png)`
    : `url(${assetBase}assets/avatar/skins/${skin.assetBaseName}-${facing}.png)`;
  const backgroundSize = moving ? `${size * 3}px ${size}px` : `${size}px ${size}px`;
  const backgroundPosition = moving ? `${-frame * size}px 0px` : "0px 0px";

  return (
    <div
      className={className}
      aria-label={skin.label}
      role="img"
      style={{
        width: size,
        height: size,
        borderRadius: 14,
        imageRendering: "pixelated",
        background: "rgba(15, 23, 42, 0.08)",
        backgroundImage,
        backgroundRepeat: "no-repeat",
        backgroundSize,
        backgroundPosition,
        transform: `scale(${multipliers.scaleX}, ${multipliers.scaleY})`,
        transformOrigin: "center bottom"
      }}
    />
  );
};

export default AvatarSprite;
