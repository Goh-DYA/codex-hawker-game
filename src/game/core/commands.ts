import { applyPurchase, applyRefund, calculateExpansionCost, calculateRefund, canAfford } from "./economy";
import {
  expandGridMap,
  getSeatLocations,
  normalizeRotation,
  validatePlacement,
} from "./grid";
import { validateWorldNavigation } from "./pathfinding";
import { captureUndoSnapshot, cloneCustomer, clonePlacedObject } from "./state";
import { isValidSimulationId } from "./validation";
import type {
  BuildCommand,
  CommandResult,
  Customer,
  GameCommand,
  GameState,
  PlacedObject,
  Rotation,
  SimulationEvent,
  UndoSnapshot,
} from "./types";

const MAX_UNDO_ENTRIES = 20;

function commandEvent(state: GameState, accepted: boolean, message?: string): SimulationEvent {
  return {
    type: accepted ? "command-applied" : "command-rejected",
    tick: state.tick,
    message,
  };
}

function reject(state: GameState, error: string): CommandResult {
  const event = commandEvent(state, false, error);
  return { state: { ...state, events: [event] }, accepted: false, error, events: [event] };
}

function accept(state: GameState, events: readonly SimulationEvent[]): CommandResult {
  return { state: { ...state, events }, accepted: true, events };
}

function isBuildCommand(command: GameCommand): command is BuildCommand {
  return (
    command.type === "place-object" ||
    command.type === "move-object" ||
    command.type === "rotate-object" ||
    command.type === "remove-object" ||
    command.type === "expand-map"
  );
}

function withUndo(state: GameState, command: BuildCommand, before: UndoSnapshot): GameState {
  const entry = {
    commandType: command.type,
    snapshot: before,
    currencyDelta: state.economy.currency - before.economy.currency,
    lifetimeSpendDelta: state.economy.lifetimeSpend - before.economy.lifetimeSpend,
    expansionCountDelta: state.progression.expansionCount - before.expansionCount,
    createdAtTick: state.tick,
  };
  return {
    ...state,
    undoStack: [...state.undoStack, entry].slice(-MAX_UNDO_ENTRIES),
  };
}

function nextAllowedRotation(current: Rotation, allowed: readonly Rotation[], clockwise = true): Rotation {
  const ordered = [...new Set(allowed)].sort((a, b) => a - b);
  const index = ordered.indexOf(current);
  if (index < 0 || ordered.length === 0) throw new RangeError("Current rotation is not allowed by its definition");
  return ordered[(index + (clockwise ? 1 : ordered.length - 1)) % ordered.length] as Rotation;
}

function navigationError(state: GameState, objects: Readonly<Record<string, PlacedObject>>): string | undefined {
  return validateWorldNavigation(state.map, state.entrance, state.exit, objects, state.catalog);
}

function clearNavigation(customer: Customer): Customer {
  return { ...customer, path: [], pathIndex: 0, movementProgress: 0, stuckMs: 0 };
}

