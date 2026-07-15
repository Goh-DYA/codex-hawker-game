import { calculateLevel } from "./economy";
import type {
  DailyObjective,
  GameState,
  SimulationEvent,
  StallDefinition,
  StallMasteryState,
} from "./types";

export const OPERATING_DAY_MS = 8 * 60 * 1_000;
const OPERATING_START_MINUTE = 10 * 60 + 30;
const MASTERY_RANK_DIVISOR = 100;

export function operatingDay(elapsedMs: number): number {
  return 1 + Math.floor(Math.max(0, elapsedMs) / OPERATING_DAY_MS);
}

export function operatingMinuteOfDay(elapsedMs: number): number {
  const operatingElapsedMs = Math.max(0, elapsedMs) % OPERATING_DAY_MS;
  return OPERATING_START_MINUTE + Math.floor(operatingElapsedMs / 1_000);
}

export function averageVisitRating(state: Pick<GameState, "metrics">): number | undefined {
  const ratings = state.metrics.visitRatings;
  if (ratings.length === 0) return undefined;
  return ratings.reduce((sum, rating) => sum + rating.score, 0) / ratings.length;
}

export function masteryRank(points: number): number {
  return 1 + Math.floor(Math.sqrt(Math.max(0, points) / MASTERY_RANK_DIVISOR));
}

export function effectiveStallDefinition(
  state: Pick<GameState, "progression">,
  definitionId: string,
  stall: StallDefinition,
): StallDefinition {
  const level = state.progression.stallMastery[definitionId]?.upgradeLevel ?? 1;
  const upgrade = stall.upgradeLevels?.find((candidate) => candidate.level === level);
  if (!upgrade) return stall;
  return {
    ...stall,
    orderMs: Math.max(100, Math.round(stall.orderMs * upgrade.serviceTimeMultiplier)),
    preparationCapacity: stall.preparationCapacity + upgrade.capacityBonus,
    queueCapacity: stall.queueCapacity + upgrade.capacityBonus,
    quality: Math.min(5, stall.quality + upgrade.qualityBonus),
    menuSlots: (stall.menuSlots ?? stall.dishIds.length) + upgrade.menuSlotsBonus,
  };
}

export function awardStallMastery(
  state: Pick<GameState, "progression">,
  definitionId: string,
  happiness: number,
): GameState["progression"] {
  const current = state.progression.stallMastery[definitionId] ?? {
    points: 0,
    rank: 1,
    upgradeLevel: 1,
  } satisfies StallMasteryState;
  const points = current.points + 10 + Math.round(Math.max(0, Math.min(100, happiness)) / 10);
  return {
    ...state.progression,
    stallMastery: {
      ...state.progression.stallMastery,
      [definitionId]: { ...current, points, rank: masteryRank(points) },
    },
  };
}

function distinctOpenStallTypes(state: GameState): number {
  return new Set(
    Object.values(state.objects)
      .filter((object) => object.open && state.catalog.placeables[object.definitionId]?.kind === "stall")
      .map((object) => object.definitionId),
  ).size;
}

function queueFlowScore(state: GameState): number {
  const counts = Object.values(state.queues).reduce((sum, queue) => sum + queue.length, 0);
  const capacity = Object.values(state.objects).reduce((sum, object) => {
    const stall = state.catalog.placeables[object.definitionId]?.stall;
    return sum + (stall ? effectiveStallDefinition(state, object.definitionId, stall).queueCapacity : 0);
  }, 0);
  return Math.max(0, Math.min(100, 100 - (counts / Math.max(1, capacity)) * 100));
}

function objective(
  day: number,
  slot: number,
  values: Omit<DailyObjective, "id" | "day" | "progress" | "completed">,
): DailyObjective {
  return { id: `day-${day}-${slot}-${values.kind}`, day, progress: 0, completed: false, ...values };
}

