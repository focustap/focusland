import React from "react";
import {
  normalizeAvatarCustomization,
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
  size = 144,
  className
}) => {
  const assetBase = import.meta.env.BASE_URL;
  const resolved = normalizeAvatarCustomization(customization);
  const skin = SKIN_OPTIONS[resolved.skinId];

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
        background: "rgba(15, 23, 42, 0.08)"
      }}
    />
  );
};

export default AvatarSprite;
