import React from "react";
import {
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
};

const AvatarSprite: React.FC<Props> = ({
  customization,
  size = PROFILE_AVATAR_PREVIEW_SIZE,
  className
}) => {
  const assetBase = import.meta.env.BASE_URL;
  const resolved = normalizeAvatarCustomization(customization);
  const skin = SKIN_OPTIONS[resolved.skinId];
  const multipliers = getAvatarScaleMultipliers(resolved);

  return (
    <img
      className={className}
      src={`${assetBase}assets/avatar/skins/${skin.assetBaseName}-front.png`}
      alt={skin.label}
      style={{
        width: size,
        height: size,
        borderRadius: 14,
        objectFit: "contain",
        imageRendering: "pixelated",
        background: "rgba(15, 23, 42, 0.08)",
        transform: `scale(${multipliers.scaleX}, ${multipliers.scaleY})`,
        transformOrigin: "center bottom"
      }}
    />
  );
};

export default AvatarSprite;
