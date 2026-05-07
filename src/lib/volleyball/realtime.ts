import { supabase, isSupabaseConfigured } from "../supabase";
import {
  createRoomCode,
  getMaxPlayers,
  type RoomSummary,
  type VolleyballInput,
  type VolleyballMatchState,
  type VolleyballMode,
  type VolleyballPresencePlayer
} from "./logic";

export const VOLLEYBALL_LOBBY_CHANNEL = "focusland-volleyball-lobby";
export const VOLLEYBALL_ROOM_PREFIX = "focusland-volleyball-room";
export const ROOM_AD_EVENT = "volleyball-room-ad";
export const ROOM_STATE_EVENT = "volleyball-state";
export const ROOM_INPUT_EVENT = "volleyball-input";
export const ROOM_CONFIG_EVENT = "volleyball-config";
export const ROOM_START_EVENT = "volleyball-start";

export type VolleyballRoomConfig = {
  mode: VolleyballMode;
  targetScore: number;
};

export type VolleyballRealtimeInputPayload = {
  userId: string;
  input: VolleyballInput;
  sentAt: number;
};

export function createVolleyballRoomSummary(params: {
  code?: string;
  hostId: string;
  hostName: string;
  mode: VolleyballMode;
  targetScore: number;
  playerCount?: number;
  status?: RoomSummary["status"];
}): RoomSummary {
  return {
    code: params.code ?? createRoomCode(),
    hostId: params.hostId,
    hostName: params.hostName,
    mode: params.mode,
    targetScore: params.targetScore,
    playerCount: params.playerCount ?? 1,
    maxPlayers: getMaxPlayers(params.mode),
    status: params.status ?? "open",
    updatedAt: Date.now()
  };
}

export function normalizeRoomCode(code: string) {
  return code.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 5);
}

export function getPlayersFromVolleyballPresence(
  rawPresence: Record<string, Array<{ userId: string; username: string; onlineAt: string }>>
) {
  const players = Object.values(rawPresence)
    .flat()
    .map((entry) => ({
      userId: entry.userId,
      username: entry.username,
      onlineAt: entry.onlineAt
    }));

  const deduped = new Map<string, VolleyballPresencePlayer>();
  players.forEach((player) => {
    if (!deduped.has(player.userId)) {
      deduped.set(player.userId, player);
    }
  });

  return Array.from(deduped.values()).sort((a, b) => a.onlineAt.localeCompare(b.onlineAt));
}

export function canUseVolleyballRealtime() {
  return isSupabaseConfigured;
}

export function createVolleyballLobbyChannel() {
  if (!isSupabaseConfigured) return null;
  return supabase.channel(VOLLEYBALL_LOBBY_CHANNEL, {
    config: { broadcast: { self: true } }
  });
}

export function createVolleyballRoomChannel(code: string, userId: string) {
  if (!isSupabaseConfigured) return null;
  return supabase.channel(`${VOLLEYBALL_ROOM_PREFIX}-${normalizeRoomCode(code)}`, {
    config: {
      broadcast: { self: false, ack: false },
      presence: { key: userId }
    }
  });
}

export async function removeVolleyballChannel(channel: ReturnType<typeof supabase.channel> | null) {
  if (!channel || !isSupabaseConfigured) return;
  await supabase.removeChannel(channel);
}

export function isRoomJoinable(room: RoomSummary) {
  return Boolean(room.hostId) && room.status === "open" && room.playerCount < room.maxPlayers;
}

export function updateRoomPlayerCount(room: RoomSummary, playerCount: number): RoomSummary {
  return {
    ...room,
    playerCount: Math.max(0, Math.min(room.maxPlayers, playerCount)),
    updatedAt: Date.now()
  };
}

export function reassignRoomHost(
  room: RoomSummary,
  players: VolleyballPresencePlayer[]
): RoomSummary | null {
  const nextHost = players[0];
  if (!nextHost) return null;
  return {
    ...room,
    hostId: nextHost.userId,
    hostName: nextHost.username,
    playerCount: Math.min(players.length, room.maxPlayers),
    updatedAt: Date.now()
  };
}

export function pruneStaleRooms(rooms: RoomSummary[], now = Date.now()) {
  return rooms
    .filter((room) => now - room.updatedAt < 9000)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export type VolleyballStateMessage = {
  state: VolleyballMatchState;
  sentAt: number;
};
