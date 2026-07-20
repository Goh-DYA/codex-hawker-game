import type {
  AccessPoint,
  GridPoint,
  NutritionIntent,
  NutritionProfileStatus,
  NutritionRequestResult,
  NutritionValue,
  QueueDirection,
  VisitRatingComponents,
} from "@/src/game/core";
import type { SatisfactionTip } from "./satisfactionInsight";
import type { QueueFlowState } from "./queueInsight";

export type QualityMode = "standard" | "lower-end";
export type GameSpeed = 0 | 1 | 2 | 4 | 10;
export type BuildTool = "select" | "place" | "move" | "remove" | "queue" | "access" | "route";
export type HealthConditionId =
  | "high-cholesterol"
  | "obesity"
  | "diabetes"
  | "hypertension";

export interface RuntimeObjective {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly progress: number;
  readonly target: number;
  readonly rewardCash: number;
  readonly rewardXp: number;
  readonly completed: boolean;
}

export interface RuntimeNutritionProfileSummary {
  readonly status: NutritionProfileStatus;
  readonly servingLabel?: string;
  readonly energyKcal?: NutritionValue;
  readonly proteinG?: NutritionValue;
  readonly totalFatG?: NutritionValue;
  readonly saturatedFatG?: NutritionValue;
  readonly transFatG?: NutritionValue;
  readonly carbohydrateG?: NutritionValue;
  readonly dietaryFibreG?: NutritionValue;
  readonly sodiumMg?: NutritionValue;
  readonly totalSugarG?: NutritionValue;
  readonly calciumMg?: NutritionValue;
  readonly ironMg?: NutritionValue;
  readonly waterG?: NutritionValue;
  /** Overall in-game balance score for this exact listed serving. */
  readonly healthRating?: number;
  /** Condition-aware scores used to personalise customers' menu choices. */
  readonly conditionRatings?: Partial<Readonly<Record<HealthConditionId, number>>>;
  readonly intentFits?: Partial<Readonly<Record<NutritionIntent, number>>>;
}

export interface RuntimeNutritionVariantSummary {
  readonly id: string;
  readonly label: string;
  readonly unlockRank: number;
  readonly profileId: string;
  readonly visualKey: string;
  readonly unlocked: boolean;
  readonly selected: boolean;
  readonly profile?: RuntimeNutritionProfileSummary;
}

export interface RuntimeNutritionFamilySummary {
  readonly dishId: string;
  /** Taste and popularity score; unlike health ratings, this is shared by every variant. */
  readonly starRating?: number;
  readonly defaultVariantId: string;
  readonly activeVariantId: string;
  readonly variants: readonly RuntimeNutritionVariantSummary[];
}

export interface RuntimeNutritionPulse {
  readonly servedMeals: number;
  readonly profiledMeals: number;
  readonly intentRequests: number;
  readonly intentMatches: number;
  readonly intentMisses: number;
  readonly intentUnknowns: number;
  readonly averages: Readonly<{
    energyKcal?: number;
    proteinG?: number;
    dietaryFibreG?: number;
    sodiumMg?: number;
  }>;
  readonly knownCounts: Readonly<{
    energyKcal: number;
    proteinG: number;
    dietaryFibreG: number;
    sodiumMg: number;
  }>;
  readonly mostServedDishId?: string;
  readonly leadingUnmetIntent?: NutritionIntent;
}

export interface RuntimeCustomerNutritionSummary {
  readonly customerId: string;
  readonly archetypeId: string;
  readonly status: string;
  /** At most two neutral, evidence-based factors from the selected dish. */
  readonly decisionReasons: readonly string[];
  readonly intentId?: NutritionIntent;
  readonly dishId?: string;
  readonly variantId?: string;
  readonly requestResult?: NutritionRequestResult;
  readonly healthConditionIds: readonly HealthConditionId[];
  readonly personalizedHealthRating?: number;
  readonly healthImpact?: number;
  readonly healthPreferenceResult?: NutritionRequestResult;
  readonly healthDecisionReasons: readonly string[];
  readonly profile?: RuntimeNutritionProfileSummary;
}

export interface RuntimeStallMastery {
  readonly definitionId: string;
  readonly points: number;
  readonly rank: number;
  readonly upgradeLevel: 1 | 2 | 3 | 4;
  readonly nextUpgradeCost?: number;
  readonly requiredRank?: number;
}

export interface RuntimeMilestoneTrack {
  readonly id: string;
  readonly title: string;
  readonly tier: number;
  readonly progress: number;
  readonly target: number;
}