export function createDailyObjectives(state: GameState, day = operatingDay(state.elapsedMs)): readonly DailyObjective[] {
  const scale = Math.max(1, state.progression.level);
  const rewardCash = 80 + scale * 20;
  const rewardXp = 25 + scale * 5;
  const service = day % 2 === 0
    ? objective(day, 1, {
        kind: "revenue",
        title: "A lively service",
        description: `Earn ${Math.round(35 + scale * 8)} credits today.`,
        target: Math.round(35 + scale * 8),
        startValue: state.economy.lifetimeRevenue,
        rewardCash,
        rewardXp,
      })
    : objective(day, 1, {
        kind: "serve",
        title: "Warm welcome",
        description: `Serve ${5 + scale * 2} neighbours today.`,
        target: 5 + scale * 2,
        startValue: state.economy.completedVisits,
        rewardCash,
        rewardXp,
      });
  const quality = day % 3 === 0
    ? objective(day, 2, {
        kind: "flow",
        title: "Easy movement",
        description: "Keep queue flow at 80% or better.",
        target: 80,
        startValue: 0,
        rewardCash,
        rewardXp,
      })
    : objective(day, 2, {
        kind: "happiness",
        title: "Happy tables",
        description: `Reach ${Math.min(92, 72 + scale)}% happiness after five new ratings.`,
        target: Math.min(92, 72 + scale),
        startValue: state.metrics.completedCustomers,
        rewardCash,
        rewardXp,
      });
  const hasTrayReturn = Object.values(state.objects).some(
    (object) => state.catalog.placeables[object.definitionId]?.kind === "tray-return",
  );
  const variety = hasTrayReturn && day % 2 === 0
    ? objective(day, 3, {
        kind: "facility",
        title: "Return-ready",
        description: `Complete ${3 + Math.floor(scale / 2)} tray returns.`,
        target: 3 + Math.floor(scale / 2),
        startValue: state.metrics.trayReturns,
        rewardCash,
        rewardXp,
      })
    : objective(day, 3, {
        kind: "variety",
        title: "Something for everyone",
        description: `Operate ${Math.min(8, Math.max(2, distinctOpenStallTypes(state) + 1))} stall types.`,
        target: Math.min(8, Math.max(2, distinctOpenStallTypes(state) + 1)),
        startValue: 0,
        rewardCash,
        rewardXp,
      });
  return [service, quality, variety];
}

function objectiveProgress(state: GameState, item: DailyObjective): number {
  switch (item.kind) {
    case "serve": return state.economy.completedVisits - item.startValue;
    case "revenue": return state.economy.lifetimeRevenue - item.startValue;
    case "happiness": {
      const newRatingCount = state.metrics.completedCustomers - item.startValue;
      if (newRatingCount < 5) return 0;
      const newRatings = state.metrics.visitRatings.slice(-Math.min(50, newRatingCount));
      return newRatings.reduce((sum, rating) => sum + rating.score, 0) / newRatings.length;
    }
    case "flow": return queueFlowScore(state);
    case "variety": return distinctOpenStallTypes(state);
    case "facility": return state.metrics.trayReturns - item.startValue;
  }
}

const MILESTONES = [
  ...[50, 250, 1_000, 5_000].map((target, index) => ({ id: `service-${index + 1}`, tier: index + 1, met: (state: GameState) => state.economy.completedVisits >= target })),
  ...[75, 85, 90, 95].map((target, index) => ({ id: `hospitality-${index + 1}`, tier: index + 1, met: (state: GameState) => state.metrics.visitRatings.length >= 20 && (averageVisitRating(state) ?? 0) >= target })),
  ...[2, 4, 6, 8].map((target, index) => ({ id: `variety-${index + 1}`, tier: index + 1, met: (state: GameState) => distinctOpenStallTypes(state) >= target })),
  ...[3, 7, 12, 20].map((target, index) => ({ id: `growth-${index + 1}`, tier: index + 1, met: (state: GameState) => state.progression.level >= target })),
] as const;

export function updateProgressionSystems(source: GameState): GameState {
  const day = operatingDay(source.elapsedMs);
  let state = source;
  if (state.progression.focusDay !== day || state.progression.dailyObjectives.length !== 3) {
    state = {
      ...state,
      progression: { ...state.progression, focusDay: day, dailyObjectives: createDailyObjectives(state, day) },
    };
  }
  let currency = state.economy.currency;
  let xp = state.progression.xp;
  const events: SimulationEvent[] = [...state.events];
  const dailyObjectives = state.progression.dailyObjectives.map((item) => {
    if (item.completed) return item;
    const progress = Math.max(0, objectiveProgress(state, item));
    if (progress < item.target) return { ...item, progress };
    currency += item.rewardCash;
    xp += item.rewardXp;
    events.push({ type: "objective-completed", tick: state.tick, entityId: item.id, amount: item.rewardCash, message: item.title });
    return { ...item, progress, completed: true };
  });
  const claimed = new Set(state.progression.claimedMilestoneIds);
  for (const milestone of MILESTONES) {
    if (claimed.has(milestone.id) || !milestone.met(state)) continue;
    claimed.add(milestone.id);
    const cashReward = 250 * milestone.tier;
    const xpReward = 100 * milestone.tier;
    currency += cashReward;
    xp += xpReward;
    events.push({ type: "milestone-completed", tick: state.tick, entityId: milestone.id, amount: cashReward });
  }
  return {
    ...state,
    economy: { ...state.economy, currency },
    progression: {
      ...state.progression,
      xp,
      level: calculateLevel(xp),
      dailyObjectives,
      claimedMilestoneIds: [...claimed],
    },
    events,
  };
}
