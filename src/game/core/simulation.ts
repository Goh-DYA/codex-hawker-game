import { applySale, getUnlockedDefinitionIds, markAbandonedVisit } from "./economy";
import {
  getBlockedTileKeys,
  getObjectQueueAnchor,
  getObjectTrayReturnPoint,
  getSeatLocations,
  isTileWalkable,
  pointKey,
  samePoint,
  type SeatLocation,
} from "./grid";
import { findPath } from "./pathfinding";
import { choose, nextFloat } from "./rng";
import { compareIds } from "./ordering";
import { cloneCustomer } from "./state";
import type {
  AdvanceResult,
  Customer,
  CustomerArchetype,
  CustomerStatus,
  DishDefinition,
  GameState,
  GridPoint,
  PlaceableDefinition,
  PlacedObject,
  SimulationEvent,
  SimulationMetrics,
} from "./types";

interface Draft {
  readonly source: GameState;
  objects: Readonly<Record<string, PlacedObject>>;
  customers: Record<string, Customer>;
  queues: Record<string, readonly string[]>;
  seatReservations: Record<string, string>;
  economy: GameState["economy"];
  progression: GameState["progression"];
  rngState: number;
  nextCustomerSequence: number;
  spawnCountdownMs: number;
  metrics: SimulationMetrics;
  events: SimulationEvent[];
  tick: number;
}

interface StallRuntime {
  readonly object: PlacedObject;
  readonly definition: PlaceableDefinition;
  readonly queueAnchor: GridPoint;
}

interface MoveResult {
  readonly customer: Customer;
  readonly arrived: boolean;
  readonly failed: boolean;
}

function createDraft(state: GameState, tick: number): Draft {
  return {
    source: state,
    objects: state.objects,
    customers: Object.fromEntries(
      Object.entries(state.customers).map(([id, customer]) => [id, cloneCustomer(customer)]),
    ),
    queues: Object.fromEntries(Object.entries(state.queues).map(([id, queue]) => [id, [...queue]])),
    seatReservations: { ...state.seatReservations },
    economy: { ...state.economy },
    progression: { ...state.progression, unlockedDefinitionIds: [...state.progression.unlockedDefinitionIds] },
    rngState: state.rngState,
    nextCustomerSequence: state.nextCustomerSequence,
    spawnCountdownMs: state.spawnCountdownMs,
    metrics: { ...state.metrics },
    events: [],
    tick,
  };
}

function event(draft: Draft, value: Omit<SimulationEvent, "tick">): void {
  draft.events.push({ ...value, tick: draft.tick });
}

function transition(draft: Draft, customer: Customer, status: CustomerStatus): Customer {
  if (customer.status !== status) {
    event(draft, { type: "customer-state-changed", entityId: customer.id, message: `${customer.status} -> ${status}` });
  }
  return {
    ...customer,
    status,
    stateElapsedMs: 0,
    path: [],
    pathIndex: 0,
    movementProgress: 0,
    stuckMs: 0,
  };
}

function getArchetype(draft: Draft, customer: Customer): CustomerArchetype {
  const archetype = draft.source.catalog.archetypes[customer.archetypeId];
  if (!archetype) throw new Error(`Customer ${customer.id} references missing archetype ${customer.archetypeId}`);
  return archetype;
}

function getStall(draft: Draft, stallId: string | undefined): StallRuntime | undefined {
  if (!stallId) return undefined;
  const object = draft.objects[stallId];
  const definition = object ? draft.source.catalog.placeables[object.definitionId] : undefined;
  const queueAnchor = object ? getObjectQueueAnchor(object, draft.source.catalog) : undefined;
  if (!object || !object.open || definition?.kind !== "stall" || !definition.stall || !queueAnchor) return undefined;
  return { object, definition, queueAnchor };
}

function blockedTiles(draft: Draft): ReadonlySet<string> {
  return getBlockedTileKeys(draft.objects, draft.source.catalog);
}

function requestPath(draft: Draft, start: GridPoint, end: GridPoint): readonly GridPoint[] | null {
  const result = findPath(draft.source.map, start, end, {
    blocked: blockedTiles(draft),
    allowEndBlocked: true,
  });
  draft.metrics = {
    ...draft.metrics,
    pathRequests: draft.metrics.pathRequests + 1,
    pathFailures: draft.metrics.pathFailures + (result.path ? 0 : 1),
  };
  return result.path;
}

