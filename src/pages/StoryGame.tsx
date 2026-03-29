import React, { useEffect, useMemo, useRef, useState } from "react";
import NavBar from "../components/NavBar";
import {
  DEFAULT_STORY_PROGRESS,
  fetchStoryProgress,
  loadStorySettings,
  persistStorySettings,
  saveStoryProgress,
  type StoryProgress,
  type StorySettings
} from "../lib/storySave";

type Choice = {
  id: string;
  label: string;
  consequence: string;
  nextChapterId?: string;
  nextSceneId: string;
  setFlags?: Record<string, boolean>;
  companionTrustDelta?: number;
  defianceDelta?: number;
};

type StoryScene = {
  id: string;
  chapterId: string;
  title: string;
  speaker: string;
  body: string;
  note?: string;
  location: string;
  mood: "snowcamp" | "tutorial" | "trail";
  choices: Choice[];
};

type ViewMode = "title" | "settings" | "playing";

const SCENES: Record<string, StoryScene> = {
  wake: {
    id: "wake",
    chapterId: "chapter-1",
    title: "Snowbound Clearing",
    speaker: "Butterfly",
    location: "Forest edge camp",
    mood: "snowcamp",
    body:
      "You wake beside a campfire that has burned itself down to red coals. Snow drifts over a small cabin, an igloo, and a pond gone mostly still with ice. A pale butterfly circles your shoulder, voice soft as dust. It introduces itself as Flutter and says it found you here before dawn.",
    choices: [
      {
        id: "follow-gently",
        label: "Sit up and ask Flutter where you are.",
        consequence: "Flutter calmly explains where you woke up.",
        nextSceneId: "path",
        companionTrustDelta: 1
      },
      {
        id: "question-first",
        label: "Stand first and inspect the camp before answering.",
        consequence: "You take the camp in before listening.",
        nextSceneId: "path",
        setFlags: { questioned_companion_early: true },
        defianceDelta: 1
      }
    ]
  },
  path: {
    id: "path",
    chapterId: "chapter-1",
    title: "Flutter's Rules",
    speaker: "Butterfly",
    location: "Campfire ring",
    mood: "snowcamp",
    body:
      "Flutter drifts in slow circles over the firepit and explains the one thing it wants you to understand early: choices matter here. People remember what you say. Some moments will echo later, and the game will not warn you what any choice leads to before you make it. 'Just choose what feels true,' it says. 'The rest follows after.'",
    note: "Manual save works whenever you want. Autosave happens only when you clear a chapter.",
    choices: [
      {
        id: "believe-warning",
        label: "Tell Flutter you understand and ask what comes next.",
        consequence: "Flutter moves on to the next lesson.",
        nextSceneId: "gate",
        setFlags: { accepted_gate_warning: true },
        companionTrustDelta: 1
      },
      {
        id: "doubt-warning",
        label: "Say that sounds stressful and ask if there is a safer way to play.",
        consequence: "Flutter reassures you and keeps going.",
        nextSceneId: "gate",
        setFlags: { doubted_gate_warning: true },
        defianceDelta: 1
      }
    ]
  },
  gate: {
    id: "gate",
    chapterId: "chapter-1",
    title: "Practice Encounter",
    speaker: "Butterfly",
    location: "Frozen pond path",
    mood: "tutorial",
    body:
      "Flutter leads you toward the pond and asks you not to panic when the world changes shape for a second. In danger, your soul condenses into a small square inside a fight box. Move it with WASD or the arrow keys. Avoid the practice motes until the lesson is over, and then the road to town opens.",
    note: "This is only a tutorial encounter. Survive the box once to continue.",
    choices: [
      {
        id: "defend-butterfly",
        label: "Tell Flutter you are ready to leave the camp behind.",
        consequence: "The road toward town finally opens.",
        nextSceneId: "camp",
        setFlags: { defended_companion_at_gate: true, tutorial_completed: true },
        companionTrustDelta: 1
      },
      {
        id: "hear-her-out",
        label: "Take one more breath, then agree to head for town.",
        consequence: "Flutter waits until you are steady, then leads on.",
        nextSceneId: "camp",
        setFlags: { listened_to_gate_warning: true, tutorial_completed: true },
        defianceDelta: 1
      }
    ]
  },
  camp: {
    id: "camp",
    chapterId: "chapter-1",
    title: "First Road South",
    speaker: "Butterfly",
    location: "South trail",
    mood: "trail",
    body:
      "With the lesson behind you, the snow path bends south toward the town lights. Flutter keeps just ahead of you, bright against the dark pines, already talking about warm food, real beds, and people who can help you understand where you came from. This is still the opening stretch of chapter one, right before the first real town section begins.",
    choices: [
      {
        id: "hold-here",
        label: "Hold the line here for now.",
        consequence: "You stop here for now.",
        nextSceneId: "camp"
      }
    ]
  }
};

