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

export function getBrawlPveProgress(): BrawlPveProgress {
  if (!isBrowser()) {
    return DEFAULT_PROGRESS;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return DEFAULT_PROGRESS;
    }

    const parsed = JSON.parse(raw) as Partial<BrawlPveProgress>;
    return {
      unlockedBosses:
        parsed.unlockedBosses?.length ? Array.from(new Set(parsed.unlockedBosses)) : DEFAULT_PROGRESS.unlockedBosses,
      clearedBosses: parsed.clearedBosses?.length ? Array.from(new Set(parsed.clearedBosses)) : []
    };
  } catch {
    return DEFAULT_PROGRESS;
  }
}

export function setBrawlPveProgress(progress: BrawlPveProgress) {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

export function completeBrawlPveBoss(bossId: string, nextBossId?: string) {
  const current = getBrawlPveProgress();
  const next = {
    unlockedBosses: Array.from(new Set([...current.unlockedBosses, ...(nextBossId ? [nextBossId] : [])])),
    clearedBosses: Array.from(new Set([...current.clearedBosses, bossId]))
  };
  setBrawlPveProgress(next);
  return next;
}
