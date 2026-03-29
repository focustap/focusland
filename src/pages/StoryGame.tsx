import React, { useEffect, useMemo, useRef, useState } from "react";
import AvatarSprite from "../components/AvatarSprite";
import NavBar from "../components/NavBar";
import {
  DEFAULT_AVATAR_CUSTOMIZATION,
  getStoredAvatarCustomization,
  normalizeAvatarCustomization,
  type AvatarCustomization,
  type AvatarFacing
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
  | "cabin-oldman-more";

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
  overworld: `${import.meta.env.BASE_URL}audio/story/private-temp/flutter-overworld.mp3`,
  tense: `${import.meta.env.BASE_URL}audio/story/private-temp/flutter-tense.mp3`
} as const;

const CHAPTER_LABEL = "Chapter 1: Snowbound Clearing";
const CAMP_START: PlayerPosition = { x: 48, y: 71 };
const CAMP_MIN_X = 8;
const CAMP_MAX_X = 88;
const CAMP_MIN_Y = 28;
const CAMP_MAX_Y = 88;

const BLOCKERS = [
  { x: 11, y: 22, w: 25, h: 24 },
  { x: 68, y: 32, w: 19, h: 18 },
  { x: 58, y: 70, w: 31, h: 19 },
  { x: 39, y: 52, w: 16, h: 13 },
  { x: 0, y: 0, w: 100, h: 19 },
  { x: 0, y: 0, w: 7, h: 100 },
  { x: 92, y: 0, w: 8, h: 100 }
];

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

function isBlocked(x: number, y: number) {
  return BLOCKERS.some((blocker) => (
    x >= blocker.x &&
    x <= blocker.x + blocker.w &&
    y >= blocker.y &&
    y <= blocker.y + blocker.h
  ));
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

const OLD_MAN_SCENE: DialogueScene = {
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
    {
      id: "leave-cabin",
      label: "Thank him and head back outside.",
      nextSceneId: "camp-free"
    }
  ]
};

