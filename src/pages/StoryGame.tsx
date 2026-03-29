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
  | "sleep-transition";

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
      return sceneId;
    default:
      return "wake-intro";
  }
}

function normalizeLoadedProgress(progress: StoryProgress): StoryProgress {
  return {
    ...progress,
    chapterId: "chapter-1",
    sceneId: mapLegacySceneId(progress.sceneId)
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

function getOldManScene(tutorialCompleted: boolean): DialogueScene {
  return {
    id: "cabin-oldman",
    title: "The Cabin Lamp",
    speaker: "Old Man",
    location: "Inside the cabin",
    body:
      "The cabin smells like cedar smoke and old paper. An old man looks up from the stove, studies you for a moment, and then talks as if you arrived in the middle of a story he has already told a hundred times. " +
      "The name you need to know is Velmora. Villages whisper it every winter now. Gangs gather under that banner, roads go dark, and people disappear between one town and the next.",
    choices: [
      {
        id: "ask-velmora",
        label: "Ask what Velmora actually wants.",
        nextSceneId: "cabin-oldman-more"
      },
      ...(tutorialCompleted
        ? [{
            id: "ask-to-rest",
            label: "Ask if you can stay here until morning.",
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

function getOldManMoreScene(tutorialCompleted: boolean): DialogueScene {
  return {
    id: "cabin-oldman-more",
    title: "Velmora",
    speaker: "Old Man",
    location: "Inside the cabin",
    body:
      "The old man shakes his head. Nobody agrees on what Velmora wants, only on what follows behind the name: burned storehouses, frightened caravans, and gangs bold enough to move openly through the back roads. " +
      "He tells you the villages are holding together for now, but only barely. If someone does not push back, spring will never feel safe again.",
    note: tutorialCompleted
      ? "You've seen enough of the camp to ask for a place to rest."
      : "This conversation is worldbuilding only. Check the igloo before you ask to stay the night.",
    choices: [
      ...(tutorialCompleted
        ? [{
            id: "rest-after-lore",
            label: "Ask if you can sleep here until morning.",
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
  note: "Stepping outside will bring you back to camp at sunrise.",
  choices: [
    {
      id: "wake-up",
      label: "Step outside.",
      nextSceneId: "camp-free"
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
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const activeMusicRef = useRef<string | null>(null);

  const currentSceneId = mapLegacySceneId(progress.sceneId);
  const movementUnlocked = currentSceneId === "camp-free";
  const tutorialCompleted = Boolean(progress.flags.tutorial_completed);
  const houseVisited = Boolean(progress.flags.house_visited);
  const campIsMorning = Boolean(progress.flags.morning_arrived);
  const sunrisePending = Boolean(progress.flags.pending_sunrise_transition);
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
        return getOldManScene(tutorialCompleted);
      case "cabin-oldman-more":
        return getOldManMoreScene(tutorialCompleted);
      case "sleep-transition":
        return SLEEP_TRANSITION_SCENE;
      default:
        return null;
    }
  }, [currentSceneId, playerName, tutorialCompleted]);

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
          setSaveStatus(`Save loaded. Last checkpoint: ${normalized.title ?? CHAPTER_LABEL}.`);
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

  const startNewGame = () => {
    setProgress({
      ...DEFAULT_STORY_PROGRESS,
      chapterId: "chapter-1",
      sceneId: "wake-intro",
      flags: {}
    });
    setMode("playing");
    setSaveStatus("New file started. Manual save is available from the story screen.");
  };

  const continueGame = () => {
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

  const goToScene = (nextSceneId: SceneId) => {
    setProgress((current) => {
      const nextFlags = { ...current.flags };

      if (nextSceneId === "camp-free" && current.sceneId === "sleep-transition") {
        nextFlags.morning_arrived = true;
        nextFlags.pending_sunrise_transition = true;
      }

      return {
        ...current,
        sceneId: nextSceneId,
        flags: nextFlags,
        updatedAt: new Date().toISOString()
      };
    });

    if (nextSceneId === "camp-free") {
      setSaveStatus(currentSceneId === "sleep-transition"
        ? "Morning breaks over the camp."
        : "Movement unlocked. Explore the camp.");
    }

    if (nextSceneId === "sleep-transition") {
      setSaveStatus("You settle in by the fire and wait for morning.");
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
                    ?? (currentSceneId === "camp-free" ? "Snowbound Clearing" : "Practice Encounter")}
                </h2>
                <p className="story-subtle">
                  {currentDialogueScene?.location ?? (campIsMorning ? "Forest edge camp" : "Night camp")} | {movementUnlocked ? "Exploration" : "Conversation"}
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
                {movementUnlocked ? (
                  <>
                    <FlutterCampExploration
                      customization={avatarCustomization}
                      variant={campIsMorning ? "day" : "night"}
                      playSunriseTransition={sunrisePending}
                      onEnterCabin={() => {
                        setProgress((current) => ({
                          ...current,
                          sceneId: "cabin-oldman",
                          updatedAt: new Date().toISOString(),
                          flags: {
                            ...current.flags,
                            house_visited: true
                          }
                        }));
                        setSaveStatus("You step inside the cabin.");
                      }}
                      onEnterIgloo={() => {
                        if (!tutorialCompleted) {
                          goToScene("igloo-brief");
                          setSaveStatus("Flutter has something to show you.");
                        } else {
                          setSaveStatus("The igloo is quiet now.");
                        }
                      }}
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
                ) : inCabinScene ? (
                  <div className="story-map story-map--cabininside" />
                ) : (
                  <div className={`story-map ${campIsMorning ? "story-map--snowcamp" : "story-map--snowcamp-night"}`}>
                    <div className="story-stage__butterfly" aria-hidden="true">
                      <span />
                      <span />
                    </div>
                  </div>
                )}

                {currentSceneId === "igloo-encounter" ? (
                  <EncounterTutorial
                    completed={tutorialCompleted}
                    onComplete={() => {
                      setProgress((current) => ({
                        ...current,
                        sceneId: "camp-free",
                        flags: {
                          ...current.flags,
                          tutorial_completed: true
                        },
                        updatedAt: new Date().toISOString()
                      }));
                      setSaveStatus("Practice complete. Explore the camp again.");
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
                      {campIsMorning
                        ? "The camp is brighter now. The cabin still has a lamp in the window, and the igloo is the only other place here that looks in use."
                        : "The camp is quiet for now. The cabin still has a lamp in the window, and the igloo is the only other place here that looks in use."}
                    </p>
                    <p className="story-subtle">
                      Velmora explained: {houseVisited ? "yes" : "not yet"} | Fight tutorial complete: {tutorialCompleted ? "yes" : "not yet"} | Morning: {campIsMorning ? "yes" : "not yet"}
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
                    onClick={() => goToScene(choice.nextSceneId)}
                  >
                    <strong>{choice.label}</strong>
                  </button>
                ))}
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
  onEnterCabin: () => void;
  onEnterIgloo: () => void;
  onStatusChange: (message: string) => void;
};

const FlutterCampExploration: React.FC<FlutterCampExplorationProps> = ({
  customization,
  onEnterCabin,
  onEnterIgloo,
  onStatusChange
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const callbacksRef = useRef({ onEnterCabin, onEnterIgloo, onStatusChange });
  const assetBase = import.meta.env.BASE_URL;

  useEffect(() => {
    callbacksRef.current = { onEnterCabin, onEnterIgloo, onStatusChange };
  }, [onEnterCabin, onEnterIgloo, onStatusChange]);

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
    const spawn = { x: 500, y: 735 };
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
      }
    ] as const;

    let player: ReturnType<typeof createAvatarRender> | null = null;
    let targetX: number | null = null;
    let targetY: number | null = null;
    let butterfly: Phaser.GameObjects.Container | null = null;
    let butterflyBob: Phaser.GameObjects.Container | null = null;
    let currentHotspot: "cabin" | "igloo" | null = null;
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
        this.load.image("flutter-camp", `${assetBase}assets/story/spawncamp.png`);
      }

      create() {
        const bg = this.add.image(width / 2, height / 2, "flutter-camp");
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
                  : "Flutter guides you toward the igloo."
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
          }
        });

        this.input.keyboard?.on("keydown-ENTER", () => {
          if (currentHotspot === "cabin") {
            callbacksRef.current.onEnterCabin();
          } else if (currentHotspot === "igloo") {
            callbacksRef.current.onEnterIgloo();
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
  }, [assetBase, customization]);

  return <div ref={containerRef} className="flutter-phaser-camp" />;
};

type EncounterTutorialProps = {
  completed: boolean;
  onComplete: () => void;
};

const EncounterTutorial: React.FC<EncounterTutorialProps> = ({ completed, onComplete }) => {
  const [soul, setSoul] = useState({ x: 92, y: 78 });
  const [elapsed, setElapsed] = useState(0);
  const [flash, setFlash] = useState(false);
  const keysRef = useRef<Record<string, boolean>>({});
  const lastHitRef = useRef(0);
  const enemyLines = useMemo(
    () => [
      "Polar Bear: 'Take this!'",
      "Polar Bear stomps the ice and growls.",
      "Polar Bear: 'You picked the wrong igloo.'",
      "Polar Bear snorts a frosty warning."
    ],
    []
  );

  useEffect(() => {
    if (completed) {
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
        if (next >= 6000) {
          onComplete();
          return 6000;
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
  }, [completed, onComplete]);

  const pelletPositions = useMemo(() => {
    const t = elapsed / 1000;
    return [
      { x: 36 + ((t * 132) % (ENCOUNTER_BOX_WIDTH - 72)), y: 34 + Math.sin(t * 1.5) * 18 },
      { x: ENCOUNTER_BOX_WIDTH - 36 - ((t * 148) % (ENCOUNTER_BOX_WIDTH - 72)), y: 86 + Math.cos(t * 1.7) * 28 },
      { x: 42 + ((t * 116) % (ENCOUNTER_BOX_WIDTH - 84)), y: 138 + Math.sin(t * 2.1) * 16 }
    ];
  }, [elapsed]);

  useEffect(() => {
    if (completed) {
      return;
    }

    const hit = pelletPositions.some((pellet) => Math.hypot(pellet.x - soul.x, pellet.y - soul.y) < 11);
    const now = performance.now();
    if (hit && now - lastHitRef.current > 600) {
      lastHitRef.current = now;
      setElapsed(0);
      setFlash(true);
      window.setTimeout(() => setFlash(false), 180);
    }
  }, [completed, pelletPositions, soul.x, soul.y]);

  return (
    <div className={`story-battle-shell ${flash ? "story-battle-shell--flash" : ""}`}>
      <div className="story-battle-field">
        <div className="story-battle-field__enemy-wrap">
          <img
            className={`story-battle-field__enemy ${completed ? "story-battle-field__enemy--defeated" : ""}`}
            src={`${import.meta.env.BASE_URL}assets/story/polarbear.png`}
            alt="Polar Bear"
          />
          <div className="story-battle-field__speech">
            {completed
              ? "Polar Bear: 'My den-mates are going to hear about this...'"
              : enemyLines[Math.min(enemyLines.length - 1, Math.floor(elapsed / 1500))]}
          </div>
        </div>

        <div className="story-battle-ui">
          <div className="story-battle-ui__head">
            <strong>{completed ? "Practice complete" : "Polar Bear blocks the igloo."}</strong>
            <span>{completed ? "Flutter seems pleased." : `Survive ${Math.ceil((6000 - elapsed) / 1000)}s`}</span>
          </div>
          <div className="story-encounter__box">
            <div className="story-encounter__grid" />
            {pelletPositions.map((pellet, index) => (
              <span
                key={index}
                className="story-encounter__pellet"
                style={{ left: `${pellet.x}px`, top: `${pellet.y}px` }}
              />
            ))}
            <span
              className="story-encounter__soul"
              style={{ left: `${soul.x}px`, top: `${soul.y}px` }}
            />
          </div>
          <div className="story-battle-ui__foot">
            <span>WASD / Arrow keys to move</span>
            <span>{completed ? "The way is clear." : "Stay calm and dodge."}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StoryGame;
