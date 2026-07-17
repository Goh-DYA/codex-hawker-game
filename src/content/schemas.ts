import { z } from "zod";

export const contentIdSchema = z
  .string()
  .min(3)
  .regex(/^(stall|dish|item|customer)\.[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const cardinalDirectionSchema = z.enum([
  "north",
  "east",
  "south",
  "west",
]);

export const rotationSchema = z.union([
  z.literal(0),
  z.literal(90),
  z.literal(180),
  z.literal(270),
]);

export const gridPointSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

export const footprintSchema = z.object({
  width: z.number().int().positive().max(8),
  height: z.number().int().positive().max(8),
});

export const unlockRequirementSchema = z.object({
  level: z.number().int().positive(),
  reputation: z.number().int().nonnegative(),
  prerequisiteIds: z.array(contentIdSchema),
});

export const spriteReferenceSchema = z.object({
  atlas: z.string().min(1).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  frame: z.string().min(1).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
});

export const audioReferenceSchema = z.object({
  event: z.string().min(3).regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/),
  volume: z.number().min(0).max(1),
});

const localizationKeySchema = z
  .string()
  .regex(/^(stall|dish|item|customer)\.[a-z0-9]+(?:-[a-z0-9]+)*\.(name|description)$/);

const qualitySchema = z.number().min(0).max(1);

export const stallUpgradeSchema = z.object({
  level: z.union([z.literal(2), z.literal(3), z.literal(4)]),
  cost: z.number().int().positive(),
  serviceTimeMultiplier: z.number().positive().max(1),
  capacityBonus: z.number().int().nonnegative(),
  qualityBonus: z.number().min(0).max(0.5),
  menuSlotsBonus: z.number().int().nonnegative().max(4),
});

export const stallSchema = z.object({
  id: contentIdSchema.refine((id) => id.startsWith("stall.")),
  nameKey: localizationKeySchema,
  descriptionKey: localizationKeySchema,
  cuisineTags: z.array(z.string().min(2)).min(2),
  footprint: footprintSchema,
  servicePoint: gridPointSchema,
  queueAnchor: gridPointSchema,
  queueDirection: cardinalDirectionSchema,
  menuSlots: z.number().int().positive().max(8),
  dishIds: z.array(contentIdSchema).min(1),
  serviceTimeMs: z.number().int().positive(),
  preparationCapacity: z.number().int().positive().max(12),
  quality: qualitySchema,
  popularity: qualitySchema,
  purchaseCost: z.number().int().positive(),
  operatingCostPerMinute: z.number().int().nonnegative(),
  upgradeLevels: z.array(stallUpgradeSchema).length(3),
  unlockRequirement: unlockRequirementSchema,
  visual: z.object({
    sprite: spriteReferenceSchema,
    palette: z.tuple([
      z.string().regex(/^#[0-9A-Fa-f]{6}$/),
      z.string().regex(/^#[0-9A-Fa-f]{6}$/),
      z.string().regex(/^#[0-9A-Fa-f]{6}$/),
    ]),
    signShape: z.enum(["awning", "lightbox", "painted-board", "tile-panel"]),
    counterFacing: cardinalDirectionSchema,
    depthSortAnchor: gridPointSchema,
  }),
  animationReferences: z.array(z.string().min(3)).min(1),
  audioReferences: z.array(audioReferenceSchema).min(1),
  tags: z.array(z.string().min(2)).min(2),
});

export const dishSchema = z.object({
  id: contentIdSchema.refine((id) => id.startsWith("dish.")),
  nameKey: localizationKeySchema,
  descriptionKey: localizationKeySchema,
  stallIds: z.array(contentIdSchema).length(1),
  category: z.enum([
    "rice",
    "noodles",
    "bread",
    "soup",
    "small-plate",
    "seafood",
    "drink",
    "dessert",
  ]),
  price: z.number().int().positive(),
  baseDemand: qualitySchema,
  preparationTimeMs: z.number().int().positive(),
  servingTimeMs: z.number().int().positive(),
  eatingTimeMs: z.number().int().positive(),
  quality: qualitySchema,
  preferenceTags: z.array(z.string().min(2)).min(2),
  dietaryTags: z.array(
    z.enum([
      "contains-egg",
      "contains-pork",
      "contains-seafood",
      "contains-dairy",
      "contains-peanuts",
      "plant-based-recipe",
      "spicy",
    ]),
  ),
  unlockRequirement: unlockRequirementSchema,
  foodSprite: spriteReferenceSchema,
  containerSprite: spriteReferenceSchema,
  portionColour: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  steamEffect: z.enum(["none", "light", "full"]),
});

export const placeableCategorySchema = z.enum([
  "table",
  "seat",
  "stall-fixture",
  "tray-waste",
  "lighting",
  "fan",
  "plant",
  "signage",
  "divider",
  "facility",
  "decor",
]);

export const interactionPointSchema = gridPointSchema.extend({
  role: z.enum([
    "use",
    "sit",
    "queue",
    "return-tray",
    "dispose-waste",
    "wash-hands",
    "collect-water",
    "inspect-menu",
  ]),
  facing: cardinalDirectionSchema,
});

export const seatPointSchema = gridPointSchema.extend({
  facing: cardinalDirectionSchema,
  comfort: qualitySchema,
  accessible: z.boolean(),
});

export const placeableSchema = z.object({
  id: contentIdSchema.refine((id) => id.startsWith("item.")),
  nameKey: localizationKeySchema,
  descriptionKey: localizationKeySchema,
  category: placeableCategorySchema,
  footprint: footprintSchema,
  rotations: z.array(rotationSchema).min(1),
  price: z.number().int().positive(),
  resaleValue: z.number().int().nonnegative(),
  upkeepPerMinute: z.number().int().nonnegative(),
  unlockRequirement: unlockRequirementSchema,
  walkability: z.enum(["blocked", "pass-through", "underpass"]),
  collision: z.array(gridPointSchema),
  interactionPoints: z.array(interactionPointSchema),
  seatPoints: z.array(seatPointSchema),
  queuePoints: z.array(gridPointSchema),
  pivot: gridPointSchema,
  depthSortAnchor: gridPointSchema,
  spriteReferences: z.array(spriteReferenceSchema).min(1),
  animationReferences: z.array(z.string().min(3)),
  audioReferences: z.array(audioReferenceSchema),
  ambienceValue: z.number().int().min(-20).max(30),
  cleanlinessModifier: z.number().int().min(-20).max(30),
  serviceModifiers: z.object({
    queuePatience: z.number().min(-1).max(1),
    eatingSpeed: z.number().min(-1).max(1),
    cleaningEfficiency: z.number().min(-1).max(1),
    movementSpeed: z.number().min(-1).max(1),
  }),
  lightRadius: z.number().int().nonnegative().max(12),
  tags: z.array(z.string().min(2)).min(2),
});

export const customerArchetypeSchema = z.object({
  id: contentIdSchema.refine((id) => id.startsWith("customer.")),
  nameKey: localizationKeySchema,
  descriptionKey: localizationKeySchema,
  gameplayRole: z.string().min(8),
  budgetRange: z.tuple([z.number().int().positive(), z.number().int().positive()]),
  patienceSeconds: z.number().positive(),
  walkingSpeedTilesPerSecond: z.number().positive().max(5),
  priceSensitivity: qualitySchema,
  qualitySensitivity: qualitySchema,
  queueSensitivity: qualitySchema,
  distanceSensitivity: qualitySchema,
  noveltyPreference: qualitySchema,
  seatPreference: z.enum([
    "any",
    "quiet",
    "near-stall",
    "group-table",
    "accessible",
    "breezy",
    "bright",
  ]),
  dishPreferenceTags: z.array(z.string().min(2)).min(2),
  groupSizeRange: z.tuple([
    z.number().int().positive().max(8),
    z.number().int().positive().max(8),
  ]),
  visualRules: z.object({
    outfitSilhouette: z.enum([
      "compact",
      "relaxed",
      "structured",
      "layered",
      "sporty",
      "classic",
    ]),
    garmentPattern: z.enum([
      "plain",
      "banded",
      "panelled",
      "sashed",
      "piped",
      "pocketed",
    ]),
    accessoryChance: qualitySchema,
    carryProp: z.enum(["none", "tote", "briefcase", "backpack", "walking-aid"]),
  }),
  visitSchedule: z.object({
    startHour: z.number().int().min(0).max(23),
    endHour: z.number().int().min(1).max(24),
    peakMultiplier: z.number().positive().max(5),
  }),
  satisfactionModifiers: z.object({
    value: z.number().min(-1).max(1),
    speed: z.number().min(-1).max(1),
    comfort: z.number().min(-1).max(1),
    variety: z.number().min(-1).max(1),
    cleanliness: z.number().min(-1).max(1),
  }),
  spendMultiplier: z.number().positive().max(4),
  trayReturnChance: qualitySchema,
  unlockRequirement: unlockRequirementSchema,
  tags: z.array(z.string().min(2)).min(2),
});

export const economySchema = z.object({
  startingCash: z.number().int().positive(),
  startingReputation: z.number().int().nonnegative(),
  maxLevel: z.number().int().positive(),
  maxReputation: z.number().int().positive(),
  minimumVisitEarnings: z.number().int().positive(),
  starterRequiredSeats: z.number().int().positive(),
  recoveryGrant: z.number().int().positive(),
  levelXpThresholds: z.array(z.number().int().nonnegative()).min(2),
});

export const nutritionMetricSchema = z.enum([
  "energyKcal",
  "proteinG",
  "totalFatG",
  "saturatedFatG",
  "transFatG",
  "carbohydrateG",
  "totalSugarG",
  "dietaryFibreG",
  "sodiumMg",
  "calciumMg",
  "ironMg",
  "waterG",
]);

export const nutritionIntentIdSchema = z.enum([
  "lighter-energy",
  "protein-forward",
  "fibre-forward",
  "sodium-aware",
  "lower-total-sugar-drink",
]);

export const nutritionValueSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("known"), value: z.number().finite().nonnegative() }),
  z.object({ status: z.literal("trace") }),
  z.object({
    status: z.literal("unavailable"),
    reason: z.enum(["not-reported", "invalid-source", "unmapped"]),
  }),
]);

