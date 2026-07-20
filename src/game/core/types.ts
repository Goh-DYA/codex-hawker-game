/** Pure simulation-domain types. Rendering and UI state intentionally live elsewhere. */

export interface GridPoint {
  readonly x: number;
  readonly y: number;
}

export type AccessPointKind = "entrance" | "exit";

export interface AccessPoint {
  readonly id: string;
  readonly kind: AccessPointKind;
  readonly position: GridPoint;
}

export interface WorldPoint {
  readonly x: number;
  readonly y: number;
}

export type Rotation = 0 | 90 | 180 | 270;
export type TileKind = "floor" | "wall" | "void";
export type QualityMode = "standard" | "lower-end";
export type QueueDirection = "north" | "east" | "south" | "west";

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
  /** Authored taste and popularity rating in the inclusive 1-5 range. */
  readonly starRating?: number;
  /** Authored relative appeal in the inclusive 0-1 range. */
  readonly baseDemand?: number;
  readonly preferenceTags?: readonly string[];
  /** Optional progression gates used when evaluating nutrition-intent availability. */
  readonly unlockLevel?: number;
  readonly unlockReputation?: number;
  /** Reviewed nutrition variants. The runtime selects exactly one active variant. */
  readonly nutritionVariants?: readonly NutritionVariant[];
  readonly defaultNutritionVariantId?: string;
  readonly activeNutritionVariantId?: string;
}

export interface StallDefinition {
  readonly dishIds: readonly string[];
  /** Full authored menu, retained when dishIds is narrowed to the active menu. */
  readonly allDishIds?: readonly string[];
  readonly orderMs: number;
  readonly preparationCapacity: number;
  readonly queueCapacity: number;
  readonly popularity: number;
  readonly quality: number;
  readonly menuSlots?: number;
  readonly upgradeLevels?: readonly StallUpgradeDefinition[];
}

export interface StallUpgradeDefinition {
  readonly level: 2 | 3 | 4;
  readonly cost: number;
  readonly serviceTimeMultiplier: number;
  readonly capacityBonus: number;
  readonly qualityBonus: number;
  readonly menuSlotsBonus: number;
}

export interface UtilityEffects {
  readonly radius: number;
  readonly ambience: number;
  readonly cleanliness: number;
  readonly queuePatience: number;
  readonly eatingSpeed: number;
  readonly cleaningEfficiency: number;
  readonly movementSpeed: number;
  /** Directories, route signs, and menu previews reduce entrance-distance bias. */
  readonly wayfinding: number;
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
  /** Spatial gameplay effects supplied by signs, facilities, comfort, and decor. */
  readonly utility?: UtilityEffects;
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
  /** How willing this archetype is to explore a less-obvious stall. Zero disables exploration. */
  readonly noveltyPreference?: number;
  readonly preferenceTags?: readonly string[];
  /** Optional progression gates. Reputation uses the core zero-to-five scale. */
  readonly unlockLevel?: number;
  readonly unlockReputation?: number;
  readonly unlockPrerequisiteIds?: readonly string[];
  readonly visitSchedule?: {
    readonly startHour: number;
    readonly endHour: number;
    readonly peakMultiplier: number;
  };
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
  /** Preferred world-space direction for an automatically planned queue. */
  readonly queueDirection?: QueueDirection;
  /**
   * Optional player-authored queue cells in head-to-tail order, expressed in
   * absolute map coordinates. When absent, the simulation plans a deterministic
   * obstacle-aware route from the stall's queue anchor.
   */
  readonly queuePath?: readonly GridPoint[];
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
  /** Completed grid steps across the guest's full centre journey. */
  readonly walkingDistanceTiles: number;
  readonly patienceRemainingMs: number;
  readonly satisfaction: number;
  /** Visit-specific conditions assigned independently of customer archetype. */
  readonly healthConditions: readonly HealthCondition[];
  readonly sourceEntranceId?: string;
  readonly targetExitId?: string;
  readonly servedStallDefinitionId?: string;
  readonly ratingFactors?: Partial<VisitRatingComponents>;
  readonly ratingSettled?: boolean;
  readonly targetStallId?: string;
  readonly orderedDishId?: string;
  /** Fictional preference for this visit; it is never a diagnosis or demographic trait. */
  readonly nutritionIntentId?: NutritionIntent;
  /** Order-time values remain frozen when the player changes a stall recipe. */
  readonly orderedNutritionVariantId?: string;
  readonly orderedNutritionProfile?: NutritionProfile;
  readonly nutritionRequestResult?: NutritionRequestResult;
  /** Frozen condition-aware rating for the ordered nutrition variant. */
  readonly personalizedHealthRating?: number;
  /** Signed satisfaction delta applied for the ordered meal, from -0.2 to 0.2. */
  readonly healthImpact?: number;
  readonly healthPreferenceResult?: HealthPreferenceResult;
  readonly reservedSeatKey?: string;
  readonly targetTrayReturnId?: string;
  readonly hasTray: boolean;
  /** True once the order has been handed over, including a zero-price dish. */
  readonly served: boolean;
  readonly spent: number;
  readonly stuckMs: number;
}

