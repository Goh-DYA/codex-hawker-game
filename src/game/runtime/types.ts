export type QualityMode = "standard" | "lower-end";
export type GameSpeed = 0 | 1 | 2 | 4;
export type BuildTool = "select" | "place" | "move" | "remove";

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
  freeSeats: number;
  totalSeats: number;
  cleanliness: number;
  trayReturnStations: number;
  buildTool: BuildTool;
  selectedBuildId?: string;
  selectedObjectId?: string;
  unlockedContentIds: readonly string[];
  stallMenus: Readonly<Record<string, readonly string[]>>;
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