const OLD_MAN_MORE_SCENE: DialogueScene = {
  id: "cabin-oldman-more",
  title: "Velmora",
  speaker: "Old Man",
  location: "Inside the cabin",
  body:
    "The old man shakes his head. Nobody agrees on what Velmora wants, only on what follows behind the name: burned storehouses, frightened caravans, and gangs bold enough to move openly through the back roads. " +
    "He tells you the villages are holding together for now, but only barely. If someone does not push back, spring will never feel safe again.",
  note: "This conversation is worldbuilding only. Nothing you say here changes the route.",
  choices: [
    {
      id: "leave-after-lore",
      label: "Step back outside into the snow.",
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
  const [playerPos, setPlayerPos] = useState<PlayerPosition>(CAMP_START);
  const [playerFacing, setPlayerFacing] = useState<AvatarFacing>("front");
  const [playerMoving, setPlayerMoving] = useState(false);
  const [walkFrameTick, setWalkFrameTick] = useState(0);
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const activeMusicRef = useRef<string | null>(null);
  const movementKeysRef = useRef<Record<string, boolean>>({});

  const currentSceneId = mapLegacySceneId(progress.sceneId);
  const movementUnlocked = currentSceneId === "camp-free";
  const tutorialCompleted = Boolean(progress.flags.tutorial_completed);
  const houseVisited = Boolean(progress.flags.house_visited);

  const currentDialogueScene = useMemo<DialogueScene | null>(() => {
    switch (currentSceneId) {
      case "wake-intro":
        return getWakeIntroScene(playerName);
      case "wake-rules":
        return getWakeRulesScene();
      case "igloo-brief":
        return IGLOO_BRIEF_SCENE;
      case "cabin-oldman":
        return OLD_MAN_SCENE;
      case "cabin-oldman-more":
        return OLD_MAN_MORE_SCENE;
      default:
        return null;
    }
  }, [currentSceneId, playerName]);

  const activeHotspot = useMemo<CampHotspot>(() => {
    if (!movementUnlocked) {
      return null;
    }

    const nearCabin = playerPos.x >= 18 && playerPos.x <= 35 && playerPos.y >= 42 && playerPos.y <= 56;
    if (nearCabin) {
      return "cabin";
    }

    const nearIgloo = playerPos.x >= 67 && playerPos.x <= 82 && playerPos.y >= 47 && playerPos.y <= 61;
    if (nearIgloo) {
      return "igloo";
    }

    return null;
  }, [movementUnlocked, playerPos.x, playerPos.y]);

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
          : STORY_MUSIC.overworld;

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
  }, [currentSceneId, mode, settings.ambientAudio]);

  useEffect(() => {
    return () => {
      if (musicRef.current) {
        musicRef.current.pause();
        musicRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!movementUnlocked || mode !== "playing") {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (["w", "a", "s", "d", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
        movementKeysRef.current[event.key] = true;
        event.preventDefault();
      }

      if ((event.key === "e" || event.key === "Enter") && activeHotspot) {
        event.preventDefault();
        if (activeHotspot === "cabin") {
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
        } else if (activeHotspot === "igloo") {
          setProgress((current) => ({
            ...current,
            sceneId: tutorialCompleted ? "camp-free" : "igloo-brief",
            updatedAt: new Date().toISOString()
          }));
          setSaveStatus(tutorialCompleted ? "The igloo is quiet now." : "Flutter has something to show you.");
        }
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      delete movementKeysRef.current[event.key];
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    let frameId = 0;
    let lastTime = performance.now();

    const tick = (time: number) => {
      const delta = Math.min(32, time - lastTime);
      lastTime = time;
      const step = delta * 0.018;

      let moving = false;
      let nextFacing: AvatarFacing = playerFacing;

      setPlayerPos((current) => {
        let nextX = current.x;
        let nextY = current.y;

        if (movementKeysRef.current.a || movementKeysRef.current.ArrowLeft) {
          nextX -= step;
          moving = true;
          nextFacing = "left";
        }
        if (movementKeysRef.current.d || movementKeysRef.current.ArrowRight) {
          nextX += step;
          moving = true;
          nextFacing = "right";
        }
        if (movementKeysRef.current.w || movementKeysRef.current.ArrowUp) {
          nextY -= step;
          moving = true;
          nextFacing = "back";
        }
        if (movementKeysRef.current.s || movementKeysRef.current.ArrowDown) {
          nextY += step;
          moving = true;
          nextFacing = "front";
        }

        nextX = Math.max(CAMP_MIN_X, Math.min(CAMP_MAX_X, nextX));
        nextY = Math.max(CAMP_MIN_Y, Math.min(CAMP_MAX_Y, nextY));

        if (isBlocked(nextX, nextY)) {
          return current;
        }

        return { x: nextX, y: nextY };
      });

      setPlayerFacing(nextFacing);
      setPlayerMoving(moving);
      if (moving) {
        setWalkFrameTick((current) => (current + 1) % 4);
      }

      frameId = window.requestAnimationFrame(tick);
    };

    frameId = window.requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.cancelAnimationFrame(frameId);
    };
  }, [activeHotspot, movementUnlocked, mode, playerFacing, tutorialCompleted]);

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
    setPlayerPos(CAMP_START);
    setPlayerFacing("front");
    setPlayerMoving(false);
    setWalkFrameTick(0);
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
    setProgress((current) => ({
      ...current,
      sceneId: nextSceneId,
      updatedAt: new Date().toISOString()
    }));

    if (nextSceneId === "camp-free") {
      setSaveStatus("Movement unlocked. Explore the camp.");
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
                  {currentDialogueScene?.location ?? "Forest edge camp"} | {movementUnlocked ? "Exploration" : "Conversation"}
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
                <div className={`story-map ${movementUnlocked ? "story-map--camp-free" : "story-map--snowcamp"}`}>
                  <div className="flutter-player" style={{ left: `${playerPos.x}%`, top: `${playerPos.y}%` }}>
                    <AvatarSprite
                      customization={avatarCustomization}
                      size={104}
                      className="story-map__player-avatar"
                      facing={playerFacing}
                      moving={playerMoving}
                      animationTick={walkFrameTick}
                    />
                  </div>
                  <div className="story-stage__butterfly" aria-hidden="true">
                    <span />
                    <span />
                  </div>
                </div>

                {movementUnlocked ? (
                  <>
                    <div className="story-stage__hint">
                      Walk with WASD or the arrow keys. Try the cabin and the igloo.
                    </div>
                    {activeHotspot ? (
                      <button
                        type="button"
                        className="flutter-interact"
                        onClick={() => {
                          if (activeHotspot === "cabin") {
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
                          } else if (!tutorialCompleted) {
                            goToScene("igloo-brief");
                            setSaveStatus("Flutter has something to show you.");
                          }
                        }}
                      >
                        {activeHotspot === "cabin"
                          ? "Press E or Enter to enter the cabin"
                          : tutorialCompleted
                            ? "The igloo is quiet now."
                            : "Press E or Enter to inspect the igloo"}
                      </button>
                    ) : null}
                  </>
                ) : null}

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
                      The camp is quiet for now. The cabin still has a lamp in the window,
                      and the igloo is the only other place here that looks in use.
                    </p>
                    <p className="story-subtle">
                      Velmora explained: {houseVisited ? "yes" : "not yet"} | Fight tutorial complete: {tutorialCompleted ? "yes" : "not yet"}
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
          x: Math.max(12, Math.min(172, nextX)),
          y: Math.max(12, Math.min(144, nextY))
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
      { x: 24 + ((t * 48) % 152), y: 30 + Math.sin(t * 1.5) * 18 },
      { x: 176 - ((t * 54) % 152), y: 78 + Math.cos(t * 1.7) * 24 },
      { x: 32 + ((t * 38) % 148), y: 126 + Math.sin(t * 2.1) * 14 }
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