export const nutritionNutrientsSchema = z.object({
  energyKcal: nutritionValueSchema,
  proteinG: nutritionValueSchema,
  totalFatG: nutritionValueSchema,
  saturatedFatG: nutritionValueSchema,
  transFatG: nutritionValueSchema,
  carbohydrateG: nutritionValueSchema,
  totalSugarG: nutritionValueSchema,
  dietaryFibreG: nutritionValueSchema,
  sodiumMg: nutritionValueSchema,
  calciumMg: nutritionValueSchema,
  ironMg: nutritionValueSchema,
  waterG: nutritionValueSchema,
});

export const nutritionServingSchema = z.object({
  amount: z.number().finite().positive(),
  unit: z.enum(["g", "ml"]),
  label: z.string().min(2),
});

export const nutritionProvenanceSchema = z.object({
  snapshotId: z.string().min(3),
  sourceFile: z.string().min(3).refine(
    (fileName) => !/[\\/]/.test(fileName),
    "Source provenance must store a file name, not a path.",
  ),
  sourceFileSha256: z.string().regex(/^[a-f0-9]{64}$/),
  sourceRowNumber: z.number().int().min(2),
  sourceFoodName: z.string().min(2),
  sourceRowSha256: z.string().regex(/^[a-f0-9]{64}$/),
  sourceDataType: z.string().min(1),
  mappingKind: z.enum(["exact", "curated-synonym", "scaled-exact"]),
  multiplier: z.number().positive(),
  reviewNote: z.string().min(8),
});

