import { supabase } from "./supabase";

export const STORY_GAME_KEY = "butterfly_story";

export type StorySettings = {
  textSpeed: "normal" | "fast";
  screenshake: boolean;
  ambientAudio: boolean;
};

export type StoryProgress = {
  chapterId: string;
  sceneId: string;
  lastChoiceId: string | null;
  chaptersCleared: string[];
  flags: Record<string, boolean>;
  companionTrust: number;
  defiance: number;
  updatedAt: string;
};

type StorySaveRow = {
  user_id: string;
  game_key: string;
  chapter_id: string;
  scene_id: string;
  save_data: StoryProgress;
  updated_at: string;
};

export const DEFAULT_STORY_SETTINGS: StorySettings = {
  textSpeed: "normal",
  screenshake: true,
  ambientAudio: true
};

export const DEFAULT_STORY_PROGRESS: StoryProgress = {
  chapterId: "chapter-1",
  sceneId: "wake",
  lastChoiceId: null,
  chaptersCleared: [],
  flags: {},
  companionTrust: 0,
  defiance: 0,
  updatedAt: new Date().toISOString()
};

export const STORY_SETTINGS_STORAGE_KEY = "focusland-story-settings";

async function getCurrentUserId() {
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("You must be logged in.");
  }

  return user.id;
}

export async function fetchStoryProgress() {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("story_saves")
    .select("user_id, game_key, chapter_id, scene_id, save_data, updated_at")
    .eq("user_id", userId)
    .eq("game_key", STORY_GAME_KEY)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const row = data as StorySaveRow | null;
  if (!row) {
    return null;
  }

  return {
    ...row.save_data,
    chapterId: row.chapter_id,
    sceneId: row.scene_id,
    updatedAt: row.updated_at
  } satisfies StoryProgress;
}

export async function saveStoryProgress(progress: StoryProgress) {
  const userId = await getCurrentUserId();
  const normalizedProgress: StoryProgress = {
    ...progress,
    updatedAt: new Date().toISOString()
  };

  const { error } = await supabase.from("story_saves").upsert(
    {
      user_id: userId,
      game_key: STORY_GAME_KEY,
      chapter_id: normalizedProgress.chapterId,
      scene_id: normalizedProgress.sceneId,
      save_data: normalizedProgress,
      updated_at: normalizedProgress.updatedAt
    },
    { onConflict: "user_id,game_key" }
  );

  if (error) {
    throw error;
  }

  return normalizedProgress;
}

export function loadStorySettings() {
  try {
    const raw = window.localStorage.getItem(STORY_SETTINGS_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_STORY_SETTINGS;
    }

    const parsed = JSON.parse(raw) as Partial<StorySettings>;
    return {
      textSpeed: parsed.textSpeed === "fast" ? "fast" : "normal",
      screenshake: parsed.screenshake ?? true,
      ambientAudio: parsed.ambientAudio ?? true
    } satisfies StorySettings;
  } catch {
    return DEFAULT_STORY_SETTINGS;
  }
}

export function persistStorySettings(settings: StorySettings) {
  window.localStorage.setItem(STORY_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}
