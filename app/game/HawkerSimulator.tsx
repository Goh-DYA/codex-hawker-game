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
  getNutritionProfile,
  PLACEABLES,
  STALLS,
  validateContent,
  type DishDefinition,
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
import { defaultStallMenusForProgression } from "@/src/game/runtime/stallMenus";
import {
  activityEntryMessage,
  appendActivityEvent,
  shouldShowPopup,
  type ActivityEntry,
} from "@/src/game/runtime/activityFeed";
import {
  CUSTOMER_INDICATOR_LEGEND,
  visualRecipeForDish,
  visualRecipeForPlaceable,
  type CustomerIndicator,
} from "@/src/game/runtime/visualRecipes";
import type {
  BuildTool,
  GameSpeed,
  RuntimeController,
  RuntimeEvent,
  RuntimeSettings,
  RuntimeSnapshot,
} from "@/src/game/runtime/types";
import {
  customerVariantLabel,
  CustomerNutritionInspector,
  dialogFocusAction,
  NutritionDisclosure,
  NutritionProfileSummary,
  NutritionPulseCard,
  VariantLabDialog,
  type CustomerNutritionView,
  type NutritionFamilyView,
  type NutritionProfileView,
  type NutritionPulseView,
} from "./NutritionEducation";

const INITIAL_LEVEL = 1;
const INITIAL_REPUTATION = 8;

const INITIAL_SNAPSHOT: RuntimeSnapshot = {
  cash: 4_200,
  reputation: INITIAL_REPUTATION,
  level: INITIAL_LEVEL,
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
  hasSatisfactionRatings: false,
  satisfactionTips: [],
  queuePressure: 0,
  queueFlowState: "good",
  queueFlowMessage: "No queues are forming and every stall approach is clear.",
  freeSeats: 8,
  totalSeats: 8,
  cleanliness: 100,
  trayReturnStations: 1,
  buildTool: "select",
  routeGuidePoints: [],
  unlockedContentIds: [],
  stallMenus: defaultStallMenusForProgression({
    level: INITIAL_LEVEL,
    reputation: INITIAL_REPUTATION,
  }),
  activeDishVariants: {},
  nutritionFamilies: [],
  nutritionPulse: {
    servedMeals: 0,
    profiledMeals: 0,
    intentRequests: 0,
    intentMatches: 0,
    intentMisses: 0,
    intentUnknowns: 0,
    averages: {},
    knownCounts: {
      energyKcal: 0,
      proteinG: 0,
      dietaryFibreG: 0,
      sodiumMg: 0,
    },
  },
  placedStalls: [],
  canUndo: false,
  objectiveProgress: 0,
  objectiveTarget: 5,
  objectives: [],
  objectiveRefreshLabel: "8h 0m",
  claimedMilestoneCount: 0,
  milestoneTracks: [],
  stallMastery: [],
  accessPoints: [
    { id: "entrance-1", kind: "entrance", position: { x: 0, y: 7 } },
    { id: "exit-1", kind: "exit", position: { x: 23, y: 7 } },
  ],
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
  ambienceVolume: 0.24,
  sfxVolume: 0.55,
  masterMuted: false,
};

function normalizeSettings(
  value: unknown,
  defaults: RuntimeSettings = DEFAULT_SETTINGS,
): RuntimeSettings {
  if (!value || typeof value !== "object") return defaults;
  const record = value as Partial<Record<keyof RuntimeSettings, unknown>>;
  const number = (key: "textScale" | "musicVolume" | "ambienceVolume" | "sfxVolume", fallback: number) =>
    typeof record[key] === "number" && Number.isFinite(record[key])
      ? Number(record[key])
      : fallback;
  return {
    quality: record.quality === "lower-end" ? "lower-end" : "standard",
    reducedMotion:
      typeof record.reducedMotion === "boolean"
        ? record.reducedMotion
        : defaults.reducedMotion,
    highContrast:
      typeof record.highContrast === "boolean"
        ? record.highContrast
        : defaults.highContrast,
    textScale: Math.max(1, Math.min(1.35, number("textScale", 1))),
    musicVolume: Math.max(0, Math.min(1, number("musicVolume", 0.32))),
    ambienceVolume: Math.max(0, Math.min(1, number("ambienceVolume", number("musicVolume", 0.24)))),
    sfxVolume: Math.max(0, Math.min(1, number("sfxVolume", 0.55))),
    masterMuted: typeof record.masterMuted === "boolean" ? record.masterMuted : false,
  };
}

type Panel = "focus" | "build" | "stalls" | "dishes" | "insights" | "activity";
type TutorialStep = 0 | 1 | 2 | 3 | 4 | 5;
type NutritionTourStep = 0 | 1 | 2;

const PANEL_COPY: Readonly<Record<Panel, { kicker: string; title: string }>> = {
  focus: { kicker: "Today at a glance", title: "Focus" },
  build: { kicker: "Build catalogue", title: "Make it yours" },
  stalls: { kicker: "Food & drink", title: "Stalls" },
  dishes: { kicker: "Dishes & nutrition", title: "Menu planning" },
  insights: { kicker: "Service review", title: "Centre insights" },
  activity: { kicker: "Recent events", title: "Activity" },
};

const EMPTY_NUTRITION_PULSE = {
  servedMeals: 0,
  profiledMeals: 0,
  intentRequests: 0,
  intentMatches: 0,
  intentMisses: 0,
  intentUnknowns: 0,
  averages: {},
  knownCounts: {
    energyKcal: 0,
    proteinG: 0,
    dietaryFibreG: 0,
    sodiumMg: 0,
  },
} as const;

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

type CustomerLegendSymbol = CustomerIndicator | "patience";