const CHAPTER_TITLES: Record<string, string> = {
  "chapter-1": "Chapter 1: Snowbound Clearing",
  "chapter-2": "Chapter 2: Toward Town"
};

const STORY_MUSIC = {
  title: `${import.meta.env.BASE_URL}audio/story/private-temp/flutter-title.mp3`,
  overworld: `${import.meta.env.BASE_URL}audio/story/private-temp/flutter-overworld.mp3`,
  tense: `${import.meta.env.BASE_URL}audio/story/private-temp/flutter-tense.mp3`
} as const;

const StoryGame: React.FC = () => {
  const [mode, setMode] = useState<ViewMode>("title");
  const [progress, setProgress] = useState<StoryProgress>(DEFAULT_STORY_PROGRESS);
  const [hasExistingSave, setHasExistingSave] = useState(false);
  const [saveStatus, setSaveStatus] = useState("Checking save data...");
  const [settings, setSettings] = useState<StorySettings>(loadStorySettings());
  const [loadingSave, setLoadingSave] = useState(true);
  const [selectedConsequence, setSelectedConsequence] = useState<string | null>(null);
  const [tutorialCleared, setTutorialCleared] = useState(Boolean(DEFAULT_STORY_PROGRESS.flags.tutorial_completed));
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const activeMusicRef = useRef<string | null>(null);

  const currentScene = useMemo(() => SCENES[progress.sceneId] ?? SCENES.wake, [progress.sceneId]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const savedProgress = await fetchStoryProgress();
        if (cancelled) {
          return;
        }

        if (savedProgress) {
          setProgress(savedProgress);
          setHasExistingSave(true);
          setSaveStatus(`Save loaded. Last checkpoint: ${CHAPTER_TITLES[savedProgress.chapterId] ?? savedProgress.chapterId}.`);
        } else {
          setSaveStatus("No story save yet. Starting fresh is safe.");
        }
      } catch {
        if (!cancelled) {
          setSaveStatus("Story save table not ready yet. Title screen still works, but Supabase saves need setup.");
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
    setTutorialCleared(Boolean(progress.flags.tutorial_completed));
  }, [progress.flags, progress.sceneId]);

  useEffect(() => {
    if (!settings.ambientAudio) {
      if (musicRef.current) {
        musicRef.current.pause();
      }
      activeMusicRef.current = null;
      return;
    }

    const nextTrack =
      mode === "playing"
        ? currentScene.chapterId === "chapter-1"
          ? STORY_MUSIC.overworld
          : STORY_MUSIC.tense
        : STORY_MUSIC.title;

    if (!musicRef.current) {
      const audio = new Audio(nextTrack);
      audio.loop = true;
      audio.volume = 0.34;
      musicRef.current = audio;
      activeMusicRef.current = nextTrack;
      void audio.play().catch(() => {});
      return;
    }

    const audio = musicRef.current;
    audio.volume = mode === "playing" && currentScene.chapterId !== "chapter-1" ? 0.28 : 0.34;

    if (activeMusicRef.current !== nextTrack) {
      audio.pause();
      audio.src = nextTrack;
      audio.currentTime = 0;
      activeMusicRef.current = nextTrack;
    }

    void audio.play().catch(() => {});
  }, [currentScene.chapterId, mode, settings.ambientAudio]);

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
    setProgress(DEFAULT_STORY_PROGRESS);
    setSelectedConsequence(null);
    setTutorialCleared(false);
    setMode("playing");
    setSaveStatus("New file started. Manual save available from the story screen.");
  };

  const continueGame = () => {
    setSelectedConsequence(null);
    setMode("playing");
  };

  const saveManual = async () => {
    setSaveStatus("Saving story progress...");
    try {
      const saved = await saveStoryProgress(progress);
      setProgress(saved);
      setHasExistingSave(true);
      setSaveStatus(`Manual save complete at ${CHAPTER_TITLES[saved.chapterId] ?? saved.chapterId}.`);
    } catch {
      setSaveStatus("Manual save failed. Supabase story_saves may still need to be created.");
    }
  };

  const applyChoice = async (choice: Choice) => {
    if (currentScene.id === "gate" && !tutorialCleared) {
      setSaveStatus("Finish Flutter's practice encounter first.");
      return;
    }

    const nextChapterId = choice.nextChapterId ?? progress.chapterId;
    const nextProgress: StoryProgress = {
      ...progress,
      chapterId: nextChapterId,
      sceneId: choice.nextSceneId,
      lastChoiceId: choice.id,
      flags: {
        ...progress.flags,
        ...(choice.setFlags ?? {})
      },
      companionTrust: progress.companionTrust + (choice.companionTrustDelta ?? 0),
      defiance: progress.defiance + (choice.defianceDelta ?? 0),
      chaptersCleared:
        choice.nextChapterId && choice.nextChapterId !== progress.chapterId
          ? Array.from(new Set([...progress.chaptersCleared, progress.chapterId]))
          : progress.chaptersCleared,
      updatedAt: new Date().toISOString()
    };

    setSelectedConsequence(choice.consequence);
    setProgress(nextProgress);

    if (choice.nextChapterId && choice.nextChapterId !== progress.chapterId) {
      setSaveStatus("Chapter cleared. Autosaving...");
      try {
        const saved = await saveStoryProgress(nextProgress);
        setProgress(saved);
        setHasExistingSave(true);
        setSaveStatus(`Autosaved at ${CHAPTER_TITLES[saved.chapterId] ?? saved.chapterId}.`);
      } catch {
        setSaveStatus("Chapter autosave failed. Story save table may still need setup.");
      }
    } else {
      setSaveStatus("Progress updated. Manual save recommended before leaving.");
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
                Wake up in a town that already knows your name. Listen to the butterfly.
                Or don&apos;t. The game will remember either way.
              </p>
            </div>

            <div className="story-title-stage story-title-stage--meadow">
              <div className="story-map story-map--title" aria-hidden="true">
                <div className="story-map__cliff" />
                <div className="story-map__snow" />
                <div className="story-map__pond" />
                <div className="story-map__dock" />
                <div className="story-map__cabin" />
                <div className="story-map__igloo" />
                <div className="story-map__campfire" />
                <div className="story-map__crate" />
                <div className="story-map__mailbox" />
                <div className="story-map__sign story-map__sign--north" />
                <div className="story-map__sign story-map__sign--south" />
                <div className="story-map__stump story-map__stump--left" />
                <div className="story-map__stump story-map__stump--right" />
                <div className="story-map__bush story-map__bush--one" />
                <div className="story-map__bush story-map__bush--two" />
                <div className="story-map__bush story-map__bush--three" />
                <div className="story-map__bush story-map__bush--four" />
                <div className="story-map__player-wrap story-map__player-wrap--title">
                  <img
                    className="story-map__player"
                    src={`${import.meta.env.BASE_URL}assets/story/pixel-crawler/character_idle_down.png`}
                    alt="Player sprite"
                  />
                </div>
              </div>
              <div className="story-title-stage__butterfly" aria-hidden="true">
                <span />
                <span />
              </div>
              <div className="story-title-stage__caption">
                A quiet beginning. A guide that feels harmless. A town that already knows something you do not.
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
                  <span>Manual save from the pause panel, with autosave only when you clear a chapter.</span>
                </div>
                <div className="story-title-card">
                  <strong>Current Slice</strong>
                  <span>Intro, first chapter, first town-gate choice, and the real save structure underneath it.</span>
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
                  onChange={(event) =>
                    handleSettingChange({
                      ...settings,
                      textSpeed: event.target.value === "fast" ? "fast" : "normal"
                    })
                  }
                >
                  <option value="normal">Normal</option>
                  <option value="fast">Fast</option>
                </select>
              </label>
              <label className="story-toggle">
                <input
                  type="checkbox"
                  checked={settings.screenshake}
                  onChange={(event) =>
                    handleSettingChange({
                      ...settings,
                      screenshake: event.target.checked
                    })
                  }
                />
                <span>Screenshake</span>
              </label>
              <label className="story-toggle">
                <input
                  type="checkbox"
                  checked={settings.ambientAudio}
                  onChange={(event) =>
                    handleSettingChange({
                      ...settings,
                      ambientAudio: event.target.checked
                    })
                  }
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
                <span className="story-kicker">{CHAPTER_TITLES[currentScene.chapterId]}</span>
                <h2>{currentScene.title}</h2>
                <p className="story-subtle">
                  {currentScene.location} | {currentScene.speaker} speaking | Companion Trust: {progress.companionTrust} | Defiance: {progress.defiance}
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

            <div className="story-stage">
              <div className={`story-stage__world story-stage__world--${currentScene.mood}`}>
                <div className={`story-map story-map--${currentScene.mood}`} aria-hidden="true">
                  <div className="story-map__cliff" />
                  <div className="story-map__snow" />
                  <div className="story-map__pond" />
                  <div className="story-map__dock" />
                  <div className="story-map__cabin" />
                  <div className="story-map__igloo" />
                  <div className="story-map__campfire" />
                  <div className="story-map__crate" />
                  <div className="story-map__mailbox" />
                  <div className="story-map__sign story-map__sign--north" />
                  <div className="story-map__sign story-map__sign--south" />
                  <div className="story-map__stump story-map__stump--left" />
                  <div className="story-map__stump story-map__stump--right" />
                  <div className="story-map__bush story-map__bush--one" />
                  <div className="story-map__bush story-map__bush--two" />
                  <div className="story-map__bush story-map__bush--three" />
                  <div className="story-map__bush story-map__bush--four" />
                  <div className="story-map__player-wrap">
                    <img
                      className="story-map__player"
                      src={`${import.meta.env.BASE_URL}assets/story/pixel-crawler/character_idle_down.png`}
                      alt="Player sprite"
                    />
                  </div>
                  <div className="story-stage__butterfly" aria-hidden="true">
                    <span />
                    <span />
                  </div>
                </div>
                <div className="story-stage__hint">
                  {currentScene.id === "wake"
                    ? "A warm fire, a cabin, and a guide you have no reason to distrust yet."
                    : currentScene.id === "path"
                      ? "Flutter teaches the rules before the road opens up."
                      : currentScene.id === "gate"
                        ? "Use WASD or the arrow keys inside the box and dodge until the lesson ends."
                        : "The path south is the start of the real town chapter."}
                </div>
                {currentScene.id === "gate" ? (
                  <EncounterTutorial
                    completed={tutorialCleared}
                    onComplete={() => {
                      if (tutorialCleared) {
                        return;
                      }

                      setTutorialCleared(true);
                      setProgress((current) => ({
                        ...current,
                        flags: {
                          ...current.flags,
                          tutorial_completed: true
                        },
                        updatedAt: new Date().toISOString()
                      }));
                      setSaveStatus("Practice complete. You can move on now.");
                    }}
                  />
                ) : null}
              </div>
            </div>

            <div
              className={`story-dialogue ${currentScene.chapterId === "chapter-2" ? "story-dialogue--tense" : ""}`}
            >
              <div className="story-dialogue__speaker">{currentScene.speaker}</div>
              <p>{currentScene.body}</p>
              {currentScene.note ? <p className="story-subtle">{currentScene.note}</p> : null}
              {selectedConsequence ? <p className="warning">{selectedConsequence}</p> : null}
            </div>

            <div className="story-choice-grid">
              {currentScene.choices.map((choice) => (
                <button
                  key={choice.id}
                  type="button"
                  className="story-choice-card"
                  onClick={() => void applyChoice(choice)}
                  disabled={currentScene.id === "gate" && !tutorialCleared}
                >
                  <strong>{choice.label}</strong>
                </button>
              ))}
            </div>

            <p className="info">{saveStatus}</p>
          </section>
        ) : null}
      </div>
    </div>
  );
};

export default StoryGame;

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
    <div className={`story-encounter ${flash ? "story-encounter--flash" : ""}`}>
      <div className="story-encounter__head">
        <strong>{completed ? "Practice complete" : "Practice encounter"}</strong>
        <span>{completed ? "Ready to continue" : "Survive 6 seconds"}</span>
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
      <div className="story-encounter__foot">
        <span>WASD / Arrow keys to move</span>
        <span>{completed ? "Lesson cleared" : `Timer ${Math.ceil((6000 - elapsed) / 1000)}s`}</span>
      </div>
    </div>
  );
};
