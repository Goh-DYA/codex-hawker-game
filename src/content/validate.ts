import { LAUNCH_CONTENT } from "./catalog";
import { PLACEABLE_CATEGORY_MINIMUMS } from "./placeables";
import { launchContentSchema } from "./schemas";
import type { PlaceableCategory } from "./types";

const EXPECTED_COUNTS = {
  stalls: 8,
  dishes: 30,
  minimumPlaceables: 80,
  customerArchetypes: 8,
} as const;

const PLACEHOLDER_PATTERN =
  /(?:\b(?:todo|tbd|placeholder|unnamed|lorem ipsum|coming soon)\b|^test(?: item)?$)/i;

export interface ContentValidationReport {
  readonly version: string;
  readonly counts: {
    readonly stalls: number;
    readonly dishes: number;
    readonly placeables: number;
    readonly customerArchetypes: number;
    readonly localizationKeys: number;
  };
  readonly categoryCounts: Readonly<Record<PlaceableCategory, number>>;
  readonly starterBundleCost: number;
}

export class ContentValidationError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`Launch content validation failed:\n- ${issues.join("\n- ")}`);
    this.name = "ContentValidationError";
    this.issues = issues;
  }
}

const increment = <T extends string>(record: Record<T, number>, key: T): void => {
  record[key] += 1;
};

/**
 * Performs schema and semantic validation. It throws one aggregated, actionable
 * error so development startup and CI show every broken content relationship at
 * once instead of failing on the first malformed record.
 */