function preparePath(customer: Customer, path: readonly GridPoint[]): Customer {
  return {
    ...customer,
    path: path.map((point) => ({ ...point })),
    pathIndex: path.length > 1 ? 1 : path.length,
    movementProgress: 0,
    stuckMs: 0,
  };
}

function pathNeedsRefresh(
  draft: Draft,
  customer: Customer,
  destination: GridPoint,
  blocked: ReadonlySet<string>,
): boolean {
  if (customer.path.length === 0) return true;
  const final = customer.path.at(-1);
  if (!final || !samePoint(final, destination)) return true;
  const next = customer.path[customer.pathIndex];
  if (!next) return !samePoint(customer.position, destination);
  return !isTileWalkable(draft.source.map, next, blocked, destination);
}

function moveToward(draft: Draft, customer: Customer, destination: GridPoint, deltaMs: number): MoveResult {
  if (samePoint(customer.position, destination)) return { customer, arrived: true, failed: false };
  const blocked = blockedTiles(draft);
  let next = customer;
  if (pathNeedsRefresh(draft, next, destination, blocked)) {
    const path = requestPath(draft, customer.position, destination);
    if (!path) {
      next = { ...customer, path: [], pathIndex: 0, stuckMs: customer.stuckMs + deltaMs };
      return { customer: next, arrived: false, failed: next.stuckMs >= draft.source.config.stuckRecoveryMs };
    }
    next = preparePath(customer, path);
  }

  const archetype = getArchetype(draft, next);
  let progress = next.movementProgress + archetype.walkingSpeed * (deltaMs / 1_000);
  let position = next.position;
  let pathIndex = next.pathIndex;
  while (progress >= 1 && pathIndex < next.path.length) {
    const step = next.path[pathIndex] as GridPoint;
    if (!isTileWalkable(draft.source.map, step, blocked, destination)) {
      return {
        customer: { ...next, position, path: [], pathIndex: 0, movementProgress: 0, stuckMs: next.stuckMs + deltaMs },
        arrived: false,
        failed: next.stuckMs + deltaMs >= draft.source.config.stuckRecoveryMs,
      };
    }
    position = { ...step };
    pathIndex += 1;
    progress -= 1;
  }
  const arrived = samePoint(position, destination);
  return {
    customer: {
      ...next,
      position,
      pathIndex,
      movementProgress: arrived ? 0 : progress,
      stuckMs: 0,
    },
    arrived,
    failed: false,
  };
}

function removeFromAllQueues(draft: Draft, customerId: string): void {
  for (const [stallId, queue] of Object.entries(draft.queues)) {
    if (queue.includes(customerId)) draft.queues[stallId] = queue.filter((id) => id !== customerId);
  }
}

function releaseSeat(draft: Draft, customer: Customer): Customer {
  if (!customer.reservedSeatKey) return customer;
  if (draft.seatReservations[customer.reservedSeatKey] === customer.id) {
    delete draft.seatReservations[customer.reservedSeatKey];
  }
  return { ...customer, reservedSeatKey: undefined };
}

function markRecovery(draft: Draft, customer: Customer, message: string): void {
  draft.metrics = { ...draft.metrics, recoveredTargets: draft.metrics.recoveredTargets + 1 };
  event(draft, { type: "target-recovered", entityId: customer.id, message });
}

function beginExit(draft: Draft, source: Customer, abandoned: boolean): Customer {
  let customer = releaseSeat(draft, source);
  removeFromAllQueues(draft, customer.id);
  customer = transition(draft, customer, "walking-to-exit");
  customer = {
    ...customer,
    targetStallId: undefined,
    orderedDishId: customer.orderedDishId,
    reservedSeatKey: undefined,
    targetTrayReturnId: undefined,
    satisfaction: abandoned ? Math.max(0, customer.satisfaction - 1) : customer.satisfaction,
  };
  if (abandoned) {
    const update = markAbandonedVisit(draft.economy, draft.progression);
    draft.economy = update.economy;
    draft.progression = update.progression;
  }
  return customer;
}

