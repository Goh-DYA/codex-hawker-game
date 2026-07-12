"use client";

import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  CUSTOMER_ARCHETYPES,
  DISHES,
  ENGLISH_LOCALIZATION,
  PLACEABLES,
  STALLS,
  validateContent,
  type PlaceableDefinition,
  type StallDefinition,
} from "@/src/content";
import { AudioDirector } from "@/src/game/audio/AudioDirector";
import {
  clearGame,
  exportSave,
  importSave,
  loadGameCandidates,
  loadPreference,
  saveGame,
  savePreference,
} from "@/src/game/persistence/saveStore";
import { registerPwa } from "@/src/game/pwa/registerPwa";
import { utilityEffectsForPlaceable } from "@/src/game/runtime/contentUtility";
import { visualRecipeForPlaceable } from "@/src/game/runtime/visualRecipes";
import type {
  BuildTool,
  GameSpeed,
  RuntimeController,
  RuntimeEvent,
  RuntimeSettings,
  RuntimeSnapshot,
} from "@/src/game/runtime/types";

const INITIAL_SNAPSHOT: RuntimeSnapshot = {
  cash: 4_200,
  reputation: 8,
  level: 1,
  experience: 0,
  nextLevelExperience: 120,
  day: 1,
  timeLabel: "10:30 AM",
  isOpen: false,
  speed: 1,
  quality: "standard",
  activeCustomers: 0,
  servedCustomers: 0,
  averageSatisfaction: 100,
  queuePressure: 0,
  queueFlowState: "good",
  queueFlowMessage: "No queues are forming and every stall approach is clear.",
  freeSeats: 8,
  totalSeats: 8,
  cleanliness: 100,
  trayReturnStations: 1,
  buildTool: "select",
  unlockedContentIds: [],
  stallMenus: Object.fromEntries(
    STALLS.map((stall) => [stall.id, stall.dishIds.slice(0, stall.menuSlots)]),
  ),
  placedStalls: [],
  canUndo: false,
  objectiveProgress: 0,
  objectiveTarget: 5,
  expansionCount: 0,
  nextExpansionCost: 1_000,
  fps: 60,
  simulationMs: 0,
  autosaveState: "saved",
};

const DEFAULT_SETTINGS: RuntimeSettings = {
  quality: "standard",
  reducedMotion: false,
  highContrast: false,
  textScale: 1,
  musicVolume: 0.32,
  sfxVolume: 0.55,
};

function normalizeSettings(value: unknown): RuntimeSettings {
  if (!value || typeof value !== "object") return DEFAULT_SETTINGS;
  const record = value as Partial<Record<keyof RuntimeSettings, unknown>>;
  const number = (key: "textScale" | "musicVolume" | "sfxVolume", fallback: number) =>
    typeof record[key] === "number" && Number.isFinite(record[key])
      ? Number(record[key])
      : fallback;
  return {
    quality: record.quality === "lower-end" ? "lower-end" : "standard",
    reducedMotion:
      typeof record.reducedMotion === "boolean"
        ? record.reducedMotion
        : DEFAULT_SETTINGS.reducedMotion,
    highContrast:
      typeof record.highContrast === "boolean"
        ? record.highContrast
        : DEFAULT_SETTINGS.highContrast,
    textScale: Math.max(1, Math.min(1.35, number("textScale", 1))),
    musicVolume: Math.max(0, Math.min(1, number("musicVolume", 0.32))),
    sfxVolume: Math.max(0, Math.min(1, number("sfxVolume", 0.55))),
  };
}

type Panel = "build" | "stalls" | "dishes" | "insights";
type TutorialStep = 0 | 1 | 2 | 3 | 4 | 5;

const subscribeToStaticValue = () => () => undefined;
const getDebugSnapshot = () =>
  process.env.NODE_ENV !== "production" &&
  typeof location !== "undefined" &&
  new URLSearchParams(location.search).has("debug");
const getServerDebugSnapshot = () => false;

interface Toast extends RuntimeEvent {
  id: number;
}

function localize(key: string) {
  return ENGLISH_LOCALIZATION[key] ?? key;
}

function money(value: number) {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 0,
  }).format(value);
}

function catalogueIcon(category: PlaceableDefinition["category"] | "stall") {
  const icons: Record<string, string> = {
    table: "▦",
    seat: "◒",
    "stall-fixture": "▤",
    "tray-waste": "↺",
    lighting: "✦",
    fan: "✣",
    plant: "♧",
    signage: "▱",
    divider: "╫",
    facility: "⬡",
    decor: "◆",
    stall: "▰",
  };
  return icons[category] ?? "◇";
}

function getContentPrice(item: PlaceableDefinition | StallDefinition) {
  return "purchaseCost" in item ? item.purchaseCost : item.price;
}

type PreviewStyle = CSSProperties & {
  "--preview-accent": string;
  "--preview-tilt": string;
  "--preview-shift": string;
};

function placeablePreview(item: PlaceableDefinition): {
  recipe: ReturnType<typeof visualRecipeForPlaceable>;
  style: PreviewStyle;
} {
  const recipe = visualRecipeForPlaceable(item.id, item.category);
  return {
    recipe,
    style: {
      "--preview-accent": `#${recipe.accent.toString(16).padStart(6, "0")}`,
      "--preview-tilt": `${recipe.detailVariant * 5 - 20}deg`,
      "--preview-shift": `${recipe.makerMark % 9 - 4}px`,
    },
  };
}

function signedEffect(value: number, suffix = "") {
  return `${value > 0 ? "+" : ""}${Math.round(value)}${suffix}`;
}

function utilityEffects(item: PlaceableDefinition): readonly string[] {
  const effects: string[] = [];
  const resolved = utilityEffectsForPlaceable(item);
  if (resolved.ambience !== 0) effects.push(`Ambience ${signedEffect(resolved.ambience)}`);
  if (resolved.cleanliness !== 0) {
    effects.push(`Cleanliness ${signedEffect(resolved.cleanliness)}`);
  }
  if (resolved.queuePatience !== 0) {
    effects.push(`Queue patience ${signedEffect(resolved.queuePatience * 100, "%")}`);
  }
  if (resolved.eatingSpeed !== 0) {
    effects.push(`Eating speed ${signedEffect(resolved.eatingSpeed * 100, "%")}`);
  }
  if (resolved.cleaningEfficiency !== 0) {
    effects.push(`Cleaning efficiency ${signedEffect(resolved.cleaningEfficiency * 100, "%")}`);
  }
  if (resolved.movementSpeed !== 0) {
    effects.push(`Walking flow ${signedEffect(resolved.movementSpeed * 100, "%")}`);
  }
  if (resolved.wayfinding > 0) {
    effects.push(`Wayfinding ${signedEffect(resolved.wayfinding * 100, "%")}`);
  }
  if (item.lightRadius > 0) effects.push(`Lights ${item.lightRadius}-tile radius`);
  for (const role of new Set(item.interactionPoints.map((point) => point.role))) {
    effects.push(
      {
        "return-tray": "Enables tray return",
        "dispose-waste": "Supports cleaner waste handling",
        "wash-hands": "Improves hygiene and dining comfort",
        "collect-water": "Improves refreshment and dining comfort",
        "inspect-menu": "Improves stall discovery",
        queue: "Improves queue patience and flow",
        sit: "Provides usable seating",
        use: "Provides passive facility support",
      }[role],
    );
  }
  if (item.queuePoints.length > 0) effects.push(`${item.queuePoints.length} queue guide points`);
  return [...new Set(effects)];
}

