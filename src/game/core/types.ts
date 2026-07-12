/** Pure simulation-domain types. Rendering and UI state intentionally live elsewhere. */

export interface GridPoint {
  readonly x: number;
  readonly y: number;
}

export interface WorldPoint {
  readonly x: number;
  readonly y: number;
}

export type Rotation = 0 | 90 | 180 | 270;
export type TileKind = "floor" | "wall" | "void";
export type QualityMode = "standard" | "lower-end";

export interface Footprint {
  readonly width: number;
  readonly height: number;
  /** Missing cells means a full width-by-height rectangle. */
  readonly cells?: readonly GridPoint[];
}

export interface GridMap {
  readonly width: number;
  readonly height: number;
  readonly tileSize: number;
  readonly worldOrigin: WorldPoint;
  /** Row-major and always width * height entries long. */
  readonly tiles: readonly TileKind[];
}

export interface DishDefinition {
  readonly id: string;
  readonly price: number;
  readonly preparationMs: number;
  readonly eatingMs: number;
  readonly quality: number;
  readonly preferenceTags?: readonly string[];
}

export interface StallDefinition {
  readonly dishIds: readonly string[];
  readonly orderMs: number;
  readonly preparationCapacity: number;
  readonly queueCapacity: number;
  readonly popularity: number;
  readonly quality: number;
}

export type PlaceableKind =
  | "stall"
  | "seat"
  | "table"
  | "tray-return"
  | "facility"
  | "decoration";

export interface PlaceableDefinition {
  readonly id: string;
  readonly kind: PlaceableKind;
  readonly footprint: Footprint;
  readonly allowedRotations: readonly Rotation[];
  readonly blocksMovement: boolean;
  readonly price: number;
  readonly refundRate?: number;
  readonly unlockLevel?: number;
  /** Points are expressed relative to the unrotated footprint origin. */
  readonly servicePoint?: GridPoint;
  readonly queueAnchor?: GridPoint;
  readonly seatPoints?: readonly GridPoint[];
  readonly trayReturnPoint?: GridPoint;
  readonly stall?: StallDefinition;
}

export interface CustomerArchetype {
  readonly id: string;
  readonly budget: number;
  readonly patienceMs: number;
  /** Tiles per simulated second. */
  readonly walkingSpeed: number;
  readonly priceSensitivity: number;
  readonly qualitySensitivity: number;
  readonly queueSensitivity: number;
  readonly distanceSensitivity: number;
  readonly preferenceTags?: readonly string[];
}

export interface SimulationCatalog {
  readonly placeables: Readonly<Record<string, PlaceableDefinition>>;
  readonly dishes: Readonly<Record<string, DishDefinition>>;
  readonly archetypes: Readonly<Record<string, CustomerArchetype>>;
}

export interface PlacedObject {
  readonly id: string;
  readonly definitionId: string;
  readonly origin: GridPoint;
  readonly rotation: Rotation;
  readonly open: boolean;
}

export type CustomerStatus =
  | "choosing-stall"
  | "walking-to-queue"
  | "queued"
  | "ordering"
  | "waiting-for-food"
  | "seeking-seat"
  | "walking-to-seat"
  | "eating"
  | "seeking-tray-return"
  | "walking-to-tray-return"
  | "walking-to-exit";

export interface Customer {
  readonly id: string;
  readonly archetypeId: string;
  readonly status: CustomerStatus;
  readonly position: GridPoint;
  readonly path: readonly GridPoint[];
  readonly pathIndex: number;
  readonly movementProgress: number;
  readonly stateElapsedMs: number;
  readonly visitElapsedMs: number;
  readonly patienceRemainingMs: number;
  readonly satisfaction: number;
  readonly targetStallId?: string;
  readonly orderedDishId?: string;
  readonly reservedSeatKey?: string;
  readonly targetTrayReturnId?: string;
  readonly hasTray: boolean;
  /** True once the order has been handed over, including a zero-price dish. */
  readonly served: boolean;
  readonly spent: number;
  readonly stuckMs: number;
}

export interface EconomyState {
  readonly currency: number;
  readonly lifetimeRevenue: number;
  readonly lifetimeSpend: number;
  readonly completedVisits: number;
  readonly abandonedVisits: number;
}

export interface ProgressionState {
  readonly xp: number;
  readonly level: number;
  readonly reputation: number;
  readonly unlockedDefinitionIds: readonly string[];
  readonly expansionCount: number;
}

export interface SimulationMetrics {
  readonly spawnedCustomers: number;
  readonly despawnedCustomers: number;
  readonly completedCustomers: number;
  readonly pathRequests: number;
  readonly pathFailures: number;
  readonly recoveredTargets: number;
}

export interface QualitySettings {
  readonly maxActiveCustomers: number;
  readonly maxFixedStepsPerAdvance: number;
}

export interface SimulationConfig {
  readonly fixedStepMs: number;
  readonly spawnIntervalMs: number;
  readonly stuckRecoveryMs: number;
  readonly maxVisitMs: number;
  readonly reputationGainPerVisit: number;
  readonly expansionBaseCostPerTile: number;
  readonly expansionCostGrowth: number;
  readonly buildUndoWindowMs: number;
  readonly standard: QualitySettings;
  readonly lowerEnd: QualitySettings;
}

export type SimulationConfigOverrides = Omit<Partial<SimulationConfig>, "standard" | "lowerEnd"> & {
  readonly standard?: Partial<QualitySettings>;
  readonly lowerEnd?: Partial<QualitySettings>;
};

