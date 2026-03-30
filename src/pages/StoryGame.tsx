import React, { useEffect, useMemo, useRef, useState } from "react";
import Phaser from "phaser";
import NavBar from "../components/NavBar";
import {
  DEFAULT_AVATAR_CUSTOMIZATION,
  createAvatarRender,
  getStoredAvatarCustomization,
  loadAvatarSpriteSheet,
  normalizeAvatarCustomization,
  updateAvatarRender,
  TOWN_AVATAR_SCALE,
  type AvatarCustomization
} from "../lib/avatarSprites";
import {
  DEFAULT_STORY_PROGRESS,
  fetchStoryProgress,
  loadStorySettings,
  persistStorySettings,
  saveStoryProgress,
  type StoryProgress,
  type StorySettings
} from "../lib/storySave";
import { supabase } from "../lib/supabase";

type ViewMode = "title" | "settings" | "playing";

type SceneId =
  | "wake-intro"
  | "wake-rules"
  | "camp-free"
  | "igloo-brief"
  | "igloo-encounter"
  | "cabin-oldman"
  | "cabin-oldman-more"
  | "sleep-transition"
  | "forest-free"
  | "forest-tree-encounter"
  | "forest-drunk-encounter"
  | "forest-after-drunk"
  | "town-free";

type DialogueChoice = {
  id: string;
  label: string;
  nextSceneId: SceneId;
};

type DialogueScene = {
  id: SceneId;
  title: string;
  speaker: string;
  location: string;
  body: string;
  note?: string;
  choices: DialogueChoice[];
};

type CampHotspot = "cabin" | "igloo" | null;

type PlayerPosition = {
  x: number;
  y: number;
};

type DeathState = {
  title: string;
  body: string;
};

const STORY_MUSIC = {
  title: `${import.meta.env.BASE_URL}audio/story/private-temp/flutter-title.mp3`,
  night: `${import.meta.env.BASE_URL}audio/story/private-temp/flutter-night.mp3`,
  overworld: `${import.meta.env.BASE_URL}audio/story/private-temp/flutter-overworld.mp3`,
  cabin: `${import.meta.env.BASE_URL}audio/story/private-temp/flutter-cabin.mp3`,
  tense: `${import.meta.env.BASE_URL}audio/story/private-temp/flutter-tense.mp3`
} as const;

const CHAPTER_LABEL = "Chapter 1: Snowbound Clearing";
const ENCOUNTER_BOX_WIDTH = 520;
const ENCOUNTER_BOX_HEIGHT = 180;
const ENCOUNTER_REACTION_DELAY_MS = 850;

type EncounterConfig = {
  key: "polarbear" | "snowtree" | "homelessdrunk";
  enemyName: string;
  enemyAsset: string;
  dodgeDurationMs: number;
  maxHp: number;
  introLines: string[];
  winLine: string;
  footRight: string;
};

const ENCOUNTERS: Record<EncounterConfig["key"], EncounterConfig> = {
  polarbear: {
    key: "polarbear",
    enemyName: "Polar Bear",
    enemyAsset: "polarbear.png",
    dodgeDurationMs: 10000,
    maxHp: 2,
    introLines: [
      "Polar Bear: 'Take this!'",
      "Polar Bear stomps the ice and growls.",
      "Polar Bear: 'You picked the wrong igloo.'",
      "Polar Bear snorts a frosty warning."
    ],
    winLine: "Polar Bear: 'My den-mates are going to hear about this...'",
    footRight: "Stay calm and dodge."
  },
  snowtree: {
    key: "snowtree",
    enemyName: "Snow Tree",
    enemyAsset: "snowtree.png",
    dodgeDurationMs: 9000,
    maxHp: 3,
    introLines: [
      "Snow Tree crackles under the snow.",
      "Snow Tree hurls icicles from its branches.",
      "Snow Tree: 'Root yourself if you can.'",
      "The air turns sharp and splintered."
    ],
    winLine: "Snow Tree: 'Spring... would have been easier...'",
    footRight: "Watch the falling lanes."
  },
  homelessdrunk: {
    key: "homelessdrunk",
    enemyName: "Homeless Drunk",
    enemyAsset: "homelessdrunk.png",
    dodgeDurationMs: 8000,
    maxHp: 3,
    introLines: [
      "Homeless Drunk staggers into the trail.",
      "Homeless Drunk flings bottles in lazy arcs.",
      "Homeless Drunk: 'Nobody gets by for free.'",
      "The path fills with wobbling glass."
    ],
    winLine: "Homeless Drunk: 'Ugh... my bottle had better aim than me...'",
    footRight: "Follow the gaps."
  }
};

function mapLegacySceneId(sceneId: string): SceneId {
  switch (sceneId) {
    case "wake":
      return "wake-intro";
    case "path":
      return "wake-rules";
    case "gate":
      return "igloo-brief";
    case "camp":
      return "camp-free";
    case "wake-intro":
    case "wake-rules":
    case "camp-free":
    case "igloo-brief":
    case "igloo-encounter":
    case "cabin-oldman":
    case "cabin-oldman-more":
    case "sleep-transition":
    case "forest-free":
    case "forest-tree-encounter":
    case "forest-drunk-encounter":
    case "forest-after-drunk":
    case "town-free":
      return sceneId;
    default:
      return "wake-intro";
  }
}

function normalizeLoadedProgress(progress: StoryProgress): StoryProgress {
  return {
    ...progress,
    chapterId: "chapter-1",
    sceneId: mapLegacySceneId(progress.sceneId),
    playerHp: typeof progress.playerHp === "number" ? progress.playerHp : 20,
    bagPotions: typeof progress.bagPotions === "number" ? progress.bagPotions : 1,
    returnSpawns:
      progress.returnSpawns && typeof progress.returnSpawns === "object"
        ? progress.returnSpawns
        : {}
  };
}

function getWakeIntroScene(playerName: string): DialogueScene {
  return {
    id: "wake-intro",
    title: "Snowbound Clearing",
    speaker: "Flutter",
    location: "Forest edge camp",
    body:
      `${playerName}, you wake beside a campfire that has burned itself down to red coals. ` +
      "Snow drifts over a quiet cabin, a little igloo, and a pond gone mostly still with ice. " +
      "A pale butterfly circles your shoulder and introduces itself as Flutter. It says it found you here before dawn, and that it can help you get your bearings if you stay calm.",
    choices: [
      {
        id: "wake-continue",
        label: "Ask Flutter what is going on.",
        nextSceneId: "wake-rules"
      }
    ]
  };
}

function getWakeRulesScene(): DialogueScene {
  return {
    id: "wake-rules",
    title: "Flutter's Rules",
    speaker: "Flutter",
    location: "Campfire ring",
    body:
      "Flutter keeps its voice light and simple. Choices matter here. People remember what you say. " +
      "The game will not tell you what a decision leads to before you make it, so if you want something to turn out a certain way later, you have to think ahead now. " +
      "For the moment, the camp is safe. Look around. If you want answers, start with the places that still feel lived in.",
    note:
      "Movement unlocks after this conversation. House and igloo are the first two interactable places.",
    choices: [
      {
        id: "wake-rules-finish",
        label: "Get up and look around the camp.",
        nextSceneId: "camp-free"
      }
    ]
  };
}

const IGLOO_BRIEF_SCENE: DialogueScene = {
  id: "igloo-brief",
  title: "Igloo Entrance",
  speaker: "Flutter",
  location: "Snow camp",
  body:
    "Flutter dips toward the igloo entrance and warns you not to panic if the world changes shape for a second. " +
    "In danger, your soul condenses into a small square inside a fight box. Move it with WASD or the arrow keys. " +
    "For this first practice, do not worry about attacking back. Just stay calm, move cleanly, and avoid the motes until the lesson ends.",
  note: "You cannot leave this prompt until you start the practice encounter.",
  choices: [
    {
      id: "start-practice",
      label: "Start the practice encounter.",
      nextSceneId: "igloo-encounter"
    }
  ]
};

function getOldManScene(tutorialCompleted: boolean, playerHp: number): DialogueScene {
  const canOfferSleep = tutorialCompleted;
  return {
    id: "cabin-oldman",
    title: "The Cabin Lamp",
    speaker: "Old Man",
    location: "Inside the cabin",
    body:
      "The cabin smells like cedar smoke and old paper. An old man looks up from the stove, studies you for a moment, and then talks as if you arrived in the middle of a story he has already told a hundred times. " +
      "The name you need to know is Velmora. Villages whisper it every winter now. Gangs gather under that banner, roads go dark, and people disappear between one town and the next. " +
      (playerHp < 20
        ? "His eyes drop to your bruises. \"If that polar bear clipped you,\" he adds, \"sleeping by my fire will put you back together by morning. And when you turn in here, that's your safe point too. If the woods finish the job later, you'll wake back up where you last slept.\""
        : ""),
    choices: [
      {
        id: "ask-velmora",
        label: "Ask what Velmora actually wants.",
        nextSceneId: "cabin-oldman-more"
      },
      ...(canOfferSleep
        ? [{
            id: "ask-to-rest",
            label: playerHp < 20
              ? "Ask if sleeping here will patch you up."
              : "Ask if you can stay here until morning.",
            nextSceneId: "sleep-transition" as const
          }]
        : []),
      {
        id: "leave-cabin",
        label: "Thank him and head back outside.",
        nextSceneId: "camp-free"
      }
    ]
  };
}

function getOldManMoreScene(tutorialCompleted: boolean, playerHp: number): DialogueScene {
  return {
    id: "cabin-oldman-more",
    title: "Velmora",
    speaker: "Old Man",
    location: "Inside the cabin",
    body:
      "The old man shakes his head. Nobody agrees on what Velmora wants, only on what follows behind the name: burned storehouses, frightened caravans, and gangs bold enough to move openly through the back roads. " +
      "He tells you the villages are holding together for now, but only barely. If someone does not push back, spring will never feel safe again. " +
      (playerHp < 20
        ? "\"And don't be proud about those cuts,\" he says. \"A proper night's sleep here will bring your strength right back. Rest here, and if you die out there after that, this cabin is where you'll start again.\""
        : ""),
    note: tutorialCompleted
      ? (playerHp < 20
          ? "The old man notices your bruises. He says a real night's sleep by the fire will get you back to full strength, auto-save your progress, and become your return point if you die."
          : "You've seen enough of the camp to ask for a place to rest. Sleeping here will auto-save your progress.")
      : "This conversation is worldbuilding only. Check the igloo before you ask to stay the night.",
    choices: [
      ...(tutorialCompleted
        ? [{
            id: "rest-after-lore",
            label: playerHp < 20
              ? "Ask if resting here will restore your strength."
              : "Ask if you can sleep here until morning.",
            nextSceneId: "sleep-transition" as const
          }]
        : []),
      {
        id: "leave-after-lore",
        label: "Step back outside into the snow.",
        nextSceneId: "camp-free"
      }
    ]
  };
}