function primaryUtility(item: PlaceableDefinition) {
  return utilityEffects(item)[0] ??
    (item.walkability === "blocked" ? "Shapes guest routes" : "Walk-through decor");
}

const UNLOCKABLE_CONTENT = [...PLACEABLES, ...STALLS] as const;
const UNLOCKABLE_BY_ID = new Map(UNLOCKABLE_CONTENT.map((item) => [item.id, item]));

function unlockLabel(
  item: PlaceableDefinition | StallDefinition,
  level: number,
  reputation: number,
  unlockedContentIds: readonly string[],
) {
  if (item.unlockRequirement.level > level) {
    return `Level ${item.unlockRequirement.level}`;
  }
  if (item.unlockRequirement.reputation > reputation) {
    return `Rep ${item.unlockRequirement.reputation}`;
  }
  const prerequisiteId = item.unlockRequirement.prerequisiteIds.find(
    (id) => !unlockedContentIds.includes(id),
  );
  const prerequisite = prerequisiteId ? UNLOCKABLE_BY_ID.get(prerequisiteId) : undefined;
  return prerequisite ? `After ${localize(prerequisite.nameKey)}` : "Locked";
}

const TUTORIAL_COPY = [
  {
    eyebrow: "Welcome, neighbour",
    title: "Build a place everyone can share",
    body: "Your small community dining hall is ready for its first lunch crowd. Every choice changes how people move, queue, eat, and feel.",
    action: "Show me around",
  },
  {
    eyebrow: "Step 1 of 4",
    title: "Move around the centre",
    body: "Drag the floor to pan. Use the wheel or the camera controls to zoom. Keyboard players can use the arrow keys and + or −.",
    action: "Got it",
  },
  {
    eyebrow: "Step 2 of 4",
    title: "Choose something to place",
    body: "Open Build, choose an unlocked item, then select a highlighted tile. Press R to rotate and Escape to cancel.",
    action: "Next",
  },
  {
    eyebrow: "Step 3 of 4",
    title: "Read the living layout",
    body: "Dotted paths show routes. Numbered queue markers show pressure. Seat rings show reservations. The Insights panel explains every bottleneck.",
    action: "Next",
  },
  {
    eyebrow: "Step 4 of 4",
    title: "Open when you are ready",
    body: "Customers arrive automatically, choose a stall, queue, collect food, reserve a seat, eat, return their tray, and leave. You can pause at any time.",
    action: "Open my centre",
  },
] as const;