/** Reconciles queues and reservations after a target is removed, moved, rotated, or closed. */
export function reconcileWorldTargets(
  state: GameState,
  objects: Readonly<Record<string, PlacedObject>>,
  invalidatedObjectId?: string,
): Pick<GameState, "customers" | "queues" | "seatReservations" | "metrics"> {
  const customers: Record<string, Customer> = Object.fromEntries(
    Object.entries(state.customers).map(([id, customer]) => [id, cloneCustomer(customer)]),
  );
  const queues: Record<string, readonly string[]> = {};
  const reservations: Record<string, string> = { ...state.seatReservations };
  let recovered = 0;

  const allStallIds = new Set(
    Object.values(objects)
      .filter((object) => {
        const definition = state.catalog.placeables[object.definitionId];
        return definition?.kind === "stall";
      })
      .map((object) => object.id),
  );
  const validStallIds = new Set(
    [...allStallIds].filter((id) => objects[id]?.open),
  );
  const validSeatKeys = new Set(getSeatLocations(objects, state.catalog).map((seat) => seat.key));
  const validTrayIds = new Set(
    Object.values(objects)
      .filter((object) => state.catalog.placeables[object.definitionId]?.kind === "tray-return")
      .map((object) => object.id),
  );

  for (const key of Object.keys(reservations)) {
    const objectId = key.slice(0, key.lastIndexOf(":"));
    if (!validSeatKeys.has(key) || objectId === invalidatedObjectId) delete reservations[key];
  }

  for (const [id, customer] of Object.entries(customers)) {
    let next = clearNavigation(customer);
    const stallInvalid =
      Boolean(customer.targetStallId) &&
      (!validStallIds.has(customer.targetStallId as string) || customer.targetStallId === invalidatedObjectId);
    const seatObjectId = customer.reservedSeatKey?.slice(0, customer.reservedSeatKey.lastIndexOf(":"));
    const seatInvalid =
      Boolean(customer.reservedSeatKey) &&
      (!validSeatKeys.has(customer.reservedSeatKey as string) || seatObjectId === invalidatedObjectId);
    const trayInvalid =
      Boolean(customer.targetTrayReturnId) &&
      (!validTrayIds.has(customer.targetTrayReturnId as string) || customer.targetTrayReturnId === invalidatedObjectId);

    if (stallInvalid) {
      if (customer.reservedSeatKey) delete reservations[customer.reservedSeatKey];
      next = {
        ...next,
        status: "choosing-stall",
        stateElapsedMs: 0,
        targetStallId: undefined,
        orderedDishId: undefined,
        reservedSeatKey: undefined,
        targetTrayReturnId: undefined,
      };
      recovered += 1;
    } else if (seatInvalid) {
      next = {
        ...next,
        status: customer.hasTray ? "seeking-seat" : "choosing-stall",
        stateElapsedMs: 0,
        reservedSeatKey: undefined,
      };
      recovered += 1;
    } else if (trayInvalid) {
      next = {
        ...next,
        status: customer.hasTray ? "seeking-tray-return" : "walking-to-exit",
        stateElapsedMs: 0,
        targetTrayReturnId: undefined,
      };
      recovered += 1;
    }
    customers[id] = next;
  }

  for (const stallId of allStallIds) {
    const existing = state.queues[stallId] ?? [];
    queues[stallId] = validStallIds.has(stallId) ? existing.filter((customerId) => {
      const customer = customers[customerId];
      return Boolean(customer && customer.targetStallId === stallId && customer.status !== "choosing-stall");
    }) : [];
  }
  for (const [key, customerId] of Object.entries(reservations)) {
    if (!customers[customerId] || customers[customerId]?.reservedSeatKey !== key) delete reservations[key];
  }

  return {
    customers,
    queues,
    seatReservations: reservations,
    metrics: { ...state.metrics, recoveredTargets: state.metrics.recoveredTargets + recovered },
  };
}

function restoreUndoSnapshot(state: GameState, entry: GameState["undoStack"][number]): GameState {
  const snapshot = entry.snapshot;
  const objectIds = new Set([...Object.keys(state.objects), ...Object.keys(snapshot.objects)]);
  const changedObjectId = [...objectIds].find((id) => JSON.stringify(state.objects[id]) !== JSON.stringify(snapshot.objects[id]));
  const world = { ...state, map: snapshot.map, objects: snapshot.objects };
  const reconciled = reconcileWorldTargets(world, snapshot.objects, changedObjectId);
  const placedObject = entry.commandType === "place-object" && changedObjectId
    ? state.objects[changedObjectId]
    : undefined;
  const placedDefinition = placedObject ? state.catalog.placeables[placedObject.definitionId] : undefined;
  const placedStallHasOperated =
    placedDefinition?.kind === "stall" &&
    (state.economy.lifetimeRevenue > snapshot.economy.lifetimeRevenue || state.progression.xp > snapshot.xp);
  // Revenue and progression are intentionally retained across undo. Once a newly
  // placed stall has produced either, treating undo as a build-preview rollback
  // would let players keep the sale while erasing its full purchase cost. From
  // that point on, removing it follows the same resale/lifetime-spend policy as
  // the explicit remove-object command.
  const refund = placedStallHasOperated && placedDefinition
    ? calculateRefund(placedDefinition.price, placedDefinition.refundRate ?? 0.5)
    : undefined;
  return {
    ...state,
    map: snapshot.map,
    objects: snapshot.objects,
    ...reconciled,
    economy: {
      ...state.economy,
      currency: refund === undefined ? state.economy.currency - entry.currencyDelta : state.economy.currency + refund,
      lifetimeSpend: refund === undefined
        ? state.economy.lifetimeSpend - entry.lifetimeSpendDelta
        : state.economy.lifetimeSpend,
    },
    progression: {
      ...state.progression,
      expansionCount: state.progression.expansionCount - entry.expansionCountDelta,
    },
    undoStack: state.undoStack.slice(0, -1),
  };
}

