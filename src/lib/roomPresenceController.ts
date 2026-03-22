import Phaser from "phaser";
import {
  createAvatarRender,
  DEFAULT_AVATAR_CUSTOMIZATION,
  normalizeAvatarCustomization,
  updateAvatarRender,
  TOWN_AVATAR_SCALE,
  type AvatarCustomization,
  type AvatarRender
} from "./avatarSprites";
import {
  fetchRoomPresence,
  LOBBY_PRESENCE_STALE_AFTER_MS,
  removePresenceForUser,
  subscribeToRoomPresence,
  updatePlayerPosition,
  upsertInitialPresence,
  type LobbyPresenceRow
} from "./lobbyPresence";
import { supabase } from "./supabase";

export const ROOM_NAMES = {
  arcade: "arcade_room",
  arena: "arena_room",
  cards: "cards_room",
  casino: "casino_room",
  invaders: "invaders_room",
  lobby: "main_lobby",
  shop: "shop_room"
} as const;

type RoomName = (typeof ROOM_NAMES)[keyof typeof ROOM_NAMES];

type RoomPresenceControllerParams = {
  scene: Phaser.Scene;
  roomName: RoomName;
  userId: string;
  username: string | null;
  profileColor: string;
  getLocalPosition: () => { x: number; y: number } | null;
};

type RemotePlayer = {
  render: AvatarRender;
  label: Phaser.GameObjects.Text;
  targetX: number;
  targetY: number;
  lastSeenAt: number;
  customization: AvatarCustomization;
};

export type RoomPresenceController = {
  animate: () => void;
  destroy: () => void;
};