const SLEEP_TRANSITION_SCENE: DialogueScene = {
  id: "sleep-transition",
  title: "Before Sunrise",
  speaker: "Old Man",
  location: "Inside the cabin",
  body:
    "The old man points to the bed near the wall and tells you to get some sleep while the fire still has life in it. " +
    "You drift off to the sound of the stove, the crackle of the hearth, and the wind fading somewhere beyond the logs. When you wake, the blue of the night has thinned toward morning.",
  note: "Stepping outside will bring you back to camp at sunrise, fully healed, and your progress will auto-save here.",
  choices: [
    {
      id: "wake-up",
      label: "Step outside.",
      nextSceneId: "camp-free"
    }
  ]
};

const FOREST_AFTER_DRUNK_SCENE: DialogueScene = {
  id: "forest-after-drunk",
  title: "After The Bottle",
  speaker: "Flutter",
  location: "Forest path",
  body:
    "Flutter drops into view at eye level and flaps there like it cannot believe what just happened. \"Okay, what the hell was up with that guy?\" it says. \"First the tree, now some bottle-swinging forest goblin? This path is a mess. You good? Because that was insane.\"",
  note: "Flutter sounds more like a rattled friend than a guide for once.",
  choices: [
    {
      id: "flutter-im-fine",
      label: "Tell Flutter you're fine and that the guy was just weird.",
      nextSceneId: "forest-free"
    },
    {
      id: "flutter-that-hurt",
      label: "Tell Flutter that absolutely sucked and ask for a second.",
      nextSceneId: "forest-free"
    },
    {
      id: "flutter-ask-why",
      label: "Ask if every road out here is this cursed.",
      nextSceneId: "forest-free"
    }
  ]
};

