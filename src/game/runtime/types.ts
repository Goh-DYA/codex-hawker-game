import type { QueueDirection } from "@/src/game/core";
import type { QueueFlowState } from "./queueInsight";

export type QualityMode = "standard" | "lower-end";
export type GameSpeed = 0 | 1 | 2 | 4;
export type BuildTool = "select" | "place" | "move" | "remove" | "queue";

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
}

export interface RuntimeSettings {
  quality: QualityMode;
  reducedMotion: boolean;
  highContrast: boolean;
  textScale: number;
  musicVolume: number;
  sfxVolume: number;
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
}

export interface RuntimeOptions {
  parent: HTMLElement;
  settings: RuntimeSettings;
  initialStates?: readonly unknown[];
  onSnapshot(snapshot: RuntimeSnapshot): void;
  onEvent(event: RuntimeEvent): void;
  onPersistentChange(state: unknown): void;
}