export interface VisitRatingComponents {
  readonly foodQuality: number;
  readonly wait: number;
  readonly value: number;
  readonly walking: number;
  readonly comfort: number;
  readonly cleanliness: number;
  readonly ambience: number;
}

export interface VisitRating {
  readonly customerId: string;
  readonly walkingMetricVersion: 2;
  readonly score: number;
  readonly served: boolean;
  readonly abandoned: boolean;
  readonly reason: string;
  readonly stallDefinitionId?: string;
  readonly components: VisitRatingComponents;
  readonly day: number;
}

export type ObjectiveKind = "serve" | "revenue" | "happiness" | "flow" | "variety" | "facility" | "nutrition";

export type NutritionObjectiveCriterion =
  | "profiled-servings"
  | "intent-matches"
  | "variant-servings";

export interface DailyObjective {
  readonly id: string;
  readonly day: number;
  readonly kind: ObjectiveKind;
  readonly title: string;
  readonly description: string;
  readonly target: number;
  readonly progress: number;
  readonly startValue: number;
  readonly rewardCash: number;
  readonly rewardXp: number;
  readonly completed: boolean;
  readonly nutritionCriterion?: NutritionObjectiveCriterion;
}

export type NutritionIntent =
  | "lighter-energy"
  | "protein-forward"
  | "fibre-forward"
  | "sodium-aware"
  | "lower-total-sugar-drink";

export type HealthCondition =
  | "high-cholesterol"
  | "obesity"
  | "diabetes"
  | "hypertension";

export type HealthPreferenceResult = "matched" | "missed" | "unknown";

export type NutritionMetric =
  | "energyKcal"
  | "proteinG"
  | "totalFatG"
  | "saturatedFatG"
  | "transFatG"
  | "carbohydrateG"
  | "totalSugarG"
  | "dietaryFibreG"
  | "sodiumMg"
  | "calciumMg"
  | "ironMg"
  | "waterG";

export type NutritionValue =
  | { readonly status: "known"; readonly value: number }
  | { readonly status: "trace" }
  | {
      readonly status: "unavailable";
      readonly reason?: "not-reported" | "invalid-source" | "unmapped";
    };

export type NutritionProfileStatus = "released" | "unavailable" | "quarantined";
export type NutritionClass = "meal" | "drink";

export interface NutritionServing {
  readonly amount: number;
  readonly unit: "g" | "ml";
  readonly label: string;
}