function openStalls(draft: Draft): readonly StallRuntime[] {
  return Object.values(draft.objects)
    .sort((a, b) => compareIds(a.id, b.id))
    .map((object) => getStall(draft, object.id))
    .filter((stall): stall is StallRuntime => Boolean(stall));
}

function spawnCustomer(draft: Draft): void {
  const archetypes = Object.values(draft.source.catalog.archetypes).sort((a, b) => compareIds(a.id, b.id));
  if (archetypes.length === 0 || openStalls(draft).length === 0) return;
  const selected = choose(draft.rngState, archetypes);
  draft.rngState = selected.state;
  const id = `customer-${draft.nextCustomerSequence}`;
  draft.nextCustomerSequence += 1;
  draft.customers[id] = {
    id,
    archetypeId: selected.value.id,
    status: "choosing-stall",
    position: { ...draft.source.entrance },
    path: [],
    pathIndex: 0,
    movementProgress: 0,
    stateElapsedMs: 0,
    visitElapsedMs: 0,
    patienceRemainingMs: selected.value.patienceMs,
    satisfaction: 3,
    hasTray: false,
    served: false,
    spent: 0,
    stuckMs: 0,
  };
  draft.metrics = { ...draft.metrics, spawnedCustomers: draft.metrics.spawnedCustomers + 1 };
  event(draft, { type: "customer-spawned", entityId: id });
}

function affordableDishes(draft: Draft, stall: StallRuntime, customer: Customer): readonly DishDefinition[] {
  const archetype = getArchetype(draft, customer);
  return (stall.definition.stall?.dishIds ?? [])
    .map((id) => draft.source.catalog.dishes[id])
    .filter((dish): dish is DishDefinition => Boolean(dish && dish.price + customer.spent <= archetype.budget));
}

function chooseStall(draft: Draft, source: Customer): Customer {
  const archetype = getArchetype(draft, source);
  let best: { stall: StallRuntime; path: readonly GridPoint[]; score: number } | undefined;
  for (const stall of openStalls(draft)) {
    const config = stall.definition.stall as NonNullable<PlaceableDefinition["stall"]>;
    const queue = draft.queues[stall.object.id] ?? [];
    if (queue.length >= config.queueCapacity || affordableDishes(draft, stall, source).length === 0) continue;
    const path = requestPath(draft, source.position, stall.queueAnchor);
    if (!path) continue;
    const cheapest = Math.min(...affordableDishes(draft, stall, source).map((dish) => dish.price));
    const random = nextFloat(draft.rngState);
    draft.rngState = random.state;
    const score =
      config.popularity * 2 +
      config.quality * archetype.qualitySensitivity -
      queue.length * archetype.queueSensitivity -
      (path.length - 1) * archetype.distanceSensitivity -
      cheapest * archetype.priceSensitivity +
      random.value * 0.001;
    if (!best || score > best.score || (score === best.score && stall.object.id < best.stall.object.id)) {
      best = { stall, path, score };
    }
  }
  if (!best) return beginExit(draft, source, true);
  const customer = preparePath(transition(draft, source, "walking-to-queue"), best.path);
  return { ...customer, targetStallId: best.stall.object.id };
}

function chooseDish(draft: Draft, stall: StallRuntime, customer: Customer): DishDefinition | undefined {
  const archetype = getArchetype(draft, customer);
  const preferred = new Set(archetype.preferenceTags ?? []);
  let best: { dish: DishDefinition; score: number } | undefined;
  for (const dish of [...affordableDishes(draft, stall, customer)].sort((a, b) => compareIds(a.id, b.id))) {
    const matches = (dish.preferenceTags ?? []).filter((tag) => preferred.has(tag)).length;
    const random = nextFloat(draft.rngState);
    draft.rngState = random.state;
    const score = dish.quality * archetype.qualitySensitivity + matches * 2 - dish.price * archetype.priceSensitivity + random.value * 0.001;
    if (!best || score > best.score || (score === best.score && dish.id < best.dish.id)) best = { dish, score };
  }
  return best?.dish;
}