export interface SimulationEvent {
  readonly type:
    | "command-applied"
    | "command-rejected"
    | "object-placed"
    | "object-moved"
    | "object-removed"
    | "customer-spawned"
    | "customer-state-changed"
    | "customer-despawned"
    | "sale-completed"
    | "level-up"
    | "target-recovered";
  readonly tick: number;
  readonly entityId?: string;
  readonly message?: string;
  readonly amount?: number;
}

export interface UndoSnapshot {
  readonly map: GridMap;
  readonly objects: Readonly<Record<string, PlacedObject>>;
  readonly economy: EconomyState;
  readonly expansionCount: number;
  readonly xp: number;
}

export interface UndoEntry {
  readonly commandType: BuildCommand["type"];
  readonly snapshot: UndoSnapshot;
  /** Difference applied by the build command; undo subtracts these from live economy state. */
  readonly currencyDelta: number;
  readonly lifetimeSpendDelta: number;
  readonly expansionCountDelta: number;
  readonly createdAtTick: number;
}

export interface GameState {
  readonly schemaVersion: 2;
  readonly map: GridMap;
  readonly entrance: GridPoint;
  readonly exit: GridPoint;
  readonly catalog: SimulationCatalog;
  readonly config: SimulationConfig;
  readonly qualityMode: QualityMode;
  readonly objects: Readonly<Record<string, PlacedObject>>;
  readonly customers: Readonly<Record<string, Customer>>;
  readonly queues: Readonly<Record<string, readonly string[]>>;
  readonly seatReservations: Readonly<Record<string, string>>;
  readonly economy: EconomyState;
  readonly progression: ProgressionState;
  readonly rngState: number;
  readonly nextCustomerSequence: number;
  readonly spawnCountdownMs: number;
  readonly accumulatorMs: number;
  readonly tick: number;
  readonly elapsedMs: number;
  readonly undoStack: readonly UndoEntry[];
  readonly metrics: SimulationMetrics;
  readonly events: readonly SimulationEvent[];
}

export interface NewGameOptions {
  readonly map: GridMap;
  readonly entrance: GridPoint;
  readonly exit: GridPoint;
  readonly catalog: SimulationCatalog;
  readonly seed?: number | string;
  readonly startingCurrency?: number;
  readonly qualityMode?: QualityMode;
  readonly config?: SimulationConfigOverrides;
  readonly initialObjects?: readonly PlacedObject[];
  readonly initiallyUnlockedDefinitionIds?: readonly string[];
}

export interface PlaceObjectCommand {
  readonly type: "place-object";
  readonly objectId: string;
  readonly definitionId: string;
  readonly origin: GridPoint;
  readonly rotation?: Rotation;
}

export interface MoveObjectCommand {
  readonly type: "move-object";
  readonly objectId: string;
  readonly origin: GridPoint;
  readonly rotation?: Rotation;
}

export interface RotateObjectCommand {
  readonly type: "rotate-object";
  readonly objectId: string;
  readonly clockwise?: boolean;
}

export interface RemoveObjectCommand {
  readonly type: "remove-object";
  readonly objectId: string;
}

export interface ExpandMapCommand {
  readonly type: "expand-map";
  readonly addColumns: number;
  readonly addRows: number;
}

export type BuildCommand =
  | PlaceObjectCommand
  | MoveObjectCommand
  | RotateObjectCommand
  | RemoveObjectCommand
  | ExpandMapCommand;

export type GameCommand =
  | BuildCommand
  | { readonly type: "undo" }
  | { readonly type: "set-stall-open"; readonly objectId: string; readonly open: boolean }
  | { readonly type: "set-quality-mode"; readonly mode: QualityMode };

export interface CommandResult {
  readonly state: GameState;
  readonly accepted: boolean;
  readonly error?: string;
  readonly events: readonly SimulationEvent[];
}

export interface AdvanceResult {
  readonly state: GameState;
  readonly fixedSteps: number;
  readonly droppedMs: number;
  readonly events: readonly SimulationEvent[];
}

export interface GameSnapshot {
  readonly schemaVersion: 2;
  readonly tick: number;
  readonly elapsedMs: number;
  readonly map: GridMap;
  readonly qualityMode: QualityMode;
  readonly entrance: GridPoint;
  readonly exit: GridPoint;
  readonly objects: readonly PlacedObject[];
  readonly customers: readonly Customer[];
  readonly queues: Readonly<Record<string, readonly string[]>>;
  readonly seatReservations: Readonly<Record<string, string>>;
  readonly economy: EconomyState;
  readonly progression: ProgressionState;
  readonly metrics: SimulationMetrics;
  readonly canUndo: boolean;
  readonly events: readonly SimulationEvent[];
}

/** Save V2 deliberately normalizes transient customers on load. */
export interface PersistentGameStateV2 {
  readonly schemaVersion: 2;
  readonly savedAtTick: number;
  readonly map: GridMap;
  readonly entrance: GridPoint;
  readonly exit: GridPoint;
  readonly qualityMode: QualityMode;
  readonly objects: readonly PlacedObject[];
  readonly economy: EconomyState;
  readonly progression: ProgressionState;
  readonly rngState: number;
  readonly nextCustomerSequence: number;
  readonly elapsedMs: number;
}

export interface PersistentGameStateV1 {
  readonly schemaVersion: 1;
  readonly map: GridMap;
  readonly entrance: GridPoint;
  readonly exit: GridPoint;
  readonly objects: readonly PlacedObject[];
  readonly money: number;
  readonly xp: number;
  readonly reputation?: number;
  readonly seed: number;
}

export type AnyPersistentGameState = PersistentGameStateV1 | PersistentGameStateV2;
