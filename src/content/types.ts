export type ContentId = string;

export type CardinalDirection = "north" | "east" | "south" | "west";
export type Rotation = 0 | 90 | 180 | 270;

export interface GridPoint {
  readonly x: number;
  readonly y: number;
}

export interface Footprint {
  readonly width: number;
  readonly height: number;
}

export interface UnlockRequirement {
  readonly level: number;
  readonly reputation: number;
  readonly prerequisiteIds: readonly ContentId[];
}

export interface SpriteReference {
  readonly atlas: string;
  readonly frame: string;
}

export interface AudioReference {
  readonly event: string;
  readonly volume: number;
}

export interface StallUpgradeLevel {
  readonly level: 2 | 3 | 4;
  readonly cost: number;
  readonly serviceTimeMultiplier: number;
  readonly capacityBonus: number;
  readonly qualityBonus: number;
  readonly menuSlotsBonus: number;
}

export interface StallDefinition {
  readonly id: ContentId;
  readonly nameKey: string;
  readonly descriptionKey: string;
  readonly cuisineTags: readonly string[];
  readonly footprint: Footprint;
  readonly servicePoint: GridPoint;
  readonly queueAnchor: GridPoint;
  readonly queueDirection: CardinalDirection;
  readonly menuSlots: number;
  readonly dishIds: readonly ContentId[];
  readonly serviceTimeMs: number;
  readonly preparationCapacity: number;
  readonly quality: number;
  readonly popularity: number;
  readonly purchaseCost: number;
  readonly operatingCostPerMinute: number;
  readonly upgradeLevels: readonly StallUpgradeLevel[];
  readonly unlockRequirement: UnlockRequirement;
  readonly visual: {
    readonly sprite: SpriteReference;
    readonly palette: readonly [string, string, string];
    readonly signShape: "awning" | "lightbox" | "painted-board" | "tile-panel";
    readonly counterFacing: CardinalDirection;
    readonly depthSortAnchor: GridPoint;
  };
  readonly animationReferences: readonly string[];
  readonly audioReferences: readonly AudioReference[];
  readonly tags: readonly string[];
}

export type DishCategory =
  | "rice"
  | "noodles"
  | "bread"
  | "soup"
  | "small-plate"
  | "seafood"
  | "drink"
  | "dessert";

export type DietaryTag =
  | "contains-egg"
  | "contains-pork"
  | "contains-seafood"
  | "contains-dairy"
  | "contains-peanuts"
  | "plant-based-recipe"
  | "spicy";

export interface DishDefinition {
  readonly id: ContentId;
  readonly nameKey: string;
  readonly descriptionKey: string;
  readonly stallIds: readonly ContentId[];
  readonly category: DishCategory;
  readonly price: number;
  readonly baseDemand: number;
  readonly preparationTimeMs: number;
  readonly servingTimeMs: number;
  readonly eatingTimeMs: number;
  readonly quality: number;
  readonly preferenceTags: readonly string[];
  readonly dietaryTags: readonly DietaryTag[];
  readonly unlockRequirement: UnlockRequirement;
  readonly foodSprite: SpriteReference;
  readonly containerSprite: SpriteReference;
  readonly portionColour: string;
  readonly steamEffect: "none" | "light" | "full";
}

export type PlaceableCategory =
  | "table"
  | "seat"
  | "stall-fixture"
  | "tray-waste"
  | "lighting"
  | "fan"
  | "plant"
  | "signage"
  | "divider"
  | "facility"
  | "decor";

export type InteractionRole =
  | "use"
  | "sit"
  | "queue"
  | "return-tray"
  | "dispose-waste"
  | "wash-hands"
  | "collect-water"
  | "inspect-menu";

export interface InteractionPoint extends GridPoint {
  readonly role: InteractionRole;
  readonly facing: CardinalDirection;
}

export interface SeatPoint extends GridPoint {
  readonly facing: CardinalDirection;
  readonly comfort: number;
  readonly accessible: boolean;
}