function findSeat(draft: Draft, customer: Customer): { seat: SeatLocation; path: readonly GridPoint[] } | undefined {
  let best: { seat: SeatLocation; path: readonly GridPoint[] } | undefined;
  for (const seat of getSeatLocations(draft.objects, draft.source.catalog)) {
    if (draft.seatReservations[seat.key]) continue;
    const path = requestPath(draft, customer.position, seat.point);
    if (!path) continue;
    if (!best || path.length < best.path.length || (path.length === best.path.length && seat.key < best.seat.key)) {
      best = { seat, path };
    }
  }
  return best;
}

function findReservedSeat(draft: Draft, customer: Customer): SeatLocation | undefined {
  if (!customer.reservedSeatKey || draft.seatReservations[customer.reservedSeatKey] !== customer.id) return undefined;
  return getSeatLocations(draft.objects, draft.source.catalog).find((seat) => seat.key === customer.reservedSeatKey);
}

function findTrayReturn(
  draft: Draft,
  customer: Customer,
): { object: PlacedObject; point: GridPoint; path: readonly GridPoint[] } | undefined {
  let best: { object: PlacedObject; point: GridPoint; path: readonly GridPoint[] } | undefined;
  for (const object of Object.values(draft.objects).sort((a, b) => compareIds(a.id, b.id))) {
    if (draft.source.catalog.placeables[object.definitionId]?.kind !== "tray-return") continue;
    const point = getObjectTrayReturnPoint(object, draft.source.catalog);
    if (!point) continue;
    const path = requestPath(draft, customer.position, point);
    if (!path) continue;
    if (!best || path.length < best.path.length || (path.length === best.path.length && object.id < best.object.id)) {
      best = { object, point, path };
    }
  }
  return best;
}

function findTargetTrayPoint(draft: Draft, id: string | undefined): GridPoint | undefined {
  if (!id) return undefined;
  const object = draft.objects[id];
  if (!object || draft.source.catalog.placeables[object.definitionId]?.kind !== "tray-return") return undefined;
  return getObjectTrayReturnPoint(object, draft.source.catalog);
}

function activePreparationCount(draft: Draft, stallId: string): number {
  return Object.values(draft.customers).filter(
    (customer) => customer.targetStallId === stallId && (customer.status === "ordering" || customer.status === "waiting-for-food"),
  ).length;
}

function completeSale(draft: Draft, source: Customer, dish: DishDefinition): Customer {
  const update = applySale(
    draft.economy,
    draft.progression,
    dish.price,
    dish.quality,
    draft.source.config.reputationGainPerVisit,
  );
  draft.economy = update.economy;
  draft.progression = {
    ...update.progression,
    unlockedDefinitionIds: getUnlockedDefinitionIds(
      draft.source.catalog,
      update.progression.level,
      update.progression.unlockedDefinitionIds,
    ),
  };
  removeFromAllQueues(draft, source.id);
  event(draft, { type: "sale-completed", entityId: source.id, amount: dish.price, message: dish.id });
  if (update.levelUp) event(draft, { type: "level-up", entityId: source.id, message: String(update.progression.level) });
  return {
    ...transition(draft, source, "seeking-seat"),
    targetStallId: undefined,
    orderedDishId: dish.id,
    hasTray: true,
    served: true,
    spent: source.spent + dish.price,
    satisfaction: Math.min(5, source.satisfaction + dish.quality * 0.1),
  };
}