export interface NutritionProfile {
  readonly id: string;
  readonly dishId: string;
  readonly status: NutritionProfileStatus;
  readonly serving?: NutritionServing;
  readonly nutrients: Readonly<Record<NutritionMetric, NutritionValue>>;
  /** Precomputed relative fits among reviewed in-game meal or drink options. */
  readonly intentFits: Partial<Readonly<Record<NutritionIntent, number>>>;
  /** General balanced-meal rating in the inclusive 1-5 range. */
  readonly healthRating?: number;
  /** Condition-aware ratings in the inclusive 1-5 range. */
  readonly conditionRatings?: Partial<Readonly<Record<HealthCondition, number>>>;
  readonly nutritionClass: NutritionClass;
}

export interface NutritionVariant {
  readonly id: string;
  readonly label: string;
  readonly unlockRank: number;
  readonly profileId: string;
  readonly visualKey: string;
  readonly profile?: NutritionProfile;
}

export type NutritionRequestResult = "matched" | "missed" | "unknown";

export interface NutritionOutcome {
  readonly customerId: string;
  readonly day: number;
  readonly intentId?: NutritionIntent;
  readonly dishId: string;
  readonly variantId?: string;
  readonly result: NutritionRequestResult;
  readonly profile?: NutritionProfile;
}

export interface NutritionIntentMetrics {
  readonly requests: number;
  readonly matches: number;
  readonly misses: number;
  readonly unknowns: number;
}

export interface NutritionMetrics {
  readonly servedMeals: number;
  readonly profiledServings: number;
  readonly nonDefaultVariantServings: number;
  readonly intentRequests: number;
  readonly intentMatches: number;
  readonly intentMisses: number;
  readonly intentUnknowns: number;
  readonly byIntent: Readonly<Record<NutritionIntent, NutritionIntentMetrics>>;
  readonly nutrientTotals: Readonly<Record<NutritionMetric, number>>;
  readonly nutrientKnownCounts: Readonly<Record<NutritionMetric, number>>;
  readonly dishServings: Readonly<Record<string, number>>;
  readonly recentOutcomes: readonly NutritionOutcome[];
  readonly today: NutritionDailyMetrics;
}

export interface NutritionDailyMetrics {
  readonly day: number;
  readonly servedMeals: number;
  readonly profiledServings: number;
  readonly intentRequests: number;
  readonly intentMatches: number;
  readonly intentMisses: number;
  readonly intentUnknowns: number;
  readonly byIntent: Readonly<Record<NutritionIntent, NutritionIntentMetrics>>;
  readonly nutrientTotals: Readonly<Record<NutritionMetric, number>>;
  readonly nutrientKnownCounts: Readonly<Record<NutritionMetric, number>>;
  readonly dishServings: Readonly<Record<string, number>>;
}

export interface StallMasteryState {
  readonly points: number;
  readonly rank: number;
  readonly upgradeLevel: 1 | 2 | 3 | 4;
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
  readonly focusDay: number;
  readonly dailyObjectives: readonly DailyObjective[];
  readonly claimedMilestoneIds: readonly string[];
  readonly stallMastery: Readonly<Record<string, StallMasteryState>>;
}

export interface SimulationMetrics {
  readonly spawnedCustomers: number;
  readonly despawnedCustomers: number;
  readonly completedCustomers: number;
  readonly pathRequests: number;
  readonly pathFailures: number;
  readonly recoveredTargets: number;
  readonly trayReturns: number;
  readonly visitRatings: readonly VisitRating[];
  readonly nutrition: NutritionMetrics;
}

export interface QualitySettings {
  /** @deprecated Ignored; arrival demand no longer uses a fixed customer ceiling. */
  readonly maxActiveCustomers?: number;
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
    | "target-recovered"
    | "objective-completed"
    | "milestone-completed"
    | "stall-upgraded";
  readonly tick: number;
  readonly entityId?: string;
  readonly message?: string;
  readonly amount?: number;
}