export function HawkerSimulator() {
  const gameHostRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<RuntimeController | undefined>(undefined);
  const audioRef = useRef<AudioDirector | undefined>(undefined);
  const saveTimerRef = useRef<number | undefined>(undefined);
  const pendingSaveRef = useRef<unknown>(undefined);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const saveSequenceRef = useRef(0);
  const storageWarningRef = useRef(false);
  const audioWarningRef = useRef(false);
  const toastSequenceRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const tutorialDialogRef = useRef<HTMLElement>(null);
  const settingsDialogRef = useRef<HTMLElement>(null);
  const helpDialogRef = useRef<HTMLElement>(null);
  const resetDialogRef = useRef<HTMLElement>(null);

  const [snapshot, setSnapshot] = useState(INITIAL_SNAPSHOT);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [panel, setPanel] = useState<Panel>("build");
  const [buildCategory, setBuildCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [menuStallId, setMenuStallId] = useState(STALLS[0]?.id ?? "");
  const [selectedId, setSelectedId] = useState<string>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [tutorialStep, setTutorialStep] = useState<TutorialStep>(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [online, setOnline] = useState(true);
  const [offlineReady, setOfflineReady] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingError, setLoadingError] = useState<string>();
  const [debugOpen, setDebugOpen] = useState(false);
  const debugEnabled = useSyncExternalStore(
    subscribeToStaticValue,
    getDebugSnapshot,
    getServerDebugSnapshot,
  );

  const announce = useCallback((event: RuntimeEvent) => {
    const id = ++toastSequenceRef.current;
    setToasts((current) => [...current.slice(-2), { ...event, id }]);
    window.setTimeout(
      () => setToasts((current) => current.filter((toast) => toast.id !== id)),
      event.kind === "error" ? 6_000 : 3_400,
    );
  }, []);

  const reportStorageIssue = useCallback(
    (message: string) => {
      if (storageWarningRef.current) return;
      storageWarningRef.current = true;
      announce({ kind: "warning", message });
    },
    [announce],
  );

  const performSave = useCallback(
    async (payload: unknown, announceSuccess = false) => {
      const sequence = ++saveSequenceRef.current;
      setSnapshot((current) => ({ ...current, autosaveState: "saving" }));
      const operation = saveQueueRef.current
        .catch(() => undefined)
        .then(() => saveGame(payload));
      saveQueueRef.current = operation;
      try {
        await operation;
        if (sequence === saveSequenceRef.current) {
          setSnapshot((current) => ({ ...current, autosaveState: "saved" }));
        }
        if (announceSuccess) {
          announce({ kind: "success", message: "Centre saved on this device." });
        }
      } catch {
        if (sequence === saveSequenceRef.current) {
          setSnapshot((current) => ({ ...current, autosaveState: "error" }));
        }
        announce({
          kind: "error",
          message: "Could not save locally. Storage may be unavailable or full.",
        });
        throw new Error("Local save failed");
      }
    },
    [announce],
  );

  const flushPendingSave = useCallback(async () => {
    window.clearTimeout(saveTimerRef.current);
    const payload = pendingSaveRef.current;
    if (payload === undefined) return;
    pendingSaveRef.current = undefined;
    await performSave(payload).catch(() => undefined);
  }, [performSave]);

  useEffect(() => {
    let disposed = false;
    let unregisterPwa: () => void = () => {};
    audioRef.current = new AudioDirector();

    async function start() {
      try {
        validateContent();
        let savedSettings = DEFAULT_SETTINGS;
        let completedTutorial = false;
        let initialStates: readonly unknown[] = [];
        try {
          savedSettings = normalizeSettings(
            await loadPreference<unknown>("settings", DEFAULT_SETTINGS),
          );
          completedTutorial =
            (await loadPreference<unknown>("tutorial-complete", false)) === true;
        } catch {
          reportStorageIssue(
            "Local preferences are unavailable. The game will continue with defaults.",
          );
        }
        try {
          initialStates = await loadGameCandidates();
        } catch {
          reportStorageIssue(
            "Local saves are unavailable in this browser session. You can still play, but progress may not persist.",
          );
        }
        if (disposed || !gameHostRef.current) return;
        setSettings(savedSettings);
        setTutorialStep(completedTutorial ? 5 : 0);
        const { createHawkerRuntime } = await import(
          "@/src/game/runtime/createHawkerRuntime"
        );
        const controller = await createHawkerRuntime({
          parent: gameHostRef.current,
          settings: savedSettings,
          initialStates,
          onSnapshot(nextSnapshot) {
            setSnapshot((current) => ({
              ...nextSnapshot,
              autosaveState: current.autosaveState,
            }));
          },
          onEvent(event) {
            announce(event);
            if (event.kind === "success") audioRef.current?.play("sale");
            if (event.kind === "error") audioRef.current?.play("invalid");
          },
          onPersistentChange(state) {
            pendingSaveRef.current = state;
            window.clearTimeout(saveTimerRef.current);
            setSnapshot((current) => ({ ...current, autosaveState: "saving" }));
            saveTimerRef.current = window.setTimeout(() => {
              void flushPendingSave();
            }, 200);
          },
        });
        if (disposed) controller.destroy();
        else {
          controllerRef.current = controller;
          unregisterPwa = registerPwa({
            onOfflineReady() {
              setOfflineReady(true);
            },
            onUpdateReady() {
              setUpdateReady(true);
            },
            onConnectivityChange(isOnline) {
              setOnline(isOnline);
            },
            onOfflineError(message) {
              announce({ kind: "warning", message: `Offline cache: ${message}` });
            },
          });
        }
      } catch (error) {
        setLoadingError(
          error instanceof Error ? error.message : "The game could not start.",
        );
      } finally {
        if (!disposed) setLoading(false);
      }
    }

    void start();
    const flushOnPageHide = () => void flushPendingSave();
    window.addEventListener("pagehide", flushOnPageHide);

    return () => {
      disposed = true;
      window.clearTimeout(saveTimerRef.current);
      void flushPendingSave();
      window.removeEventListener("pagehide", flushOnPageHide);
      controllerRef.current?.destroy();
      audioRef.current?.destroy();
      unregisterPwa();
    };
  }, [announce, flushPendingSave, reportStorageIssue]);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--player-text-scale",
      String(settings.textScale),
    );
    controllerRef.current?.setQuality(settings.quality);
    controllerRef.current?.setReducedMotion(settings.reducedMotion);
    audioRef.current?.setVolumes(settings.musicVolume, settings.sfxVolume);
    void savePreference("settings", settings).catch(() =>
      reportStorageIssue("Preferences could not be saved on this device."),
    );
  }, [reportStorageIssue, settings]);

  useEffect(() => {
    const modal = resetOpen
      ? resetDialogRef.current
      : settingsOpen
        ? settingsDialogRef.current
        : helpOpen
          ? helpDialogRef.current
          : tutorialStep < 5
            ? tutorialDialogRef.current
            : null;
    if (!modal) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const focusableSelector = [
      "button:not([disabled])",
      "input:not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      "[href]",
      "[tabindex]:not([tabindex='-1'])",
    ].join(",");
    const focusables = () =>
      Array.from(modal.querySelectorAll<HTMLElement>(focusableSelector)).filter(
        (element) => !element.hidden && element.getAttribute("aria-hidden") !== "true",
      );
    const initial = modal.querySelector<HTMLElement>("[autofocus]") ?? focusables()[0] ?? modal;
    window.requestAnimationFrame(() => initial.focus());

    const handleModalKeys = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (resetOpen) setResetOpen(false);
        else if (settingsOpen) setSettingsOpen(false);
        else if (helpOpen) setHelpOpen(false);
        else {
          setTutorialStep(5);
          void savePreference("tutorial-complete", true).catch(() =>
            reportStorageIssue("Tutorial progress could not be saved."),
          );
        }
        return;
      }
      if (event.key !== "Tab") return;
      const available = focusables();
      if (available.length === 0) {
        event.preventDefault();
        modal.focus();
        return;
      }
      const first = available[0]!;
      const last = available[available.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleModalKeys);
    return () => {
      document.removeEventListener("keydown", handleModalKeys);
      window.requestAnimationFrame(() => previousFocus?.focus());
    };
  }, [helpOpen, reportStorageIssue, resetOpen, settingsOpen, tutorialStep]);

  const buildCategories = useMemo(
    () => ["all", ...new Set(PLACEABLES.map((item) => item.category))],
    [],
  );

  const visiblePlaceables = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("en-SG");
    return PLACEABLES.filter((item) => {
      const matchesCategory = buildCategory === "all" || item.category === buildCategory;
      const searchable = `${localize(item.nameKey)} ${localize(item.descriptionKey)}`.toLocaleLowerCase("en-SG");
      return matchesCategory && (!normalizedQuery || searchable.includes(normalizedQuery));
    });
  }, [buildCategory, query]);

  const selectedContent = useMemo(
    () =>
      PLACEABLES.find((item) => item.id === selectedId) ??
      STALLS.find((stall) => stall.id === selectedId),
    [selectedId],
  );

  function unlockAudio() {
    void audioRef.current
      ?.unlock()
      .then(() => audioRef.current?.startAmbience())
      .catch(() => {
        if (audioWarningRef.current) return;
        audioWarningRef.current = true;
        announce({
          kind: "warning",
          message: "Audio is unavailable; every important cue still has a visual equivalent.",
        });
      });
  }

  function selectBuildItem(item: PlaceableDefinition | StallDefinition) {
    unlockAudio();
    if (!snapshot.unlockedContentIds.includes(item.id)) {
      announce({
        kind: "warning",
        message: `${localize(item.nameKey)} unlocks with ${unlockLabel(item, snapshot.level, snapshot.reputation, snapshot.unlockedContentIds).toLocaleLowerCase("en-SG")}.`,
      });
      return;
    }
    if (getContentPrice(item) > snapshot.cash) {
      announce({ kind: "warning", message: "You need more cash for that item." });
      return;
    }
    setSelectedId(item.id);
    controllerRef.current?.selectBuildItem(item.id);
    controllerRef.current?.setBuildTool("place");
    audioRef.current?.play("ui");
  }

  function chooseTool(tool: BuildTool) {
    setSelectedId(tool === "place" ? selectedId : undefined);
    controllerRef.current?.setBuildTool(tool);
    if (tool !== "place") controllerRef.current?.selectBuildItem(undefined);
    audioRef.current?.play("ui");
  }

  function setGameSpeed(speed: GameSpeed) {
    unlockAudio();
    controllerRef.current?.setSpeed(speed);
    audioRef.current?.play("ui");
  }

  function toggleCentre() {
    unlockAudio();
    const changed = controllerRef.current?.toggleOpen() ?? false;
    if (changed) audioRef.current?.play(snapshot.isOpen ? "close" : "open");
  }

  async function finishTutorial(openCentre: boolean) {
    setTutorialStep(5);
    await savePreference("tutorial-complete", true).catch(() =>
      reportStorageIssue("Tutorial progress could not be saved."),
    );
    if (openCentre && !snapshot.isOpen) toggleCentre();
  }

  async function saveNow(): Promise<boolean> {
    window.clearTimeout(saveTimerRef.current);
    pendingSaveRef.current = undefined;
    const state = controllerRef.current?.exportState();
    if (!state) return false;
    try {
      await performSave(state, true);
      return true;
    } catch {
      return false;
    }
  }

  async function applyReadyUpdate() {
    if (!(await saveNow())) return;
    const registration = await navigator.serviceWorker?.getRegistration();
    if (!registration?.waiting) {
      location.reload();
      return;
    }
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      () => location.reload(),
      { once: true },
    );
    registration.waiting.postMessage({ type: "ACTIVATE_UPDATE" });
  }

  function downloadSave() {
    const state = controllerRef.current?.exportState();
    if (!state) return;
    const link = document.createElement("a");
    link.href = URL.createObjectURL(
      new Blob([exportSave(state)], { type: "application/json" }),
    );
    link.download = `hawker-simulator-day-${snapshot.day}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  async function uploadSave(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      window.clearTimeout(saveTimerRef.current);
      pendingSaveRef.current = undefined;
      const payload = importSave(await file.text());
      controllerRef.current?.importState(payload);
      await performSave(payload);
      announce({ kind: "success", message: "Save imported and checked." });
    } catch (error) {
      announce({
        kind: "error",
        message: error instanceof Error ? error.message : "Could not import that save.",
      });
    }
  }

  async function confirmReset() {
    window.clearTimeout(saveTimerRef.current);
    pendingSaveRef.current = undefined;
    await saveQueueRef.current.catch(() => undefined);
    await clearGame().catch(() =>
      reportStorageIssue("The stored save could not be removed."),
    );
    controllerRef.current?.reset();
    setResetOpen(false);
    setTutorialStep(0);
    await savePreference("tutorial-complete", false).catch(() =>
      reportStorageIssue("Tutorial progress could not be reset."),
    );
    announce({ kind: "info", message: "A fresh centre is ready." });
  }

  const objectivePercent = Math.min(
    100,
    (snapshot.objectiveProgress / Math.max(1, snapshot.objectiveTarget)) * 100,
  );
  const tutorialCopy = TUTORIAL_COPY[Math.min(tutorialStep, 4)]!;
  const interfaceInert = tutorialStep < 5 || settingsOpen || helpOpen || resetOpen;

  return (
    <main
      className="game-shell"
      data-contrast={settings.highContrast ? "high" : "normal"}
      data-motion={settings.reducedMotion ? "reduced" : "full"}
      onPointerDown={unlockAudio}
    >
      <header className="topbar" inert={interfaceInert} aria-hidden={interfaceInert}>
        <div className="brand-lockup" aria-label="Hawker Simulator">
          <span className="brand-mark" aria-hidden="true">
            <span />
          </span>
          <div>
            <p>Neighbourhood edition</p>
            <h1>Hawker Simulator</h1>
          </div>
        </div>

        <dl className="hud-stats" aria-label="Centre status">
          <div>
            <dt>Cash</dt>
            <dd data-testid="cash-value">{money(snapshot.cash)}</dd>
          </div>
          <div>
            <dt>Reputation</dt>
            <dd>
              <span aria-hidden="true">♥</span> {Math.round(snapshot.reputation)}
            </dd>
          </div>
          <div className="level-stat">
            <dt>Level {snapshot.level}</dt>
            <dd>
              <span className="progress-track" aria-hidden="true">
                <span
                  style={{
                    width: `${Math.min(100, (snapshot.experience / Math.max(1, snapshot.nextLevelExperience)) * 100)}%`,
                  }}
                />
              </span>
              <span className="sr-only">
                {snapshot.experience} of {snapshot.nextLevelExperience} experience
              </span>
            </dd>
          </div>
        </dl>

        <div className="day-controls">
          <div className="clock-card">
            <span>Day {snapshot.day}</span>
            <strong>{snapshot.timeLabel}</strong>
          </div>
          <div className="speed-group" aria-label="Simulation speed">
            {([0, 1, 2, 4] as const).map((speed) => (
              <button
                type="button"
                key={speed}
                className={snapshot.speed === speed ? "is-active" : ""}
                aria-pressed={snapshot.speed === speed}
                aria-label={speed === 0 ? "Pause" : `${speed} times speed`}
                onClick={() => setGameSpeed(speed)}
              >
                {speed === 0 ? "Ⅱ" : `${speed}×`}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Open settings"
            onClick={() => setSettingsOpen(true)}
          >
            ⚙
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Open help"
            onClick={() => setHelpOpen(true)}
          >
            ?
          </button>
        </div>
      </header>

      <section className="play-layout" inert={interfaceInert} aria-hidden={interfaceInert}>
        <aside className="left-rail" aria-label="Objectives and centre pulse">
          <section className="objective-card">
            <div className="card-kicker">
              <span>Today&apos;s focus</span>
              <span>First 5 guests</span>
            </div>
            <h2>Warm welcome</h2>
            <p>Serve {snapshot.objectiveTarget} happy neighbours.</p>
            <div className="objective-progress">
              <span style={{ width: `${objectivePercent}%` }} />
            </div>
            <small>
              {snapshot.objectiveProgress} / {snapshot.objectiveTarget} complete
            </small>
          </section>

          <section className="pulse-card">
            <div className="section-heading">
              <div>
                <span>Live read</span>
                <h2>Centre pulse</h2>
              </div>
              <span className="live-dot">Live</span>
            </div>
            <dl>
              <div>
                <dt>Guests inside</dt>
                <dd>{snapshot.activeCustomers}</dd>
              </div>
              <div>
                <dt>Free seats</dt>
                <dd>
                  {snapshot.freeSeats}/{snapshot.totalSeats}
                </dd>
              </div>
              <div>
                <dt>Happiness</dt>
                <dd>{Math.round(snapshot.averageSatisfaction)}%</dd>
              </div>
              <div>
                <dt>Cleanliness</dt>
                <dd>{Math.round(snapshot.cleanliness)}%</dd>
              </div>
            </dl>
            <button type="button" onClick={() => setPanel("insights")}>
              Explain the flow <span aria-hidden="true">→</span>
            </button>
          </section>

          <section className="tip-card">
            <span aria-hidden="true">✦</span>
            <div>
              <strong>Layout tip</strong>
              <p>Leave two tiles before popular stall queues to reduce crowd knots.</p>
            </div>
          </section>
        </aside>

        <section className="world-column" aria-label="Hawker centre map">
          <div className="world-toolbar">
            <div className="mode-pill">
              <span className={snapshot.buildTool === "place" || snapshot.buildTool === "queue" ? "amber-dot" : "green-dot"} />
              {snapshot.buildTool === "place"
                ? "Build mode"
                : snapshot.buildTool === "queue"
                  ? "Queue editor"
                  : snapshot.isOpen
                    ? "Centre open"
                    : "Planning mode"}
            </div>
            <div className="world-message" aria-live="polite">
              {snapshot.buildTool === "queue"
                ? "Queue editor: choose adjacent clear tiles to bend the line; Escape finishes"
                : selectedContent
                ? `${localize(selectedContent.nameKey)} selected — choose a clear tile`
                : snapshot.isOpen
                  ? `${snapshot.activeCustomers} neighbours are visiting`
                  : "Arrange your centre, then open the shutters"}
            </div>
            <div className="tool-segment" aria-label="Build tools">
              {(["select", "move", "remove"] as const).map((tool) => (
                <button
                  type="button"
                  key={tool}
                  aria-pressed={snapshot.buildTool === tool}
                  className={snapshot.buildTool === tool ? "is-active" : ""}
                  onClick={() => chooseTool(tool)}
                >
                  {tool === "select" ? "Select" : tool === "move" ? "Move" : "Remove"}
                </button>
              ))}
              {snapshot.selectedObjectId && snapshot.selectedObjectDefinitionId?.startsWith("stall.") ? (
                <button
                  type="button"
                  aria-pressed={snapshot.buildTool === "queue"}
                  className={snapshot.buildTool === "queue" ? "is-active" : ""}
                  onClick={() => {
                    if (snapshot.buildTool === "queue") controllerRef.current?.finishQueueEdit();
                    else controllerRef.current?.beginQueueEdit(snapshot.selectedObjectId as string);
                  }}
                >
                  {snapshot.buildTool === "queue" ? "Finish queue" : "Edit queue"}
                </button>
              ) : null}
            </div>
          </div>

          <div className="world-frame">
            <div
              ref={gameHostRef}
              className="game-host"
              data-testid="game-world"
              role="application"
              aria-label="Interactive hawker centre. Use arrow keys to move the build cursor, Enter to place, R to rotate, and Escape to cancel."
              tabIndex={0}
            >
              {loading ? (
                <div className="loading-centre" role="status">
                  <span className="loading-bowl" aria-hidden="true" />
                  <strong>Setting the tables…</strong>
                  <small>Preparing the local simulation</small>
                </div>
              ) : null}
              {loadingError ? (
                <div className="loading-centre error-card" role="alert">
                  <strong>The shutters could not open</strong>
                  <small>{loadingError}</small>
                  <button type="button" onClick={() => location.reload()}>
                    Reload game
                  </button>
                </div>
              ) : null}
            </div>

            <div className="camera-controls" aria-label="Camera controls">
              <button
                type="button"
                aria-label="Zoom in"
                onClick={() => controllerRef.current?.zoomBy(0.15)}
              >
                +
              </button>
              <button
                type="button"
                aria-label="Centre camera"
                onClick={() => controllerRef.current?.centreCamera()}
              >
                ◎
              </button>
              <button
                type="button"
                aria-label="Zoom out"
                onClick={() => controllerRef.current?.zoomBy(-0.15)}
              >
                −
              </button>
            </div>

            <div className="map-legend" aria-label="Map legend">
              <span><i className="legend-route" /> Guest route</span>
              <span><i className="legend-queue" /> Queue</span>
              <span><i className="legend-seat" /> Reserved seat</span>
            </div>
          </div>

          <div className="action-strip">
            <div className="save-state" role="status">
              <span className={snapshot.autosaveState === "error" ? "error-dot" : "green-dot"} />
              {snapshot.autosaveState === "saving"
                ? "Saving…"
                : snapshot.autosaveState === "error"
                  ? "Save needs attention"
                  : "Saved on this device"}
            </div>
            <div className="edit-actions">
              <button
                type="button"
                disabled={!snapshot.canUndo}
                onClick={() => controllerRef.current?.undo()}
              >
                ↶ Undo
              </button>
              <button type="button" onClick={() => controllerRef.current?.rotateSelection()}>
                ↻ Rotate <kbd>R</kbd>
              </button>
              <button type="button" onClick={() => chooseTool("select")}>
                Cancel <kbd>Esc</kbd>
              </button>
            </div>
            <button
              type="button"
              className={snapshot.isOpen ? "centre-toggle close" : "centre-toggle"}
              data-testid="toggle-centre"
              onClick={toggleCentre}
            >
              <span aria-hidden="true">{snapshot.isOpen ? "▥" : "▤"}</span>
              {snapshot.isOpen ? "Close centre" : "Open centre"}
            </button>
          </div>
        </section>

        <aside className="catalogue-panel" aria-label="Build catalogue">
          <div className="catalogue-heading">
            <div>
              <span>{panel === "stalls" ? "Food & drink" : panel === "dishes" ? "Menus" : panel === "insights" ? "Why it happens" : "Build catalogue"}</span>
              <h2>
                {panel === "stalls" ? "Stalls" : panel === "dishes" ? "Thirty dishes" : panel === "insights" ? "Flow insights" : "Make it yours"}
              </h2>
            </div>
            <span className="count-badge">
              {panel === "stalls" ? STALLS.length : panel === "dishes" ? DISHES.length : panel === "insights" ? snapshot.activeCustomers : PLACEABLES.length}
            </span>
          </div>

          {panel === "build" ? (
            <>
              <label className="search-field">
                <span className="sr-only">Search catalogue</span>
                <span aria-hidden="true">⌕</span>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search tables, fans, plants…"
                />
              </label>
              <div className="category-scroller" aria-label="Catalogue categories">
                {buildCategories.map((category) => (
                  <button
                    type="button"
                    key={category}
                    className={buildCategory === category ? "is-active" : ""}
                    aria-pressed={buildCategory === category}
                    onClick={() => setBuildCategory(category)}
                  >
                    {category === "all" ? "All" : category.replace("-", " ")}
                  </button>
                ))}
              </div>
              <div className="catalogue-grid" data-testid="build-catalogue">
                {visiblePlaceables.map((item) => {
                  const locked = !snapshot.unlockedContentIds.includes(item.id);
                  const selected = selectedId === item.id;
                  const preview = placeablePreview(item);
                  return (
                    <button
                      type="button"
                      key={item.id}
                      className={`catalogue-item ${selected ? "is-selected" : ""}`}
                      aria-pressed={selected}
                      aria-label={`${localize(item.nameKey)}, ${money(item.price)}${locked ? `, locked: ${unlockLabel(item, snapshot.level, snapshot.reputation, snapshot.unlockedContentIds)}` : ""}`}
                      onClick={() => selectBuildItem(item)}
                    >
                      <span
                        className={`item-art item-${item.category}`}
                        data-silhouette={preview.recipe.silhouetteVariant}
                        data-detail={preview.recipe.detailVariant}
                        data-mark={preview.recipe.makerMark.toString(16).padStart(2, "0")}
                        style={preview.style}
                        aria-hidden="true"
                      >
                        <span>{catalogueIcon(item.category)}</span>
                      </span>
                      <strong>{localize(item.nameKey)}</strong>
                      <small>
                        {locked
                          ? unlockLabel(item, snapshot.level, snapshot.reputation, snapshot.unlockedContentIds)
                          : `${money(item.price)} · ${primaryUtility(item)}`}
                      </small>
                      {locked ? <i aria-hidden="true">●</i> : null}
                    </button>
                  );
                })}
              </div>
            </>
          ) : null}

          {panel === "stalls" ? (
            <div className="stall-list" data-testid="stall-catalogue">
              {snapshot.placedStalls.length > 0 ? (
                <section className="operating-stalls" aria-labelledby="operating-stalls-title">
                  <h3 id="operating-stalls-title">Operating queue plans</h3>
                  {snapshot.placedStalls.map((placed) => (
                    <article key={placed.objectId} className="queue-manager-row">
                      <div>
                        <strong>{placed.name}</strong>
                        <small>
                          {placed.queueCount} queueing · {placed.customQueue ? "custom path" : `${placed.queueDirection} auto-line`}
                        </small>
                      </div>
                      <div className="queue-direction-group" aria-label={`${placed.name} queue direction`}>
                        {(["north", "east", "south", "west"] as const).map((direction) => (
                          <button
                            type="button"
                            key={direction}
                            className={!placed.customQueue && placed.queueDirection === direction ? "is-active" : ""}
                            aria-pressed={!placed.customQueue && placed.queueDirection === direction}
                            aria-label={`Route ${placed.name} queue ${direction}`}
                            onClick={() => controllerRef.current?.setQueueDirection(placed.objectId, direction)}
                          >
                            {{ north: "↑", east: "→", south: "↓", west: "←" }[direction]}
                          </button>
                        ))}
                        <button
                          type="button"
                          className={placed.customQueue ? "is-active edit-queue-button" : "edit-queue-button"}
                          onClick={() => controllerRef.current?.beginQueueEdit(placed.objectId)}
                        >
                          Bend line
                        </button>
                      </div>
                    </article>
                  ))}
                </section>
              ) : null}
              <h3 className="catalogue-subheading">Add another stall</h3>
              {STALLS.map((stall) => {
                const locked = !snapshot.unlockedContentIds.includes(stall.id);
                return (
                  <button
                    type="button"
                    key={stall.id}
                    className={selectedId === stall.id ? "stall-card is-selected" : "stall-card"}
                    onClick={() => selectBuildItem(stall)}
                  >
                    <span
                      className="stall-swatch"
                      style={{
                        background: `linear-gradient(145deg, ${stall.visual.palette[0]}, ${stall.visual.palette[1]})`,
                      }}
                      aria-hidden="true"
                    >
                      {catalogueIcon("stall")}
                    </span>
                    <span>
                      <strong>{localize(stall.nameKey)}</strong>
                      <small>{stall.dishIds.length} dishes · {Math.round(stall.quality * 100)} quality</small>
                    </span>
                    <em>{locked ? unlockLabel(stall, snapshot.level, snapshot.reputation, snapshot.unlockedContentIds) : money(stall.purchaseCost)}</em>
                  </button>
                );
              })}
            </div>
          ) : null}

          {panel === "dishes" ? (
            <div className="menu-manager">
              <label className="menu-stall-picker">
                Operating stall
                <select value={menuStallId} onChange={(event) => setMenuStallId(event.target.value)}>
                  {STALLS.map((stall) => (
                    <option
                      key={stall.id}
                      value={stall.id}
                      disabled={!snapshot.unlockedContentIds.includes(stall.id)}
                    >
                      {localize(stall.nameKey)}
                    </option>
                  ))}
                </select>
              </label>
              {STALLS.filter((stall) => stall.id === menuStallId).map((stall) => {
                const activeMenu = snapshot.stallMenus[stall.id] ?? [];
                return (
                  <div className="dish-list" key={stall.id}>
                    <p className="menu-capacity">
                      {activeMenu.length} of {stall.menuSlots} menu slots active
                    </p>
                    {DISHES.filter((dish) => dish.stallIds.includes(stall.id)).map((dish) => {
                      const checked = activeMenu.includes(dish.id);
                      const gated =
                        dish.unlockRequirement.level > snapshot.level ||
                        dish.unlockRequirement.reputation > snapshot.reputation;
                      return (
                        <label key={dish.id} className="dish-row menu-dish-row">
                          <span style={{ background: dish.portionColour }} aria-hidden="true" />
                          <div>
                            <strong>{localize(dish.nameKey)}</strong>
                            <small>
                              {dish.category.replace("-", " ")} · {money(dish.price)} · demand {Math.round(dish.baseDemand * 100)}%
                            </small>
                          </div>
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={gated || (!checked && activeMenu.length >= stall.menuSlots)}
                            aria-label={`Offer ${localize(dish.nameKey)}`}
                            onChange={(event) =>
                              controllerRef.current?.setDishEnabled(
                                stall.id,
                                dish.id,
                                event.target.checked,
                              )
                            }
                          />
                          {gated ? (
                            <em>Lvl {dish.unlockRequirement.level}</em>
                          ) : null}
                        </label>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ) : null}

          {panel === "insights" ? (
            <div className="insights-list">
              <article data-state={snapshot.queueFlowState}>
                <span aria-hidden="true">↝</span>
                <div>
                  <strong>Queue flow</strong>
                  <p>
                    {snapshot.queueFlowMessage}
                  </p>
                </div>
                <em>{Math.round(snapshot.queuePressure)}% used</em>
              </article>
              <article data-state={snapshot.freeSeats < 2 ? "warning" : "good"}>
                <span aria-hidden="true">◒</span>
                <div>
                  <strong>Communal seating</strong>
                  <p>
                    {snapshot.freeSeats < 2
                      ? "Very few seats are free. Add a table family or improve turnover."
                      : `${snapshot.freeSeats} seats are ready for arriving diners.`}
                  </p>
                </div>
                <em>{snapshot.freeSeats}/{snapshot.totalSeats}</em>
              </article>
              <article data-state={snapshot.trayReturnStations === 0 || snapshot.cleanliness < 70 ? "warning" : "good"}>
                <span aria-hidden="true">↺</span>
                <div>
                  <strong>Tray return</strong>
                  <p>
                    {snapshot.trayReturnStations === 0
                      ? "There is no usable tray-return station. Add a return rack on a clear exit route."
                      : snapshot.cleanliness < 70
                        ? "Tray-return capacity is strained. Add a visible rack near an exit route."
                        : `${snapshot.trayReturnStations} return point${snapshot.trayReturnStations === 1 ? " is" : "s are"} visible and tables are turning over cleanly.`}
                  </p>
                </div>
                <em>{Math.round(snapshot.cleanliness)}%</em>
              </article>
              <article data-state="neutral">
                <span aria-hidden="true">◎</span>
                <div>
                  <strong>Archetypes active</strong>
                  <p>Workers, families, students and five other behaviour profiles visit as you progress.</p>
                </div>
                <em>{CUSTOMER_ARCHETYPES.length}</em>
              </article>
              <button
                type="button"
                className="expansion-button"
                disabled={snapshot.level < 3 || snapshot.cash < snapshot.nextExpansionCost}
                onClick={() => {
                  if (controllerRef.current?.expandMap()) audioRef.current?.play("reward");
                }}
              >
                <span>Expand hall · plot {snapshot.expansionCount + 1}</span>
                <strong>
                  {snapshot.level < 3 ? "Unlocks at level 3" : money(snapshot.nextExpansionCost)}
                </strong>
                <small>Add 4 × 2 buildable tiles</small>
              </button>
            </div>
          ) : null}

          {selectedContent ? (
            <div className="selection-card">
              <button
                type="button"
                aria-label="Clear selection"
                onClick={() => {
                  setSelectedId(undefined);
                  controllerRef.current?.selectBuildItem(undefined);
                }}
              >
                ×
              </button>
              <span>{"category" in selectedContent ? selectedContent.category : "food stall"}</span>
              <strong>{localize(selectedContent.nameKey)}</strong>
              <p>{localize(selectedContent.descriptionKey)}</p>
              <dl>
                <div><dt>Footprint</dt><dd>{selectedContent.footprint.width} × {selectedContent.footprint.height}</dd></div>
                <div><dt>Price</dt><dd>{money(getContentPrice(selectedContent))}</dd></div>
              </dl>
              {"category" in selectedContent ? (
                <div className="utility-card">
                  <strong>In-game utility</strong>
                  <ul>
                    {utilityEffects(selectedContent).map((effect) => (
                      <li key={effect}>{effect}</li>
                    ))}
                    {utilityEffects(selectedContent).length === 0 ? (
                      <li>
                        {selectedContent.walkability === "blocked"
                          ? "Shapes guest routes and collision-safe queue lines"
                          : "Adds a walk-through visual landmark"}
                      </li>
                    ) : null}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </aside>
      </section>

      <nav className="bottom-dock" aria-label="Game sections" inert={interfaceInert} aria-hidden={interfaceInert}>
        {(
          [
            ["build", "▦", "Build"],
            ["stalls", "▰", "Stalls"],
            ["dishes", "◉", "Dishes"],
            ["insights", "⌁", "Insights"],
          ] as const
        ).map(([value, icon, label]) => (
          <button
            type="button"
            key={value}
            className={panel === value ? "is-active" : ""}
            aria-current={panel === value ? "page" : undefined}
            onClick={() => setPanel(value)}
          >
            <span aria-hidden="true">{icon}</span>
            {label}
          </button>
        ))}
        <span className="dock-divider" />
        <button type="button" onClick={() => void saveNow()}>
          <span aria-hidden="true">▣</span>
          Save now
        </button>
      </nav>

      <div className="connection-badge" data-online={online} inert={interfaceInert} aria-hidden={interfaceInert}>
        <span />
        {online ? (offlineReady ? "Online · offline-ready" : "Online") : "Playing offline"}
      </div>

      <div className="toast-stack" aria-live="polite" aria-atomic="false" inert={interfaceInert} aria-hidden={interfaceInert}>
        {updateReady ? (
          <div className="toast info">
            <span>↻</span>
            <p>A safe update is ready. Save, then reload when convenient.</p>
            <button type="button" onClick={() => void applyReadyUpdate()}>Save &amp; update</button>
          </div>
        ) : null}
        {toasts.map((toast) => (
          <div className={`toast ${toast.kind}`} key={toast.id}>
            <span aria-hidden="true">{toast.kind === "success" ? "✓" : toast.kind === "error" ? "!" : "i"}</span>
            <p>{toast.message}</p>
          </div>
        ))}
      </div>

      {tutorialStep < 5 ? (
        <div className="modal-backdrop tutorial-backdrop" role="presentation">
          <section
            ref={tutorialDialogRef}
            className="tutorial-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tutorial-title"
            tabIndex={-1}
          >
            <div className="tutorial-art" aria-hidden="true">
              <div className="awning"><i /><i /><i /><i /></div>
              <div className="mini-floor">
                <span className="mini-stall" />
                <span className="mini-table one" />
                <span className="mini-table two" />
                <span className="mini-person a" />
                <span className="mini-person b" />
                <span className="mini-plant" />
              </div>
            </div>
            <div className="tutorial-copy">
              <span>{tutorialCopy.eyebrow}</span>
              <h2 id="tutorial-title">{tutorialCopy.title}</h2>
              <p>{tutorialCopy.body}</p>
              <div className="tutorial-dots" aria-label={`Tutorial step ${tutorialStep + 1} of 5`}>
                {TUTORIAL_COPY.map((_, index) => (
                  <i key={index} className={index === tutorialStep ? "is-active" : ""} />
                ))}
              </div>
              <div className="tutorial-actions">
                <button type="button" className="text-button" onClick={() => void finishTutorial(false)}>
                  Skip tutorial
                </button>
                <button
                  type="button"
                  className="primary-button"
                  autoFocus
                  onClick={() => {
                    if (tutorialStep === 4) void finishTutorial(true);
                    else setTutorialStep((tutorialStep + 1) as TutorialStep);
                  }}
                >
                  {tutorialCopy.action} <span aria-hidden="true">→</span>
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {settingsOpen ? (
        <div className="modal-backdrop" role="presentation">
          <section ref={settingsDialogRef} className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title" tabIndex={-1} inert={resetOpen} aria-hidden={resetOpen}>
            <header>
              <div><span>Preferences</span><h2 id="settings-title">Settings</h2></div>
              <button type="button" aria-label="Close settings" onClick={() => setSettingsOpen(false)}>×</button>
            </header>
            <div className="settings-content">
              <fieldset>
                <legend>Performance</legend>
                <label>
                  Quality mode
                  <select
                    value={settings.quality}
                    onChange={(event) => setSettings((current) => ({ ...current, quality: event.target.value as RuntimeSettings["quality"] }))}
                  >
                    <option value="standard">Standard · target 60 FPS</option>
                    <option value="lower-end">Lower-end · target 30 FPS</option>
                  </select>
                </label>
                <label className="switch-row">
                  <span><strong>Reduced motion</strong><small>Calmer camera and fewer ambient animations</small></span>
                  <input type="checkbox" checked={settings.reducedMotion} onChange={(event) => setSettings((current) => ({ ...current, reducedMotion: event.target.checked }))} />
                </label>
              </fieldset>
              <fieldset>
                <legend>Readability</legend>
                <label>
                  Text size <strong>{Math.round(settings.textScale * 100)}%</strong>
                  <input type="range" min="1" max="1.35" step="0.05" value={settings.textScale} onChange={(event) => setSettings((current) => ({ ...current, textScale: Number(event.target.value) }))} />
                </label>
                <label className="switch-row">
                  <span><strong>High contrast</strong><small>Deeper outlines and stronger status patterns</small></span>
                  <input type="checkbox" checked={settings.highContrast} onChange={(event) => setSettings((current) => ({ ...current, highContrast: event.target.checked }))} />
                </label>
              </fieldset>
              <fieldset>
                <legend>Audio</legend>
                <label>Ambient volume <strong>{Math.round(settings.musicVolume * 100)}%</strong><input type="range" min="0" max="1" step="0.05" value={settings.musicVolume} onChange={(event) => setSettings((current) => ({ ...current, musicVolume: Number(event.target.value) }))} /></label>
                <label>Effects volume <strong>{Math.round(settings.sfxVolume * 100)}%</strong><input type="range" min="0" max="1" step="0.05" value={settings.sfxVolume} onChange={(event) => setSettings((current) => ({ ...current, sfxVolume: Number(event.target.value) }))} /></label>
              </fieldset>
              <fieldset>
                <legend>Local data</legend>
                <div className="button-row">
                  <button type="button" onClick={downloadSave}>Export save</button>
                  <button type="button" onClick={() => fileInputRef.current?.click()}>Import save</button>
                  <input ref={fileInputRef} className="sr-only" type="file" accept="application/json" onChange={uploadSave} />
                </div>
                <button type="button" className="danger-button" onClick={() => setResetOpen(true)}>Reset game…</button>
              </fieldset>
            </div>
            <footer><button type="button" className="primary-button" onClick={() => setSettingsOpen(false)}>Done</button></footer>
          </section>
        </div>
      ) : null}

      {helpOpen ? (
        <div className="modal-backdrop" role="presentation">
          <section ref={helpDialogRef} className="help-modal" role="dialog" aria-modal="true" aria-labelledby="help-title" tabIndex={-1}>
            <header><div><span>How to play</span><h2 id="help-title">Neighbourhood guide</h2></div><button type="button" aria-label="Close help" onClick={() => setHelpOpen(false)}>×</button></header>
            <div className="help-grid">
              <article><kbd>Drag</kbd><strong>Pan the map</strong><p>Or use the arrow keys while the world is focused.</p></article>
              <article><kbd>Wheel</kbd><strong>Zoom</strong><p>Use + and − on the keyboard too.</p></article>
              <article><kbd>R</kbd><strong>Rotate</strong><p>Multi-tile footprints preview before purchase.</p></article>
              <article><kbd>Esc</kbd><strong>Cancel</strong><p>Leave build mode without spending anything.</p></article>
              <article><kbd>Space</kbd><strong>Pause</strong><p>The simulation clamps time after a suspended tab.</p></article>
              <article><kbd>U</kbd><strong>Undo</strong><p>Restore the most recent build change safely.</p></article>
            </div>
            <footer><button type="button" onClick={() => { setHelpOpen(false); setTutorialStep(0); }}>Replay tutorial</button><button type="button" className="primary-button" onClick={() => setHelpOpen(false)}>Back to centre</button></footer>
          </section>
        </div>
      ) : null}

      {resetOpen ? (
        <div className="modal-backdrop nested" role="presentation">
          <section ref={resetDialogRef} className="confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="reset-title" aria-describedby="reset-description" tabIndex={-1}>
            <span aria-hidden="true">!</span>
            <h2 id="reset-title">Reset this centre?</h2>
            <p id="reset-description">This removes the local save and starts again. Export first if you may want it later.</p>
            <div><button type="button" onClick={() => setResetOpen(false)}>Keep playing</button><button type="button" className="danger-button" onClick={() => void confirmReset()}>Reset game</button></div>
          </section>
        </div>
      ) : null}

      {debugEnabled ? (
        <section className={debugOpen ? "debug-panel is-open" : "debug-panel"} aria-label="Developer tools" inert={interfaceInert} aria-hidden={interfaceInert}>
          <button type="button" onClick={() => setDebugOpen((value) => !value)}>Debug {debugOpen ? "×" : "+"}</button>
          {debugOpen ? (
            <div>
              <code>{snapshot.fps.toFixed(0)} FPS · {snapshot.simulationMs.toFixed(2)} ms sim</code>
              <button type="button" onClick={() => controllerRef.current?.setDebugOverlay(true)}>Show grid data</button>
              <button type="button" onClick={() => controllerRef.current?.spawnCustomer()}>Spawn customer</button>
              <button type="button" onClick={() => controllerRef.current?.addCash(1_000)}>+ $1,000</button>
            </div>
          ) : null}
        </section>
      ) : null}

      <p className="sr-only" aria-live="polite">
        {snapshot.activeCustomers} guests active. {snapshot.freeSeats} seats free. Cash {money(snapshot.cash)}.
      </p>
    </main>
  );
}