function processCustomer(draft: Draft, source: Customer, deltaMs: number): Customer | undefined {
  let customer: Customer = {
    ...source,
    visitElapsedMs: source.visitElapsedMs + deltaMs,
    stateElapsedMs: source.stateElapsedMs + deltaMs,
  };

  if (customer.visitElapsedMs >= draft.source.config.maxVisitMs && customer.status !== "walking-to-exit") {
    return beginExit(draft, customer, !customer.served);
  }

  switch (customer.status) {
    case "choosing-stall":
      return chooseStall(draft, customer);

    case "walking-to-queue": {
      const stall = getStall(draft, customer.targetStallId);
      if (!stall) {
        removeFromAllQueues(draft, customer.id);
        markRecovery(draft, customer, "Stall unavailable while walking to queue");
        return { ...transition(draft, customer, "choosing-stall"), targetStallId: undefined, orderedDishId: undefined };
      }
      const movement = moveToward(draft, customer, stall.queueAnchor, deltaMs);
      customer = movement.customer;
      if (movement.failed) {
        markRecovery(draft, customer, "Queue path became unreachable");
        return { ...transition(draft, customer, "choosing-stall"), targetStallId: undefined };
      }
      if (!movement.arrived) return customer;
      const queue = draft.queues[stall.object.id] ?? [];
      if (queue.length >= (stall.definition.stall?.queueCapacity ?? 0)) {
        return { ...transition(draft, customer, "choosing-stall"), targetStallId: undefined };
      }
      draft.queues[stall.object.id] = [...queue, customer.id];
      return transition(draft, customer, "queued");
    }

    case "queued": {
      const stall = getStall(draft, customer.targetStallId);
      const queue = customer.targetStallId ? draft.queues[customer.targetStallId] ?? [] : [];
      if (!stall || !queue.includes(customer.id)) {
        removeFromAllQueues(draft, customer.id);
        markRecovery(draft, customer, "Queue target was removed");
        return { ...transition(draft, customer, "choosing-stall"), targetStallId: undefined };
      }
      customer = { ...customer, patienceRemainingMs: customer.patienceRemainingMs - deltaMs };
      if (customer.patienceRemainingMs <= 0) return beginExit(draft, customer, true);
      if (
        queue[0] === customer.id &&
        activePreparationCount(draft, stall.object.id) < (stall.definition.stall?.preparationCapacity ?? 1)
      ) {
        return transition(draft, customer, "ordering");
      }
      return customer;
    }

    case "ordering": {
      const stall = getStall(draft, customer.targetStallId);
      if (!stall) {
        removeFromAllQueues(draft, customer.id);
        markRecovery(draft, customer, "Stall closed during ordering");
        return { ...transition(draft, customer, "choosing-stall"), targetStallId: undefined };
      }
      if (customer.stateElapsedMs < (stall.definition.stall?.orderMs ?? 0)) return customer;
      const dish = chooseDish(draft, stall, customer);
      if (!dish) return beginExit(draft, customer, true);
      // Ordering occupies the queue head; preparation occupies a capacity slot.
      // Releasing here lets the next customer advance while this meal is prepared.
      removeFromAllQueues(draft, customer.id);
      return { ...transition(draft, customer, "waiting-for-food"), orderedDishId: dish.id };
    }

    case "waiting-for-food": {
      const stall = getStall(draft, customer.targetStallId);
      const dish = customer.orderedDishId ? draft.source.catalog.dishes[customer.orderedDishId] : undefined;
      if (!stall || !dish) {
        removeFromAllQueues(draft, customer.id);
        markRecovery(draft, customer, "Order target disappeared during preparation");
        return { ...transition(draft, customer, "choosing-stall"), targetStallId: undefined, orderedDishId: undefined };
      }
      if (customer.stateElapsedMs < dish.preparationMs) return customer;
      return completeSale(draft, customer, dish);
    }

    case "seeking-seat": {
      const selected = findSeat(draft, customer);
      if (!selected) {
        customer = { ...customer, patienceRemainingMs: customer.patienceRemainingMs - deltaMs };
        if (customer.patienceRemainingMs <= 0) return beginExit(draft, customer, false);
        return customer;
      }
      draft.seatReservations[selected.seat.key] = customer.id;
      return {
        ...preparePath(transition(draft, customer, "walking-to-seat"), selected.path),
        reservedSeatKey: selected.seat.key,
      };
    }

    case "walking-to-seat": {
      const seat = findReservedSeat(draft, customer);
      if (!seat) {
        customer = releaseSeat(draft, customer);
        markRecovery(draft, customer, "Reserved seat was removed");
        return transition(draft, customer, "seeking-seat");
      }
      const movement = moveToward(draft, customer, seat.point, deltaMs);
      if (movement.failed) {
        customer = releaseSeat(draft, movement.customer);
        markRecovery(draft, customer, "Reserved seat became unreachable");
        return transition(draft, customer, "seeking-seat");
      }
      return movement.arrived ? transition(draft, movement.customer, "eating") : movement.customer;
    }

    case "eating": {
      const seat = findReservedSeat(draft, customer);
      const dish = customer.orderedDishId ? draft.source.catalog.dishes[customer.orderedDishId] : undefined;
      if (!seat) {
        customer = releaseSeat(draft, customer);
        markRecovery(draft, customer, "Seat was removed while eating");
        return transition(draft, customer, "seeking-seat");
      }
      if (!dish || customer.stateElapsedMs < dish.eatingMs) return customer;
      customer = releaseSeat(draft, customer);
      return { ...transition(draft, customer, "seeking-tray-return"), satisfaction: Math.min(5, customer.satisfaction + 0.25) };
    }

    case "seeking-tray-return": {
      const selected = findTrayReturn(draft, customer);
      if (!selected) return beginExit(draft, customer, false);
      return {
        ...preparePath(transition(draft, customer, "walking-to-tray-return"), selected.path),
        targetTrayReturnId: selected.object.id,
      };
    }

    case "walking-to-tray-return": {
      const point = findTargetTrayPoint(draft, customer.targetTrayReturnId);
      if (!point) {
        markRecovery(draft, customer, "Tray-return target was removed");
        return { ...transition(draft, customer, "seeking-tray-return"), targetTrayReturnId: undefined };
      }
      const movement = moveToward(draft, customer, point, deltaMs);
      if (movement.failed) {
        markRecovery(draft, movement.customer, "Tray-return target became unreachable");
        return beginExit(draft, movement.customer, false);
      }
      if (!movement.arrived) return movement.customer;
      return beginExit(draft, { ...movement.customer, hasTray: false, satisfaction: Math.min(5, movement.customer.satisfaction + 0.1) }, false);
    }

    case "walking-to-exit": {
      const movement = moveToward(draft, customer, draft.source.exit, deltaMs);
      if (!movement.arrived && !movement.failed) return movement.customer;
      removeFromAllQueues(draft, customer.id);
      releaseSeat(draft, customer);
      draft.metrics = {
        ...draft.metrics,
        despawnedCustomers: draft.metrics.despawnedCustomers + 1,
        completedCustomers: draft.metrics.completedCustomers + (customer.served ? 1 : 0),
      };
      event(draft, {
        type: "customer-despawned",
        entityId: customer.id,
        message: movement.failed ? "forced-after-stuck" : customer.served ? "completed" : "abandoned",
      });
      return undefined;
    }
  }
}

