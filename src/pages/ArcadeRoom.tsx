import React, { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import NavBar from "../components/NavBar";
import Phaser from "phaser";
import {
  createAvatarRender,
  getStoredAvatarCustomization,
  loadAvatarSpriteSheet,
  normalizeAvatarCustomization,
  TOWN_AVATAR_SCALE,
  updateAvatarRender,
  type AvatarCustomization,
  type AvatarRender
} from "../lib/avatarSprites";
import { DEFAULT_PROFILE_COLOR, normalizeProfileColor } from "../lib/profileColor";
import { createRoomPresenceController, ROOM_NAMES, type RoomPresenceController } from "../lib/roomPresenceController";
import { supabase } from "../lib/supabase";

type Hotspot = {
  label: string;
  route: string;
  x: number;
  y: number;
  width: number;
  height: number;
  entranceX: number;
  entranceY: number;
};

const ArcadeRoom: React.FC = () => {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const assetBase = import.meta.env.BASE_URL;

  useEffect(() => {
    if (!containerRef.current || gameRef.current) {
      return;
    }

    let isUnmounted = false;
    let cleanup: (() => void) | undefined;

    const setup = async () => {
      const width = 780;
      const height = 520;
      let avatarCustomization = getStoredAvatarCustomization();
      let profileColor = DEFAULT_PROFILE_COLOR;
      let username: string | null = null;
      let userId: string | null = null;

      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (session) {
        userId = session.user.id;
        const { data: profile } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", session.user.id)
          .maybeSingle();

        profileColor = normalizeProfileColor((profile?.color as string | null) ?? DEFAULT_PROFILE_COLOR);
        username = (profile?.username as string | null) ?? session.user.email ?? null;
        avatarCustomization = normalizeAvatarCustomization(
          (profile as { avatar_customization?: Partial<AvatarCustomization> | null } | null)?.avatar_customization
          ?? avatarCustomization
        );
      }

      if (isUnmounted || !containerRef.current) {
        return;
      }

      class ArcadeScene extends Phaser.Scene {
        player!: AvatarRender;
        targetX: number | null = null;
        targetY: number | null = null;
        pendingRoute: string | null = null;
        hotspots: Hotspot[] = [];
        roomPresence?: RoomPresenceController;

        preload() {
          loadAvatarSpriteSheet(this, assetBase);
          this.load.image("arcade-room-bg", `${assetBase}assets/lobby/arcade-room.png`);
        }

        create() {
          this.cameras.main.setBackgroundColor("#020617");
          const bg = this.add.image(width / 2, height / 2, "arcade-room-bg");
          bg.setDisplaySize(width, height);
          this.add.rectangle(width / 2, height / 2, width, height, 0x020617, 0.18);
          this.add.rectangle(width / 2, height / 2, width - 16, height - 16, 0x000000, 0)
            .setStrokeStyle(2, 0xffffff, 0.08);

        this.add.text(width / 2, 34, "Focusland Arcade", {
          color: "#7dd3fc",
          fontSize: "28px",
          fontStyle: "bold"
        }).setOrigin(0.5);

        const machines = [
          { label: "Gwent", route: "/gwent", x: 104, y: 170, color: 0xf59e0b },
          { label: "Cards", route: "/cards", x: 282, y: 136, color: 0xa855f7 },
          { label: "Dodge", route: "/game", x: 448, y: 58, color: 0x22c55e },
          { label: "Catch", route: "/catch", x: 510, y: 58, color: 0xf97316 },
          { label: "Pong", route: "/pong", x: 572, y: 58, color: 0x06b6d4 },
          { label: "8 Ball", route: "/pool", x: 274, y: 346, color: 0x0f766e },
          { label: "Invaders", route: "/hangar", x: 510, y: 346, color: 0xeab308 }
        ];

        machines.forEach((machine) => {
          this.add.circle(machine.x, machine.y + 26, 26, machine.color, 0.28).setDepth(2);
          this.add.circle(machine.x, machine.y + 18, 12, machine.color, 0.88)
            .setStrokeStyle(2, 0xffffff, 0.9)
            .setDepth(3);
          this.add.text(machine.x, machine.y + 82, machine.label, {
            color: "#f8fafc",
            fontSize: "15px",
            fontStyle: "bold"
          }).setOrigin(0.5).setDepth(3);

          this.hotspots.push({
            label: machine.label,
            route: machine.route,
            x: machine.x,
            y: machine.y,
            width: 82,
            height: 96,
            entranceX: machine.x,
            entranceY: machine.y + 54
          });
        });

        const doorX = 44;
        const doorY = height - 84;
        this.add.rectangle(doorX, doorY, 64, 96, 0x22c55e, 0.28).setDepth(2);
        this.add.text(doorX + 24, doorY + 10, "Hub", {
          color: "#dcfce7",
          fontSize: "14px",
          fontStyle: "bold"
        }).setOrigin(0.5).setDepth(3);

        this.hotspots.push({
          label: "Hub Door",
          route: "/lobby",
          x: doorX,
          y: doorY,
          width: 72,
          height: 104,
          entranceX: doorX + 22,
          entranceY: height - 94
        });

          this.player = createAvatarRender(this, 112, height - 84, avatarCustomization, 12, TOWN_AVATAR_SCALE);
          if (userId) {
            this.roomPresence = createRoomPresenceController({
              scene: this,
              roomName: ROOM_NAMES.arcade,
              userId,
              username,
              profileColor,
              getLocalPosition: () => ({ x: this.player.container.x, y: this.player.container.y })
            });
          }

          this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
            this.targetX = pointer.x;
            this.targetY = Phaser.Math.Clamp(pointer.y, 56, height - 24);
            this.pendingRoute = null;

            for (const hotspot of this.hotspots) {
              const bounds = new Phaser.Geom.Rectangle(
                hotspot.x - hotspot.width / 2,
                hotspot.y - hotspot.height / 2,
                hotspot.width,
                hotspot.height
              );
              if (bounds.contains(pointer.x, pointer.y)) {
                this.targetX = hotspot.entranceX;
                this.targetY = hotspot.entranceY;
                this.pendingRoute = hotspot.route;
                break;
              }
            }
          });
        }

        update(_time: number, delta: number) {
          this.roomPresence?.animate();

          if (this.targetX == null || this.targetY == null) {
            return;
          }

          const dx = this.targetX - this.player.container.x;
          const dy = this.targetY - this.player.container.y;
          const distance = Math.hypot(dx, dy);
          const step = (230 * delta) / 1000;

          if (distance <= step) {
            this.player.container.setPosition(this.targetX, this.targetY - 18);
            updateAvatarRender(this.player, avatarCustomization, "front", false);
            const route = this.pendingRoute;
            this.targetX = null;
            this.targetY = null;
            this.pendingRoute = null;
            if (route) {
              navigate(route);
            }
            return;
          }

          const nextX = Phaser.Math.Clamp(this.player.container.x + (dx / distance) * step, 18, width - 18);
          const nextY = Phaser.Math.Clamp(this.player.container.y + (dy / distance) * step, 38, height - 40);
          this.player.container.setPosition(nextX, nextY);
          updateAvatarRender(
            this.player,
            avatarCustomization,
            Math.abs(dx) > Math.abs(dy)
              ? dx < 0
                ? "left"
                : "right"
              : dy < 0
                ? "back"
                : "front",
            true
          );
        }
      }

      const game = new Phaser.Game({
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
        scene: ArcadeScene
      });

      gameRef.current = game;
      cleanup = () => {
        game.destroy(true);
        gameRef.current = null;
      };
    };

    void setup();

    return () => {
      isUnmounted = true;
      cleanup?.();
    };
  }, [navigate]);

  return (
    <div className="page">
      <NavBar />
      <div className="content card" style={{ maxWidth: 840 }}>
        <h2>Arcade Room</h2>
        <p>Click a machine to walk over and play. The main event games now have their own buildings in town.</p>
        <div ref={containerRef} style={{ width: "100%", maxWidth: 780, margin: "1rem auto" }} />
      </div>
    </div>
  );
};

export default ArcadeRoom;