export interface RuntimeStallSummary {
  readonly objectId: string;
  readonly definitionId: string;
  readonly name: string;
  readonly queueCount: number;
  readonly queueDirection: QueueDirection;
  readonly customQueue: boolean;
  readonly open: boolean;
}

export interface RuntimeSnapshot {
  cash: number;
  reputation: number;
  level: number;
  experience: number;
  nextLevelExperience: number;
  day: number;
  timeLabel: string;
  isOpen: boolean;
  speed: GameSpeed;
  quality: QualityMode;
  activeCustomers: number;
  servedCustomers: number;
  averageSatisfaction: number;
  hasSatisfactionRatings: boolean;
  satisfactionBreakdown?: VisitRatingComponents;
  satisfactionTips: readonly SatisfactionTip[];
  queuePressure: number;
  queueFlowState: QueueFlowState;
  queueFlowMessage: string;
  freeSeats: number;
  totalSeats: number;
  cleanliness: number;
  trayReturnStations: number;
  buildTool: BuildTool;
  selectedBuildId?: string;
  selectedObjectId?: string;
  selectedObjectDefinitionId?: string;
  unlockedContentIds: readonly string[];
  stallMenus: Readonly<Record<string, readonly string[]>>;
  activeDishVariants: Readonly<Record<string, string>>;
  nutritionFamilies: readonly RuntimeNutritionFamilySummary[];
  nutritionPulse: RuntimeNutritionPulse;
  selectedCustomerId?: string;
  selectedCustomerNutrition?: RuntimeCustomerNutritionSummary;
  placedStalls: readonly RuntimeStallSummary[];
  canUndo: boolean;
  objectiveProgress: number;
  objectiveTarget: number;
  objectives: readonly RuntimeObjective[];
  objectiveRefreshLabel: string;
  claimedMilestoneCount: number;
  milestoneTracks: readonly RuntimeMilestoneTrack[];
  stallMastery: readonly RuntimeStallMastery[];
  accessPoints: readonly AccessPoint[];
  routeGuidePoints: readonly GridPoint[];
  selectedAccessPointId?: string;
  expansionCount: number;
  nextExpansionCost: number;
  fps: number;
  simulationMs: number;
  autosaveState: "saved" | "saving" | "error";
  pausedReason?: string;
}

export interface RuntimeEvent {
  kind: "info" | "success" | "warning" | "error";
  message: string;
  importance?: "routine" | "important";
  groupKey?: string;
  amount?: number;
}

export interface RuntimeSettings {
  quality: QualityMode;
  reducedMotion: boolean;
  highContrast: boolean;
  textScale: number;
  musicVolume: number;
  ambienceVolume: number;
  sfxVolume: number;
  masterMuted: boolean;
}

export interface RuntimeController {
  destroy(): void;
  selectBuildItem(itemId?: string): void;
  setBuildTool(tool: BuildTool): void;
  rotateSelection(): void;
  undo(): void;
  toggleOpen(): boolean;
  setSpeed(speed: GameSpeed): void;
  setQuality(quality: QualityMode): void;
  setReducedMotion(enabled: boolean): void;
  setHighContrast(enabled: boolean): void;
  setDebugOverlay(enabled: boolean): void;
  zoomBy(delta: number): void;
  centreCamera(): void;
  exportState(): unknown;
  importState(value: unknown): void;
  reset(): void;
  spawnCustomer(): void;
  addCash(amount: number): void;
  expandMap(): boolean;
  beginQueueEdit(objectId: string): boolean;
  setQueueDirection(objectId: string, direction: QueueDirection): boolean;
  finishQueueEdit(): void;
  setDishEnabled(stallId: string, dishId: string, enabled: boolean): boolean;
  setDishVariant(dishId: string, variantId: string): boolean;
  selectCustomer(customerId?: string): void;
  addAccessPoint(kind: AccessPoint["kind"]): void;
  selectAccessPoint(accessPointId?: string): void;
  removeSelectedAccessPoint(): boolean;
  clearGuestRoute(): boolean;
  upgradeStall(definitionId: string): boolean;
}

export interface RuntimeOptions {
  parent: HTMLElement;
  settings: RuntimeSettings;
  initialStates?: readonly unknown[];
  onSnapshot(snapshot: RuntimeSnapshot): void;
  onEvent(event: RuntimeEvent): void;
  onPersistentChange(state: unknown): void;
}
