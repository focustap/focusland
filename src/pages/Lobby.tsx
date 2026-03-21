// Lobby page.
// Single-screen point-and-click room built with Phaser.
// Now supports simple real-time multiplayer presence using Supabase Realtime.
import React, { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import NavBar from "../components/NavBar";
import Phaser from "phaser";
import { DEFAULT_PROFILE_COLOR, normalizeProfileColor, profileColorToNumber } from "../lib/profileColor";
import { supabase } from "../lib/supabase";
import {
  LOBBY_ROOM_NAME,
  LOBBY_PRESENCE_STALE_AFTER_MS,
  fetchRoomPresence,
  subscribeToRoomPresence,
  upsertInitialPresence,
  updatePlayerPosition,
  removePresenceForUser,
  type LobbyPresenceRow
} from "../lib/lobbyPresence";

const Lobby: React.FC = () => {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const assetBase = import.meta.env.BASE_URL;

  useEffect(() => {
    if (!containerRef.current || gameRef.current) {
      return;
    }

    let isUnmounted = false;

    const setup = async (): Promise<(() => void) | undefined> => {
      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (!session) {
        navigate("/login");
        return () => {};
      }

      const userId = session.user.id;

      const { data: profile } = await supabase
        .from("profiles")
        .select("username, color")
        .eq("id", userId)
        .maybeSingle();

      const username: string | null = (profile?.username as string) ?? session.user.email ?? null;
      const profileColor = normalizeProfileColor((profile?.color as string | null) ?? DEFAULT_PROFILE_COLOR);

      if (isUnmounted || !containerRef.current) {
        return () => {};
      }

      const width = 800;
      const height = 520;

      // Simple structure to describe a building zone.
      type Building = {
        name: string;
        color: number;
        body: Phaser.GameObjects.Zone | null;
        entranceX: number;
        entranceY: number;
        route: string;
        x: number;
        y: number;
        width: number;
        height: number;
      };

      // This function will be called when the player reaches an entrance.
      const goToRoute = (route: string) => {
        // When leaving the lobby (e.g. to the arcade), remove our presence row
        // so other players no longer see us in this room.
        void removePresenceForUser({ userId, roomName: LOBBY_ROOM_NAME });
        navigate(route);
      };

      let player: Phaser.GameObjects.Rectangle | null = null;
      let targetX: number | null = null;
      let targetY: number | null = null;
      let buildings: Building[] = [];
      const walkSpeed = 150;
      const arrivalThreshold = 10; // pixels
      let isTransitioning = false;
      let detachPageHideListener: (() => void) | undefined;

      const sceneConfig: Phaser.Types.Scenes.SettingsConfig = {
        active: true,
        key: "LobbyScene"
      };

      class LobbyScene extends Phaser.Scene {
        otherPlayers: Map<
          string,
          {
            rect: Phaser.GameObjects.Rectangle;
            label: Phaser.GameObjects.Text;
            targetX: number;
            targetY: number;
            lastSeenAt: number;
          }
        > = new Map();

        localUserId: string;
        localUsername: string | null;
        unsubscribePresence?: () => void;
        lastSentX: number = 0;
        lastSentY: number = 0;

        constructor() {
          super(sceneConfig);
          this.localUserId = userId;
          this.localUsername = username;
        }

        preload() {
          this.load.image("lobby-town", `${assetBase}assets/lobby/tiny-town/sample.png`);
        }

        create() {
        this.cameras.main.setBackgroundColor("#050816");

        const bg = this.add.image(width / 2, height / 2, "lobby-town");
        bg.setDisplaySize(width, 448);
        bg.setY(height / 2 + 8);

        this.add.rectangle(width / 2, 32, width, 82, 0x050816, 0.34).setDepth(1);
        this.add.rectangle(width / 2, height - 18, width, 110, 0x020617, 0.28).setDepth(1);
        this.add.rectangle(width / 2, height / 2, width - 16, height - 16, 0x000000, 0)
          .setStrokeStyle(2, 0xffffff, 0.08)
          .setDepth(20);

        const localColor = profileColorToNumber(profileColor);

        // Player in the center of the room.
        player = this.add.rectangle(width / 2 - 8, height / 2 + 44, 24, 32, localColor).setDepth(12);

        const handlePageHide = () => {
          void removePresenceForUser({ userId, roomName: LOBBY_ROOM_NAME });
        };
        window.addEventListener("pagehide", handlePageHide);
        window.addEventListener("beforeunload", handlePageHide);
        detachPageHideListener = () => {
          window.removeEventListener("pagehide", handlePageHide);
          window.removeEventListener("beforeunload", handlePageHide);
        };

          // Start "last sent" position at the initial spawn location.
          this.lastSentX = player.x;
          this.lastSentY = player.y;

          void upsertInitialPresence({
          userId,
          username,
          x: player.x,
          y: player.y,
          color: profileColor
        });

          this.time.addEvent({
            delay: 60,
          loop: true,
          callback: () => {
              if (!player) return;

              // Only send an update if the player actually moved
              // more than a tiny amount since last send.
              const currentX = player.x;
              const currentY = player.y;
              const movedDistance = Math.hypot(currentX - this.lastSentX, currentY - this.lastSentY);
              if (movedDistance < 1) {
                return;
              }

              this.lastSentX = currentX;
              this.lastSentY = currentY;

            void updatePlayerPosition({
              userId,
                x: currentX,
                y: currentY
            });
          }
        });

          this.time.addEvent({
            delay: Math.max(4000, Math.floor(LOBBY_PRESENCE_STALE_AFTER_MS / 3)),
            loop: true,
            callback: () => {
              if (!player) return;

              void updatePlayerPosition({
                userId,
                x: player.x,
                y: player.y
              });
            }
          });

          // Load any existing players already in this room so
          // they appear immediately when we join.
          void (async () => {
            const { data, error } = await fetchRoomPresence(LOBBY_ROOM_NAME);
            if (error || !data) {
              return;
            }
            data.forEach((row) => {
              this.handlePresenceEvent("INSERT", row as LobbyPresenceRow);
            });
          })();

          // Subscribe to realtime changes (INSERT, UPDATE, DELETE)
          // so new players and movement updates appear live.
          this.unsubscribePresence = subscribeToRoomPresence(
            LOBBY_ROOM_NAME,
            ({ type, row }) => {
              if (!player) return;
              this.handlePresenceEvent(type, row);
            }
          );

          this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            if (this.unsubscribePresence) {
              this.unsubscribePresence();
            }
          });
          this.events.once(Phaser.Scenes.Events.DESTROY, () => {
            if (this.unsubscribePresence) {
              this.unsubscribePresence();
            }
          });

        // Buildings around the edges.
        buildings = [
          {
            name: "Casino",
            color: 0xe11d48,
            body: null,
            entranceX: 186,
            entranceY: 142,
            route: "/casino",
            x: 184,
            y: 112,
            width: 120,
            height: 94
          },
          {
            name: "Profile House",
            color: 0x3b82f6,
            body: null,
            entranceX: 292,
            entranceY: 314,
            route: "/profile",
            x: 286,
            y: 306,
            width: 118,
            height: 90
          },
          {
            name: "Arena",
            color: 0xf59e0b,
            body: null,
            entranceX: 665,
            entranceY: 356,
            route: "/arena",
            x: 678,
            y: 326,
            width: 146,
            height: 134
          },
          {
            name: "Records House",
            color: 0x22c55e,
            body: null,
            entranceX: 514,
            entranceY: 168,
            route: "/leaderboard",
            x: 520,
            y: 150,
            width: 120,
            height: 82
          },
          {
            name: "Hangar",
            color: 0x06b6d4,
            body: null,
            entranceX: 642,
            entranceY: 182,
            route: "/hangar",
            x: 648,
            y: 162,
            width: 118,
            height: 82
          },
          {
            name: "Arcade",
            color: 0x8b5cf6,
            body: null,
            entranceX: 286,
            entranceY: 142,
            route: "/arcade",
            x: 286,
            y: 110,
            width: 116,
            height: 88
          }
        ];

        const drawBuilding = (building: Building) => {
          const glow = this.add.circle(building.entranceX, building.entranceY + 6, 22, building.color, 0.28).setDepth(7);
          const marker = this.add.circle(building.entranceX, building.entranceY + 2, 11, building.color, 0.9)
            .setStrokeStyle(2, 0xffffff, 0.88)
            .setDepth(8);
          const zone = this.add.zone(building.entranceX, building.entranceY, building.width, building.height).setDepth(6);
          const tagWidth = Math.max(96, building.name.length * 8 + 22);
          const tag = this.add.rectangle(building.entranceX, building.entranceY - 28, tagWidth, 22, 0x0f172a, 0.9)
            .setStrokeStyle(1, building.color, 0.9)
            .setDepth(9);
          const label = this.add.text(building.entranceX, building.entranceY - 28, building.name, {
            fontFamily: "\"Trebuchet MS\", system-ui, sans-serif",
            fontSize: "13px",
            color: "#f8fafc",
            fontStyle: "bold"
          }).setOrigin(0.5).setDepth(10);
          const guide = this.add.text(building.entranceX, building.entranceY + 24, "Click to enter", {
            fontFamily: "\"Trebuchet MS\", system-ui, sans-serif",
            fontSize: "11px",
            color: "#dbeafe"
          }).setOrigin(0.5).setDepth(9);

          this.tweens.add({
            targets: [glow, marker],
            scale: { from: 0.96, to: 1.08 },
            alpha: { from: glow.alpha, to: 0.52 },
            duration: 1100,
            yoyo: true,
            repeat: -1
          });

          this.tweens.add({
            targets: guide,
            y: guide.y + 3,
            alpha: { from: 0.92, to: 0.48 },
            duration: 950,
            yoyo: true,
            repeat: -1
          });

          tag.setData("route", building.route);
          label.setData("route", building.route);
          guide.setData("route", building.route);
          marker.setData("route", building.route);
          zone.setData("route", building.route);
          building.body = zone;
        };

        buildings.forEach((building) => {
          drawBuilding(building);
        });

        const hubHeader = this.add.rectangle(width / 2, 34, 370, 46, 0x0f172a, 0.72)
          .setStrokeStyle(1, 0xffffff, 0.08)
          .setDepth(15);
        const hubTitle = this.add.text(width / 2, 24, "Focusland Town Square", {
          fontFamily: "Georgia, serif",
          fontSize: "21px",
          color: "#f8fafc",
          fontStyle: "bold"
        }).setOrigin(0.5).setDepth(16);
        const hubSubtitle = this.add.text(width / 2, 44, "Walk the town and step onto a marker to enter each destination.", {
          fontFamily: "\"Trebuchet MS\", system-ui, sans-serif",
          fontSize: "11px",
          color: "#cbd5e1"
        }).setOrigin(0.5).setDepth(16);

        hubHeader.setAlpha(0.86);
        hubTitle.setAlpha(0.98);
        hubSubtitle.setAlpha(0.95);

        // Handle clicks: walk to clicked position.
        this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
          // Set the target position to where the player should walk.
          targetX = pointer.x;
          targetY = pointer.y;

          // Check if click was inside a building; if so, set targetX to its entrance.
          for (const building of buildings) {
            if (!building.body) continue;
            const bounds = building.body.getBounds();
            if (bounds.contains(pointer.x, pointer.y)) {
              // Walk to the entrance of the building instead of the click point.
              targetX = building.entranceX;
              targetY = building.entranceY;
              // Store route on the scene so we can check when arriving.
              (this as any).pendingRoute = building.route;
              break;
            }
          }
        });
      }

      handlePresenceEvent(eventType: "INSERT" | "UPDATE" | "DELETE", row: LobbyPresenceRow) {
        if (row.room_name !== LOBBY_ROOM_NAME) return;
        if (row.user_id === this.localUserId) return;

        const existing = this.otherPlayers.get(row.user_id);

        if (eventType === "DELETE") {
          if (existing) {
            existing.rect.destroy();
            existing.label.destroy();
            this.otherPlayers.delete(row.user_id);
          }
          return;
        }

        const colorNumber = profileColorToNumber(row.color);

        if (!existing) {
          const rect = this.add.rectangle(row.x, row.y, 24, 32, colorNumber).setDepth(12);
          const label = this.add.text(row.x, row.y - 24, row.username ?? "Player", {
            fontSize: "12px",
            color: "#f8fafc",
            stroke: "#0f172a",
            strokeThickness: 3
          });
          label.setOrigin(0.5);
          label.setDepth(13);

          this.otherPlayers.set(row.user_id, {
            rect,
            label,
            targetX: row.x,
            targetY: row.y,
            lastSeenAt: Date.now()
          });
        } else {
          existing.targetX = row.x;
          existing.targetY = row.y;
          existing.lastSeenAt = Date.now();
          existing.rect.fillColor = colorNumber;
          existing.label.setText(row.username ?? "Player");
        }
      }

      update(_time: number, delta: number) {
        if (!player) return;

        this.otherPlayers.forEach((otherPlayer) => {
          const distance = Phaser.Math.Distance.Between(
            otherPlayer.rect.x,
            otherPlayer.rect.y,
            otherPlayer.targetX,
            otherPlayer.targetY
          );
          const nextX =
            distance < 0.75
              ? otherPlayer.targetX
              : Phaser.Math.Linear(otherPlayer.rect.x, otherPlayer.targetX, 0.14);
          const nextY =
            distance < 0.75
              ? otherPlayer.targetY
              : Phaser.Math.Linear(otherPlayer.rect.y, otherPlayer.targetY, 0.14);
          otherPlayer.rect.setPosition(nextX, nextY);
          otherPlayer.label.setPosition(nextX, nextY - 24);
        });

        // If there is no target, stop moving.
        if (targetX == null || targetY == null) {
          return;
        }

        const dx = targetX - player.x;
        const dy = targetY - player.y;
        const distance = Math.hypot(dx, dy);

        if (distance < arrivalThreshold) {
          player.setPosition(targetX, targetY);

          // If a route is pending and we just arrived at its entrance, navigate once.
          const pendingRoute: string | undefined = (this as any).pendingRoute;
          if (pendingRoute && !isTransitioning) {
            isTransitioning = true;
            (this as any).pendingRoute = undefined;
            goToRoute(pendingRoute);
          }

          targetX = null;
          targetY = null;
        } else {
          // Use delta-time movement instead of physics velocity so speed
          // stays consistent even if the browser has a rough frame.
          const step = (walkSpeed * delta) / 1000;
          const moveDistance = Math.min(step, distance);
          const nextX = Phaser.Math.Clamp(
            player.x + (dx / distance) * moveDistance,
            12,
            width - 12
          );
          const nextY = Phaser.Math.Clamp(
            player.y + (dy / distance) * moveDistance,
            16,
            height - 16
          );
          player.setPosition(nextX, nextY);
        }
      }
    }

      const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      width,
      height,
      parent: containerRef.current,
      physics: {
        default: "arcade",
        arcade: {
          gravity: { x: 0, y: 0 },
          debug: false
        }
      },
      scene: LobbyScene
    };

      const game = new Phaser.Game(config);
      gameRef.current = game;

      return () => {
        // When the lobby scene is torn down (e.g. navigating away),
        // also remove this user's presence row from the lobby.
        detachPageHideListener?.();
        void removePresenceForUser({ userId, roomName: LOBBY_ROOM_NAME });
        game.destroy(true);
        gameRef.current = null;
      };
    };

    let cleanup: (() => void) | undefined;

void setup().then((returnedCleanup) => {
  cleanup = returnedCleanup;
});

return () => {
  isUnmounted = true;
  cleanup?.();
};
  }, [navigate]);

      return (
    <div className="page">
      <NavBar />
      <div className="content card" style={{ maxWidth: 860 }}>
        <h2>Town Lobby</h2>
        <p>Walk through the town square and click one of the glowing markers to head into the Casino, Arcade, Arena, Hangar, Records House, or Profile House.</p>
        <div
          ref={containerRef}
          style={{
            width: "100%",
            maxWidth: 800,
            margin: "1rem auto"
          }}
        />
      </div>
    </div>
  );
};

export default Lobby;

