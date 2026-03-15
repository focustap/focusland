import { supabase } from "./supabase";

export type LobbyPresenceRow = {
  user_id: string;
  username: string | null;
  room_name: string;
  x: number;
  y: number;
  color: string;
  updated_at: string;
};

export const LOBBY_ROOM_NAME = "main_lobby";

export async function fetchRoomPresence(roomName: string = LOBBY_ROOM_NAME) {
  return supabase
    .from("lobby_presence")
    .select("*")
    .eq("room_name", roomName);
}

export async function upsertInitialPresence(params: {
  userId: string;
  username: string | null;
  x: number;
  y: number;
  color: string;
  roomName?: string;
}) {
  const { userId, username, x, y, color, roomName = LOBBY_ROOM_NAME } = params;

  await supabase.from("lobby_presence").upsert(
    {
      user_id: userId,
      username,
      room_name: roomName,
      x,
      y,
      color
    },
    { onConflict: "user_id" }
  );
}

export async function updatePlayerPosition(params: {
  userId: string;
  x: number;
  y: number;
  roomName?: string;
}) {
  const { userId, x, y, roomName = LOBBY_ROOM_NAME } = params;

  await supabase
    .from("lobby_presence")
    .update({ x, y })
    .eq("user_id", userId)
    .eq("room_name", roomName);
}

export function subscribeToRoomPresence(
  roomName: string,
  handler: (payload: { type: "INSERT" | "UPDATE" | "DELETE"; row: LobbyPresenceRow }) => void
) {
  const channel = supabase
    .channel(`lobby-presence-${roomName}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "lobby_presence",
        filter: `room_name=eq.${roomName}`
      },
      (payload) => {
        if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
          handler({
            type: payload.eventType,
            row: payload.new as LobbyPresenceRow
          });
        } else if (payload.eventType === "DELETE") {
          handler({
            type: "DELETE",
            row: payload.old as LobbyPresenceRow
          });
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

