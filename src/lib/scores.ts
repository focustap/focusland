// Simple helper for saving scores directly to Supabase.
// This keeps the game code beginner-friendly and reusable.
import { supabase } from "./supabase";

export async function saveScoreToSupabase(
  gameName: string,
  score: number
): Promise<void> {
  // Make sure we know which user this score belongs to.
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("You must be logged in to save a score.");
  }

  const { error } = await supabase.from("scores").insert({
    user_id: user.id,
    game_name: gameName,
    score
  });

  if (error) {
    throw error;
  }
}