export function stepSimulation(state: GameState): GameState {
  const deltaMs = state.config.fixedStepMs;
  const tick = state.tick + 1;
  const draft = createDraft(state, tick);
  draft.spawnCountdownMs -= deltaMs;

  const quality = state.qualityMode === "standard" ? state.config.standard : state.config.lowerEnd;
  if (draft.spawnCountdownMs <= 0 && Object.keys(draft.customers).length < quality.maxActiveCustomers) {
    spawnCustomer(draft);
    draft.spawnCountdownMs += state.config.spawnIntervalMs;
  }

  const ids = Object.keys(draft.customers).sort((a, b) => {
    const aNumber = Number(a.slice(a.lastIndexOf("-") + 1));
    const bNumber = Number(b.slice(b.lastIndexOf("-") + 1));
    return aNumber - bNumber || compareIds(a, b);
  });
  for (const id of ids) {
    const customer = draft.customers[id];
    if (!customer) continue;
    const processed = processCustomer(draft, customer, deltaMs);
    if (processed) draft.customers[id] = processed;
    else delete draft.customers[id];
  }

  return {
    ...state,
    customers: draft.customers,
    queues: draft.queues,
    seatReservations: draft.seatReservations,
    economy: draft.economy,
    progression: draft.progression,
    rngState: draft.rngState,
    nextCustomerSequence: draft.nextCustomerSequence,
    spawnCountdownMs: draft.spawnCountdownMs,
    metrics: draft.metrics,
    tick,
    elapsedMs: state.elapsedMs + deltaMs,
    undoStack: state.undoStack.filter(
      (entry) => tick - entry.createdAtTick <= Math.ceil(state.config.buildUndoWindowMs / state.config.fixedStepMs),
    ),
    events: draft.events,
  };
}

