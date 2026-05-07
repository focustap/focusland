import {
  canStartVolleyballMatch,
  getMaxPlayers,
  startVolleyballMatch,
  type RoomSummary,
  type VolleyballMatchState,
  type VolleyballMode,
  type VolleyballPresencePlayer
} from "./logic";
import { createVolleyballRoomSummary, isRoomJoinable, reassignRoomHost, updateRoomPlayerCount } from "./realtime";

export type VolleyballHarnessRoom = {
  summary: RoomSummary;
  players: VolleyballPresencePlayer[];
  state: VolleyballMatchState | null;
};

export function createHarnessPlayer(index: number): VolleyballPresencePlayer {
  return {
    userId: `harness-player-${index}`,
    username: `Harness ${index}`,
    onlineAt: String(index).padStart(2, "0")
  };
}

export function createHarnessRoom(mode: VolleyballMode = "1v1", targetScore = 7): VolleyballHarnessRoom {
  const host = createHarnessPlayer(1);
  return {
    summary: createVolleyballRoomSummary({
      code: mode === "1v1" ? "TST1V" : "TST2V",
      hostId: host.userId,
      hostName: host.username,
      mode,
      targetScore
    }),
    players: [host],
    state: null
  };
}

export function harnessJoin(room: VolleyballHarnessRoom, player: VolleyballPresencePlayer) {
  if (!isRoomJoinable(room.summary)) {
    return { room, joined: false };
  }
  if (room.players.some((entry) => entry.userId === player.userId)) {
    return { room, joined: true };
  }
  const players = [...room.players, player].slice(0, room.summary.maxPlayers);
  return {
    room: {
      ...room,
      players,
      summary: updateRoomPlayerCount(room.summary, players.length)
    },
    joined: players.some((entry) => entry.userId === player.userId)
  };
}

export function harnessLeave(room: VolleyballHarnessRoom, userId: string): VolleyballHarnessRoom | null {
  const players = room.players.filter((player) => player.userId !== userId);
  const summary = reassignRoomHost(room.summary, players);
  if (!summary) return null;
  return {
    ...room,
    players,
    summary: updateRoomPlayerCount(summary, players.length),
    state: room.state && players.length >= getMaxPlayers(room.summary.mode) ? room.state : null
  };
}

export function harnessChangeMode(room: VolleyballHarnessRoom, mode: VolleyballMode): VolleyballHarnessRoom {
  const players = room.players.slice(0, getMaxPlayers(mode));
  return {
    ...room,
    players,
    summary: {
      ...room.summary,
      mode,
      maxPlayers: getMaxPlayers(mode),
      playerCount: players.length,
      updatedAt: Date.now()
    },
    state: null
  };
}

export function harnessStart(room: VolleyballHarnessRoom) {
  if (!canStartVolleyballMatch(room.players, room.summary.mode)) {
    return { room, started: false };
  }
  return {
    room: {
      ...room,
      summary: { ...room.summary, status: "playing" as const, updatedAt: Date.now() },
      state: startVolleyballMatch(room.players, room.summary.mode, room.summary.targetScore)
    },
    started: true
  };
}