export interface UndoSnapshot {
  readonly map: GridMap;
  readonly accessPoints: readonly AccessPoint[];
  readonly routeGuidePoints: readonly GridPoint[];
  readonly entrance: GridPoint;
  readonly exit: GridPoint;
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
  readonly schemaVersion: 4;
  readonly map: GridMap;
  readonly accessPoints: readonly AccessPoint[];
  readonly routeGuidePoints: readonly GridPoint[];
  /** Compatibility aliases for callers that have not migrated to accessPoints. */
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
  readonly arrivalPerformancePressure: number;
  readonly undoStack: readonly UndoEntry[];
  readonly metrics: SimulationMetrics;
  readonly events: readonly SimulationEvent[];
}

export interface NewGameOptions {
  readonly map: GridMap;
  readonly entrance?: GridPoint;
  readonly exit?: GridPoint;
  readonly accessPoints?: readonly AccessPoint[];
  readonly routeGuidePoints?: readonly GridPoint[];
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

export interface ConfigureQueueCommand {
  readonly type: "configure-queue";
  readonly objectId: string;
  /** Absolute queue cells in head-to-tail order. */
  readonly points: readonly GridPoint[];
}

export interface SetStallQueueDirectionCommand {
  readonly type: "set-stall-queue-direction";
  readonly objectId: string;
  readonly direction: QueueDirection;
}

export interface ConfigureGuestRouteCommand {
  readonly type: "configure-guest-route";
  readonly points: readonly GridPoint[];
}

export interface AddAccessPointCommand {
  readonly type: "add-access-point";
  readonly accessPoint: AccessPoint;
}

export interface MoveAccessPointCommand {
  readonly type: "move-access-point";
  readonly accessPointId: string;
  readonly position: GridPoint;
}

export interface RemoveAccessPointCommand {
  readonly type: "remove-access-point";
  readonly accessPointId: string;
}

export interface UpgradeStallCommand {
  readonly type: "upgrade-stall";
  readonly definitionId: string;
}

export type BuildCommand =
  | PlaceObjectCommand
  | MoveObjectCommand
  | RotateObjectCommand
  | RemoveObjectCommand
  | ExpandMapCommand
  | ConfigureQueueCommand
  | SetStallQueueDirectionCommand
  | ConfigureGuestRouteCommand
  | AddAccessPointCommand
  | MoveAccessPointCommand
  | RemoveAccessPointCommand;

export type GameCommand =
  | BuildCommand
  | { readonly type: "undo" }
  | { readonly type: "set-stall-open"; readonly objectId: string; readonly open: boolean }
  | { readonly type: "set-quality-mode"; readonly mode: QualityMode }
  | UpgradeStallCommand;

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
  readonly schemaVersion: 4;
  readonly tick: number;
  readonly elapsedMs: number;
  readonly map: GridMap;
  readonly accessPoints: readonly AccessPoint[];
  readonly routeGuidePoints: readonly GridPoint[];
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

export interface PersistentGameStateV3 {
  readonly schemaVersion: 3;
  readonly savedAtTick: number;
  readonly map: GridMap;
  readonly accessPoints: readonly AccessPoint[];
  readonly routeGuidePoints: readonly GridPoint[];
  readonly qualityMode: QualityMode;
  readonly objects: readonly PlacedObject[];
  readonly economy: EconomyState;
  readonly progression: ProgressionState;
  readonly metrics: Pick<SimulationMetrics, "trayReturns" | "visitRatings">;
  readonly rngState: number;
  readonly nextCustomerSequence: number;
  readonly elapsedMs: number;
}

export interface PersistentGameStateV4 {
  readonly schemaVersion: 4;
  readonly savedAtTick: number;
  readonly map: GridMap;
  readonly accessPoints: readonly AccessPoint[];
  readonly routeGuidePoints: readonly GridPoint[];
  readonly qualityMode: QualityMode;
  readonly objects: readonly PlacedObject[];
  readonly economy: EconomyState;
  readonly progression: ProgressionState;
  readonly metrics: Pick<SimulationMetrics, "trayReturns" | "visitRatings" | "nutrition">;
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

export type AnyPersistentGameState =
  | PersistentGameStateV1
  | PersistentGameStateV2
  | PersistentGameStateV3
  | PersistentGameStateV4;