const StoryGame: React.FC = () => {
  const [mode, setMode] = useState<ViewMode>("title");
  const [progress, setProgress] = useState<StoryProgress>({
    ...DEFAULT_STORY_PROGRESS,
    sceneId: "wake-intro"
  });
  const [playerName, setPlayerName] = useState("Traveler");
  const [avatarCustomization, setAvatarCustomization] = useState<AvatarCustomization>(DEFAULT_AVATAR_CUSTOMIZATION);
  const [hasExistingSave, setHasExistingSave] = useState(false);
  const [saveStatus, setSaveStatus] = useState("Checking save data...");
  const [settings, setSettings] = useState<StorySettings>(loadStorySettings());
  const [loadingSave, setLoadingSave] = useState(true);
  const [deathState, setDeathState] = useState<DeathState | null>(null);
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const activeMusicRef = useRef<string | null>(null);

  const currentSceneId = mapLegacySceneId(progress.sceneId);
  const campMovementUnlocked = currentSceneId === "camp-free";
  const forestMovementUnlocked = currentSceneId === "forest-free";
  const townMovementUnlocked = currentSceneId === "town-free";
  const movementUnlocked = campMovementUnlocked || forestMovementUnlocked || townMovementUnlocked;
  const tutorialCompleted = Boolean(progress.flags.tutorial_completed);
  const houseVisited = Boolean(progress.flags.house_visited);
  const campIsMorning = Boolean(progress.flags.morning_arrived);
  const sunrisePending = Boolean(progress.flags.pending_sunrise_transition);
  const forestUnlocked = campIsMorning;
  const forestTreeDone = Boolean(progress.flags.forest_tree_done);
  const forestDrunkDone = Boolean(progress.flags.forest_drunk_done);
  const inForestScene =
    currentSceneId === "forest-free" ||
    currentSceneId === "forest-tree-encounter" ||
    currentSceneId === "forest-drunk-encounter" ||
    currentSceneId === "forest-after-drunk";
  const inTownScene = currentSceneId === "town-free";
  const inCabinScene =
    currentSceneId === "cabin-oldman" ||
    currentSceneId === "cabin-oldman-more" ||
    currentSceneId === "sleep-transition";

  const currentDialogueScene = useMemo<DialogueScene | null>(() => {
    switch (currentSceneId) {
      case "wake-intro":
        return getWakeIntroScene(playerName);
      case "wake-rules":
        return getWakeRulesScene();
      case "igloo-brief":
        return IGLOO_BRIEF_SCENE;
      case "cabin-oldman":
        return getOldManScene(tutorialCompleted, progress.playerHp);
      case "cabin-oldman-more":
        return getOldManMoreScene(tutorialCompleted, progress.playerHp);
      case "sleep-transition":
        return SLEEP_TRANSITION_SCENE;
      case "forest-after-drunk":
        return FOREST_AFTER_DRUNK_SCENE;
      default:
        return null;
    }
  }, [currentSceneId, playerName, progress.playerHp, tutorialCompleted]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const {
          data: { session }
        } = await supabase.auth.getSession();

        if (session && !cancelled) {
          const fallbackName = session.user.email?.split("@")[0] ?? "Traveler";
          setPlayerName(fallbackName);

          const { data: profile } = await supabase
            .from("profiles")
            .select("username, avatar_customization")
            .eq("id", session.user.id)
            .maybeSingle();

          if (!cancelled) {
            setPlayerName((profile?.username as string | null) ?? fallbackName);
            setAvatarCustomization(
              normalizeAvatarCustomization(
                (profile as { avatar_customization?: Partial<AvatarCustomization> | null } | null)?.avatar_customization
                ?? getStoredAvatarCustomization()
              )
            );
          }
        } else if (!cancelled) {
          setAvatarCustomization(getStoredAvatarCustomization());
        }

        const savedProgress = await fetchStoryProgress();
        if (cancelled) {
          return;
        }

        if (savedProgress) {
          const normalized = normalizeLoadedProgress(savedProgress);
          setProgress(normalized);
          setHasExistingSave(true);
          setSaveStatus(`Save loaded. Last checkpoint: ${CHAPTER_LABEL}.`);
        } else {
          setSaveStatus("No story save yet. Starting fresh is safe.");
        }
      } catch {
        if (!cancelled) {
          setSaveStatus("Story save table not ready yet. Title screen still works, but Supabase saves need setup.");
          setAvatarCustomization(getStoredAvatarCustomization());
        }
      } finally {
        if (!cancelled) {
          setLoadingSave(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!settings.ambientAudio) {
      if (musicRef.current) {
        musicRef.current.pause();
      }
      activeMusicRef.current = null;
      return;
    }

    const nextTrack =
      mode === "title" || mode === "settings"
        ? STORY_MUSIC.title
        : currentSceneId === "igloo-encounter"
          ? STORY_MUSIC.tense
          : inCabinScene
            ? STORY_MUSIC.cabin
            : campIsMorning
              ? STORY_MUSIC.overworld
              : STORY_MUSIC.night;

    if (!musicRef.current) {
      const audio = new Audio(nextTrack);
      audio.loop = true;
      audio.volume = nextTrack === STORY_MUSIC.tense ? 0.28 : 0.34;
      musicRef.current = audio;
      activeMusicRef.current = nextTrack;
      void audio.play().catch(() => {});
      return;
    }

    const audio = musicRef.current;
    audio.volume = nextTrack === STORY_MUSIC.tense ? 0.28 : 0.34;
    if (activeMusicRef.current !== nextTrack) {
      audio.pause();
      audio.src = nextTrack;
      audio.currentTime = 0;
      activeMusicRef.current = nextTrack;
    }
    void audio.play().catch(() => {});
  }, [campIsMorning, currentSceneId, inCabinScene, mode, settings.ambientAudio]);

  useEffect(() => {
    return () => {
      if (musicRef.current) {
        musicRef.current.pause();
        musicRef.current = null;
      }
    };
  }, []);

  const handleSettingChange = (nextSettings: StorySettings) => {
    setSettings(nextSettings);
    persistStorySettings(nextSettings);
  };

  const loadLastSave = async () => {
    setSaveStatus("Loading last save...");
    try {
      const savedProgress = await fetchStoryProgress();
      if (!savedProgress) {
        setDeathState(null);
        setMode("title");
        setSaveStatus("No save found yet. Start a new file to create one.");
        return;
      }

      const normalized = normalizeLoadedProgress(savedProgress);
      setProgress(normalized);
      setHasExistingSave(true);
      setDeathState(null);
      setMode("playing");
      setSaveStatus("Last save loaded.");
    } catch {
      setSaveStatus("Could not load the last save.");
    }
  };

  const autoSaveCheckpoint = async (nextProgress: StoryProgress, successMessage: string) => {
    try {
      const saved = await saveStoryProgress({
        ...nextProgress,
        chapterId: "chapter-1"
      });
      setProgress(saved);
      setHasExistingSave(true);
      setSaveStatus(successMessage);
    } catch {
      setSaveStatus("Rested until morning, but the auto-save did not go through.");
    }
  };

  const startNewGame = () => {
    setProgress({
      ...DEFAULT_STORY_PROGRESS,
      chapterId: "chapter-1",
      sceneId: "wake-intro",
      flags: {},
      playerHp: 20,
      bagPotions: 1,
      returnSpawns: {}
    });
    setDeathState(null);
    setMode("playing");
    setSaveStatus("New file started. Manual save is available from the story screen.");
  };

  const continueGame = () => {
    setDeathState(null);
    setMode("playing");
  };

  const saveManual = async () => {
    setSaveStatus("Saving story progress...");
    try {
      const saved = await saveStoryProgress({
        ...progress,
        chapterId: "chapter-1"
      });
      setProgress(saved);
      setHasExistingSave(true);
      setSaveStatus("Manual save complete.");
    } catch {
      setSaveStatus("Manual save failed. Supabase story_saves may still need to be created.");
    }
  };

  const handleDialogueChoice = (choice: DialogueChoice) => {
    if (choice.id === "flutter-im-fine") {
      setSaveStatus("Flutter calms down, mutters that the guy was definitely weird, and sticks close.");
    } else if (choice.id === "flutter-that-hurt") {
      setSaveStatus("Flutter gives you a second to reset, then says the forest owes both of you an apology.");
    } else if (choice.id === "flutter-ask-why") {
      setSaveStatus("Flutter says the roads were not supposed to be this bad, then nudges you onward.");
    }

    goToScene(choice.nextSceneId);
  };

  const goToScene = (nextSceneId: SceneId) => {
    const isWakeFromSleep = currentSceneId === "sleep-transition" && nextSceneId === "camp-free";
    const nextFlags = { ...progress.flags };

    if (isWakeFromSleep) {
      nextFlags.morning_arrived = true;
      nextFlags.pending_sunrise_transition = true;
    }

    const nextProgress: StoryProgress = {
      ...progress,
      sceneId: nextSceneId,
      playerHp: isWakeFromSleep ? 20 : progress.playerHp,
      flags: nextFlags,
      updatedAt: new Date().toISOString()
    };

    setProgress(nextProgress);

    if (nextSceneId === "camp-free") {
      setSaveStatus(isWakeFromSleep
        ? "Morning breaks over the camp. Saving..."
        : "Movement unlocked. Explore the camp.");
    }

    if (nextSceneId === "sleep-transition") {
      setSaveStatus("You settle in by the fire and wait for morning.");
    }

    if (isWakeFromSleep) {
      void autoSaveCheckpoint(nextProgress, "Morning breaks over the camp. Auto-save complete.");
    }
  };

  return (
    <div className="page">
      <NavBar />
      <div className="content card story-shell">
        {mode === "title" ? (
          <section className="story-title-screen">
            <div className="story-title-screen__hero">
              <span className="story-kicker">A narrative RPG experiment</span>
              <h2>Flutter</h2>
              <p>
                Wake up in a snow-buried camp with only a butterfly guide and a name the world already seems to know.
              </p>
            </div>

            <div className="story-title-stage">
              <div className="story-map story-map--title" aria-hidden="true" />
              <div className="story-title-stage__butterfly" aria-hidden="true">
                <span />
                <span />
              </div>
              <div className="story-title-stage__caption">
                {playerName} wakes in the cold. Flutter is already there.
              </div>
            </div>

            <div className="story-title-screen__actions">
              <button type="button" className="primary-button" onClick={startNewGame}>
                New Game
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={continueGame}
                disabled={!hasExistingSave}
              >
                Continue
              </button>
              <button type="button" className="secondary-button" onClick={() => setMode("settings")}>
                Settings
              </button>
            </div>

            <div className="story-title-screen__meta">
              <p className="info">{loadingSave ? "Checking save data..." : saveStatus}</p>
              <div className="story-title-screen__cards">
                <div className="story-title-card">
                  <strong>Save Model</strong>
                  <span>Manual saves only during the intro. Chapter autosaves come later, after real story progress.</span>
                </div>
                <div className="story-title-card">
                  <strong>Current Slice</strong>
                  <span>Wake-up scene, choice tutorial, camp exploration, igloo fight tutorial, and the first Velmora lore conversation.</span>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {mode === "settings" ? (
          <section className="story-settings-panel">
            <h2>Settings</h2>
            <div className="story-settings-grid">
              <label className="field">
                <span>Text Speed</span>
                <select
                  value={settings.textSpeed}
                  onChange={(event) => handleSettingChange({
                    ...settings,
                    textSpeed: event.target.value === "fast" ? "fast" : "normal"
                  })}
                >
                  <option value="normal">Normal</option>
                  <option value="fast">Fast</option>
                </select>
              </label>
              <label className="story-toggle">
                <input
                  type="checkbox"
                  checked={settings.screenshake}
                  onChange={(event) => handleSettingChange({
                    ...settings,
                    screenshake: event.target.checked
                  })}
                />
                <span>Screenshake</span>
              </label>
              <label className="story-toggle">
                <input
                  type="checkbox"
                  checked={settings.ambientAudio}
                  onChange={(event) => handleSettingChange({
                    ...settings,
                    ambientAudio: event.target.checked
                  })}
                />
                <span>Ambient Audio</span>
              </label>
            </div>
            <div className="button-row">
              <button type="button" className="primary-button" onClick={() => setMode("title")}>
                Back To Title
              </button>
            </div>
          </section>
        ) : null}

        {mode === "playing" ? (
          <section className="story-play-shell">
            <div className="story-play-shell__top">
              <div>
                <span className="story-kicker">{CHAPTER_LABEL}</span>
                <h2>
                  {currentDialogueScene?.title
                    ?? (currentSceneId === "camp-free"
                      ? "Snowbound Clearing"
                      : currentSceneId === "forest-free"
                        ? "Forest Trail"
                        : currentSceneId === "town-free"
                          ? "Frosthollow"
                        : "Encounter")}
                </h2>
                <p className="story-subtle">
                  {currentDialogueScene?.location
                    ?? (currentSceneId === "forest-free"
                      ? "Forest path"
                      : currentSceneId === "town-free"
                        ? "Town center"
                      : campIsMorning
                        ? "Forest edge camp"
                        : "Night camp")} | {movementUnlocked ? "Exploration" : "Conversation"}
                </p>
              </div>
              <div className="button-row">
                <button type="button" className="secondary-button" onClick={saveManual}>
                  Manual Save
                </button>
                <button type="button" className="secondary-button" onClick={() => setMode("title")}>
                  Title Screen
                </button>
              </div>
            </div>

            <div className="flutter-play-grid">
              <div className="flutter-map-shell">
                {campMovementUnlocked ? (
                  <>
                    <FlutterCampExploration
                      customization={avatarCustomization}
                      variant={campIsMorning ? "day" : "night"}
                      playSunriseTransition={sunrisePending}
                      spawnPointId={progress.returnSpawns.camp}
                      onEnterCabin={() => {
                        setProgress((current) => ({
                          ...current,
                          sceneId: "cabin-oldman",
                          updatedAt: new Date().toISOString(),
                          flags: {
                            ...current.flags,
                            house_visited: true
                          },
                          returnSpawns: {
                            ...current.returnSpawns,
                            camp: "cabin"
                          }
                        }));
                        setSaveStatus("You step inside the cabin.");
                      }}
                      onEnterIgloo={() => {
                        setProgress((current) => ({
                          ...current,
                          returnSpawns: {
                            ...current.returnSpawns,
                            camp: "igloo"
                          }
                        }));
                        if (!tutorialCompleted) {
                          goToScene("igloo-encounter");
                          setSaveStatus("The air snaps cold as the igloo challenge begins.");
                        } else {
                          setSaveStatus("The igloo is quiet now.");
                        }
                      }}
                      onEnterForest={() => {
                        if (forestUnlocked) {
                          setProgress((current) => ({
                            ...current,
                            sceneId: "forest-free",
                            updatedAt: new Date().toISOString(),
                            returnSpawns: {
                              ...current.returnSpawns,
                              camp: "forest",
                              forest: "south"
                            }
                          }));
                          setSaveStatus("You head down the forest path.");
                        }
                      }}
                      forestUnlocked={forestUnlocked}
                      onSunriseTransitionComplete={() => {
                        setProgress((current) => ({
                          ...current,
                          flags: {
                            ...current.flags,
                            pending_sunrise_transition: false
                          }
                        }));
                      }}
                      onStatusChange={setSaveStatus}
                    />
                    <div className="story-stage__hint">
                      Click the snow to move. Walk to the cabin or igloo, then press E to enter.
                    </div>
                  </>
                ) : forestMovementUnlocked ? (
                  <>
                    <FlutterForestExploration
                      customization={avatarCustomization}
                      spawnPointId={progress.returnSpawns.forest}
                      treeEncounterComplete={forestTreeDone}
                      drunkEncounterComplete={forestDrunkDone}
                      onTriggerTreeEncounter={() => {
                        setProgress((current) => ({
                          ...current,
                          sceneId: "forest-tree-encounter",
                          updatedAt: new Date().toISOString(),
                          returnSpawns: {
                            ...current.returnSpawns,
                            forest: "tree"
                          }
                        }));
                        setSaveStatus("A snow-laden tree tears itself out of the silence.");
                      }}
                      onTriggerDrunkEncounter={() => {
                        setProgress((current) => ({
                          ...current,
                          sceneId: "forest-drunk-encounter",
                          updatedAt: new Date().toISOString(),
                          returnSpawns: {
                            ...current.returnSpawns,
                            forest: "drunk"
                          }
                        }));
                        setSaveStatus("Someone lurches into the trail ahead.");
                      }}
                      onEnterTown={() => {
                        setProgress((current) => ({
                          ...current,
                          sceneId: "town-free",
                          updatedAt: new Date().toISOString(),
                          returnSpawns: {
                            ...current.returnSpawns,
                            forest: "town",
                            town: "south"
                          }
                        }));
                        setSaveStatus("The trees finally break. A town waits ahead.");
                      }}
                      onStatusChange={setSaveStatus}
                    />
                    <div className="story-stage__hint">
                      Follow the path. After the forest fights, the top of the trail leads into town.
                    </div>
                  </>
                ) : townMovementUnlocked ? (
                  <>
                    <FlutterTownExploration
                      customization={avatarCustomization}
                      spawnPointId={progress.returnSpawns.town}
                      onReturnToForest={() => {
                        setProgress((current) => ({
                          ...current,
                          sceneId: "forest-free",
                          updatedAt: new Date().toISOString(),
                          returnSpawns: {
                            ...current.returnSpawns,
                            town: "south",
                            forest: "town"
                          }
                        }));
                        setSaveStatus("You head back out toward the forest trail.");
                      }}
                      onStatusChange={setSaveStatus}
                    />
                    <div className="story-stage__hint">
                      Walk the roads and press E near places of interest. The south road goes back to the forest.
                    </div>
                  </>
                ) : currentSceneId === "forest-after-drunk" ? (
                  <div className="story-map story-map--flutter-talk" />
                ) : inCabinScene ? (
                  <div className="story-map story-map--cabininside" />
                ) : inForestScene ? (
                  <div className="story-map story-map--forest-static" />
                ) : (
                  <div className={`story-map ${campIsMorning ? "story-map--snowcamp" : "story-map--snowcamp-night"}`}>
                    <div className="story-stage__butterfly" aria-hidden="true">
                      <span />
                      <span />
                    </div>
                  </div>
                )}

                {currentSceneId === "igloo-encounter" ? (
                  <EncounterBattle
                    config={ENCOUNTERS.polarbear}
                    onComplete={() => {
                      setProgress((current) => ({
                        ...current,
                        sceneId: "camp-free",
                        flags: {
                          ...current.flags,
                          tutorial_completed: true
                        },
                        returnSpawns: {
                          ...current.returnSpawns,
                          camp: "igloo"
                        },
                        updatedAt: new Date().toISOString()
                      }));
                      setSaveStatus("Practice complete. Explore the camp again.");
                    }}
                    onLose={() => {
                      setDeathState({
                        title: "You Died",
                        body: "The polar bear slams you into the snow. You'll return to your last save."
                      });
                      setSaveStatus("You died. Load your last save to continue.");
                    }}
                    playerHp={progress.playerHp}
                    bagPotions={progress.bagPotions}
                    onPlayerHpChange={(value) => {
                      setProgress((current) => ({ ...current, playerHp: value }));
                    }}
                    onBagPotionsChange={(value) => {
                      setProgress((current) => ({ ...current, bagPotions: value }));
                    }}
                  />
                ) : currentSceneId === "forest-tree-encounter" ? (
                  <EncounterBattle
                    config={ENCOUNTERS.snowtree}
                    onComplete={() => {
                      setProgress((current) => ({
                        ...current,
                        sceneId: "forest-free",
                        flags: {
                          ...current.flags,
                          forest_tree_done: true
                        },
                        returnSpawns: {
                          ...current.returnSpawns,
                          forest: "tree"
                        },
                        updatedAt: new Date().toISOString()
                      }));
                      setSaveStatus("The snow tree splinters and the trail opens again.");
                    }}
                    onLose={() => {
                      setDeathState({
                        title: "You Died",
                        body: "The snow tree tears through you with ice and bark. You'll return to your last save."
                      });
                      setSaveStatus("You died. Load your last save to continue.");
                    }}
                    playerHp={progress.playerHp}
                    bagPotions={progress.bagPotions}
                    onPlayerHpChange={(value) => {
                      setProgress((current) => ({ ...current, playerHp: value }));
                    }}
                    onBagPotionsChange={(value) => {
                      setProgress((current) => ({ ...current, bagPotions: value }));
                    }}
                  />
                ) : currentSceneId === "forest-drunk-encounter" ? (
                  <EncounterBattle
                    config={ENCOUNTERS.homelessdrunk}
                    onComplete={() => {
                      setProgress((current) => ({
                        ...current,
                        sceneId: "forest-after-drunk",
                        flags: {
                          ...current.flags,
                          forest_drunk_done: true
                        },
                        returnSpawns: {
                          ...current.returnSpawns,
                          forest: "drunk"
                        },
                        updatedAt: new Date().toISOString()
                      }));
                      setSaveStatus("The drunk stumbles off the path, muttering to himself.");
                    }}
                    onLose={() => {
                      setDeathState({
                        title: "You Died",
                        body: "The bottle connects hard and the forest goes dark. You'll return to your last save."
                      });
                      setSaveStatus("You died. Load your last save to continue.");
                    }}
                    playerHp={progress.playerHp}
                    bagPotions={progress.bagPotions}
                    onPlayerHpChange={(value) => {
                      setProgress((current) => ({ ...current, playerHp: value }));
                    }}
                    onBagPotionsChange={(value) => {
                      setProgress((current) => ({ ...current, bagPotions: value }));
                    }}
                  />
                ) : null}
              </div>

              <div className="story-dialogue">
                {currentDialogueScene ? (
                  <>
                    <div className="story-dialogue__speaker">{currentDialogueScene.speaker}</div>
                    <p>{currentDialogueScene.body}</p>
                    {currentDialogueScene.note ? <p className="story-subtle">{currentDialogueScene.note}</p> : null}
                  </>
                ) : (
                  <>
                    <div className="story-dialogue__speaker">Flutter</div>
                    <p>
                      {forestMovementUnlocked
                        ? (forestDrunkDone
                            ? "Flutter keeps checking in now. Every so often it asks if you're steady, if you want it closer, if you need a second before the two of you keep walking, or if you want it to keep talking so the road feels less empty."
                            : forestTreeDone
                              ? "Flutter stays a little nearer after the tree fight and fills the quiet with small comments about the snow, the path, whether you're still doing alright, and whether it should scout a little farther ahead."
                              : "The trees crowd in on both sides of the path. Flutter chatters lightly while you move, pointing out the trail, asking if you're cold, and checking now and then that you're holding up.")
                        : townMovementUnlocked
                        ? "The town is bigger than it looked from the path. Flutter keeps up a running little commentary while you explore, pointing out the inn, the store, and anything else that looks important."
                        : campIsMorning
                        ? "The camp is brighter now. Flutter sounds relieved to have daylight back and keeps your spirits up with little observations about the snow, the road ahead, and whether you feel more like yourself after resting."
                        : "The camp is quiet for now. Flutter keeps close, talking just enough to keep the silence from settling too hard around you and checking that you're alright after waking up alone out here."}
                    </p>
                    <p className="story-subtle">
                      Velmora explained: {houseVisited ? "yes" : "not yet"} | Fight tutorial complete: {tutorialCompleted ? "yes" : "not yet"} | Morning: {campIsMorning ? "yes" : "not yet"} | Forest fights: {Number(forestTreeDone) + Number(forestDrunkDone)}/2 | Area: {townMovementUnlocked ? "town" : forestMovementUnlocked ? "forest" : "camp"} | HP: {progress.playerHp}/20 | Potions: {progress.bagPotions}
                    </p>
                  </>
                )}
              </div>
            </div>

            {currentDialogueScene ? (
              <div className="story-choice-grid">
                {currentDialogueScene.choices.map((choice) => (
                  <button
                    key={choice.id}
                    type="button"
                    className="story-choice-card"
                    onClick={() => handleDialogueChoice(choice)}
                  >
                    <strong>{choice.label}</strong>
                  </button>
                ))}
              </div>
            ) : null}

            {deathState ? (
              <div className="story-death-screen">
                <div className="story-death-screen__panel">
                  <span className="story-kicker">{deathState.title}</span>
                  <h3>{deathState.title}</h3>
                  <p>{deathState.body}</p>
                  <p className="story-subtle">
                    Death sends you back to your last save. Sleeping in the cabin creates that checkpoint.
                  </p>
                  <div className="button-row">
                    <button type="button" className="primary-button" onClick={() => void loadLastSave()}>
                      Load Last Save
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => {
                        setDeathState(null);
                        setMode("title");
                      }}
                    >
                      Title Screen
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            <p className="info">{saveStatus}</p>
          </section>
        ) : null}
      </div>
    </div>
  );
};

type FlutterCampExplorationProps = {
  customization: AvatarCustomization;
  variant: "night" | "day";
  playSunriseTransition: boolean;
  spawnPointId?: string;
  onEnterCabin: () => void;
  onEnterIgloo: () => void;
  onEnterForest: () => void;
  forestUnlocked: boolean;
  onSunriseTransitionComplete: () => void;
  onStatusChange: (message: string) => void;
};

const FlutterCampExploration: React.FC<FlutterCampExplorationProps> = ({
  customization,
  variant,
  playSunriseTransition,
  spawnPointId,
  onEnterCabin,
  onEnterIgloo,
  onEnterForest,
  forestUnlocked,
  onSunriseTransitionComplete,
  onStatusChange
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const callbacksRef = useRef({
    onEnterCabin,
    onEnterIgloo,
    onSunriseTransitionComplete,
    onStatusChange
  });
  const assetBase = import.meta.env.BASE_URL;

  useEffect(() => {
    callbacksRef.current = {
      onEnterCabin,
      onEnterIgloo,
      onEnterForest,
      forestUnlocked,
      onSunriseTransitionComplete,
      onStatusChange
    };
  }, [forestUnlocked, onEnterCabin, onEnterForest, onEnterIgloo, onSunriseTransitionComplete, onStatusChange]);

  useEffect(() => {
    if (!containerRef.current || gameRef.current) {
      return;
    }

    const width = 1024;
    const height = 1024;
    const logicalYOffset = 18;
    const walkSpeed = 220;
    const arrivalThreshold = 14;
    const collisionRadius = 20;
    const spawnPoints = {
      center: { x: 500, y: 735 },
      cabin: { x: 291, y: 388 },
      igloo: { x: 778, y: 526 },
      forest: { x: 498, y: 852 }
    } as const;
    const spawn = spawnPoints[(spawnPointId as keyof typeof spawnPoints) ?? "center"] ?? spawnPoints.center;
    const blockers = [
      new Phaser.Geom.Rectangle(0, 0, width, 108),
      new Phaser.Geom.Rectangle(0, 0, 58, height),
      new Phaser.Geom.Rectangle(966, 0, 58, height),
      new Phaser.Geom.Rectangle(150, 158, 220, 154),
      new Phaser.Geom.Rectangle(726, 312, 160, 132),
      new Phaser.Geom.Rectangle(640, 734, 288, 176),
      new Phaser.Geom.Rectangle(454, 470, 106, 82)
    ];
    const buildings = [
      {
        name: "cabin",
        bounds: new Phaser.Geom.Rectangle(126, 146, 266, 196),
        entranceX: 291,
        entranceY: 362,
        interactBounds: new Phaser.Geom.Rectangle(258, 340, 74, 48)
      },
      {
        name: "igloo",
        bounds: new Phaser.Geom.Rectangle(691, 288, 214, 188),
        entranceX: 778,
        entranceY: 498,
        interactBounds: new Phaser.Geom.Rectangle(744, 476, 84, 52)
      },
      {
        name: "forest",
        bounds: new Phaser.Geom.Rectangle(430, 908, 176, 104),
        entranceX: 498,
        entranceY: 894,
        interactBounds: new Phaser.Geom.Rectangle(458, 864, 88, 64)
      }
    ] as const;

    let player: ReturnType<typeof createAvatarRender> | null = null;
    let targetX: number | null = null;
    let targetY: number | null = null;
    let butterfly: Phaser.GameObjects.Container | null = null;
    let butterflyBob: Phaser.GameObjects.Container | null = null;
    let currentHotspot: "cabin" | "igloo" | "forest" | null = null;
    let hotspotHint: Phaser.GameObjects.Text | null = null;

    const isBlocked = (x: number, y: number) => {
      const footprint = new Phaser.Geom.Circle(x, y, collisionRadius);
      return blockers.some((blocker) => Phaser.Geom.Intersects.CircleToRectangle(footprint, blocker));
    };

    const resolveBlockedStep = (
      currentX: number,
      currentY: number,
      nextX: number,
      nextY: number
    ) => {
      if (!isBlocked(nextX, nextY)) {
        return { x: nextX, y: nextY, blocked: false };
      }

      if (!isBlocked(nextX, currentY)) {
        return { x: nextX, y: currentY, blocked: false };
      }

      if (!isBlocked(currentX, nextY)) {
        return { x: currentX, y: nextY, blocked: false };
      }

      return { x: currentX, y: currentY, blocked: true };
    };

    class FlutterCampScene extends Phaser.Scene {
      preload() {
        loadAvatarSpriteSheet(this, assetBase);
        this.load.image("flutter-camp-day", `${assetBase}assets/story/spawncamp.png`);
        this.load.image("flutter-camp-night", `${assetBase}assets/story/spawncampnight.png`);
      }

      create() {
        const dayBg = this.add.image(width / 2, height / 2, "flutter-camp-day");
        dayBg.setDisplaySize(width, height);
        dayBg.setDepth(0);
        const nightBg = this.add.image(width / 2, height / 2, "flutter-camp-night");
        nightBg.setDisplaySize(width, height);
        nightBg.setDepth(1);

        const activeBg = variant === "day" ? dayBg : nightBg;
        const inactiveBg = variant === "day" ? nightBg : dayBg;
        activeBg.setAlpha(1);
        inactiveBg.setAlpha(variant === "day" ? 0 : 1);

        if (playSunriseTransition) {
          dayBg.setAlpha(1);
          nightBg.setAlpha(1);
          this.tweens.add({
            targets: nightBg,
            alpha: 0,
            duration: 1800,
            ease: "Sine.easeInOut",
            onComplete: () => {
              callbacksRef.current.onSunriseTransitionComplete();
            }
          });
        }

        player = createAvatarRender(
          this,
          spawn.x,
          spawn.y + logicalYOffset,
          customization,
          8,
          TOWN_AVATAR_SCALE * 1.16
        );
        updateAvatarRender(player, customization, "front", false);

        const leftWing = this.add.ellipse(-7, 0, 12, 10, 0xe7f6ff, 0.85).setAngle(-18);
        const rightWing = this.add.ellipse(7, 0, 12, 10, 0xe7f6ff, 0.85).setAngle(18);
        const glow = this.add.circle(0, 0, 3.5, 0xa9e6ff, 0.95);
        butterflyBob = this.add.container(0, 0, [leftWing, rightWing, glow]);
        butterfly = this.add.container(spawn.x - 18, spawn.y - 10, [butterflyBob]).setDepth(9);

        this.tweens.add({
          targets: [leftWing, rightWing],
          angle: { from: -26, to: 26 },
          yoyo: true,
          repeat: -1,
          duration: 170,
          ease: "Sine.easeInOut"
        });

        this.tweens.add({
          targets: butterflyBob,
          y: -6,
          yoyo: true,
          repeat: -1,
          duration: 900,
          ease: "Sine.easeInOut"
        });

        this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
          if (!player) {
            return;
          }

          targetX = Phaser.Math.Clamp(pointer.x, 28, width - 28);
          targetY = Phaser.Math.Clamp(pointer.y - logicalYOffset, 146, height - 28);

          for (const building of buildings) {
            if (building.bounds.contains(pointer.x, pointer.y)) {
              targetX = building.entranceX;
              targetY = building.entranceY;
              callbacksRef.current.onStatusChange(
                building.name === "cabin"
                  ? "Walking to the cabin."
                  : building.name === "igloo"
                    ? "Flutter guides you toward the igloo."
                    : "You head for the forest trail."
              );
              break;
            }
          }
        });

        hotspotHint = this.add.text(width / 2, height - 30, "", {
          fontFamily: "\"Trebuchet MS\", system-ui, sans-serif",
          fontSize: "14px",
          color: "#e5eefc",
          backgroundColor: "rgba(8, 12, 20, 0.72)",
          padding: { x: 12, y: 8 }
        })
          .setOrigin(0.5)
          .setDepth(20)
          .setVisible(false);

        this.input.keyboard?.on("keydown-E", () => {
          if (currentHotspot === "cabin") {
            callbacksRef.current.onEnterCabin();
          } else if (currentHotspot === "igloo") {
            callbacksRef.current.onEnterIgloo();
          } else if (currentHotspot === "forest" && callbacksRef.current.forestUnlocked) {
            callbacksRef.current.onEnterForest();
          }
        });

        this.input.keyboard?.on("keydown-ENTER", () => {
          if (currentHotspot === "cabin") {
            callbacksRef.current.onEnterCabin();
          } else if (currentHotspot === "igloo") {
            callbacksRef.current.onEnterIgloo();
          } else if (currentHotspot === "forest" && callbacksRef.current.forestUnlocked) {
            callbacksRef.current.onEnterForest();
          }
        });
      }

      update(_time: number, delta: number) {
        if (!player) {
          return;
        }

        const currentX = player.container.x;
        const currentY = player.container.y - logicalYOffset;
        const matchingHotspot = buildings.find((building) => building.interactBounds.contains(currentX, currentY));
        currentHotspot = matchingHotspot?.name ?? null;

        if (hotspotHint) {
          if (currentHotspot === "cabin") {
            hotspotHint.setText("Press E to enter the cabin").setVisible(true);
          } else if (currentHotspot === "igloo") {
            hotspotHint.setText("Press E to inspect the igloo").setVisible(true);
          } else if (currentHotspot === "forest" && callbacksRef.current.forestUnlocked) {
            hotspotHint.setText("Press E to head into the forest").setVisible(true);
          } else if (currentHotspot === "forest") {
            hotspotHint.setText("Wait until morning before heading into the forest").setVisible(true);
          } else {
            hotspotHint.setVisible(false);
          }
        }

        if (targetX == null || targetY == null) {
          updateAvatarRender(player, customization, player.facing, false);
          if (butterfly) {
            const idleOffsets = {
              front: { x: -16, y: -8 },
              back: { x: 16, y: 12 },
              left: { x: 18, y: 2 },
              right: { x: -18, y: 2 }
            } as const;
            const offset = idleOffsets[player.facing];
            butterfly.setPosition(player.container.x + offset.x, player.container.y - logicalYOffset + offset.y);
          }
          return;
        }

        const dx = targetX - currentX;
        const dy = targetY - currentY;
        const distance = Math.hypot(dx, dy);

        if (distance < arrivalThreshold) {
          player.container.setPosition(targetX, targetY + logicalYOffset);
          updateAvatarRender(player, customization, "front", false);
          targetX = null;
          targetY = null;

          return;
        }

        const step = (walkSpeed * delta) / 1000;
        const moveDistance = Math.min(step, distance);
        const nextX = Phaser.Math.Clamp(currentX + (dx / distance) * moveDistance, 28, width - 28);
        const nextY = Phaser.Math.Clamp(currentY + (dy / distance) * moveDistance, 146, height - 28);
        const resolvedStep = resolveBlockedStep(currentX, currentY, nextX, nextY);

        if (resolvedStep.blocked) {
          targetX = null;
          targetY = null;
          updateAvatarRender(player, customization, player.facing, false);
          callbacksRef.current.onStatusChange("That path is blocked.");
          return;
        }

        player.container.setPosition(resolvedStep.x, resolvedStep.y + logicalYOffset);

        const facing =
          Math.abs(dx) > Math.abs(dy)
            ? dx < 0
              ? "left"
              : "right"
            : dy < 0
              ? "back"
              : "front";

        updateAvatarRender(player, customization, facing, true);

        if (butterfly) {
          const offsets = {
            front: { x: -16, y: -8 },
            back: { x: 16, y: 12 },
            left: { x: 18, y: 2 },
            right: { x: -18, y: 2 }
          } as const;
          const offset = offsets[facing];
          butterfly.setPosition(player.container.x + offset.x, player.container.y - logicalYOffset + offset.y);
        }
      }
    }

    gameRef.current = new Phaser.Game({
      type: Phaser.AUTO,
      width,
      height,
      parent: containerRef.current,
      backgroundColor: "#111827",
      scene: FlutterCampScene,
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH
      }
    });

    return () => {
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
    };
  }, [assetBase, customization, playSunriseTransition, spawnPointId, variant]);

  return <div ref={containerRef} className="flutter-phaser-camp" />;
};

type FlutterForestExplorationProps = {
  customization: AvatarCustomization;
  spawnPointId?: string;
  treeEncounterComplete: boolean;
  drunkEncounterComplete: boolean;
  onTriggerTreeEncounter: () => void;
  onTriggerDrunkEncounter: () => void;
  onEnterTown: () => void;
  onStatusChange: (message: string) => void;
};

const FlutterForestExploration: React.FC<FlutterForestExplorationProps> = ({
  customization,
  spawnPointId,
  treeEncounterComplete,
  drunkEncounterComplete,
  onTriggerTreeEncounter,
  onTriggerDrunkEncounter,
  onEnterTown,
  onStatusChange
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const callbacksRef = useRef({
    onTriggerTreeEncounter,
    onTriggerDrunkEncounter,
    onEnterTown,
    onStatusChange,
    treeEncounterComplete,
    drunkEncounterComplete
  });
  const assetBase = import.meta.env.BASE_URL;

  useEffect(() => {
    callbacksRef.current = {
      onTriggerTreeEncounter,
      onTriggerDrunkEncounter,
      onEnterTown,
      onStatusChange,
      treeEncounterComplete,
      drunkEncounterComplete
    };
  }, [drunkEncounterComplete, onEnterTown, onStatusChange, onTriggerDrunkEncounter, onTriggerTreeEncounter, treeEncounterComplete]);

  useEffect(() => {
    if (!containerRef.current || gameRef.current) {
      return;
    }

    const width = 1024;
    const height = 1792;
    const logicalYOffset = 18;
    const walkSpeed = 220;
    const arrivalThreshold = 14;
    const collisionRadius = 18;
    const spawnPoints = {
      south: { x: 506, y: 1620 },
      tree: { x: 512, y: 1260 },
      drunk: { x: 512, y: 760 }
    } as const;
    const spawn = spawnPoints[(spawnPointId as keyof typeof spawnPoints) ?? "south"] ?? spawnPoints.south;
    const blockers = [
      new Phaser.Geom.Rectangle(0, 0, 118, height),
      new Phaser.Geom.Rectangle(906, 0, 118, height)
    ];
    const treeTrigger = new Phaser.Geom.Rectangle(360, 1160, 304, 96);
    const drunkTrigger = new Phaser.Geom.Rectangle(360, 670, 304, 104);
    const townInteract = new Phaser.Geom.Rectangle(390, 92, 250, 88);

    let player: ReturnType<typeof createAvatarRender> | null = null;
    let targetX: number | null = null;
    let targetY: number | null = null;
    let butterfly: Phaser.GameObjects.Container | null = null;
    let butterflyBob: Phaser.GameObjects.Container | null = null;
    let hotspotHint: Phaser.GameObjects.Text | null = null;
    let atTownExit = false;

    const isBlocked = (x: number, y: number) => {
      const footprint = new Phaser.Geom.Circle(x, y, collisionRadius);
      return blockers.some((blocker) => Phaser.Geom.Intersects.CircleToRectangle(footprint, blocker));
    };

    const resolveBlockedStep = (
      currentX: number,
      currentY: number,
      nextX: number,
      nextY: number
    ) => {
      if (!isBlocked(nextX, nextY)) {
        return { x: nextX, y: nextY, blocked: false };
      }
      if (!isBlocked(nextX, currentY)) {
        return { x: nextX, y: currentY, blocked: false };
      }
      if (!isBlocked(currentX, nextY)) {
        return { x: currentX, y: nextY, blocked: false };
      }
      return { x: currentX, y: currentY, blocked: true };
    };

    class FlutterForestScene extends Phaser.Scene {
      preload() {
        loadAvatarSpriteSheet(this, assetBase);
        this.load.image("flutter-forest", `${assetBase}assets/story/forestmap.png`);
      }

      create() {
        const bg = this.add.image(width / 2, height / 2, "flutter-forest");
        bg.setDisplaySize(width, height);
        bg.setDepth(0);

        player = createAvatarRender(
          this,
          spawn.x,
          spawn.y + logicalYOffset,
          customization,
          8,
          TOWN_AVATAR_SCALE * 1.16
        );
        updateAvatarRender(player, customization, "front", false);

        const leftWing = this.add.ellipse(-7, 0, 12, 10, 0xe7f6ff, 0.85).setAngle(-18);
        const rightWing = this.add.ellipse(7, 0, 12, 10, 0xe7f6ff, 0.85).setAngle(18);
        const glow = this.add.circle(0, 0, 3.5, 0xa9e6ff, 0.95);
        butterflyBob = this.add.container(0, 0, [leftWing, rightWing, glow]);
        butterfly = this.add.container(spawn.x - 18, spawn.y - 10, [butterflyBob]).setDepth(9);

        this.tweens.add({
          targets: [leftWing, rightWing],
          angle: { from: -26, to: 26 },
          yoyo: true,
          repeat: -1,
          duration: 170,
          ease: "Sine.easeInOut"
        });

        this.tweens.add({
          targets: butterflyBob,
          y: -6,
          yoyo: true,
          repeat: -1,
          duration: 900,
          ease: "Sine.easeInOut"
        });

        this.cameras.main.scrollY = Math.max(0, spawn.y - 620);

        this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
          targetX = Phaser.Math.Clamp(pointer.x, 146, width - 146);
          targetY = Phaser.Math.Clamp(pointer.worldY - logicalYOffset, 80, height - 60);
        });

        hotspotHint = this.add.text(width / 2, 980, "", {
          fontFamily: "\"Trebuchet MS\", system-ui, sans-serif",
          fontSize: "14px",
          color: "#e5eefc",
          backgroundColor: "rgba(8, 12, 20, 0.72)",
          padding: { x: 12, y: 8 }
        })
          .setOrigin(0.5)
          .setDepth(20)
          .setScrollFactor(0)
          .setVisible(false);

        this.input.keyboard?.on("keydown-E", () => {
          if (atTownExit && callbacksRef.current.treeEncounterComplete && callbacksRef.current.drunkEncounterComplete) {
            callbacksRef.current.onEnterTown();
          }
        });

        this.input.keyboard?.on("keydown-ENTER", () => {
          if (atTownExit && callbacksRef.current.treeEncounterComplete && callbacksRef.current.drunkEncounterComplete) {
            callbacksRef.current.onEnterTown();
          }
        });
      }

      update(_time: number, delta: number) {
        if (!player) {
          return;
        }

        const currentX = player.container.x;
        const currentY = player.container.y - logicalYOffset;
        atTownExit = townInteract.contains(currentX, currentY);

        if (!callbacksRef.current.treeEncounterComplete && treeTrigger.contains(currentX, currentY)) {
          callbacksRef.current.onTriggerTreeEncounter();
          return;
        }

        if (callbacksRef.current.treeEncounterComplete && !callbacksRef.current.drunkEncounterComplete && drunkTrigger.contains(currentX, currentY)) {
          callbacksRef.current.onTriggerDrunkEncounter();
          return;
        }

        if (hotspotHint) {
          if (atTownExit && callbacksRef.current.treeEncounterComplete && callbacksRef.current.drunkEncounterComplete) {
            hotspotHint.setText("Press E to enter the town").setVisible(true);
          } else if (atTownExit) {
            hotspotHint.setText("Keep going. Something else is still lurking on the trail.").setVisible(true);
          } else {
            hotspotHint.setVisible(false);
          }
        }

        if (targetX == null || targetY == null) {
          updateAvatarRender(player, customization, player.facing, false);
          if (butterfly) {
            const idleOffsets = {
              front: { x: -16, y: -8 },
              back: { x: 16, y: 12 },
              left: { x: 18, y: 2 },
              right: { x: -18, y: 2 }
            } as const;
            const offset = idleOffsets[player.facing];
            butterfly.setPosition(player.container.x + offset.x, player.container.y - logicalYOffset + offset.y);
          }
          return;
        }

        const dx = targetX - currentX;
        const dy = targetY - currentY;
        const distance = Math.hypot(dx, dy);

        if (distance < arrivalThreshold) {
          player.container.setPosition(targetX, targetY + logicalYOffset);
          updateAvatarRender(player, customization, "front", false);
          targetX = null;
          targetY = null;
          return;
        }

        const step = (walkSpeed * delta) / 1000;
        const moveDistance = Math.min(step, distance);
        const nextX = Phaser.Math.Clamp(currentX + (dx / distance) * moveDistance, 146, width - 146);
        const nextY = Phaser.Math.Clamp(currentY + (dy / distance) * moveDistance, 80, height - 60);
        const resolvedStep = resolveBlockedStep(currentX, currentY, nextX, nextY);

        if (resolvedStep.blocked) {
          targetX = null;
          targetY = null;
          updateAvatarRender(player, customization, player.facing, false);
          callbacksRef.current.onStatusChange("The trees choke off that route.");
          return;
        }

        player.container.setPosition(resolvedStep.x, resolvedStep.y + logicalYOffset);

        const facing =
          Math.abs(dx) > Math.abs(dy)
            ? dx < 0
              ? "left"
              : "right"
            : dy < 0
              ? "back"
              : "front";

        updateAvatarRender(player, customization, facing, true);
        this.cameras.main.scrollY = Phaser.Math.Clamp(player.container.y - 560, 0, height - 1024);

        if (butterfly) {
          const offsets = {
            front: { x: -16, y: -8 },
            back: { x: 16, y: 12 },
            left: { x: 18, y: 2 },
            right: { x: -18, y: 2 }
          } as const;
          const offset = offsets[facing];
          butterfly.setPosition(player.container.x + offset.x, player.container.y - logicalYOffset + offset.y);
        }
      }
    }

    gameRef.current = new Phaser.Game({
      type: Phaser.AUTO,
      width,
      height: 1024,
      parent: containerRef.current,
      backgroundColor: "#0d1225",
      scene: FlutterForestScene,
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH
      }
    });

    return () => {
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
    };
  }, [assetBase, customization, drunkEncounterComplete, onEnterTown, onStatusChange, onTriggerDrunkEncounter, onTriggerTreeEncounter, spawnPointId, treeEncounterComplete]);

  return <div ref={containerRef} className="flutter-phaser-camp" />;
};

