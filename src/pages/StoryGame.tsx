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
  choices: Choice[];
};

type ViewMode = "title" | "settings" | "playing";

const SCENES: Record<string, StoryScene> = {
  wake: {
    id: "wake",
    chapterId: "chapter-1",
    title: "Waking Meadow",
    speaker: "Butterfly",
    body:
      "You wake in wet grass with no memory of the night before. A pale butterfly circles your shoulder, voice soft as dust. It says it found you first. It says the town ahead can help, if you listen carefully.",
    choices: [
      {
        id: "follow-gently",
        label: "Follow the butterfly toward town.",
        consequence: "Companion feels trusted.",
        nextSceneId: "path",
        companionTrustDelta: 1
      },
      {
        id: "question-first",
        label: "Ask who it is before moving.",
        consequence: "Companion notices your hesitation.",
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
    body:
      "The butterfly buzzes ahead of you along a cracked path. It points out the church steeple in the distance and warns you not to trust the masked scavengers near the gate. 'They serve him,' it says, though it never explains who 'him' is.",
    note: "This first chapter only autosaves when you pass into the town proper.",
    choices: [
      {
        id: "believe-warning",
        label: "Accept the warning and head to the town gate.",
        consequence: "These actions will have consequences.",
        nextChapterId: "chapter-2",
        nextSceneId: "gate",
        setFlags: { accepted_gate_warning: true },
        companionTrustDelta: 1
      },
      {
        id: "doubt-warning",
        label: "Decide to hear the scavengers out anyway.",
        consequence: "Companion will remember that.",
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
    body:
      "Wooden barricades lean under strips of cloth and warning bells. A scavenger girl grips a rusted spear and stares past you, not at you, but at the butterfly hovering beside your ear. 'If it's with you,' she says, 'then you're already late.'",
    choices: [
      {
        id: "defend-butterfly",
        label: "Defend the butterfly and demand answers from her.",
        consequence: "She will remember your tone.",
        nextSceneId: "camp",
        setFlags: { defended_companion_at_gate: true },
        companionTrustDelta: 1
      },
      {
        id: "hear-her-out",
        label: "Ask what she means by 'already late.'",
        consequence: "Companion did not like that.",
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
    body:
      "The path forward opens into a lonely campfire and a ledger full of names scratched out one by one. This is where chapter two would open into the full town hub, side routes, and your first real encounter.",
    choices: [
      {
        id: "hold-here",
        label: "Hold the line here for now.",
        consequence: "Manual saves remain available.",
        nextSceneId: "camp"
      }
    ]
  }
};

const CHAPTER_TITLES: Record<string, string> = {
  "chapter-1": "Chapter 1: Waking Meadow",
  "chapter-2": "Chapter 2: Town Gate"
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
                  {currentScene.speaker} speaking. Companion Trust: {progress.companionTrust} | Defiance: {progress.defiance}
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
              <div className="story-stage__world">
                <div className="story-stage__sky" />
                <div className="story-stage__ground" />
                <div className="story-stage__path" />
                <div className="story-stage__player" />
                <div className="story-stage__butterfly">
                  <span />
                  <span />
                </div>
                <div className="story-stage__hint">
                  Top-down overworld shell. We&apos;ll swap this for the real map scene next.
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
                  <span>{choice.consequence}</span>
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
