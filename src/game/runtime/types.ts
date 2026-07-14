import type { AccessPoint, QueueDirection, VisitRatingComponents } from "@/src/game/core";
import type { SatisfactionTip } from "./satisfactionInsight";
import type { QueueFlowState } from "./queueInsight";

export type QualityMode = "standard" | "lower-end";
export type GameSpeed = 0 | 1 | 2 | 4 | 10;
export type BuildTool = "select" | "place" | "move" | "remove" | "queue" | "access";

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
  addAccessPoint(kind: AccessPoint["kind"]): void;
  selectAccessPoint(accessPointId?: string): void;
  removeSelectedAccessPoint(): boolean;
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