export interface PlaceableDefinition {
  readonly id: ContentId;
  readonly nameKey: string;
  readonly descriptionKey: string;
  readonly category: PlaceableCategory;
  readonly footprint: Footprint;
  readonly rotations: readonly Rotation[];
  readonly price: number;
  readonly resaleValue: number;
  readonly upkeepPerMinute: number;
  readonly unlockRequirement: UnlockRequirement;
  readonly walkability: "blocked" | "pass-through" | "underpass";
  readonly collision: readonly GridPoint[];
  readonly interactionPoints: readonly InteractionPoint[];
  readonly seatPoints: readonly SeatPoint[];
  readonly queuePoints: readonly GridPoint[];
  readonly pivot: GridPoint;
  readonly depthSortAnchor: GridPoint;
  readonly spriteReferences: readonly SpriteReference[];
  readonly animationReferences: readonly string[];
  readonly audioReferences: readonly AudioReference[];
  readonly ambienceValue: number;
  readonly cleanlinessModifier: number;
  readonly serviceModifiers: {
    readonly queuePatience: number;
    readonly eatingSpeed: number;
    readonly cleaningEfficiency: number;
    readonly movementSpeed: number;
  };
  readonly lightRadius: number;
  readonly tags: readonly string[];
}

export type SeatPreference =
  | "any"
  | "quiet"
  | "near-stall"
  | "group-table"
  | "accessible"
  | "breezy"
  | "bright";

export interface CustomerArchetypeDefinition {
  readonly id: ContentId;
  readonly nameKey: string;
  readonly descriptionKey: string;
  readonly gameplayRole: string;
  readonly budgetRange: readonly [number, number];
  readonly patienceSeconds: number;
  readonly walkingSpeedTilesPerSecond: number;
  readonly priceSensitivity: number;
  readonly qualitySensitivity: number;
  readonly queueSensitivity: number;
  readonly distanceSensitivity: number;
  readonly noveltyPreference: number;
  readonly seatPreference: SeatPreference;
  readonly dishPreferenceTags: readonly string[];
  readonly groupSizeRange: readonly [number, number];
  readonly visualRules: {
    readonly outfitSilhouette:
      | "compact"
      | "relaxed"
      | "structured"
      | "layered"
      | "sporty"
      | "classic";
    readonly garmentPattern:
      | "plain"
      | "banded"
      | "panelled"
      | "sashed"
      | "piped"
      | "pocketed";
    readonly accessoryChance: number;
    readonly carryProp: "none" | "tote" | "briefcase" | "backpack" | "walking-aid";
  };
  readonly visitSchedule: {
    readonly startHour: number;
    readonly endHour: number;
    readonly peakMultiplier: number;
  };
  readonly satisfactionModifiers: {
    readonly value: number;
    readonly speed: number;
    readonly comfort: number;
    readonly variety: number;
    readonly cleanliness: number;
  };
  readonly spendMultiplier: number;
  readonly trayReturnChance: number;
  readonly unlockRequirement: UnlockRequirement;
  readonly tags: readonly string[];
}

export interface EconomyDefinition {
  readonly startingCash: number;
  readonly startingReputation: number;
  readonly maxLevel: number;
  readonly maxReputation: number;
  readonly minimumVisitEarnings: number;
  readonly starterRequiredSeats: number;
  readonly recoveryGrant: number;
  readonly levelXpThresholds: readonly number[];
}

export interface LaunchContent {
  readonly version: string;
  readonly economy: EconomyDefinition;
  readonly stalls: readonly StallDefinition[];
  readonly dishes: readonly DishDefinition[];
  readonly placeables: readonly PlaceableDefinition[];
  readonly customerArchetypes: readonly CustomerArchetypeDefinition[];
  readonly localization: Readonly<Record<string, string>>;
}

export interface LocalizedSeed {
  readonly name: string;
  readonly description: string;
}