export const nutritionProfileSchema = z.object({
  id: z.string().min(3),
  dishId: contentIdSchema.refine((id) => id.startsWith("dish.")),
  variantId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
  status: z.enum(["released", "unavailable", "quarantined"]),
  nutritionClass: z.enum(["meal", "drink"]),
  serving: nutritionServingSchema.optional(),
  nutrients: nutritionNutrientsSchema,
  intentFits: z.partialRecord(
    nutritionIntentIdSchema,
    z.number().min(0).max(1),
  ),
  provenance: nutritionProvenanceSchema.optional(),
  unavailableReason: z
    .enum(["not-reported", "invalid-source", "unmapped"])
    .optional(),
  reviewNote: z.string().min(8),
  quarantineReasons: z.array(z.string().min(8)).min(1).optional(),
});

export const nutritionVariantSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().min(2),
  profileId: z.string().min(3),
  unlockRank: z.union([z.literal(1), z.literal(2), z.literal(4), z.literal(7)]),
  visualKey: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
});

export const nutritionVariantFamilySchema = z.object({
  dishId: contentIdSchema.refine((id) => id.startsWith("dish.")),
  defaultVariantId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  variants: z.array(nutritionVariantSchema).min(2),
});

export const nutritionIntentSchema = z.object({
  id: nutritionIntentIdSchema,
  name: z.string().min(3),
  description: z.string().min(16),
  metric: nutritionMetricSchema,
  direction: z.enum(["lower", "higher"]),
  nutritionClass: z.enum(["meal", "drink"]),
});

export const nutritionSourceSnapshotSchema = z.object({
  id: z.string().min(3),
  fileName: z.string().min(3).refine(
    (fileName) => !/[\\/]/.test(fileName),
    "Source snapshots must store a file name, not a path.",
  ),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  rowCount: z.number().int().positive(),
});

export const nutritionGuidelineSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  nutrient: z.string().min(2),
  lowerLimit: z.string().min(1),
  upperLimit: z.string().min(1),
  remarks: z.string().min(8),
  source: z.string().min(2),
  comparison: z.enum(["context-only", "not-comparable"]),
  notComparableReason: z.string().min(8).optional(),
});

export const nutritionContentSchema = z.object({
  schemaVersion: z.literal(1),
  dataVersion: z.string().regex(/^sg-[a-f0-9]{12}-[a-f0-9]{12}$/),
  sourceSnapshots: z.array(nutritionSourceSnapshotSchema).length(2),
  profiles: z.array(nutritionProfileSchema).min(46),
  variantFamilies: z.array(nutritionVariantFamilySchema).length(10),
  intents: z.array(nutritionIntentSchema).length(5),
  guidelines: z.array(nutritionGuidelineSchema).length(11),
  disclosure: z.string().min(100),
});

export const launchContentSchema = z.object({
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  economy: economySchema,
  stalls: z.array(stallSchema),
  dishes: z.array(dishSchema),
  placeables: z.array(placeableSchema),
  customerArchetypes: z.array(customerArchetypeSchema),
  nutrition: nutritionContentSchema,
  localization: z.record(z.string(), z.string().min(1)),
});