type FlutterTownExplorationProps = {
  customization: AvatarCustomization;
  spawnPointId?: string;
  onReturnToForest: () => void;
  onStatusChange: (message: string) => void;
};

const FlutterTownExploration: React.FC<FlutterTownExplorationProps> = ({
  customization,
  spawnPointId,
  onReturnToForest,
  onStatusChange
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const callbacksRef = useRef({
    onReturnToForest,
    onStatusChange
  });
  const assetBase = import.meta.env.BASE_URL;

  useEffect(() => {
    callbacksRef.current = {
      onReturnToForest,
      onStatusChange
    };
  }, [onReturnToForest, onStatusChange]);

  useEffect(() => {
    if (!containerRef.current || gameRef.current) {
      return;
    }

    const worldWidth = 2048;
    const worldHeight = 2048;
    const viewport = 1024;
    const logicalYOffset = 18;
    const walkSpeed = 220;
    const arrivalThreshold = 14;
    const collisionRadius = 22;
    const spawnPoints = {
      south: { x: 1010, y: 1858 }
    } as const;
    const spawn = spawnPoints[(spawnPointId as keyof typeof spawnPoints) ?? "south"] ?? spawnPoints.south;
    const blockers = [
      new Phaser.Geom.Rectangle(0, 0, worldWidth, 116),
      new Phaser.Geom.Rectangle(0, 0, 96, worldHeight),
      new Phaser.Geom.Rectangle(worldWidth - 96, 0, 96, worldHeight),
      new Phaser.Geom.Rectangle(0, worldHeight - 92, worldWidth, 92),
      new Phaser.Geom.Rectangle(0, 0, worldWidth, 290),
      new Phaser.Geom.Rectangle(1370, 0, 620, 900),
      new Phaser.Geom.Rectangle(0, 1410, 780, 638),
      new Phaser.Geom.Rectangle(164, 638, 452, 382),
      new Phaser.Geom.Rectangle(765, 770, 312, 250),
      new Phaser.Geom.Rectangle(1510, 760, 332, 272),
      new Phaser.Geom.Rectangle(1180, 1452, 550, 370),
      new Phaser.Geom.Rectangle(670, 1100, 240, 160),
      new Phaser.Geom.Rectangle(840, 944, 404, 186),
      new Phaser.Geom.Rectangle(744, 1006, 166, 158)
    ];
    const hotspots = [
      {
        name: "forest",
        interactBounds: new Phaser.Geom.Rectangle(938, 1746, 160, 114),
        label: "Press E to head back to the forest"
      },
      {
        name: "store",
        interactBounds: new Phaser.Geom.Rectangle(892, 844, 142, 86),
        label: "Press E to check the store"
      },
      {
        name: "inn",
        interactBounds: new Phaser.Geom.Rectangle(1482, 924, 146, 94),
        label: "Press E to check the inn"
      },
      {
        name: "castle",
        interactBounds: new Phaser.Geom.Rectangle(1518, 332, 136, 86),
        label: "Press E to look toward the castle road"
      },
      {
        name: "cave",
        interactBounds: new Phaser.Geom.Rectangle(318, 404, 120, 76),
        label: "Press E to inspect the cave"
      },
      {
        name: "homes",
        interactBounds: new Phaser.Geom.Rectangle(252, 886, 256, 110),
        label: "Press E to check the houses"
      }
    ] as const;

    let player: ReturnType<typeof createAvatarRender> | null = null;
    let targetX: number | null = null;
    let targetY: number | null = null;
    let butterfly: Phaser.GameObjects.Container | null = null;
    let butterflyBob: Phaser.GameObjects.Container | null = null;
    let hotspotHint: Phaser.GameObjects.Text | null = null;
    let currentHotspot: (typeof hotspots)[number]["name"] | null = null;

    const isBlocked = (x: number, y: number) => {
      const footprint = new Phaser.Geom.Circle(x, y, collisionRadius);
      return blockers.some((blocker) => Phaser.Geom.Intersects.CircleToRectangle(footprint, blocker));
    };

    const resolveBlockedStep = (
      currentX: number,
      currentY: number,
      nextX: number,
      nextY: number
    ) => {
      if (!isBlocked(nextX, nextY)) {
        return { x: nextX, y: nextY, blocked: false };
      }
      if (!isBlocked(nextX, currentY)) {
        return { x: nextX, y: currentY, blocked: false };
      }
      if (!isBlocked(currentX, nextY)) {
        return { x: currentX, y: nextY, blocked: false };
      }
      return { x: currentX, y: currentY, blocked: true };
    };

    class FlutterTownScene extends Phaser.Scene {
      preload() {
        loadAvatarSpriteSheet(this, assetBase);
        this.load.image("flutter-town", `${assetBase}assets/story/townmap.png`);
      }

      create() {
        const bg = this.add.image(worldWidth / 2, worldHeight / 2, "flutter-town");
        bg.setDisplaySize(worldWidth, worldHeight);
        bg.setDepth(0);

        player = createAvatarRender(
          this,
          spawn.x,
          spawn.y + logicalYOffset,
          customization,
          8,
          TOWN_AVATAR_SCALE * 1.16
        );
        updateAvatarRender(player, customization, "front", false);

        const leftWing = this.add.ellipse(-7, 0, 12, 10, 0xe7f6ff, 0.85).setAngle(-18);
        const rightWing = this.add.ellipse(7, 0, 12, 10, 0xe7f6ff, 0.85).setAngle(18);
        const glow = this.add.circle(0, 0, 3.5, 0xa9e6ff, 0.95);
        butterflyBob = this.add.container(0, 0, [leftWing, rightWing, glow]);
        butterfly = this.add.container(spawn.x - 18, spawn.y - 10, [butterflyBob]).setDepth(9);

        this.tweens.add({
          targets: [leftWing, rightWing],
          angle: { from: -26, to: 26 },
          yoyo: true,
          repeat: -1,
          duration: 170,
          ease: "Sine.easeInOut"
        });

        this.tweens.add({
          targets: butterflyBob,
          y: -6,
          yoyo: true,
          repeat: -1,
          duration: 900,
          ease: "Sine.easeInOut"
        });

        this.cameras.main.setBounds(0, 0, worldWidth, worldHeight);
        this.cameras.main.startFollow(player.container, false, 0.12, 0.12, 0, -logicalYOffset);

        this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
          targetX = Phaser.Math.Clamp(pointer.worldX, 32, worldWidth - 32);
          targetY = Phaser.Math.Clamp(pointer.worldY - logicalYOffset, 130, worldHeight - 40);
        });

        hotspotHint = this.add.text(viewport / 2, viewport - 34, "", {
          fontFamily: "\"Trebuchet MS\", system-ui, sans-serif",
          fontSize: "14px",
          color: "#e5eefc",
          backgroundColor: "rgba(8, 12, 20, 0.72)",
          padding: { x: 12, y: 8 }
        })
          .setOrigin(0.5)
          .setDepth(20)
          .setScrollFactor(0)
          .setVisible(false);

        const handleInteract = () => {
          if (currentHotspot === "forest") {
            callbacksRef.current.onReturnToForest();
          } else if (currentHotspot === "store") {
            callbacksRef.current.onStatusChange("The store is here. We'll make it enterable next.");
          } else if (currentHotspot === "inn") {
            callbacksRef.current.onStatusChange("The inn looks warm. We'll wire it up next.");
          } else if (currentHotspot === "castle") {
            callbacksRef.current.onStatusChange("The road to the castle is there, but that feels like later-story business.");
          } else if (currentHotspot === "cave") {
            callbacksRef.current.onStatusChange("The cave mouth watches the town. Not entering it yet.");
          } else if (currentHotspot === "homes") {
            callbacksRef.current.onStatusChange("People definitely live here. House interiors can come next.");
          }
        };

        this.input.keyboard?.on("keydown-E", handleInteract);
        this.input.keyboard?.on("keydown-ENTER", handleInteract);
      }

      update(_time: number, delta: number) {
        if (!player) {
          return;
        }

        const currentX = player.container.x;
        const currentY = player.container.y - logicalYOffset;
        const matchingHotspot = hotspots.find((hotspot) => hotspot.interactBounds.contains(currentX, currentY));
        currentHotspot = matchingHotspot?.name ?? null;

        if (hotspotHint) {
          if (matchingHotspot) {
            hotspotHint.setText(matchingHotspot.label).setVisible(true);
          } else {
            hotspotHint.setVisible(false);
          }
        }

        if (targetX == null || targetY == null) {
          updateAvatarRender(player, customization, player.facing, false);
          if (butterfly) {
            const idleOffsets = {
              front: { x: -16, y: -8 },
              back: { x: 16, y: 12 },
              left: { x: 18, y: 2 },
              right: { x: -18, y: 2 }
            } as const;
            const offset = idleOffsets[player.facing];
            butterfly.setPosition(player.container.x + offset.x, player.container.y - logicalYOffset + offset.y);
          }
          return;
        }

        const dx = targetX - currentX;
        const dy = targetY - currentY;
        const distance = Math.hypot(dx, dy);

        if (distance < arrivalThreshold) {
          player.container.setPosition(targetX, targetY + logicalYOffset);
          updateAvatarRender(player, customization, "front", false);
          targetX = null;
          targetY = null;
          return;
        }

        const step = (walkSpeed * delta) / 1000;
        const moveDistance = Math.min(step, distance);
        const nextX = Phaser.Math.Clamp(currentX + (dx / distance) * moveDistance, 32, worldWidth - 32);
        const nextY = Phaser.Math.Clamp(currentY + (dy / distance) * moveDistance, 130, worldHeight - 40);
        const resolvedStep = resolveBlockedStep(currentX, currentY, nextX, nextY);

        if (resolvedStep.blocked) {
          targetX = null;
          targetY = null;
          updateAvatarRender(player, customization, player.facing, false);
          callbacksRef.current.onStatusChange("That route is blocked off.");
          return;
        }

        player.container.setPosition(resolvedStep.x, resolvedStep.y + logicalYOffset);

        const facing =
          Math.abs(dx) > Math.abs(dy)
            ? dx < 0
              ? "left"
              : "right"
            : dy < 0
              ? "back"
              : "front";

        updateAvatarRender(player, customization, facing, true);

        if (butterfly) {
          const offsets = {
            front: { x: -16, y: -8 },
            back: { x: 16, y: 12 },
            left: { x: 18, y: 2 },
            right: { x: -18, y: 2 }
          } as const;
          const offset = offsets[facing];
          butterfly.setPosition(player.container.x + offset.x, player.container.y - logicalYOffset + offset.y);
        }
      }
    }

    gameRef.current = new Phaser.Game({
      type: Phaser.AUTO,
      width: viewport,
      height: viewport,
      parent: containerRef.current,
      backgroundColor: "#0d1225",
      scene: FlutterTownScene,
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH
      }
    });

    return () => {
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
    };
  }, [assetBase, customization, onReturnToForest, onStatusChange, spawnPointId]);

  return <div ref={containerRef} className="flutter-phaser-camp" />;
};

