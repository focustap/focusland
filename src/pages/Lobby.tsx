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

      const width = 640;
      const height = 480;

      // Simple structure to describe a building zone.
      type Building = {
        name: string;
        color: number;
        body: Phaser.GameObjects.Rectangle | null;
        entranceX: number;
        entranceY: number;
        route: string;
        x: number;
        y: number;
        width: number;
        height: number;
        labelColor: string;
        roofOffsetX: number;
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

        create() {
        this.cameras.main.setBackgroundColor("#09111f");

        this.add.rectangle(width / 2, height / 2, width - 18, height - 18, 0x152238);
        this.add.rectangle(width / 2, height / 2, width - 36, height - 36, 0x1f7a4c);
        this.add.rectangle(width / 2, height / 2, width - 60, height - 60, 0x3f9c5c, 0.18);
        this.add.circle(width / 2, height / 2 + 8, 56, 0x0f172a, 0.3);
        this.add.circle(width / 2, height / 2 + 8, 38, 0x7dd3fc, 0.85);
        this.add.circle(width / 2, height / 2 + 8, 22, 0xe0f2fe, 0.7);

        const pathColor = 0xd6c5a1;
        this.add.rectangle(width / 2, height / 2 + 8, 380, 28, pathColor);
        this.add.rectangle(width / 2, height / 2 + 8, 28, 250, pathColor);
        this.add.rectangle(width / 2, height / 2 + 8, 120, 120, 0xe8dcc2);
        this.add.rectangle(width / 2, height / 2 + 8, 88, 88, 0xf6eee0);

        const addTree = (x: number, y: number) => {
          this.add.rectangle(x, y + 18, 12, 26, 0x7c4a1c);
          this.add.circle(x, y, 18, 0x1d7a46);
          this.add.circle(x - 12, y + 6, 12, 0x155e37);
          this.add.circle(x + 12, y + 6, 12, 0x2ca35e);
        };

        [
          [182, 154],
          [462, 154],
          [182, 326],
          [462, 326],
          [250, 105],
          [392, 105],
          [248, 380],
          [394, 380]
        ].forEach(([x, y]) => addTree(x, y));

        const localColor = profileColorToNumber(profileColor);

        // Player in the center of the room.
        player = this.add.rectangle(width / 2, height / 2 + 60, 24, 32, localColor);

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
            name: "Try to Dodge",
            color: 0x22c55e,
            body: null,
            entranceX: width / 2,
            entranceY: 80,
            route: "/game",
            x: width / 2,
            y: 68,
            width: 120,
            height: 70,
            labelColor: "#082f1d",
            roofOffsetX: 64
          },
          {
            name: "Pong",
            color: 0x06b6d4,
            body: null,
            entranceX: 120,
            entranceY: 80,
            route: "/pong",
            x: 94,
            y: 82,
            width: 108,
            height: 62,
            labelColor: "#082f49",
            roofOffsetX: 60
          },
          {
            name: "Catch Club",
            color: 0xf97316,
            body: null,
            entranceX: width - 120,
            entranceY: height / 2,
            route: "/catch",
            x: width - 86,
            y: height / 2 - 8,
            width: 112,
            height: 82,
            labelColor: "#431407",
            roofOffsetX: 64
          },
          {
            name: "Profile House",
            color: 0x3b82f6,
            body: null,
            entranceX: 120,
            entranceY: height / 2,
            route: "/profile",
            x: 84,
            y: height / 2 - 8,
            width: 108,
            height: 82,
            labelColor: "#172554",
            roofOffsetX: 60
          },
          {
            name: "21",
            color: 0xe11d48,
            body: null,
            entranceX: width / 2,
            entranceY: height - 80,
            route: "/casino",
            x: width / 2,
            y: height - 62,
            width: 124,
            height: 72,
            labelColor: "#4c0519",
            roofOffsetX: 72
          },
          {
            name: "Invaders",
            color: 0x8b5cf6,
            body: null,
            entranceX: width - 120,
            entranceY: height - 80,
            route: "/invaders",
            x: width - 88,
            y: height - 62,
            width: 116,
            height: 72,
            labelColor: "#2e1065",
            roofOffsetX: 66
          },
          {
            name: "Brawl",
            color: 0xf59e0b,
            body: null,
            entranceX: 118,
            entranceY: height - 80,
            route: "/brawl",
            x: 92,
            y: height - 62,
            width: 112,
            height: 72,
            labelColor: "#451a03",
            roofOffsetX: 64
          }
        ];

        const drawBuilding = (building: Building) => {
          const roofColor = Phaser.Display.Color.IntegerToColor(building.color)
            .darken(20)
            .color;
          const roofBaseY = building.y - building.height / 2;
          const body = this.add.rectangle(
            building.x,
            building.y,
            building.width,
            building.height,
            building.color
          );
          this.add.triangle(
            building.x + building.roofOffsetX,
            roofBaseY + 11,
            -building.width / 2 - 6,
            8,
            building.width / 2 + 6,
            8,
            0,
            -28,
            roofColor
          );
          this.add.rectangle(
            building.x,
            roofBaseY + 4,
            building.width + 6,
            10,
            roofColor
          );
          this.add.rectangle(
            building.x,
            building.y + building.height / 2 - 14,
            22,
            28,
            0x5b3419
          );
          this.add.rectangle(
            building.x - building.width / 4,
            building.y + 4,
            16,
            18,
            0xfef3c7
          );
          this.add.rectangle(
            building.x + building.width / 4,
            building.y + 4,
            16,
            18,
            0xfef3c7
          );
          const signWidth = Math.max(72, building.name.length * 8 + 18);
          this.add.rectangle(
            building.x,
            building.y + building.height / 2 + 16,
            signWidth,
            18,
            0xf8fafc
          );
          this.add
            .text(building.x, building.y + building.height / 2 + 16, building.name, {
              fontSize: "13px",
              color: building.labelColor,
              fontStyle: "bold"
            })
            .setOrigin(0.5);
          building.body = body;
        };

        buildings.forEach((building) => {
          drawBuilding(building);
        });

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
          const rect = this.add.rectangle(row.x, row.y, 24, 32, colorNumber);
          const label = this.add.text(row.x, row.y - 24, row.username ?? "Player", {
            fontSize: "12px",
            color: "#111827"
          });
          label.setOrigin(0.5);

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
      <div className="content card">
        <h2>Town Lobby</h2>
        <p>Click on the floor to walk, or click a building to enter.</p>
        <div
          ref={containerRef}
          style={{
            width: "100%",
            maxWidth: 640,
            margin: "1rem auto"
          }}
        />
      </div>
    </div>
  );
};

export default Lobby;

