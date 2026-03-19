import { supabase } from "./supabase";

const STORAGE_KEY = "focusland-brawl-pve-progress";

export type BrawlPveProgress = {
  unlockedBosses: string[];
  clearedBosses: string[];
};

const DEFAULT_PROGRESS: BrawlPveProgress = {
  unlockedBosses: ["boss-1"],
  clearedBosses: []
};

function isBrowser() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function normalizeProgress(progress?: Partial<BrawlPveProgress> | null): BrawlPveProgress {
  return {
    unlockedBosses:
      progress?.unlockedBosses?.length
        ? Array.from(new Set(progress.unlockedBosses))
        : DEFAULT_PROGRESS.unlockedBosses,
    clearedBosses: progress?.clearedBosses?.length ? Array.from(new Set(progress.clearedBosses)) : []
  };
}

export function getLocalBrawlPveProgress(): BrawlPveProgress {
  if (!isBrowser()) return DEFAULT_PROGRESS;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PROGRESS;
    return normalizeProgress(JSON.parse(raw) as Partial<BrawlPveProgress>);
  } catch {
    return DEFAULT_PROGRESS;
  }
}

function setLocalBrawlPveProgress(progress: BrawlPveProgress) {
  if (!isBrowser()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

export async function loadBrawlPveProgress(userId?: string): Promise<BrawlPveProgress> {
  const local = getLocalBrawlPveProgress();
  if (!userId) return local;

  const { data, error } = await supabase
    .from("profiles")
    .select("pve_unlocked_bosses, pve_cleared_bosses")
    .eq("id", userId)
    .maybeSingle();

  if (error) return local;

  const remote = normalizeProgress({
    unlockedBosses: data?.pve_unlocked_bosses as string[] | undefined,
    clearedBosses: data?.pve_cleared_bosses as string[] | undefined
  });

  const merged = normalizeProgress({
    unlockedBosses: [...local.unlockedBosses, ...remote.unlockedBosses],
    clearedBosses: [...local.clearedBosses, ...remote.clearedBosses]
  });

  setLocalBrawlPveProgress(merged);
  return merged;
}

async function persistBrawlPveProgress(userId: string, progress: BrawlPveProgress) {
  await supabase
    .from("profiles")
    .update({
      pve_unlocked_bosses: progress.unlockedBosses,
      pve_cleared_bosses: progress.clearedBosses
    })
    .eq("id", userId);
}

async function persistHighestBoss(userId: string, bossId: string) {
  const bossNumber = Number.parseInt(bossId.replace("boss-", ""), 10);
  if (!Number.isFinite(bossNumber)) return;

  const { data } = await supabase
    .from("game_stats")
    .select("user_id, brawl_pve_highest_boss")
    .eq("user_id", userId)
    .maybeSingle();

  const nextHighest = Math.max(Number(data?.brawl_pve_highest_boss ?? 0), bossNumber);

  await supabase.from("game_stats").upsert(
    {
      user_id: userId,
      brawl_pve_highest_boss: nextHighest
    },
    { onConflict: "user_id" }
  );
}

export async function completeBrawlPveBoss(userId: string | undefined, bossId: string, nextBossId?: string) {
  const current = await loadBrawlPveProgress(userId);
  const next = normalizeProgress({
    unlockedBosses: [...current.unlockedBosses, ...(nextBossId ? [nextBossId] : [])],
    clearedBosses: [...current.clearedBosses, bossId]
  });

  setLocalBrawlPveProgress(next);

  if (userId) {
    await persistBrawlPveProgress(userId, next);
    await persistHighestBoss(userId, bossId);
  }

  return next;
}
