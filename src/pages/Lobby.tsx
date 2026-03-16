// Lobby page.
// Single-screen point-and-click room built with Phaser.
// Now supports simple real-time multiplayer presence using Supabase Realtime.
import React, { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import NavBar from "../components/NavBar";
import Phaser from "phaser";
import { supabase } from "../lib/supabase";
import {
  LOBBY_ROOM_NAME,
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

    const setup = async () => {
      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (!session) {
        navigate("/login");
        return;
      }

      const userId = session.user.id;

      const { data: profile } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", userId)
        .maybeSingle();

      const username: string | null = (profile?.username as string) ?? session.user.email ?? null;

      if (isUnmounted || !containerRef.current) {
        return;
      }

      const width = 640;
      const height = 480;

      // Simple structure to describe a building zone.
      type Building = {
        name: string;
        color: number;
        rect: Phaser.GameObjects.Rectangle | null;
        entranceX: number;
        entranceY: number;
        route: string;
      };

      // This function will be called when the player reaches an entrance.
      const goToRoute = (route: string) => {
        // When leaving the lobby (e.g. to the arcade), remove our presence row
        // so other players no longer see us in this room.
        void removePresenceForUser({ userId, roomName: LOBBY_ROOM_NAME });
        navigate(route);
      };

      let player: Phaser.GameObjects.Rectangle | null = null;
      let playerBody: Phaser.Physics.Arcade.Body | null = null;
      let targetX: number | null = null;
      let targetY: number | null = null;
      let buildings: Building[] = [];
      const walkSpeed = 150;
      const arrivalThreshold = 10; // pixels
      let isTransitioning = false;

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
        // Background floor.
        this.cameras.main.setBackgroundColor("#0f172a");

        this.add.rectangle(width / 2, height / 2, width - 40, height - 40, 0x111827);

        const localColor = 0x38bdf8;

        // Player in the center of the room.
        player = this.add.rectangle(width / 2, height / 2 + 60, 24, 32, localColor);
        this.physics.add.existing(player);
        playerBody = player.body as Phaser.Physics.Arcade.Body;
        playerBody.setCollideWorldBounds(true);
        playerBody.setAllowGravity(false);
        playerBody.setImmovable(false);

          // Start "last sent" position at the initial spawn location.
          this.lastSentX = player.x;
          this.lastSentY = player.y;

          void upsertInitialPresence({
          userId,
          username,
          x: player.x,
          y: player.y,
          color: `#${localColor.toString(16)}`
        });

          this.time.addEvent({
            delay: 120,
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
            name: "Arcade",
            color: 0x22c55e,
            rect: null,
            entranceX: width / 2,
            entranceY: 80,
            route: "/game"
          },
          {
            name: "Shop",
            color: 0xf97316,
            rect: null,
            entranceX: width - 120,
            entranceY: height / 2,
            route: "/shop"
          },
          {
            name: "Profile House",
            color: 0x3b82f6,
            rect: null,
            entranceX: 120,
            entranceY: height / 2,
            route: "/profile"
          },
          {
            name: "Leaderboard",
            color: 0xeab308,
            rect: null,
            entranceX: width / 2,
            entranceY: height - 80,
            route: "/leaderboard"
          }
        ];

        // Draw buildings as simple rectangles with labels.
        buildings.forEach((building) => {
          let x = building.entranceX;
          let y = building.entranceY;
          let w = 100;
          let h = 60;

          // Adjust building position so the entrance is roughly centered on one side.
          if (building.name === "Arcade") {
            y = 40;
          } else if (building.name === "Leaderboard") {
            y = height - 40;
          } else if (building.name === "Shop") {
            x = width - 70;
          } else if (building.name === "Profile House") {
            x = 70;
          }

          const rect = this.add.rectangle(x, y, w, h, building.color);
          building.rect = rect;
          this.add
            .text(rect.x, rect.y, building.name, {
              fontSize: "14px",
              color: "#0f172a"
            })
            .setOrigin(0.5);
        });

        // Handle clicks: walk to clicked position.
        this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
          // Set the target position to where the player should walk.
          targetX = pointer.x;
          targetY = pointer.y;

          // Check if click was inside a building; if so, set targetX to its entrance.
          for (const building of buildings) {
            if (!building.rect) continue;
            const bounds = building.rect.getBounds();
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

        const colorNumber = parseInt(row.color.replace("#", ""), 16) || 0x22c55e;

        if (!existing) {
          const rect = this.add.rectangle(row.x, row.y, 24, 32, colorNumber);
          const label = this.add.text(row.x, row.y - 24, row.username ?? "Player", {
            fontSize: "12px",
            color: "#e5e7eb"
          });
          label.setOrigin(0.5);

          this.otherPlayers.set(row.user_id, { rect, label });
        } else {
            // Snap remote players directly to their latest known position
            // so they don't appear to get "stuck" between updates.
            existing.rect.setPosition(row.x, row.y);
          existing.rect.fillColor = colorNumber;
          existing.label.setText(row.username ?? "Player");
            existing.label.setPosition(row.x, row.y - 24);
        }
      }

      update() {
        if (!player || !playerBody) return;

        // If there is no target, stop moving.
        if (targetX == null || targetY == null) {
          playerBody.setVelocity(0, 0);
          return;
        }

        // Move in full 2D toward the target.
        const dx = targetX - player.x;
        const dy = targetY - player.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < arrivalThreshold) {
          // Arrived at the target location.
          playerBody.setVelocity(0, 0);
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
          const vx = (dx / distance) * walkSpeed;
          const vy = (dy / distance) * walkSpeed;
          playerBody.setVelocity(vx, vy);
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
          gravity: { y: 0 },
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
        void removePresenceForUser({ userId, roomName: LOBBY_ROOM_NAME });
        game.destroy(true);
        gameRef.current = null;
      };
    };

    const cleanup = setup();

    return () => {
      isUnmounted = true;
      void cleanup;
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