export const validateContent = (
  candidate: unknown = LAUNCH_CONTENT,
): ContentValidationReport => {
  const parsed = launchContentSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new ContentValidationError(
      parsed.error.issues.map(
        (issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`,
      ),
    );
  }

  const content = parsed.data;
  const issues: string[] = [];
  const check = (condition: boolean, message: string): void => {
    if (!condition) issues.push(message);
  };

  check(
    content.stalls.length === EXPECTED_COUNTS.stalls,
    `Expected exactly ${EXPECTED_COUNTS.stalls} stalls, found ${content.stalls.length}.`,
  );
  check(
    content.dishes.length === EXPECTED_COUNTS.dishes,
    `Expected exactly ${EXPECTED_COUNTS.dishes} dishes, found ${content.dishes.length}.`,
  );
  check(
    content.placeables.length >= EXPECTED_COUNTS.minimumPlaceables,
    `Expected at least ${EXPECTED_COUNTS.minimumPlaceables} placeables, found ${content.placeables.length}.`,
  );
  check(
    content.customerArchetypes.length === EXPECTED_COUNTS.customerArchetypes,
    `Expected exactly ${EXPECTED_COUNTS.customerArchetypes} customer archetypes, found ${content.customerArchetypes.length}.`,
  );

  const groups = [
    ["stall", content.stalls],
    ["dish", content.dishes],
    ["placeable", content.placeables],
    ["customer archetype", content.customerArchetypes],
  ] as const;

  const allIds = new Set<string>();
  for (const [label, records] of groups) {
    const ids = new Set<string>();
    const names = new Set<string>();
    const descriptions = new Set<string>();

    for (const record of records) {
      check(!ids.has(record.id), `Duplicate ${label} ID: ${record.id}.`);
      check(!allIds.has(record.id), `Content ID is reused across groups: ${record.id}.`);
      ids.add(record.id);
      allIds.add(record.id);

      const name = content.localization[record.nameKey];
      const description = content.localization[record.descriptionKey];
      check(
        typeof name === "string",
        `${record.id} is missing localization key ${record.nameKey}.`,
      );
      check(
        typeof description === "string",
        `${record.id} is missing localization key ${record.descriptionKey}.`,
      );

      if (typeof name === "string") {
        const normalizedName = name.trim().toLocaleLowerCase("en");
        check(name.trim().length >= 3, `${record.id} has an empty or trivial name.`);
        check(
          !PLACEHOLDER_PATTERN.test(name),
          `${record.id} has a placeholder-like name: ${name}.`,
        );
        check(
          normalizedName !== record.nameKey.toLocaleLowerCase("en"),
          `${record.id} exposes its localization key as its name.`,
        );
        check(
          !names.has(normalizedName),
          `${label} name is not unique: ${name}.`,
        );
        names.add(normalizedName);
      }

      if (typeof description === "string") {
        const normalizedDescription = description
          .trim()
          .replace(/\s+/g, " ")
          .toLocaleLowerCase("en");
        check(
          description.trim().length >= 36,
          `${record.id} description is too short to be meaningful.`,
        );
        check(
          !PLACEHOLDER_PATTERN.test(description),
          `${record.id} has placeholder-like descriptive copy.`,
        );
        check(
          !descriptions.has(normalizedDescription),
          `${label} descriptions must be meaningfully distinct (${record.id}).`,
        );
        descriptions.add(normalizedDescription);
      }
    }
  }

  const dishById = new Map(content.dishes.map((dish) => [dish.id, dish]));
  const stallById = new Map(content.stalls.map((stall) => [stall.id, stall]));

  for (const stall of content.stalls) {
    check(
      stall.dishIds.length >= 3,
      `${stall.id} must offer at least three launch dishes.`,
    );
    check(
      stall.menuSlots <= stall.dishIds.length,
      `${stall.id} has more menu slots than available dishes.`,
    );
    check(
      new Set(stall.dishIds).size === stall.dishIds.length,
      `${stall.id} lists the same dish more than once.`,
    );
    for (const dishId of stall.dishIds) {
      const dish = dishById.get(dishId);
      check(Boolean(dish), `${stall.id} links to missing dish ${dishId}.`);
      check(
        Boolean(dish?.stallIds.includes(stall.id)),
        `${stall.id} -> ${dishId} is not reciprocated by the dish.`,
      );
    }
  }

  for (const dish of content.dishes) {
    check(
      dish.stallIds.length === 1,
      `${dish.id} must belong to exactly one launch stall.`,
    );
    for (const stallId of dish.stallIds) {
      const stall = stallById.get(stallId);
      check(Boolean(stall), `${dish.id} links to missing stall ${stallId}.`);
      check(
        Boolean(stall?.dishIds.includes(dish.id)),
        `${dish.id} -> ${stallId} is not reciprocated by the stall menu.`,
      );
      if (stall) {
        check(
          dish.unlockRequirement.level >= stall.unlockRequirement.level,
          `${dish.id} unlocks before its stall ${stall.id}.`,
        );
        check(
          dish.unlockRequirement.reputation >= stall.unlockRequirement.reputation,
          `${dish.id} reputation requirement is below its stall ${stall.id}.`,
        );
      }
    }
  }

  const categoryCounts = Object.fromEntries(
    Object.keys(PLACEABLE_CATEGORY_MINIMUMS).map((category) => [category, 0]),
  ) as Record<PlaceableCategory, number>;

  for (const item of content.placeables) {
    increment(categoryCounts, item.category);
    check(
      item.resaleValue <= item.price,
      `${item.id} resale value exceeds purchase price.`,
    );
    check(
      new Set(item.rotations).size === item.rotations.length,
      `${item.id} contains duplicate rotations.`,
    );
    check(item.rotations.includes(0), `${item.id} must include its base 0° rotation.`);
    check(
      item.spriteReferences.length === item.rotations.length,
      `${item.id} needs one sprite reference per supported rotation.`,
    );
    check(
      item.walkability === "blocked" || item.collision.length === 0,
      `${item.id} is walkable but still declares collision tiles.`,
    );
    check(
      item.walkability !== "blocked" || item.collision.length > 0,
      `${item.id} blocks movement but has no collision tiles.`,
    );
    for (const point of item.collision) {
      check(
        Number.isInteger(point.x) &&
          Number.isInteger(point.y) &&
          point.x >= 0 &&
          point.y >= 0 &&
          point.x < item.footprint.width &&
          point.y < item.footprint.height,
        `${item.id} has collision outside its footprint at (${point.x}, ${point.y}).`,
      );
    }
    if (item.category === "seat") {
      check(item.seatPoints.length > 0, `${item.id} is a seat with no seat point.`);
      check(
        item.interactionPoints.some((point) => point.role === "sit"),
        `${item.id} is a seat with no sit interaction.`,
      );
    }
  }

  for (const [category, minimum] of Object.entries(
    PLACEABLE_CATEGORY_MINIMUMS,
  ) as [PlaceableCategory, number][]) {
    check(
      categoryCounts[category] >= minimum,
      `Placeable category ${category} requires ${minimum}, found ${categoryCounts[category]}.`,
    );
  }

  const progressionRecords = [
    ...content.stalls,
    ...content.dishes,
    ...content.placeables,
    ...content.customerArchetypes,
  ];
  const unlockById = new Map(
    progressionRecords.map((record) => [record.id, record.unlockRequirement]),
  );

  for (const record of progressionRecords) {
    const unlock = record.unlockRequirement;
    check(
      unlock.level <= content.economy.maxLevel,
      `${record.id} unlock level ${unlock.level} exceeds max level ${content.economy.maxLevel}.`,
    );
    check(
      unlock.reputation <= content.economy.maxReputation,
      `${record.id} reputation ${unlock.reputation} exceeds the attainable maximum.`,
    );
    check(
      new Set(unlock.prerequisiteIds).size === unlock.prerequisiteIds.length,
      `${record.id} repeats an unlock prerequisite.`,
    );

    for (const prerequisiteId of unlock.prerequisiteIds) {
      const prerequisite = unlockById.get(prerequisiteId);
      check(
        prerequisiteId !== record.id,
        `${record.id} cannot require itself to unlock.`,
      );
      check(
        Boolean(prerequisite),
        `${record.id} has missing unlock prerequisite ${prerequisiteId}.`,
      );
      if (prerequisite) {
        check(
          prerequisite.level <= unlock.level &&
            prerequisite.reputation <= unlock.reputation,
          `${record.id} requires ${prerequisiteId}, which unlocks later.`,
        );
      }
    }
  }

  const visitedUnlocks = new Set<string>();
  const activeUnlockPath = new Set<string>();
  const visitUnlock = (id: string): void => {
    if (visitedUnlocks.has(id)) return;
    if (activeUnlockPath.has(id)) {
      issues.push(`Unlock prerequisite cycle includes ${id}.`);
      return;
    }

    activeUnlockPath.add(id);
    const requirement = unlockById.get(id);
    for (const prerequisiteId of requirement?.prerequisiteIds ?? []) {
      if (unlockById.has(prerequisiteId)) visitUnlock(prerequisiteId);
    }
    activeUnlockPath.delete(id);
    visitedUnlocks.add(id);
  };
  for (const id of unlockById.keys()) visitUnlock(id);

  check(
    content.economy.levelXpThresholds.length === content.economy.maxLevel,
    "Economy must provide one XP threshold for every level.",
  );
  check(
    content.economy.levelXpThresholds[0] === 0,
    "Level 1 XP threshold must be zero.",
  );
  for (let index = 1; index < content.economy.levelXpThresholds.length; index += 1) {
    check(
      content.economy.levelXpThresholds[index] >
        content.economy.levelXpThresholds[index - 1],
      `XP thresholds must increase strictly at level ${index + 1}.`,
    );
  }

  const starterStalls = content.stalls.filter(
    (stall) =>
      stall.unlockRequirement.level === 1 &&
      stall.unlockRequirement.reputation <= content.economy.startingReputation,
  );
  check(starterStalls.length >= 2, "At least two stalls must be available at launch.");
  for (const stall of starterStalls) {
    check(
      stall.dishIds.some((dishId) => {
        const dish = dishById.get(dishId);
        return (
          dish?.unlockRequirement.level === 1 &&
          dish.unlockRequirement.reputation <= content.economy.startingReputation
        );
      }),
      `${stall.id} has no dish available when the stall unlocks.`,
    );
  }

  const cheapestStarter = (
    category: PlaceableCategory,
    requiredTag?: string,
  ): number => {
    const prices = content.placeables
      .filter(
        (item) =>
          item.category === category &&
          item.unlockRequirement.level === 1 &&
          item.unlockRequirement.reputation <= content.economy.startingReputation &&
          (requiredTag === undefined || item.tags.includes(requiredTag)),
      )
      .map((item) => item.price);
    check(
      prices.length > 0,
      `No starter ${requiredTag ?? category} is available.`,
    );
    return prices.length > 0 ? Math.min(...prices) : Number.POSITIVE_INFINITY;
  };

  const cheapestStarterStall =
    starterStalls.length > 0
      ? Math.min(...starterStalls.map((stall) => stall.purchaseCost))
      : Number.POSITIVE_INFINITY;
  const cheapestTable = cheapestStarter("table");
  const cheapestSeat = cheapestStarter("seat");
  const cheapestTrayReturn = cheapestStarter("tray-waste", "tray-return");
  const cheapestFacility = cheapestStarter("facility");
  const starterBundleCost =
    cheapestStarterStall +
    cheapestTable +
    cheapestSeat * content.economy.starterRequiredSeats +
    cheapestTrayReturn +
    cheapestFacility;

  check(
    starterBundleCost <= content.economy.startingCash,
    `Starter bundle costs ${starterBundleCost}, above starting cash ${content.economy.startingCash}.`,
  );
  check(
    content.economy.recoveryGrant >=
      cheapestTable +
        cheapestSeat * content.economy.starterRequiredSeats +
        cheapestTrayReturn,
    "Recovery grant cannot restore a minimum table, seats, and waste facility.",
  );

  for (const stall of content.stalls) {
    const plausibleCashAtUnlock =
      content.economy.startingCash +
      (stall.unlockRequirement.level - 1) *
        content.economy.minimumVisitEarnings *
        120;
    check(
      stall.purchaseCost <= plausibleCashAtUnlock,
      `${stall.id} is not plausibly affordable at its unlock level.`,
    );
  }

  const roles = new Set<string>();
  const behaviorSignatures = new Set<string>();
  for (const customer of content.customerArchetypes) {
    check(
      customer.budgetRange[0] <= customer.budgetRange[1],
      `${customer.id} has an inverted budget range.`,
    );
    check(
      customer.groupSizeRange[0] <= customer.groupSizeRange[1],
      `${customer.id} has an inverted group-size range.`,
    );
    check(
      customer.visitSchedule.startHour < customer.visitSchedule.endHour,
      `${customer.id} has an empty visit schedule.`,
    );
    check(
      !roles.has(customer.gameplayRole.toLocaleLowerCase("en")),
      `${customer.id} duplicates another customer gameplay role.`,
    );
    roles.add(customer.gameplayRole.toLocaleLowerCase("en"));

    const signature = [
      customer.patienceSeconds,
      customer.walkingSpeedTilesPerSecond,
      customer.priceSensitivity,
      customer.qualitySensitivity,
      customer.queueSensitivity,
      customer.distanceSensitivity,
      customer.noveltyPreference,
      customer.seatPreference,
      customer.groupSizeRange.join("-"),
      customer.visitSchedule.startHour,
      customer.visitSchedule.endHour,
    ].join("|");
    check(
      !behaviorSignatures.has(signature),
      `${customer.id} is not behaviorally distinct.`,
    );
    behaviorSignatures.add(signature);
  }

  if (issues.length > 0) throw new ContentValidationError(issues);

  return {
    version: content.version,
    counts: {
      stalls: content.stalls.length,
      dishes: content.dishes.length,
      placeables: content.placeables.length,
      customerArchetypes: content.customerArchetypes.length,
      localizationKeys: Object.keys(content.localization).length,
    },
    categoryCounts,
    starterBundleCost,
  };
};