export function createRoomPresenceController({
  scene,
  roomName,
  userId,
  username,
  profileColor,
  getLocalPosition
}: RoomPresenceControllerParams): RoomPresenceController {
  const otherPlayers = new Map<string, RemotePlayer>();
  const avatarCustomizationCache = new Map<string, AvatarCustomization>();
  let destroyed = false;
  let unsubscribePresence: (() => void) | undefined;
  let detachPageHideListener: (() => void) | undefined;
  let lastSentX = Number.NaN;
  let lastSentY = Number.NaN;

  const destroyRemotePlayer = (remotePlayer: RemotePlayer) => {
    remotePlayer.render.container.destroy();
    remotePlayer.label.destroy();
  };

  const handlePresenceEvent = (eventType: "INSERT" | "UPDATE" | "DELETE", row: LobbyPresenceRow) => {
    if (destroyed || row.room_name !== roomName || row.user_id === userId) {
      return;
    }

    const existing = otherPlayers.get(row.user_id);

    if (eventType === "DELETE") {
      if (existing) {
        destroyRemotePlayer(existing);
        otherPlayers.delete(row.user_id);
      }
      return;
    }

    if (!existing) {
      const customization = avatarCustomizationCache.get(row.user_id) ?? DEFAULT_AVATAR_CUSTOMIZATION;
      const render = createAvatarRender(scene, row.x, row.y, customization, 12, TOWN_AVATAR_SCALE);
      const label = scene.add.text(row.x, row.y - 40, row.username ?? "Player", {
        fontSize: "12px",
        color: "#f8fafc",
        stroke: "#0f172a",
        strokeThickness: 3
      });
      label.setOrigin(0.5);
      label.setDepth(20);

      otherPlayers.set(row.user_id, {
        render,
        label,
        targetX: row.x,
        targetY: row.y,
        lastSeenAt: Date.now(),
        customization
      });

      void supabase
        .from("profiles")
        .select("avatar_customization")
        .eq("id", row.user_id)
        .maybeSingle()
        .then(({ data: remoteProfile }) => {
          if (!remoteProfile) {
            return;
          }

          const resolvedCustomization = normalizeAvatarCustomization(
            (remoteProfile as { avatar_customization?: Partial<AvatarCustomization> | null }).avatar_customization
            ?? DEFAULT_AVATAR_CUSTOMIZATION
          );
          avatarCustomizationCache.set(row.user_id, resolvedCustomization);

          const current = otherPlayers.get(row.user_id);
          if (!current) {
            return;
          }

          current.customization = resolvedCustomization;
          updateAvatarRender(current.render, resolvedCustomization, current.render.facing, false);
        });
      return;
    }

    existing.targetX = row.x;
    existing.targetY = row.y;
    existing.lastSeenAt = Date.now();
    existing.label.setText(row.username ?? "Player");
  };

  const sendLocalPosition = () => {
    const position = getLocalPosition();
    if (!position) {
      return;
    }

    const movedDistance = Math.hypot(position.x - lastSentX, position.y - lastSentY);
    if (!Number.isNaN(lastSentX) && movedDistance < 1) {
      return;
    }

    lastSentX = position.x;
    lastSentY = position.y;
    void updatePlayerPosition({
      userId,
      roomName,
      x: position.x,
      y: position.y
    });
  };

  const initialPosition = getLocalPosition();
  if (initialPosition) {
    lastSentX = initialPosition.x;
    lastSentY = initialPosition.y;
    void upsertInitialPresence({
      userId,
      username,
      roomName,
      x: initialPosition.x,
      y: initialPosition.y,
      color: profileColor
    });
  }

  scene.time.addEvent({
    delay: 80,
    loop: true,
    callback: sendLocalPosition
  });

  scene.time.addEvent({
    delay: Math.max(4000, Math.floor(LOBBY_PRESENCE_STALE_AFTER_MS / 3)),
    loop: true,
    callback: () => {
      const position = getLocalPosition();
      if (!position) {
        return;
      }

      lastSentX = position.x;
      lastSentY = position.y;
      void updatePlayerPosition({
        userId,
        roomName,
        x: position.x,
        y: position.y
      });
    }
  });

  void fetchRoomPresence(roomName).then(({ data, error }) => {
    if (error || !data || destroyed) {
      return;
    }

    data.forEach((row) => {
      handlePresenceEvent("INSERT", row as LobbyPresenceRow);
    });
  });

  unsubscribePresence = subscribeToRoomPresence(roomName, ({ type, row }) => {
    handlePresenceEvent(type, row);
  });

  const handlePageHide = () => {
    void removePresenceForUser({ userId, roomName });
  };
  window.addEventListener("pagehide", handlePageHide);
  window.addEventListener("beforeunload", handlePageHide);
  detachPageHideListener = () => {
    window.removeEventListener("pagehide", handlePageHide);
    window.removeEventListener("beforeunload", handlePageHide);
  };

  const destroy = () => {
    if (destroyed) {
      return;
    }

    destroyed = true;
    unsubscribePresence?.();
    detachPageHideListener?.();
    otherPlayers.forEach((remotePlayer) => {
      destroyRemotePlayer(remotePlayer);
    });
    otherPlayers.clear();
    void removePresenceForUser({ userId, roomName });
  };

  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, destroy);
  scene.events.once(Phaser.Scenes.Events.DESTROY, destroy);

  return {
    animate: () => {
      if (destroyed) {
        return;
      }

      const staleCutoff = Date.now() - LOBBY_PRESENCE_STALE_AFTER_MS;
      otherPlayers.forEach((remotePlayer, remoteUserId) => {
        if (remotePlayer.lastSeenAt < staleCutoff) {
          destroyRemotePlayer(remotePlayer);
          otherPlayers.delete(remoteUserId);
          return;
        }

        const dxToTarget = remotePlayer.targetX - remotePlayer.render.container.x;
        const dyToTarget = remotePlayer.targetY - remotePlayer.render.container.y;
        const distance = Phaser.Math.Distance.Between(
          remotePlayer.render.container.x,
          remotePlayer.render.container.y,
          remotePlayer.targetX,
          remotePlayer.targetY
        );
        const nextX =
          distance < 0.75
            ? remotePlayer.targetX
            : Phaser.Math.Linear(remotePlayer.render.container.x, remotePlayer.targetX, 0.16);
        const nextY =
          distance < 0.75
            ? remotePlayer.targetY
            : Phaser.Math.Linear(remotePlayer.render.container.y, remotePlayer.targetY, 0.16);

        remotePlayer.render.container.setPosition(nextX, nextY);
        updateAvatarRender(
          remotePlayer.render,
          remotePlayer.customization,
          Math.abs(dxToTarget) > Math.abs(dyToTarget)
            ? dxToTarget < 0
              ? "left"
              : "right"
            : dyToTarget < 0
              ? "back"
              : "front",
          distance >= 0.75
        );
        remotePlayer.label.setPosition(nextX, nextY - 40);
      });
    },
    destroy
  };
}
