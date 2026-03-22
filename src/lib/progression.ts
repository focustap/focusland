import { supabase } from "./supabase";

type GameStatColumns = {
  dodge_best_score?: number;
  catch_best_score?: number;
  invaders_best_wave?: number;
  brawl_wins?: number;
  brawl_pve_highest_boss?: number;
};

type ArcadeResultInput = {
  scoreGameName?: string;
  score?: number;
  goldEarned?: number;
  stats?: GameStatColumns;
};

type GameStatsRow = {
  user_id: string;
  dodge_best_score: number | null;
  catch_best_score: number | null;
  invaders_best_wave: number | null;
  brawl_wins: number | null;
  brawl_pve_highest_boss: number | null;
};

async function getCurrentUser() {
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("You must be logged in.");
  }

  return user;
}

export async function getCurrentUserGold() {
  const user = await getCurrentUser();
  const { data, error } = await supabase
    .from("profiles")
    .select("gold")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return Math.max(0, Number(data?.gold ?? 0));
}

export async function applyGoldDelta(delta: number) {
  const user = await getCurrentUser();
  const { data, error } = await supabase
    .from("profiles")
    .select("gold")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const nextGold = Math.max(0, Number(data?.gold ?? 0) + delta);
  const { error: updateError } = await supabase
    .from("profiles")
    .update({ gold: nextGold })
    .eq("id", user.id);

  if (updateError) {
    throw updateError;
  }

  return nextGold;
}

export async function recordArcadeResult(input: ArcadeResultInput) {
  const user = await getCurrentUser();

  if (typeof input.score === "number" && input.scoreGameName) {
    const { error: scoreError } = await supabase.from("scores").insert({
      user_id: user.id,
      game_name: input.scoreGameName,
      score: input.score
    });

    if (scoreError) {
      throw scoreError;
    }
  }

  if (input.goldEarned) {
    await applyGoldDelta(input.goldEarned);
  }

  if (!input.stats) {
    return;
  }

  const { data: currentStats, error: statsError } = await supabase
    .from("game_stats")
    .select("user_id, dodge_best_score, catch_best_score, invaders_best_wave, brawl_wins, brawl_pve_highest_boss")
    .eq("user_id", user.id)
    .maybeSingle();

  if (statsError) {
    throw statsError;
  }

  const existing = currentStats as GameStatsRow | null;
  const payload: GameStatsRow = {
    user_id: user.id,
    dodge_best_score: Math.max(
      existing?.dodge_best_score ?? 0,
      input.stats.dodge_best_score ?? existing?.dodge_best_score ?? 0
    ),
    catch_best_score: Math.max(
      existing?.catch_best_score ?? 0,
      input.stats.catch_best_score ?? existing?.catch_best_score ?? 0
    ),
    invaders_best_wave: Math.max(
      existing?.invaders_best_wave ?? 0,
      input.stats.invaders_best_wave ?? existing?.invaders_best_wave ?? 0
    ),
    brawl_wins: (existing?.brawl_wins ?? 0) + (input.stats.brawl_wins ?? 0),
    brawl_pve_highest_boss: Math.max(
      existing?.brawl_pve_highest_boss ?? 0,
      input.stats.brawl_pve_highest_boss ?? existing?.brawl_pve_highest_boss ?? 0
    )
  };

  const { error: upsertError } = await supabase
    .from("game_stats")
    .upsert(payload, { onConflict: "user_id" });

  if (upsertError) {
    throw upsertError;
  }
}

export async function recordCardDuelWin() {
  const user = await getCurrentUser();

  const { error } = await supabase.from("scores").insert({
    user_id: user.id,
    game_name: "card_duel_win",
    score: 1
  });

  if (error) {
    throw error;
  }
}