function CustomerIndicatorIcon({ indicator }: { indicator: CustomerLegendSymbol }) {
  if (indicator === "patience") {
    return (
      <svg
        className="customer-indicator-icon is-patience"
        viewBox="0 0 24 24"
        aria-hidden="true"
        focusable="false"
      >
        <circle cx="12" cy="12" r="3.5" fill="currentColor" opacity="0.28" />
        <circle
          cx="12"
          cy="12"
          r="8"
          fill="none"
          stroke="#e8b94f"
          strokeWidth="2.5"
          strokeDasharray="30 21"
          transform="rotate(-90 12 12)"
        />
        <circle
          cx="12"
          cy="12"
          r="8"
          fill="none"
          stroke="#c75542"
          strokeWidth="2.5"
          strokeDasharray="10 41"
          strokeDashoffset="-31"
          transform="rotate(-90 12 12)"
        />
      </svg>
    );
  }

  let glyph;
  if (indicator === "question") {
    glyph = (
      <>
        <circle cx="12" cy="9" r="3.5" />
        <circle cx="12" cy="17" r="1.5" fill="currentColor" stroke="none" />
      </>
    );
  } else if (indicator === "footsteps") {
    glyph = (
      <>
        <ellipse cx="8.5" cy="14" rx="1.8" ry="3.6" fill="currentColor" stroke="none" />
        <ellipse cx="15.5" cy="10" rx="1.8" ry="3.6" fill="currentColor" stroke="none" />
      </>
    );
  } else if (indicator === "queue") {
    glyph = [7, 12, 17].map((cx) => (
      <circle key={cx} cx={cx} cy="12" r="1.7" fill="currentColor" stroke="none" />
    ));
  } else if (indicator === "order") {
    glyph = (
      <>
        <rect x="6" y="6.5" width="12" height="8.5" rx="2" />
        <path d="M10 15 8 19 8.5 15" />
      </>
    );
  } else if (indicator === "clock") {
    glyph = (
      <>
        <circle cx="12" cy="12" r="6" />
        <path d="M12 12V8M12 12l4 2" />
      </>
    );
  } else if (indicator === "seat") {
    glyph = <path d="M7 6v11M7 13h10M17 13v5" />;
  } else if (indicator === "meal") {
    glyph = (
      <>
        <circle cx="13" cy="12" r="5.5" />
        <path d="M6 6v12" />
      </>
    );
  } else if (indicator === "return") {
    glyph = <path d="M18 12H6m0 0 4-4m-4 4 4 4" />;
  } else {
    glyph = <path d="M6 12h12m0 0-4-4m4 4-4 4" />;
  }

  return (
    <svg
      className={`customer-indicator-icon is-${indicator}`}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <circle className="customer-indicator-bubble" cx="12" cy="12" r="10" />
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {glyph}
      </g>
    </svg>
  );
}

function CustomerStatusLegend() {
  return (
    <div className="customer-status-legend">
      <p>The bubble above each customer shows what they are doing now.</p>
      <ul data-testid="customer-status-legend">
        {CUSTOMER_INDICATOR_LEGEND.map((entry) => (
          <li key={entry.indicator}>
            <CustomerIndicatorIcon indicator={entry.indicator} />
            <span>
              <strong>{entry.label}</strong>
              <small>{entry.description}</small>
            </span>
          </li>
        ))}
        <li>
          <CustomerIndicatorIcon indicator="patience" />
          <span>
            <strong>Patience ring</strong>
            <small>
              Shows patience remaining from the queue. It turns red when low and remains visible
              while food is prepared.
            </small>
          </span>
        </li>
      </ul>
    </div>
  );
}

function CustomerStatusGuide() {
  const [open, setOpen] = useState(false);

  return (
    <section className="settings-guide" aria-label="Customer status icon guide">
      <button
        type="button"
        aria-label="Customer status bubbles"
        aria-expanded={open}
        aria-controls="customer-status-legend-content"
        onClick={() => setOpen((current) => !current)}
      >
        <span>
          <strong>Customer status bubbles</strong>
          <small>See what every on-map symbol means</small>
        </span>
      </button>
      {open ? (
        <div id="customer-status-legend-content">
          <CustomerStatusLegend />
        </div>
      ) : null}
    </section>
  );
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
};

type DishPreviewStyle = CSSProperties & {
  "--dish-portion": string;
  "--dish-garnish": string;
};

function placeablePreview(item: PlaceableDefinition): {
  recipe: ReturnType<typeof visualRecipeForPlaceable>;
  style: PreviewStyle;
} {
  const recipe = visualRecipeForPlaceable(item.id, item.category, item.tags);
  return {
    recipe,
    style: {
      "--preview-accent": `#${recipe.accent.toString(16).padStart(6, "0")}`,
    },
  };
}

function dishPresentation(recipe: ReturnType<typeof visualRecipeForDish>) {
  const presentation = recipe.presentation;
  if (presentation.vessel === "tall-drinking-glass") return "tall-drink";
  if (presentation.vessel === "kopitiam-cup-and-saucer") return "mug";
  return {
    "rice-mound": "composed-rice",
    porridge: "porridge",
    "noodle-tangle": "noodles",
    broth: "soup",
    liquid: "mug",
    "shaved-ice": "shaved-dessert",
    flatbread: presentation.motif.includes("thosai") ? "rolled-bread" : "flatbread",
    "cake-cubes": "fried-plate",
    omelette: "fried-plate",
    fritters: "small-cakes",
    dumplings: "dumplings",
    skewers: "skewers",
    "grilled-pieces": "grilled",
    pudding: "porridge",
    "whole-seafood": "seafood",
    "leaf-parcel": "leaf-parcel",
    buns: "dumplings",
  }[presentation.portionShape];
}

function dishPreview(dish: (typeof DISHES)[number]): {
  recipe: ReturnType<typeof visualRecipeForDish>;
  presentation: string;
  style: DishPreviewStyle;
} {
  const recipe = visualRecipeForDish(dish);
  return {
    recipe,
    presentation: dishPresentation(recipe),
    style: {
      "--dish-portion": `#${recipe.portionColour.toString(16).padStart(6, "0")}`,
      "--dish-garnish": `#${recipe.garnishColour.toString(16).padStart(6, "0")}`,
    },
  };
}