type EncounterBattleProps = {
  config: EncounterConfig;
  onComplete: () => void;
  onLose: () => void;
  playerHp: number;
  bagPotions: number;
  onPlayerHpChange: (value: number) => void;
  onBagPotionsChange: (value: number) => void;
};

const EncounterBattle: React.FC<EncounterBattleProps> = ({
  config,
  onComplete,
  onLose,
  playerHp,
  bagPotions,
  onPlayerHpChange,
  onBagPotionsChange
}) => {
  const [soul, setSoul] = useState({ x: ENCOUNTER_BOX_WIDTH / 2, y: ENCOUNTER_BOX_HEIGHT / 2 });
  const [elapsed, setElapsed] = useState(0);
  const [flash, setFlash] = useState(false);
  const [enemyHp, setEnemyHp] = useState(config.maxHp);
  const [phase, setPhase] = useState<"command" | "dodging" | "won">("command");
  const [statusLine, setStatusLine] = useState(`${config.enemyName} steps into your way.`);
  const keysRef = useRef<Record<string, boolean>>({});
  const lastHitRef = useRef(0);
  const finishTimeoutRef = useRef<number | null>(null);
  const hitDamage = config.key === "polarbear" ? 3 : config.key === "snowtree" ? 4 : 5;
  const activeElapsedMs = Math.max(0, elapsed - ENCOUNTER_REACTION_DELAY_MS);

  useEffect(() => {
    return () => {
      if (finishTimeoutRef.current) {
        window.clearTimeout(finishTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (phase !== "dodging") {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (["w", "a", "s", "d", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
        keysRef.current[event.key] = true;
        event.preventDefault();
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      delete keysRef.current[event.key];
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    let frameId = 0;
    let lastTime = performance.now();

    const tick = (time: number) => {
      const delta = Math.min(32, time - lastTime);
      lastTime = time;

      setSoul((current) => {
        const speed = 0.17 * delta;
        let nextX = current.x;
        let nextY = current.y;

        if (keysRef.current.a || keysRef.current.ArrowLeft) nextX -= speed;
        if (keysRef.current.d || keysRef.current.ArrowRight) nextX += speed;
        if (keysRef.current.w || keysRef.current.ArrowUp) nextY -= speed;
        if (keysRef.current.s || keysRef.current.ArrowDown) nextY += speed;

        return {
          x: Math.max(12, Math.min(ENCOUNTER_BOX_WIDTH - 12, nextX)),
          y: Math.max(12, Math.min(ENCOUNTER_BOX_HEIGHT - 12, nextY))
        };
      });

      setElapsed((current) => {
        const next = current + delta;
        if (next >= config.dodgeDurationMs) {
          setPhase("command");
          setStatusLine(`${config.enemyName} pauses. Your move.`);
          return config.dodgeDurationMs;
        }
        return next;
      });

      frameId = window.requestAnimationFrame(tick);
    };

    frameId = window.requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.cancelAnimationFrame(frameId);
    };
  }, [config.dodgeDurationMs, phase]);

  const pelletPositions = useMemo(() => {
    const t = activeElapsedMs / 1000;
    if (config.key === "snowtree") {
      const fallingIcicles = [72, 156, 244, 332, 420].map((baseX, index) => ({
        x: baseX + Math.sin(t * 1.6 + index * 0.8) * 22,
        y: -34 + ((t * (200 + index * 16) + index * 54) % (ENCOUNTER_BOX_HEIGHT + 84))
      }));

      const sideBranches = [
        {
          x: -26 + ((t * 210) % (ENCOUNTER_BOX_WIDTH + 52)),
          y: 46 + Math.sin(t * 1.8) * 18
        },
        {
          x: ENCOUNTER_BOX_WIDTH + 26 - ((t * 238 + 110) % (ENCOUNTER_BOX_WIDTH + 52)),
          y: 118 + Math.cos(t * 1.4 + 0.7) * 22
        }
      ];

      return [...fallingIcicles, ...sideBranches];
    }

    if (config.key === "homelessdrunk") {
      return [
        {
          x: -30 + ((t * 164) % (ENCOUNTER_BOX_WIDTH + 60)),
          y: 34 + Math.sin(t * 2.1) * 18
        },
        {
          x: ENCOUNTER_BOX_WIDTH + 30 - ((t * 178 + 120) % (ENCOUNTER_BOX_WIDTH + 60)),
          y: 84 + Math.sin(t * 1.5 + 1.1) * 26
        },
        {
          x: -26 + ((t * 144 + 210) % (ENCOUNTER_BOX_WIDTH + 52)),
          y: 138 + Math.cos(t * 1.9 + 0.5) * 18
        },
        {
          x: ENCOUNTER_BOX_WIDTH / 2 + Math.sin(t * 2.4) * 170,
          y: -28 + ((t * 92) % (ENCOUNTER_BOX_HEIGHT + 56))
        }
      ];
    }

    return [
      { x: -24 + ((t * 168) % (ENCOUNTER_BOX_WIDTH + 48)), y: 34 + Math.sin(t * 1.5) * 18 },
      { x: ENCOUNTER_BOX_WIDTH + 24 - ((t * 182) % (ENCOUNTER_BOX_WIDTH + 48)), y: 86 + Math.cos(t * 1.7) * 28 },
      { x: -20 + ((t * 154 + 160) % (ENCOUNTER_BOX_WIDTH + 40)), y: 138 + Math.sin(t * 2.1) * 16 }
    ];
  }, [activeElapsedMs, config.key]);

  useEffect(() => {
    if (phase !== "dodging") {
      return;
    }

    if (elapsed < ENCOUNTER_REACTION_DELAY_MS) {
      return;
    }

    const hit = pelletPositions.some((pellet) => Math.hypot(pellet.x - soul.x, pellet.y - soul.y) < 11);
    const now = performance.now();
    if (hit && now - lastHitRef.current > 600) {
      lastHitRef.current = now;
      setFlash(true);
      const nextHp = Math.max(0, playerHp - hitDamage);
      onPlayerHpChange(nextHp);
      if (nextHp <= 0) {
        setStatusLine(`${config.enemyName} drops you. Flutter pulls you back.`);
        finishTimeoutRef.current = window.setTimeout(() => {
          onLose();
        }, 900);
      } else {
        setStatusLine(`${config.enemyName} hits you for ${hitDamage}.`);
      }
      window.setTimeout(() => setFlash(false), 180);
    }
  }, [config.enemyName, elapsed, hitDamage, onLose, onPlayerHpChange, pelletPositions, phase, playerHp, soul.x, soul.y]);

  const startDodgePhase = () => {
    setSoul({ x: ENCOUNTER_BOX_WIDTH / 2, y: ENCOUNTER_BOX_HEIGHT / 2 });
    setElapsed(0);
    setPhase("dodging");
    setStatusLine(`Brace yourself. ${config.enemyName} is winding up...`);
  };

  const handleAttack = () => {
    const remaining = enemyHp - 1;
    setEnemyHp(remaining);
    if (remaining <= 0) {
      setPhase("won");
      setStatusLine(config.winLine);
      finishTimeoutRef.current = window.setTimeout(() => {
        onComplete();
      }, 900);
      return;
    }

    setStatusLine(`You strike ${config.enemyName}. ${remaining} HP left.`);
    startDodgePhase();
  };

  const handleBag = () => {
    if (bagPotions <= 0) {
      setStatusLine("Your bag is empty.");
      return;
    }
    onBagPotionsChange(bagPotions - 1);
    onPlayerHpChange(Math.min(20, playerHp + 6));
    setStatusLine("You steady yourself with a quick snack.");
    startDodgePhase();
  };

  const handleRun = () => {
    setStatusLine("Flutter nudges you forward. Running is not an option.");
  };

  return (
    <div className={`story-battle-shell ${flash ? "story-battle-shell--flash" : ""}`}>
      <div className="story-battle-field">
        <div className="story-battle-field__enemy-wrap">
          <img
            className={`story-battle-field__enemy ${phase === "won" ? "story-battle-field__enemy--defeated" : ""}`}
            src={`${import.meta.env.BASE_URL}assets/story/${config.enemyAsset}`}
            alt={config.enemyName}
          />
          <div className="story-battle-field__speech">
            {phase === "won"
              ? config.winLine
              : phase === "dodging"
                ? config.introLines[Math.min(config.introLines.length - 1, Math.floor(elapsed / 2200))]
                : statusLine}
          </div>
        </div>

        <div className="story-battle-ui">
          <div className="story-battle-ui__head">
            <strong>{config.enemyName} blocks the way.</strong>
            <span>{phase === "dodging"
              ? `Hold for ${Math.max(0, Math.ceil((config.dodgeDurationMs - elapsed) / 1000))}s`
              : `HP ${Math.max(enemyHp, 0)}/${config.maxHp}`}</span>
          </div>
          <div className="story-battle-ui__health">
            <span>Your HP</span>
            <strong>{playerHp}/20</strong>
          </div>
          <div className="story-encounter__box">
            <div className="story-encounter__grid" />
            {phase === "dodging" ? (
              <>
                {pelletPositions.map((pellet, index) => (
                  <span
                    key={index}
                    className={`story-encounter__pellet story-encounter__pellet--${config.key}`}
                    style={{ left: `${pellet.x}px`, top: `${pellet.y}px` }}
                  />
                ))}
                <span
                  className="story-encounter__soul"
                  style={{ left: `${soul.x}px`, top: `${soul.y}px` }}
                />
              </>
            ) : (
              <div className="story-encounter__command-state">{statusLine}</div>
            )}
          </div>
          <div className="story-battle-actions">
            <button type="button" className="story-battle-action" onClick={handleAttack} disabled={phase !== "command"}>
              Attack
            </button>
            <button type="button" className="story-battle-action" onClick={handleBag} disabled={phase !== "command"}>
              Bag{bagPotions > 0 ? ` (${bagPotions})` : ""}
            </button>
            <button type="button" className="story-battle-action" onClick={handleRun} disabled={phase !== "command"}>
              Run
            </button>
          </div>
          <div className="story-battle-ui__foot">
            <span>{phase === "dodging" ? "WASD / Arrow keys to move" : "Choose your move"}</span>
            <span>{phase === "dodging" ? config.footRight : "Attack, prep, then dodge."}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StoryGame;