export function dispatchCommand(state: GameState, command: GameCommand): CommandResult {
  if (command.type === "undo") {
    const entry = state.undoStack.at(-1);
    if (!entry) return reject(state, "There is no build action to undo");
    const maxAgeTicks = Math.ceil(state.config.buildUndoWindowMs / state.config.fixedStepMs);
    if (state.tick - entry.createdAtTick > maxAgeTicks) {
      return reject({ ...state, undoStack: [] }, "The recent-build undo window has expired");
    }
    if (
      entry.commandType === "expand-map" &&
      Object.values(state.customers).some(
        (customer) => customer.position.x >= entry.snapshot.map.width || customer.position.y >= entry.snapshot.map.height,
      )
    ) {
      return reject(state, "Cannot undo expansion while a customer is in the expanded area");
    }
    const restored = restoreUndoSnapshot(state, entry);
    return accept(restored, [commandEvent(state, true, `Undid ${entry.commandType}`)]);
  }

  if (command.type === "set-quality-mode") {
    if (command.mode !== "standard" && command.mode !== "lower-end") return reject(state, "Unknown quality mode");
    return accept({ ...state, qualityMode: command.mode }, [commandEvent(state, true)]);
  }

  if (command.type === "set-stall-open") {
    const object = state.objects[command.objectId];
    const definition = object ? state.catalog.placeables[object.definitionId] : undefined;
    if (!object || definition?.kind !== "stall") return reject(state, "Stall does not exist");
    if (object.open === command.open) return accept(state, [commandEvent(state, true)]);
    const objects = { ...state.objects, [object.id]: { ...object, open: command.open } };
    const routeError = command.open ? navigationError(state, objects) : undefined;
    if (routeError) return reject(state, routeError);
    const reconciled = command.open
      ? reconcileWorldTargets(state, objects)
      : reconcileWorldTargets(state, objects, object.id);
    return accept({ ...state, objects, ...reconciled, undoStack: [] }, [commandEvent(state, true)]);
  }

  if (!isBuildCommand(command)) return reject(state, "Unsupported command");
  const before = captureUndoSnapshot(state);

  if (command.type === "place-object") {
    if (!isValidSimulationId(command.objectId)) return reject(state, "Object id must be a non-empty safe ID");
    if (state.objects[command.objectId]) return reject(state, `Object id already exists: ${command.objectId}`);
    const definition = state.catalog.placeables[command.definitionId];
    if (!definition) return reject(state, `Unknown placeable: ${command.definitionId}`);
    if (!state.progression.unlockedDefinitionIds.includes(definition.id)) return reject(state, "Placeable is locked");
    if (!canAfford(state.economy, definition.price)) return reject(state, "Insufficient currency");
    let rotation: Rotation;
    try {
      rotation = normalizeRotation(command.rotation ?? 0);
    } catch (error) {
      return reject(state, error instanceof Error ? error.message : "Invalid rotation");
    }
    const object: PlacedObject = {
      id: command.objectId,
      definitionId: command.definitionId,
      origin: { ...command.origin },
      rotation,
      open: definition.kind === "stall",
    };
    const validation = validatePlacement(state.map, state.objects, state.catalog, object, {
      reservedPoints: [state.entrance, state.exit],
    });
    if (!validation.valid) return reject(state, validation.reasons.join("; "));
    const objects = { ...state.objects, [object.id]: object };
    const routeError = navigationError(state, objects);
    if (routeError) return reject(state, routeError);
    const queues = definition.kind === "stall" ? { ...state.queues, [object.id]: [] } : state.queues;
    const next = withUndo(
      { ...state, objects, queues, economy: applyPurchase(state.economy, definition.price) },
      command,
      before,
    );
    return accept(next, [
      commandEvent(state, true),
      { type: "object-placed", tick: state.tick, entityId: object.id },
    ]);
  }

  if (command.type === "expand-map") {
    let map;
    try {
      map = expandGridMap(state.map, command.addColumns, command.addRows);
    } catch (error) {
      return reject(state, error instanceof Error ? error.message : "Invalid expansion");
    }
    const cost = calculateExpansionCost(state.map, state.progression, state.config, command.addColumns, command.addRows);
    if (!canAfford(state.economy, cost)) return reject(state, "Insufficient currency");
    const next = withUndo(
      {
        ...state,
        map,
        economy: applyPurchase(state.economy, cost),
        progression: { ...state.progression, expansionCount: state.progression.expansionCount + 1 },
      },
      command,
      before,
    );
    return accept(next, [commandEvent(state, true)]);
  }

  const existing = state.objects[command.objectId];
  if (!existing) return reject(state, `Object does not exist: ${command.objectId}`);
  const definition = state.catalog.placeables[existing.definitionId];
  if (!definition) return reject(state, `Definition no longer exists: ${existing.definitionId}`);

  if (command.type === "remove-object") {
    const objects = { ...state.objects };
    delete objects[existing.id];
    const reconciled = reconcileWorldTargets(state, objects, existing.id);
    const refund = calculateRefund(definition.price, definition.refundRate ?? 0.5);
    const next = withUndo(
      { ...state, objects, ...reconciled, economy: applyRefund(state.economy, refund) },
      command,
      before,
    );
    return accept(next, [
      commandEvent(state, true),
      { type: "object-removed", tick: state.tick, entityId: existing.id, amount: refund },
    ]);
  }

  let rotation = existing.rotation;
  let origin = existing.origin;
  if (command.type === "move-object") {
    origin = { ...command.origin };
    if (command.rotation !== undefined) {
      try {
        rotation = normalizeRotation(command.rotation);
      } catch (error) {
        return reject(state, error instanceof Error ? error.message : "Invalid rotation");
      }
    }
  } else {
    rotation = nextAllowedRotation(existing.rotation, definition.allowedRotations, command.clockwise ?? true);
  }
  const updated: PlacedObject = { ...clonePlacedObject(existing), origin, rotation };
  if (
    updated.origin.x === existing.origin.x &&
    updated.origin.y === existing.origin.y &&
    updated.rotation === existing.rotation
  ) {
    return accept(state, [commandEvent(state, true, "Object is already in the requested orientation")]);
  }
  const validation = validatePlacement(state.map, state.objects, state.catalog, updated, {
    ignoreObjectId: existing.id,
    reservedPoints: [state.entrance, state.exit],
  });
  if (!validation.valid) return reject(state, validation.reasons.join("; "));
  const objects = { ...state.objects, [existing.id]: updated };
  const routeError = navigationError(state, objects);
  if (routeError) return reject(state, routeError);
  const reconciled = reconcileWorldTargets(state, objects, existing.id);
  const next = withUndo({ ...state, objects, ...reconciled }, command, before);
  return accept(next, [
    commandEvent(state, true),
    { type: "object-moved", tick: state.tick, entityId: existing.id },
  ]);
}
