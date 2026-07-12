import type {
  EconomyState,
  GridMap,
  ProgressionState,
  SimulationCatalog,
  SimulationConfig,
} from "./types";

export interface EconomyUpdate {
  readonly economy: EconomyState;
  readonly progression: ProgressionState;
  readonly levelUp: boolean;
}

export function xpRequiredForLevel(level: number): number {
  if (!Number.isInteger(level) || level < 1) throw new RangeError("Level must be a positive integer");
  return 100 * (level - 1) * (level - 1);
}

export function calculateLevel(xp: number): number {
  if (!Number.isFinite(xp) || xp < 0) throw new RangeError("XP cannot be negative");
  return 1 + Math.floor(Math.sqrt(xp / 100));
}

export function canAfford(economy: EconomyState, cost: number): boolean {
  return Number.isFinite(cost) && cost >= 0 && economy.currency >= cost;
}

export function applyPurchase(economy: EconomyState, cost: number): EconomyState {
  if (!Number.isFinite(cost) || cost < 0) throw new RangeError("Purchase cost cannot be negative");
  if (!canAfford(economy, cost)) throw new RangeError("Insufficient currency");
  return {
    ...economy,
    currency: economy.currency - cost,
    lifetimeSpend: economy.lifetimeSpend + cost,
  };
}

export function calculateRefund(purchasePrice: number, refundRate = 0.5): number {
  if (!Number.isFinite(purchasePrice) || purchasePrice < 0) throw new RangeError("Price cannot be negative");
  if (!Number.isFinite(refundRate) || refundRate < 0 || refundRate > 1) {
    throw new RangeError("Refund rate must be between zero and one");
  }
  return Math.floor(purchasePrice * refundRate);
}

export function applyRefund(economy: EconomyState, amount: number): EconomyState {
  if (!Number.isFinite(amount) || amount < 0) throw new RangeError("Refund cannot be negative");
  return { ...economy, currency: economy.currency + amount };
}

export function calculateExpansionCost(
  map: GridMap,
  progression: ProgressionState,
  config: SimulationConfig,
  addColumns: number,
  addRows: number,
): number {
  if (!Number.isInteger(addColumns) || !Number.isInteger(addRows) || addColumns < 0 || addRows < 0) {
    throw new RangeError("Expansion dimensions must be non-negative integers");
  }
  const addedTiles = (map.width + addColumns) * (map.height + addRows) - map.width * map.height;
  if (addedTiles <= 0) throw new RangeError("Expansion must add at least one tile");
  return Math.ceil(
    addedTiles * config.expansionBaseCostPerTile * config.expansionCostGrowth ** progression.expansionCount,
  );
}

export function applySale(
  economy: EconomyState,
  progression: ProgressionState,
  price: number,
  dishQuality: number,
  reputationGain = 0.02,
): EconomyUpdate {
  if (!Number.isFinite(price) || price < 0) throw new RangeError("Sale price cannot be negative");
  const normalizedQuality = Math.max(0, Math.min(5, dishQuality));
  const xpGain = Math.max(1, Math.round(price * (1 + normalizedQuality / 5)));
  const nextXp = progression.xp + xpGain;
  const nextLevel = calculateLevel(nextXp);
  return {
    economy: {
      ...economy,
      currency: economy.currency + price,
      lifetimeRevenue: economy.lifetimeRevenue + price,
      completedVisits: economy.completedVisits + 1,
    },
    progression: {
      ...progression,
      xp: nextXp,
      level: nextLevel,
      reputation: Math.max(0, Math.min(5, progression.reputation + reputationGain)),
    },
    levelUp: nextLevel > progression.level,
  };
}

export function markAbandonedVisit(economy: EconomyState, progression: ProgressionState): EconomyUpdate {
  return {
    economy: { ...economy, abandonedVisits: economy.abandonedVisits + 1 },
    progression: {
      ...progression,
      reputation: Math.max(0, progression.reputation - 0.01),
    },
    levelUp: false,
  };
}

export function getUnlockedDefinitionIds(
  catalog: SimulationCatalog,
  level: number,
  explicitUnlocks: readonly string[] = [],
): readonly string[] {
  const unlocked = new Set(explicitUnlocks);
  for (const definition of Object.values(catalog.placeables)) {
    if ((definition.unlockLevel ?? 1) <= level) unlocked.add(definition.id);
  }
  return [...unlocked].filter((id) => Boolean(catalog.placeables[id])).sort();
}
