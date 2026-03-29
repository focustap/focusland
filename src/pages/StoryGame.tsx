import React, { useEffect, useMemo, useState } from "react";
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
  mood: "meadow" | "path" | "gate" | "camp";
  choices: Choice[];
};

type ViewMode = "title" | "settings" | "playing";

const SCENES: Record<string, StoryScene> = {
  wake: {
    id: "wake",
    chapterId: "chapter-1",
    title: "Waking Meadow",
    speaker: "Butterfly",
    location: "North meadow",
    mood: "meadow",
    body:
      "You wake in wet grass with no memory of the night before. A pale butterfly circles your shoulder, voice soft as dust. It says it found you first. It says the town ahead can help, if you stay calm and keep moving.",
    choices: [
      {
        id: "follow-gently",
        label: "Follow the butterfly toward town.",
        consequence: "You follow the butterfly toward town.",
        nextSceneId: "path",
        companionTrustDelta: 1
      },
      {
        id: "question-first",
        label: "Ask who it is before moving.",
        consequence: "The butterfly answers, and you keep moving.",
        nextSceneId: "path",
        setFlags: { questioned_companion_early: true },
        defianceDelta: 1
      }
    ]
  },
  path: {
    id: "path",
    chapterId: "chapter-1",
    title: "The Narrow Path",
    speaker: "Butterfly",
    location: "Broken footpath",
    mood: "path",
    body:
      "The butterfly buzzes ahead of you along a cracked path. It points out the church steeple in the distance and tells you the town is tense lately, so it might help if you stay close. When you ask why it sounds so certain, it only laughs and says it has always been good at first impressions.",
    note: "This first chapter only autosaves when you pass into the town proper.",
    choices: [
      {
        id: "believe-warning",
        label: "Trust it and keep walking toward the town gate.",
        consequence: "You keep moving toward town.",
        nextChapterId: "chapter-2",
        nextSceneId: "gate",
        setFlags: { accepted_gate_warning: true },
        companionTrustDelta: 1
      },
      {
        id: "doubt-warning",
        label: "Ignore the advice and decide to judge the town for yourself.",
        consequence: "You decide to make up your own mind.",
        nextChapterId: "chapter-2",
        nextSceneId: "gate",
        setFlags: { doubted_gate_warning: true },
        defianceDelta: 1
      }
    ]
  },
  gate: {
    id: "gate",
    chapterId: "chapter-2",
    title: "Town Gate",
    speaker: "Scavenger Girl",
    location: "Town perimeter",
    mood: "gate",
    body:
      "Wooden barricades lean under strips of cloth and warning bells. A scavenger girl grips a rusted spear and gives you the kind of guarded look any stranger would get this close to town. After a beat, her posture eases just enough to ask your name and where you came from.",
    choices: [
      {
        id: "defend-butterfly",
        label: "Answer simply and ask if the gate is still open.",
        consequence: "She steps aside and lets you through.",
        nextSceneId: "camp",
        setFlags: { defended_companion_at_gate: true },
        companionTrustDelta: 1
      },
      {
        id: "hear-her-out",
        label: "Make small talk and ask what the town is like before going in.",
        consequence: "She relaxes a little and answers.",
        nextSceneId: "camp",
        setFlags: { listened_to_gate_warning: true },
        defianceDelta: 1
      }
    ]
  },
  camp: {
    id: "camp",
    chapterId: "chapter-2",
    title: "Campfire Ledger",
    speaker: "Narration",
    location: "Outskirts camp",
    mood: "camp",
    body:
      "The path forward opens into a quiet camp just outside the main square, with a ledger, a kettle, and a few supplies left out for whoever arrives after dark. The butterfly keeps drifting ahead like it already knows where everything is. This is where chapter two would open into the full town hub, side routes, and your first real encounter.",
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
  "chapter-1": "Chapter 1: Waking Meadow",
  "chapter-2": "Chapter 2: Town Gate"
};

const SPEAKER_SPRITES: Record<string, string | null> = {
  Butterfly: null,
  "Scavenger Girl": `${import.meta.env.BASE_URL}assets/story/pixel-crawler/orc_shaman_idle.png`,
  Narration: `${import.meta.env.BASE_URL}assets/story/pixel-crawler/skeleton_mage_idle.png`
};

const StoryGame: React.FC = () => {
  const [mode, setMode] = useState<ViewMode>("title");
  const [progress, setProgress] = useState<StoryProgress>(DEFAULT_STORY_PROGRESS);
  const [hasExistingSave, setHasExistingSave] = useState(false);
  const [saveStatus, setSaveStatus] = useState("Checking save data...");
  const [settings, setSettings] = useState<StorySettings>(loadStorySettings());
  const [loadingSave, setLoadingSave] = useState(true);
  const [selectedConsequence, setSelectedConsequence] = useState<string | null>(null);

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

  const handleSettingChange = (nextSettings: StorySettings) => {
    setSettings(nextSettings);
    persistStorySettings(nextSettings);
  };

  const startNewGame = () => {
    setProgress(DEFAULT_STORY_PROGRESS);
    setSelectedConsequence(null);
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
              <div className="story-title-stage__sky" />
              <div className="story-title-stage__ground" />
              <div className="story-title-stage__path" />
              <img
                className="story-title-stage__tree story-title-stage__tree--left"
                src={`${import.meta.env.BASE_URL}assets/story/pixel-crawler/tree_model_01_size_03.png`}
                alt=""
              />
              <img
                className="story-title-stage__tree story-title-stage__tree--right"
                src={`${import.meta.env.BASE_URL}assets/story/pixel-crawler/tree_model_02_size_03.png`}
                alt=""
              />
              <img
                className="story-title-stage__player"
                src={`${import.meta.env.BASE_URL}assets/story/pixel-crawler/character_idle_down.png`}
                alt="Player sprite"
              />
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
                <div className="story-stage__sky" />
                <div className="story-stage__ground" />
                <div className="story-stage__path" />
                <img
                  className="story-stage__tree story-stage__tree--left"
                  src={`${import.meta.env.BASE_URL}assets/story/pixel-crawler/tree_model_01_size_03.png`}
                  alt=""
                />
                <img
                  className="story-stage__tree story-stage__tree--right"
                  src={`${import.meta.env.BASE_URL}assets/story/pixel-crawler/tree_model_02_size_03.png`}
                  alt=""
                />
                <div className="story-stage__setpiece" aria-hidden="true" />
                <img
                  className="story-stage__player"
                  src={`${import.meta.env.BASE_URL}assets/story/pixel-crawler/character_idle_down.png`}
                  alt="Player sprite"
                />
                {currentScene.speaker !== "Butterfly" ? (
                  <img
                    className="story-stage__npc"
                    src={SPEAKER_SPRITES[currentScene.speaker] ?? ""}
                    alt=""
                  />
                ) : null}
                <div className="story-stage__butterfly" aria-hidden="true">
                  <span />
                  <span />
                </div>
                <div className="story-stage__hint">
                  {currentScene.mood === "meadow"
                    ? "You wake beneath cold moonlight while the butterfly waits for you to stand."
                    : currentScene.mood === "path"
                      ? "The road narrows ahead. The butterfly keeps steering the pace."
                      : currentScene.mood === "gate"
                        ? "The town gate is close enough to touch, but the first warning arrives before safety does."
                        : "The road opens into a small camp where names have been crossed out one by one."}
                </div>
              </div>

              <div className="story-dialogue-shell">
                <div className="story-dialogue-shell__portrait">
                  {SPEAKER_SPRITES[currentScene.speaker] ? (
                    <img src={SPEAKER_SPRITES[currentScene.speaker] ?? ""} alt="" />
                  ) : (
                    <div className="story-dialogue-shell__butterfly" aria-hidden="true">
                      <span />
                      <span />
                    </div>
                  )}
                </div>
                <div
                  className={`story-dialogue ${currentScene.chapterId === "chapter-2" ? "story-dialogue--tense" : ""}`}
                >
                  <div className="story-dialogue__speaker">{currentScene.speaker}</div>
                  <p>{currentScene.body}</p>
                  {currentScene.note ? <p className="story-subtle">{currentScene.note}</p> : null}
                  {selectedConsequence ? <p className="warning">{selectedConsequence}</p> : null}
                </div>
              </div>
            </div>

            <div className="story-choice-grid">
              {currentScene.choices.map((choice) => (
                <button
                  key={choice.id}
                  type="button"
                  className="story-choice-card"
                  onClick={() => void applyChoice(choice)}
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