export function advanceSimulation(state: GameState, realDeltaMs: number): AdvanceResult {
  if (!Number.isFinite(realDeltaMs) || realDeltaMs < 0) throw new RangeError("Delta time must be a non-negative number");
  const fixedStepMs = state.config.fixedStepMs;
  let accumulator = state.accumulatorMs + realDeltaMs;
  const availableSteps = Math.floor(accumulator / fixedStepMs);
  const quality = state.qualityMode === "standard" ? state.config.standard : state.config.lowerEnd;
  const fixedSteps = Math.min(availableSteps, quality.maxFixedStepsPerAdvance);
  const droppedSteps = Math.max(0, availableSteps - fixedSteps);
  const droppedMs = droppedSteps * fixedStepMs;
  accumulator -= (fixedSteps + droppedSteps) * fixedStepMs;

  let working: GameState = { ...state, accumulatorMs: accumulator, events: [] };
  const events: SimulationEvent[] = [];
  for (let index = 0; index < fixedSteps; index += 1) {
    working = stepSimulation(working);
    events.push(...working.events);
  }
  working = { ...working, accumulatorMs: accumulator, events };
  return { state: working, fixedSteps, droppedMs, events };
}

export function assertSimulationInvariants(state: GameState): void {
  const customerIds = new Set(Object.keys(state.customers));
  const queued = new Set<string>();
  for (const [stallId, queue] of Object.entries(state.queues)) {
    const stall = state.objects[stallId];
    const definition = stall ? state.catalog.placeables[stall.definitionId] : undefined;
    if (!stall || definition?.kind !== "stall" || !definition.stall) {
      throw new Error(`Queue exists for missing or invalid stall ${stallId}`);
    }
    if (queue.length > definition.stall.queueCapacity) throw new Error(`Queue ${stallId} exceeds capacity`);
    for (const customerId of queue) {
      const customer = state.customers[customerId];
      if (!customerIds.has(customerId) || !customer) throw new Error(`Queue ${stallId} references missing customer ${customerId}`);
      if (queued.has(customerId)) throw new Error(`Customer ${customerId} is in more than one queue`);
      if (customer.targetStallId !== stallId) throw new Error(`Queued customer ${customerId} targets another stall`);
      if (customer.status !== "queued" && customer.status !== "ordering") {
        throw new Error(`Customer ${customerId} has invalid queued status ${customer.status}`);
      }
      queued.add(customerId);
    }
  }
  const validSeatKeys = new Set(getSeatLocations(state.objects, state.catalog).map((seat) => seat.key));
  for (const [seatKey, customerId] of Object.entries(state.seatReservations)) {
    if (!validSeatKeys.has(seatKey)) throw new Error(`Reservation references missing seat ${seatKey}`);
    const customer = state.customers[customerId];
    if (!customer) throw new Error(`Seat ${seatKey} is reserved by missing customer ${customerId}`);
    if (customer.reservedSeatKey !== seatKey) throw new Error(`Seat reservation ${seatKey} is not mirrored by its customer`);
  }
  for (const customer of Object.values(state.customers)) {
    if (customer.reservedSeatKey && state.seatReservations[customer.reservedSeatKey] !== customer.id) {
      throw new Error(`Customer ${customer.id} has an orphaned seat reservation`);
    }
    if (!Number.isFinite(customer.position.x) || !Number.isFinite(customer.position.y)) {
      throw new Error(`Customer ${customer.id} has an invalid position`);
    }
  }
  for (const [name, value] of Object.entries(state.economy)) {
    if (!Number.isFinite(value) || value < 0) throw new Error(`Economy value ${name} is invalid`);
  }
  for (const [name, value] of Object.entries(state.metrics)) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Metric ${name} is invalid`);
  }
  if (state.metrics.spawnedCustomers !== state.metrics.despawnedCustomers + customerIds.size) {
    throw new Error("Spawn/despawn/active customer accounting does not balance");
  }
}

export function simulationDigest(state: GameState): string {
  const customers = Object.values(state.customers)
    .sort((a, b) => compareIds(a.id, b.id))
    .map((customer) => ({
      id: customer.id,
      status: customer.status,
      at: pointKey(customer.position),
      stall: customer.targetStallId,
      seat: customer.reservedSeatKey,
      spent: customer.spent,
    }));
  return JSON.stringify({
    tick: state.tick,
    rngState: state.rngState,
    economy: state.economy,
    progression: state.progression,
    queues: state.queues,
    reservations: state.seatReservations,
    customers,
    metrics: state.metrics,
  });
}