function nutritionProfileView(
  dishId: string,
  variantId?: string,
): NutritionProfileView | undefined {
  const profile = getNutritionProfile(dishId, variantId);
  if (!profile) return undefined;
  return {
    status: profile.status,
    servingLabel: profile.serving?.label,
    energyKcal: profile.nutrients.energyKcal,
    proteinG: profile.nutrients.proteinG,
    dietaryFibreG: profile.nutrients.dietaryFibreG,
    sodiumMg: profile.nutrients.sodiumMg,
    totalSugarG: profile.nutrients.totalSugarG,
    intentFits: profile.intentFits,
  };
}

function dishLabel(dishId: string) {
  const dish = DISHES.find((candidate) => candidate.id === dishId);
  return dish ? localize(dish.nameKey) : dishId.replace(/^dish\./, "").replaceAll("-", " ");
}

function personaLabel(archetypeId: string) {
  const archetype = CUSTOMER_ARCHETYPES.find((candidate) => candidate.id === archetypeId);
  return archetype
    ? localize(archetype.nameKey)
    : archetypeId.replace(/^customer\./, "").replaceAll("-", " ");
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
    effects.push(`Walking speed ${signedEffect(resolved.movementSpeed * 100, "%")}`);
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
const CUSTOMER_PERSONAS_BY_UNLOCK = [...CUSTOMER_ARCHETYPES].sort(
  (left, right) =>
    left.unlockRequirement.level - right.unlockRequirement.level ||
    left.unlockRequirement.reputation - right.unlockRequirement.reputation ||
    left.id.localeCompare(right.id, "en-SG"),
);

function unlockLabel(
  item: Pick<PlaceableDefinition | StallDefinition | DishDefinition, "nameKey" | "unlockRequirement">,
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
    title: "Run the centre. Read the plate.",
    body: "Your community dining hall is ready for its first lunch crowd. Every choice changes how people move, queue, eat, and compare menu trade-offs.",
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
    body: "Dotted paths show routes. Numbered queue markers show pressure. Seat rings show reservations. Centre insights explains every bottleneck.",
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
  const activitySequenceRef = useRef(0);
  const panelRef = useRef<Panel>("build");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const tutorialDialogRef = useRef<HTMLElement>(null);
  const nutritionTourDialogRef = useRef<HTMLElement>(null);
  const cataloguePanelRef = useRef<HTMLElement>(null);
  const settingsDialogRef = useRef<HTMLElement>(null);
  const helpDialogRef = useRef<HTMLElement>(null);
  const resetDialogRef = useRef<HTMLElement>(null);
  const managementReturnFocusRef = useRef<HTMLElement | null>(null);

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
  const [nutritionTourStep, setNutritionTourStep] = useState<NutritionTourStep>(2);
  const [nutritionLens, setNutritionLens] = useState(true);
  const [variantLabDishId, setVariantLabDishId] = useState<string>();
  const [managementOpen, setManagementOpen] = useState(false);
  const [compactManagement, setCompactManagement] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [activityEntries, setActivityEntries] = useState<readonly ActivityEntry[]>([]);
  const [activityUnread, setActivityUnread] = useState(0);
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
    const activityId = ++activitySequenceRef.current;
    setActivityEntries((current) => appendActivityEvent(current, event, activityId));
    if (panelRef.current !== "activity") {
      setActivityUnread((current) => Math.min(99, current + 1));
    }
    if (!shouldShowPopup(event)) return;
    const id = ++toastSequenceRef.current;
    setToasts([{ ...event, id }]);
    window.setTimeout(
      () => setToasts((current) => current.filter((toast) => toast.id !== id)),
      event.kind === "error" ? 6_000 : 3_400,
    );
  }, []);

  useEffect(() => {
    panelRef.current = panel;
  }, [panel]);

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
        let completedNutritionTour = false;
        let savedNutritionLens = true;
        let initialStates: readonly unknown[] = [];
        try {
          const initialSettings = {
            ...DEFAULT_SETTINGS,
            reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
          };
          savedSettings = normalizeSettings(
            await loadPreference<unknown>("settings", undefined),
            initialSettings,
          );
          completedTutorial =
            (await loadPreference<unknown>("tutorial-complete", false)) === true;
          completedNutritionTour =
            (await loadPreference<unknown>("nutrition-tour-v1-complete", false)) === true;
          savedNutritionLens =
            (await loadPreference<unknown>("nutrition-lens-enabled", true)) !== false;
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
        setNutritionTourStep(completedNutritionTour ? 2 : 0);
        setNutritionLens(savedNutritionLens);
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
            audioRef.current?.setGameplayState(
              nextSnapshot.isOpen,
              nextSnapshot.activeCustomers,
              nextSnapshot.queuePressure,
            );
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
    controllerRef.current?.setHighContrast(settings.highContrast);
    audioRef.current?.setVoiceLimit(settings.quality === "standard" ? 16 : 8);
    audioRef.current?.setVolumes(
      settings.musicVolume,
      settings.ambienceVolume,
      settings.sfxVolume,
      settings.masterMuted,
    );
    void savePreference("settings", settings).catch(() =>
      reportStorageIssue("Preferences could not be saved on this device."),
    );
  }, [reportStorageIssue, settings]);

  useEffect(() => {
    if (loading) return;
    void savePreference("nutrition-lens-enabled", nutritionLens).catch(() =>
      reportStorageIssue("Nutrition Lens preference could not be saved."),
    );
  }, [loading, nutritionLens, reportStorageIssue]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 899px)");
    const updateCompactManagement = () => setCompactManagement(mediaQuery.matches);
    updateCompactManagement();
    mediaQuery.addEventListener("change", updateCompactManagement);
    return () => mediaQuery.removeEventListener("change", updateCompactManagement);
  }, []);

  useEffect(() => {
    const modal = resetOpen
      ? resetDialogRef.current
      : settingsOpen
        ? settingsDialogRef.current
          : helpOpen
            ? helpDialogRef.current
            : tutorialStep < 5
              ? tutorialDialogRef.current
              : nutritionTourStep < 2
                ? nutritionTourDialogRef.current
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
        else if (tutorialStep < 5) {
          setTutorialStep(5);
          void savePreference("tutorial-complete", true).catch(() =>
            reportStorageIssue("Tutorial progress could not be saved."),
          );
        } else {
          setNutritionTourStep(2);
          void savePreference("nutrition-tour-v1-complete", true).catch(() =>
            reportStorageIssue("Nutrition tour progress could not be saved."),
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
  }, [helpOpen, nutritionTourStep, reportStorageIssue, resetOpen, settingsOpen, tutorialStep]);

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

  function chooseRouteTool() {
    const nextTool: BuildTool = snapshot.buildTool === "route" ? "select" : "route";
    chooseTool(nextTool);
    if (nextTool === "route") {
      window.requestAnimationFrame(() => gameHostRef.current?.focus());
    }
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

  async function finishNutritionTour() {
    setNutritionTourStep(2);
    await savePreference("nutrition-tour-v1-complete", true).catch(() =>
      reportStorageIssue("Nutrition tour progress could not be saved."),
    );
  }

  function openPanel(nextPanel: Panel, returnFocus?: HTMLElement) {
    if (
      !managementOpen &&
      window.matchMedia("(max-width: 899px)").matches
    ) {
      managementReturnFocusRef.current =
        returnFocus ?? document.activeElement as HTMLElement | null;
    }
    setPanel(nextPanel);
    setManagementOpen(true);
    if (nextPanel === "activity") setActivityUnread(0);
  }

  function closeManagementSheet() {
    setManagementOpen(false);
    controllerRef.current?.selectCustomer(undefined);
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
    link.download = `hawker-balance-day-${snapshot.day}.json`;
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
      const controller = controllerRef.current;
      if (!controller) throw new Error("The game is not ready to import a save.");
      controller.importState(payload);
      await performSave(controller.exportState());
      announce({ kind: "success", message: "Save imported and checked.", importance: "important" });
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
    setNutritionTourStep(0);
    await savePreference("tutorial-complete", false).catch(() =>
      reportStorageIssue("Tutorial progress could not be reset."),
    );
    await savePreference("nutrition-tour-v1-complete", false).catch(() =>
      reportStorageIssue("Nutrition tour progress could not be reset."),
    );
    announce({ kind: "info", message: "A fresh centre is ready." });
  }

  const tutorialCopy = TUTORIAL_COPY[Math.min(tutorialStep, 4)]!;
  const nutritionRuntime = snapshot as RuntimeSnapshot & {
    readonly nutritionFamilies?: readonly NutritionFamilyView[];
    readonly nutritionPulse?: NutritionPulseView;
    readonly selectedCustomerNutrition?: CustomerNutritionView;
  };
  const nutritionFamilies = nutritionRuntime.nutritionFamilies ?? [];
  const nutritionPulse = nutritionRuntime.nutritionPulse ?? EMPTY_NUTRITION_PULSE;
  const selectedCustomerNutrition = nutritionRuntime.selectedCustomerNutrition;
  const managementSheetOpen = compactManagement && (
    managementOpen || Boolean(selectedCustomerNutrition)
  );
  const variantLabFamily = variantLabDishId
    ? nutritionFamilies.find((family) => family.dishId === variantLabDishId)
    : undefined;
  const interfaceInert =
    tutorialStep < 5 ||
    nutritionTourStep < 2 ||
    settingsOpen ||
    helpOpen ||
    resetOpen ||
    Boolean(variantLabFamily);

  useEffect(() => {
    if (!managementSheetOpen) return;
    const sheet = cataloguePanelRef.current;
    if (!sheet) return;
    if (!managementReturnFocusRef.current) {
      managementReturnFocusRef.current = document.activeElement as HTMLElement | null;
    }
    const focusableSelector = [
      "button:not([disabled])",
      "input:not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      "[href]",
      "summary",
      "[tabindex]:not([tabindex='-1'])",
    ].join(",");
    const focusables = () =>
      Array.from(sheet.querySelectorAll<HTMLElement>(focusableSelector)).filter(
        (element) => !element.hidden && element.getAttribute("aria-hidden") !== "true",
      );
    const initialFocusFrame = window.requestAnimationFrame(() => {
      const inspectorClose = sheet.querySelector<HTMLElement>(
        ".customer-nutrition-inspector button",
      );
      (inspectorClose ?? focusables()[0] ?? sheet).focus();
    });
    const handleSheetKeys = (event: KeyboardEvent) => {
      const activeModal = (document.activeElement as HTMLElement | null)?.closest(
        "[aria-modal='true']",
      );
      if (activeModal && activeModal !== sheet) return;
      const available = focusables();
      const first = available[0];
      const last = available.at(-1);
      const activeElement = document.activeElement;
      const action = dialogFocusAction(
        event.key,
        event.shiftKey,
        available.length,
        activeElement === first || !sheet.contains(activeElement),
        activeElement === last || !sheet.contains(activeElement),
      );
      if (action === "close") {
        event.preventDefault();
        setManagementOpen(false);
        controllerRef.current?.selectCustomer(undefined);
      } else if (action === "container") {
        event.preventDefault();
        sheet.focus();
      } else if (action === "last") {
        event.preventDefault();
        last?.focus();
      } else if (action === "first") {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", handleSheetKeys);
    return () => {
      window.cancelAnimationFrame(initialFocusFrame);
      document.removeEventListener("keydown", handleSheetKeys);
      const shouldRestore = sheet.contains(document.activeElement);
      const returnFocus = managementReturnFocusRef.current;
      managementReturnFocusRef.current = null;
      if (shouldRestore) {
        window.requestAnimationFrame(() => returnFocus?.focus());
      }
    };
  }, [managementSheetOpen]);
  const unlockedCustomerCount = CUSTOMER_ARCHETYPES.filter(
    (customer) =>
      customer.unlockRequirement.level <= snapshot.level &&
      customer.unlockRequirement.reputation <= snapshot.reputation &&
      customer.unlockRequirement.prerequisiteIds.every((id) =>
        snapshot.unlockedContentIds.includes(id),
      ),
  ).length;

  return (
    <main
      className="game-shell"
      data-contrast={settings.highContrast ? "high" : "normal"}
      data-motion={settings.reducedMotion ? "reduced" : "full"}
      data-management-open={managementOpen || Boolean(selectedCustomerNutrition)}
      onPointerDown={unlockAudio}
    >
      <header className="topbar" inert={interfaceInert} aria-hidden={interfaceInert}>
        <div className="brand-lockup" aria-label="Hawker Balance">
          <span className="brand-mark" aria-hidden="true">
            <span />
          </span>
          <div>
            <p>Nutrition edition</p>
            <h1>Hawker Balance</h1>
            <span className="brand-tagline">Run the centre. Read the plate.</span>
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
            {([0, 1, 2, 4, 10] as const).map((speed) => (
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
            aria-label="Open settings and icon guide"
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
              <span>Refresh {snapshot.objectiveRefreshLabel}</span>
            </div>
            <h2>Three ways to grow</h2>
            <div className="objective-list">
              {snapshot.objectives.map((objective) => (
                <article key={objective.id} data-complete={objective.completed}>
                  <strong>{objective.completed ? "✓ " : ""}{objective.title}</strong>
                  <p>{objective.description}</p>
                  <div className="objective-progress"><span style={{ width: `${Math.min(100, (objective.progress / Math.max(1, objective.target)) * 100)}%` }} /></div>
                  <small>{Math.round(objective.progress)} / {objective.target} · ${objective.rewardCash} + {objective.rewardXp} XP</small>
                </article>
              ))}
              {snapshot.objectives.length === 0 ? <small>Opening today&apos;s objective board…</small> : null}
            </div>
          </section>

          <NutritionPulseCard
            compact
            pulse={nutritionPulse}
            dishLabel={dishLabel}
            onReview={() => openPanel("dishes")}
          />

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
              <span className={snapshot.buildTool === "place" || snapshot.buildTool === "queue" || snapshot.buildTool === "access" || snapshot.buildTool === "route" ? "amber-dot" : "green-dot"} />
              {snapshot.buildTool === "place"
                ? "Build mode"
                : snapshot.buildTool === "queue"
                  ? "Queue editor"
                  : snapshot.buildTool === "access"
                    ? "Access editor"
                    : snapshot.buildTool === "route"
                      ? "Route editor"
                      : snapshot.isOpen
                        ? "Centre open"
                        : "Planning mode"}
            </div>
            <div className="world-message" aria-live="polite">
              {snapshot.buildTool === "queue"
                ? "Queue editor: choose adjacent clear tiles to bend the line; Escape finishes"
                : snapshot.buildTool === "access"
                  ? "Access editor: choose an entry or exit, then choose a boundary tile"
                : snapshot.buildTool === "route"
                  ? "Route editor: choose clear floor tiles to guide guests; choose a guide again to remove it; Escape finishes"
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
              <button
                type="button"
                aria-pressed={snapshot.buildTool === "access"}
                className={snapshot.buildTool === "access" ? "is-active" : ""}
                onClick={() => chooseTool(snapshot.buildTool === "access" ? "select" : "access")}
              >
                {snapshot.buildTool === "access" ? "Finish access" : "Access"}
              </button>
              <button
                type="button"
                aria-pressed={snapshot.buildTool === "route"}
                className={snapshot.buildTool === "route" ? "is-active" : ""}
                onClick={chooseRouteTool}
              >
                {snapshot.buildTool === "route" ? "Finish route" : "Route"}
              </button>
              {snapshot.buildTool === "access" ? (
                <>
                  <button type="button" onClick={() => controllerRef.current?.addAccessPoint("entrance")}>+ Entry</button>
                  <button type="button" onClick={() => controllerRef.current?.addAccessPoint("exit")}>+ Exit</button>
                  <button type="button" disabled={!snapshot.selectedAccessPointId} onClick={() => controllerRef.current?.removeSelectedAccessPoint()}>Remove access</button>
                </>
              ) : null}
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
              aria-label={snapshot.buildTool === "route"
                ? "Guest route editor. Use arrow keys to move the route cursor, Enter to add or remove a preferred route guide, and Escape to finish."
                : "Interactive hawker centre. Use arrow keys to move the cursor. Enter selects a guest or places the current item, R rotates, and Escape clears the selection."}
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
              <span><i className="legend-preferred-route" /> Preferred route guide</span>
              <span><i className="legend-predicted-route" /> Predicted guest path</span>
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
              {snapshot.buildTool === "route" ? (
                <>
                  <button
                    type="button"
                    disabled={!snapshot.canUndo}
                    onClick={() => controllerRef.current?.undo()}
                  >
                    ↶ Undo
                  </button>
                  <button
                    type="button"
                    disabled={snapshot.routeGuidePoints.length === 0}
                    onClick={() => controllerRef.current?.clearGuestRoute()}
                  >
                    Clear route
                  </button>
                  <button type="button" onClick={() => chooseTool("select")}>
                    Finish <kbd>Esc</kbd>
                  </button>
                </>
              ) : (
                <>
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
                </>
              )}
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

        <aside
          ref={cataloguePanelRef}
          className="catalogue-panel"
          aria-label={`${PANEL_COPY[panel].title} panel`}
          aria-modal={managementSheetOpen || undefined}
          role={managementSheetOpen ? "dialog" : undefined}
          tabIndex={managementSheetOpen ? -1 : undefined}
        >
          <div className="catalogue-heading">
            <div>
              <span>{PANEL_COPY[panel].kicker}</span>
              <h2>{PANEL_COPY[panel].title}</h2>
            </div>
            <span className="count-badge">
              {panel === "stalls"
                ? STALLS.length
                : panel === "dishes"
                  ? DISHES.length
                  : panel === "focus"
                    ? snapshot.objectives.length
                  : panel === "insights"
                    ? snapshot.activeCustomers
                    : panel === "activity"
                      ? activityEntries.length
                      : PLACEABLES.length}
            </span>
            <button
              type="button"
              className="sheet-close-button"
              aria-label="Close management sheet"
              onClick={closeManagementSheet}
            >
              ×
            </button>
          </div>

          {panel === "focus" ? (
            <div className="focus-panel">
              <section className="objective-card">
                <div className="card-kicker">
                  <span>Today&apos;s focus</span>
                  <span>Refresh {snapshot.objectiveRefreshLabel}</span>
                </div>
                <h2>Three ways to grow</h2>
                <div className="objective-list">
                  {snapshot.objectives.map((objective) => (
                    <article key={objective.id} data-complete={objective.completed}>
                      <strong>{objective.completed ? "✓ " : ""}{objective.title}</strong>
                      <p>{objective.description}</p>
                      <div className="objective-progress">
                        <span style={{ width: `${Math.min(100, (objective.progress / Math.max(1, objective.target)) * 100)}%` }} />
                      </div>
                      <small>{Math.round(objective.progress)} / {objective.target} · ${objective.rewardCash} + {objective.rewardXp} XP</small>
                    </article>
                  ))}
                  {snapshot.objectives.length === 0 ? <small>Opening today&apos;s objective board…</small> : null}
                </div>
              </section>
              <NutritionPulseCard
                pulse={nutritionPulse}
                dishLabel={dishLabel}
                onReview={() => openPanel("dishes")}
              />
              <section className="service-pulse-card" aria-label="Service pulse">
                <h3>Service pulse</h3>
                <dl>
                  <div><dt>Guests inside</dt><dd>{snapshot.activeCustomers}</dd></div>
                  <div><dt>Free seats</dt><dd>{snapshot.freeSeats}/{snapshot.totalSeats}</dd></div>
                  <div><dt>Happiness</dt><dd>{snapshot.hasSatisfactionRatings ? `${Math.round(snapshot.averageSatisfaction)}%` : "—"}</dd></div>
                  <div><dt>Cleanliness</dt><dd>{Math.round(snapshot.cleanliness)}%</dd></div>
                </dl>
              </section>
              <NutritionDisclosure />
            </div>
          ) : null}

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
                        data-motif={preview.recipe.motif}
                        data-form={preview.recipe.form}
                        data-material={preview.recipe.material}
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
                        {snapshot.stallMastery.filter((mastery) => mastery.definitionId === placed.definitionId).map((mastery) => (
                          <small key={mastery.definitionId}>Mastery rank {mastery.rank} · Upgrade {mastery.upgradeLevel}/4</small>
                        ))}
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
                      {snapshot.stallMastery.filter((mastery) => mastery.definitionId === placed.definitionId && mastery.nextUpgradeCost !== undefined).map((mastery) => (
                        <button
                          type="button"
                          key={`upgrade-${mastery.definitionId}`}
                          className="stall-upgrade-button"
                          disabled={mastery.rank < (mastery.requiredRank ?? 1) || snapshot.cash < (mastery.nextUpgradeCost ?? 0)}
                          onClick={() => controllerRef.current?.upgradeStall(mastery.definitionId)}
                        >
                          <span className="stall-upgrade-copy">
                            Upgrade to level {mastery.upgradeLevel + 1}
                            <small>Requires mastery rank {mastery.requiredRank}</small>
                          </span>
                          <strong>{money(mastery.nextUpgradeCost ?? 0)}</strong>
                        </button>
                      ))}
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
                      data-stall={stall.id.slice("stall.".length)}
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
              <div className="nutrition-lens-toolbar">
                <label>
                  <span>Nutrition Lens</span>
                  <input
                    type="checkbox"
                    checked={nutritionLens}
                    onChange={(event) => setNutritionLens(event.target.checked)}
                  />
                </label>
                <p>Compare values per listed serving.</p>
              </div>
              {STALLS.filter((stall) => stall.id === menuStallId).map((stall) => {
                const activeMenu = snapshot.stallMenus[stall.id] ?? [];
                const mastery = snapshot.stallMastery.find((candidate) => candidate.definitionId === stall.id);
                const upgrade = stall.upgradeLevels.find((candidate) => candidate.level === mastery?.upgradeLevel);
                const menuSlots = stall.menuSlots + (upgrade?.menuSlotsBonus ?? 0);
                return (
                  <div className="dish-list" key={stall.id}>
                    <p className="menu-capacity">
                      {activeMenu.length} of {menuSlots} menu slots active
                    </p>
                    {DISHES.filter((dish) => dish.stallIds.includes(stall.id)).map((dish) => {
                      const checked = activeMenu.includes(dish.id);
                      const preview = dishPreview(dish);
                      const gated =
                        dish.unlockRequirement.level > snapshot.level ||
                        dish.unlockRequirement.reputation > snapshot.reputation ||
                        dish.unlockRequirement.prerequisiteIds.some(
                          (id) => !snapshot.unlockedContentIds.includes(id),
                        );
                      const atCapacity = !checked && activeMenu.length >= menuSlots;
                      const unavailableReason = gated
                        ? unlockLabel(
                            dish,
                            snapshot.level,
                            snapshot.reputation,
                            snapshot.unlockedContentIds,
                          )
                        : atCapacity
                          ? `All ${menuSlots} menu slots are active`
                          : undefined;
                      const reasonId = `dish-menu-reason-${dish.id.slice("dish.".length)}`;
                      const dishTitleId = `dish-menu-title-${dish.id.slice("dish.".length)}`;
                      const nutritionFamily = nutritionFamilies.find(
                        (family) => family.dishId === dish.id,
                      );
                      const activeVariant = nutritionFamily?.variants.find(
                        (variant) => variant.id === nutritionFamily.activeVariantId,
                      );
                      const profile = activeVariant?.profile
                        ?? nutritionProfileView(dish.id, activeVariant?.id);
                      return (
                        <article
                          key={dish.id}
                          className="dish-row menu-dish-row"
                          aria-labelledby={dishTitleId}
                        >
                          <span
                            className="dish-preview"
                            data-dish={dish.id.slice("dish.".length)}
                            data-variant={activeVariant?.visualKey}
                            data-form={preview.recipe.foodForm}
                            data-motif={preview.recipe.presentation.motif}
                            data-presentation={preview.presentation}
                            data-semantic={preview.recipe.presentation.semanticKey}
                            data-vessel={preview.recipe.presentation.vessel}
                            style={preview.style}
                            aria-hidden="true"
                          >
                            <i className="dish-preview-portion" />
                            <i className="dish-preview-garnish" />
                            <i className="dish-preview-side" />
                          </span>
                          <div className="dish-menu-main">
                            <h3 id={dishTitleId}>{localize(dish.nameKey)}</h3>
                            <small>
                              {dish.category.replace("-", " ")} · {money(dish.price)} · demand {Math.round(dish.baseDemand * 100)}%
                            </small>
                            {activeVariant ? <small>Serving: {activeVariant.label}</small> : null}
                          </div>
                          {nutritionLens ? <NutritionProfileSummary profile={profile} /> : null}
                          <div className="dish-menu-actions">
                            <button
                              type="button"
                              aria-label={`View nutrition for ${localize(dish.nameKey)}`}
                              onClick={() => setNutritionLens(true)}
                            >
                              View nutrition
                            </button>
                            {nutritionFamily ? (
                              <button
                                type="button"
                                aria-label={`Tune recipe for ${localize(dish.nameKey)}`}
                                onClick={() => setVariantLabDishId(dish.id)}
                              >
                                Tune recipe
                              </button>
                            ) : null}
                            <label className="dish-offer-control">
                              <span>Offer</span>
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={Boolean(unavailableReason)}
                                aria-label={`Offer ${localize(dish.nameKey)}${unavailableReason ? `, unavailable: ${unavailableReason}` : ""}`}
                                aria-describedby={unavailableReason ? reasonId : undefined}
                                onChange={(event) =>
                                  controllerRef.current?.setDishEnabled(
                                    stall.id,
                                    dish.id,
                                    event.target.checked,
                                  )
                                }
                              />
                            </label>
                          </div>
                          {unavailableReason ? (
                            <em id={reasonId}>{unavailableReason}</em>
                          ) : null}
                        </article>
                      );
                    })}
                    <p className="nutrition-lens-note">
                      Nutrition values are estimates for the listed serving. Actual recipes and portions vary.
                    </p>
                    <NutritionDisclosure />
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
              <article data-state="good">
                <span aria-hidden="true">★</span>
                <div>
                  <strong>Centre journey</strong>
                  <p>{snapshot.claimedMilestoneCount} permanent milestones completed.</p>
                  <dl className="milestone-progress-list">
                    {snapshot.milestoneTracks.map((track) => (
                      <div key={track.id}>
                        <dt>{track.title} tier {track.tier}</dt>
                        <dd>{Math.round(track.progress).toLocaleString()} / {track.target.toLocaleString()}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
                <em>{snapshot.claimedMilestoneCount}/16</em>
              </article>
              <article data-state={snapshot.hasSatisfactionRatings && snapshot.averageSatisfaction < 70 ? "warning" : "good"}>
                <span aria-hidden="true">♥</span>
                <div>
                  <strong>Guest happiness</strong>
                  <p>{snapshot.hasSatisfactionRatings ? `Recent guest visits average ${Math.round(snapshot.averageSatisfaction)}%.` : "Complete a visit to receive the first rating."}</p>
                  {snapshot.satisfactionBreakdown ? (
                    <dl className="happiness-breakdown" aria-label="Guest happiness factors">
                      {[
                        ["Food", snapshot.satisfactionBreakdown.foodQuality],
                        ["Wait", snapshot.satisfactionBreakdown.wait],
                        ["Value", snapshot.satisfactionBreakdown.value],
                        ["Route efficiency", snapshot.satisfactionBreakdown.walking],
                        ["Comfort", snapshot.satisfactionBreakdown.comfort],
                        ["Cleanliness", snapshot.satisfactionBreakdown.cleanliness],
                        ["Ambience", snapshot.satisfactionBreakdown.ambience],
                      ].map(([label, value]) => (
                        <div key={label}>
                          <dt>{label}</dt>
                          <dd aria-label={`${label} ${Math.round(Number(value))} out of 100`}>
                            {Math.round(Number(value))}/100
                          </dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                  {snapshot.satisfactionTips.length ? (
                    <div className="happiness-advice">
                      <b>Ways to improve</b>
                      <ul>
                        {snapshot.satisfactionTips.map((tip) => (
                          <li key={tip.factor}>
                            <strong>{tip.label} · {Math.round(tip.score)}</strong>
                            <span>{tip.action}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
                <em>{snapshot.hasSatisfactionRatings ? `${Math.round(snapshot.averageSatisfaction)}%` : "—"}</em>
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
                  <strong>Customer personas</strong>
                  <p>
                    {unlockedCustomerCount} of {CUSTOMER_ARCHETYPES.length} distinct behaviour
                    profiles can currently visit.
                  </p>
                  <details className="persona-roster">
                    <summary>Browse the persona roster</summary>
                    <ul>
                      {CUSTOMER_PERSONAS_BY_UNLOCK.map((customer) => {
                        const unlocked =
                          customer.unlockRequirement.level <= snapshot.level &&
                          customer.unlockRequirement.reputation <= snapshot.reputation &&
                          customer.unlockRequirement.prerequisiteIds.every((id) =>
                            snapshot.unlockedContentIds.includes(id),
                          );
                        return (
                          <li key={customer.id} data-locked={!unlocked}>
                            <strong>{localize(customer.nameKey)}</strong>
                            <span>{localize(customer.descriptionKey)}</span>
                            <small>
                              {unlocked
                                ? "Can visit now"
                                : unlockLabel(
                                    customer,
                                    snapshot.level,
                                    snapshot.reputation,
                                    snapshot.unlockedContentIds,
                                  )}
                            </small>
                          </li>
                        );
                      })}
                    </ul>
                  </details>
                </div>
                <em>{unlockedCustomerCount}/{CUSTOMER_ARCHETYPES.length}</em>
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

          {panel === "activity" ? (
            <div className="activity-panel">
              <div className="activity-toolbar">
                <span>Latest first · routine events stay here</span>
                <button
                  type="button"
                  disabled={activityEntries.length === 0}
                  onClick={() => {
                    setActivityEntries([]);
                    setActivityUnread(0);
                  }}
                >
                  Clear
                </button>
              </div>
              {activityEntries.length === 0 ? (
                <div className="activity-empty">
                  <span aria-hidden="true">◎</span>
                  <strong>No activity yet</strong>
                  <p>Sales, build actions and centre updates will appear here.</p>
                </div>
              ) : (
                <div className="activity-list">
                  {activityEntries.map((entry) => (
                    <article key={entry.id} data-kind={entry.kind} data-importance={entry.importance ?? "routine"}>
                      <span aria-hidden="true">
                        {entry.kind === "success" ? "✓" : entry.kind === "warning" ? "!" : entry.kind === "error" ? "×" : "i"}
                      </span>
                      <div>
                        <strong>
                          {entry.kind === "success" ? "Completed" : entry.kind === "warning" ? "Attention" : entry.kind === "error" ? "Problem" : "Update"}
                        </strong>
                        <p>{activityEntryMessage(entry)}</p>
                      </div>
                      {entry.count > 1 ? <em>×{entry.count}</em> : null}
                    </article>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {selectedCustomerNutrition ? (
            <CustomerNutritionInspector
              customer={selectedCustomerNutrition}
              dishLabel={dishLabel}
              personaLabel={personaLabel}
              variantLabel={(dishId, variantId) =>
                customerVariantLabel(nutritionFamilies, dishId, variantId)}
              onClose={() => controllerRef.current?.selectCustomer(undefined)}
              onRestoreFocus={() => gameHostRef.current?.focus()}
            />
          ) : null}

          {selectedContent && panel !== "activity" ? (
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
            ["focus", "◎", "Focus"],
            ["build", "▦", "Build"],
            ["stalls", "▰", "Stalls"],
            ["dishes", "◉", "Dishes"],
            ["insights", "⌁", "Insights"],
            ["activity", "◷", "Activity"],
          ] as const
        ).map(([value, icon, label]) => (
          <button
            type="button"
            key={value}
            className={panel === value ? "is-active" : ""}
            aria-current={panel === value ? "page" : undefined}
            aria-label={value === "activity" && activityUnread > 0 ? `Activity, ${activityUnread} unread` : label}
            onClick={(event) => {
              openPanel(value, event.currentTarget);
            }}
          >
            <span aria-hidden="true">{icon}</span>
            {label}
            {value === "activity" && activityUnread > 0 ? (
              <i className="dock-unread" aria-hidden="true">{activityUnread}</i>
            ) : null}
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

      {tutorialStep === 5 && nutritionTourStep < 2 ? (
        <div className="modal-backdrop" role="presentation">
          <section
            ref={nutritionTourDialogRef}
            className="nutrition-tour-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="nutrition-tour-title"
            tabIndex={-1}
          >
            <div className="nutrition-tour-art" aria-hidden="true">
              {nutritionTourStep === 0 ? "◉" : "☺"}
            </div>
            <div className="nutrition-tour-copy">
              <span>Nutrition tour · {nutritionTourStep + 1} of 2</span>
              <h2 id="nutrition-tour-title">
                {nutritionTourStep === 0 ? "Read the menu, not a grade" : "Meet each visit intent"}
              </h2>
              <p>
                {nutritionTourStep === 0
                  ? "Open Menu planning to compare listed servings. The Nutrition Lens shows energy, protein, fibre, and sodium without calling a dish good or bad. Reviewed families can be tuned in the Variant Lab."
                  : "Select a guest to see their fictional nutrition intent and the trade-off behind their order. Taste, price, queues, and distance still matter, so a request may be missed."}
              </p>
              <div className="tutorial-actions">
                <button type="button" className="text-button" onClick={() => void finishNutritionTour()}>
                  Skip tour
                </button>
                <button
                  type="button"
                  className="primary-button"
                  autoFocus
                  onClick={() => {
                    if (nutritionTourStep === 1) void finishNutritionTour();
                    else setNutritionTourStep(1);
                  }}
                >
                  {nutritionTourStep === 1 ? "Start balancing" : "Show customer intents"}
                  <span aria-hidden="true"> →</span>
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {variantLabFamily ? (
        <VariantLabDialog
          dishName={dishLabel(variantLabFamily.dishId)}
          family={variantLabFamily}
          onChoose={(variantId) => {
            controllerRef.current?.setDishVariant(variantLabFamily.dishId, variantId);
          }}
          onClose={() => setVariantLabDishId(undefined)}
        />
      ) : null}

      {settingsOpen ? (
        <div className="modal-backdrop" role="presentation">
          <section ref={settingsDialogRef} className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title" tabIndex={-1} inert={resetOpen} aria-hidden={resetOpen}>
            <header>
              <div><span>Preferences &amp; guide</span><h2 id="settings-title">Settings</h2></div>
              <button type="button" aria-label="Close settings" onClick={() => setSettingsOpen(false)}>×</button>
            </header>
            <div className="settings-content">
              <CustomerStatusGuide />
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
                <label className="switch-row"><span><strong>Mute all audio</strong></span><input type="checkbox" checked={settings.masterMuted} onChange={(event) => setSettings((current) => ({ ...current, masterMuted: event.target.checked }))} /></label>
                <label>Music volume <strong>{Math.round(settings.musicVolume * 100)}%</strong><input type="range" min="0" max="1" step="0.05" value={settings.musicVolume} onChange={(event) => setSettings((current) => ({ ...current, musicVolume: Number(event.target.value) }))} /></label>
                <label>Ambience volume <strong>{Math.round(settings.ambienceVolume * 100)}%</strong><input type="range" min="0" max="1" step="0.05" value={settings.ambienceVolume} onChange={(event) => setSettings((current) => ({ ...current, ambienceVolume: Number(event.target.value) }))} /></label>
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
              <article><kbd>Menu</kbd><strong>Compare trade-offs</strong><p>Use Nutrition Lens and Variant Lab for reviewed listed servings.</p></article>
              <article><kbd>Guest</kbd><strong>Inspect a visit</strong><p>Select a guest to read their fictional intent and order result.</p></article>
            </div>
            <NutritionDisclosure />
            <footer>
              <button type="button" onClick={() => { setHelpOpen(false); setTutorialStep(0); }}>Replay tutorial</button>
              <button type="button" onClick={() => { setHelpOpen(false); setNutritionTourStep(0); }}>Replay nutrition tour</button>
              <button type="button" className="primary-button" onClick={() => setHelpOpen(false)}>Back to centre</button>
            </footer>
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
