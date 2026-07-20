import type { SimulationCatalog } from "./types";
import { HEALTH_CONDITIONS } from "./nutrition";

export interface ValidationIssue {
  readonly path: string;
  readonly message: string;
}

const SIMULATION_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/i;

export function isValidSimulationId(value: unknown): value is string {
  return typeof value === "string" && SIMULATION_ID_PATTERN.test(value);
}

export class CatalogValidationError extends Error {
  readonly issues: readonly ValidationIssue[];

  constructor(issues: readonly ValidationIssue[]) {
    super(`Simulation catalog is invalid (${issues.length} issue${issues.length === 1 ? "" : "s"})`);
    this.name = "CatalogValidationError";
    this.issues = issues;
  }
}

function positiveNumber(value: number, path: string, issues: ValidationIssue[], allowZero = false): void {
  if (!Number.isFinite(value) || (allowZero ? value < 0 : value <= 0)) {
    issues.push({ path, message: allowZero ? "must be a non-negative number" : "must be a positive number" });
  }
}

function positiveInteger(value: number, path: string, issues: ValidationIssue[]): void {
  if (!Number.isInteger(value) || value <= 0) issues.push({ path, message: "must be a positive integer" });
}

function gridPoint(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): value is { readonly x: number; readonly y: number } {
  if (
    !value ||
    typeof value !== "object" ||
    !("x" in value) ||
    !("y" in value) ||
    typeof value.x !== "number" ||
    typeof value.y !== "number" ||
    !Number.isInteger(value.x) ||
    !Number.isInteger(value.y)
  ) {
    issues.push({ path, message: "must use finite integer coordinates" });
    return false;
  }
  return true;
}

function validateCatalogInternal(catalog: SimulationCatalog): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!catalog || typeof catalog !== "object") return [{ path: "catalog", message: "must be an object" }];
  if (!catalog.placeables || typeof catalog.placeables !== "object" || Array.isArray(catalog.placeables)) {
    issues.push({ path: "placeables", message: "must be a record" });
  }
  if (!catalog.dishes || typeof catalog.dishes !== "object" || Array.isArray(catalog.dishes)) {
    issues.push({ path: "dishes", message: "must be a record" });
  }
  if (!catalog.archetypes || typeof catalog.archetypes !== "object" || Array.isArray(catalog.archetypes)) {
    issues.push({ path: "archetypes", message: "must be a record" });
  }
  if (issues.length > 0) return issues;

  for (const [key, definition] of Object.entries(catalog.placeables ?? {})) {
    const path = `placeables.${key}`;
    if (!isValidSimulationId(key)) issues.push({ path, message: "record key must be a non-empty safe ID" });
    if (!definition || typeof definition !== "object") {
      issues.push({ path, message: "must be an object" });
      continue;
    }
    if (!isValidSimulationId(definition.id)) issues.push({ path: `${path}.id`, message: "must be a non-empty safe ID" });
    else if (definition.id !== key) issues.push({ path: `${path}.id`, message: "must match its record key" });
    if (!Array.isArray(definition.allowedRotations) || definition.allowedRotations.length === 0) {
      issues.push({ path: `${path}.allowedRotations`, message: "must be a non-empty array" });
    } else if (definition.allowedRotations.some((rotation) => ![0, 90, 180, 270].includes(rotation))) {
      issues.push({ path: `${path}.allowedRotations`, message: "may contain only 0, 90, 180, and 270" });
    }
    if (!definition.footprint || typeof definition.footprint !== "object") {
      issues.push({ path: `${path}.footprint`, message: "must be an object" });
    } else {
      positiveInteger(definition.footprint.width, `${path}.footprint.width`, issues);
      positiveInteger(definition.footprint.height, `${path}.footprint.height`, issues);
    }
    if (definition.footprint && typeof definition.footprint === "object" && definition.footprint.cells !== undefined) {
      if (!Array.isArray(definition.footprint.cells) || definition.footprint.cells.length === 0) {
        issues.push({ path: `${path}.footprint.cells`, message: "must be a non-empty array when provided" });
      } else {
        const seen = new Set<string>();
        definition.footprint.cells.forEach((cell, index) => {
          if (!gridPoint(cell, `${path}.footprint.cells[${index}]`, issues)) return;
          const key = `${cell.x},${cell.y}`;
          if (seen.has(key)) issues.push({ path: `${path}.footprint.cells[${index}]`, message: "must be unique" });
          seen.add(key);
          if (cell.x < 0 || cell.y < 0 || cell.x >= definition.footprint.width || cell.y >= definition.footprint.height) {
            issues.push({ path: `${path}.footprint.cells[${index}]`, message: "must be inside the footprint bounds" });
          }
        });
      }
    }
    positiveNumber(definition.price, `${path}.price`, issues, true);
    if (
      definition.refundRate !== undefined &&
      (!Number.isFinite(definition.refundRate) || definition.refundRate < 0 || definition.refundRate > 1)
    ) {
      issues.push({ path: `${path}.refundRate`, message: "must be between zero and one" });
    }
    if (definition.unlockLevel !== undefined && (!Number.isInteger(definition.unlockLevel) || definition.unlockLevel < 1)) {
      issues.push({ path: `${path}.unlockLevel`, message: "must be a positive integer" });
    }
    if (definition.kind === "stall") {
      if (!definition.stall || typeof definition.stall !== "object") {
        issues.push({ path: `${path}.stall`, message: "must be an object for stall definitions" });
      }
      if (!definition.servicePoint) issues.push({ path: `${path}.servicePoint`, message: "is required for stall definitions" });
      if (!definition.queueAnchor) issues.push({ path: `${path}.queueAnchor`, message: "is required for stall definitions" });
      if (definition.stall && typeof definition.stall === "object") {
        positiveNumber(definition.stall.orderMs, `${path}.stall.orderMs`, issues);
        positiveInteger(definition.stall.preparationCapacity, `${path}.stall.preparationCapacity`, issues);
        positiveInteger(definition.stall.queueCapacity, `${path}.stall.queueCapacity`, issues);
        positiveNumber(definition.stall.popularity, `${path}.stall.popularity`, issues, true);
        if (!Number.isFinite(definition.stall.quality) || definition.stall.quality < 0 || definition.stall.quality > 5) {
          issues.push({ path: `${path}.stall.quality`, message: "must be between zero and five" });
        }
        if (!Array.isArray(definition.stall.dishIds) || definition.stall.dishIds.length === 0) {
          issues.push({ path: `${path}.stall.dishIds`, message: "must not be empty" });
        }
        for (const dishId of Array.isArray(definition.stall.dishIds) ? definition.stall.dishIds : []) {
          if (!isValidSimulationId(dishId)) issues.push({ path: `${path}.stall.dishIds`, message: "contains an invalid dish ID" });
          else if (!catalog.dishes[dishId]) issues.push({ path: `${path}.stall.dishIds`, message: `references unknown dish ${dishId}` });
        }
      }
    }
    if (definition.seatPoints !== undefined && !Array.isArray(definition.seatPoints)) {
      issues.push({ path: `${path}.seatPoints`, message: "must be an array" });
    }
    if (definition.kind === "seat" && (!Array.isArray(definition.seatPoints) || definition.seatPoints.length === 0)) {
      issues.push({ path: `${path}.seatPoints`, message: "must not be empty for seats" });
    }
    if (definition.kind === "tray-return" && !definition.trayReturnPoint) {
      issues.push({ path: `${path}.trayReturnPoint`, message: "is required for tray-return facilities" });
    }
    if (definition.servicePoint) gridPoint(definition.servicePoint, `${path}.servicePoint`, issues);
    if (definition.queueAnchor) gridPoint(definition.queueAnchor, `${path}.queueAnchor`, issues);
    if (definition.trayReturnPoint) gridPoint(definition.trayReturnPoint, `${path}.trayReturnPoint`, issues);
    if (Array.isArray(definition.seatPoints)) {
      definition.seatPoints.forEach((point, index) => gridPoint(point, `${path}.seatPoints[${index}]`, issues));
    }
  }

  for (const [key, dish] of Object.entries(catalog.dishes ?? {})) {
    const path = `dishes.${key}`;
    if (!isValidSimulationId(key)) issues.push({ path, message: "record key must be a non-empty safe ID" });
    if (!dish || typeof dish !== "object") {
      issues.push({ path, message: "must be an object" });
      continue;
    }
    if (!isValidSimulationId(dish.id)) issues.push({ path: `${path}.id`, message: "must be a non-empty safe ID" });
    else if (dish.id !== key) issues.push({ path: `${path}.id`, message: "must match its record key" });
    positiveNumber(dish.price, `${path}.price`, issues, true);
    positiveNumber(dish.preparationMs, `${path}.preparationMs`, issues);
    positiveNumber(dish.eatingMs, `${path}.eatingMs`, issues);
    if (!Number.isFinite(dish.quality) || dish.quality < 0 || dish.quality > 5) {
      issues.push({ path: `${path}.quality`, message: "must be between zero and five" });
    }
    if (
      dish.starRating !== undefined &&
      (!Number.isFinite(dish.starRating) || dish.starRating < 1 || dish.starRating > 5)
    ) {
      issues.push({ path: `${path}.starRating`, message: "must be between one and five" });
    }
    for (const [variantIndex, variant] of (dish.nutritionVariants ?? []).entries()) {
      const profile = variant.profile;
      if (!profile) continue;
      const profilePath = `${path}.nutritionVariants[${variantIndex}].profile`;
      if (
        profile.healthRating !== undefined &&
        (!Number.isFinite(profile.healthRating) ||
          profile.healthRating < 1 ||
          profile.healthRating > 5)
      ) {
        issues.push({
          path: `${profilePath}.healthRating`,
          message: "must be between one and five",
        });
      }
      for (const [condition, rating] of Object.entries(profile.conditionRatings ?? {})) {
        if (!HEALTH_CONDITIONS.includes(condition as (typeof HEALTH_CONDITIONS)[number])) {
          issues.push({
            path: `${profilePath}.conditionRatings.${condition}`,
            message: "is not a supported health condition",
          });
        } else if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
          issues.push({
            path: `${profilePath}.conditionRatings.${condition}`,
            message: "must be between one and five",
          });
        }
      }
    }
  }

  for (const [key, archetype] of Object.entries(catalog.archetypes ?? {})) {
    const path = `archetypes.${key}`;
    if (!isValidSimulationId(key)) issues.push({ path, message: "record key must be a non-empty safe ID" });
    if (!archetype || typeof archetype !== "object") {
      issues.push({ path, message: "must be an object" });
      continue;
    }
    if (!isValidSimulationId(archetype.id)) issues.push({ path: `${path}.id`, message: "must be a non-empty safe ID" });
    else if (archetype.id !== key) issues.push({ path: `${path}.id`, message: "must match its record key" });
    positiveNumber(archetype.budget, `${path}.budget`, issues, true);
    positiveNumber(archetype.patienceMs, `${path}.patienceMs`, issues);
    positiveNumber(archetype.walkingSpeed, `${path}.walkingSpeed`, issues);
    for (const field of ["priceSensitivity", "qualitySensitivity", "queueSensitivity", "distanceSensitivity"] as const) {
      positiveNumber(archetype[field], `${path}.${field}`, issues, true);
    }
    if (archetype.noveltyPreference !== undefined) {
      positiveNumber(archetype.noveltyPreference, `${path}.noveltyPreference`, issues, true);
    }
    if (archetype.unlockLevel !== undefined) {
      positiveNumber(archetype.unlockLevel, `${path}.unlockLevel`, issues);
      if (!Number.isInteger(archetype.unlockLevel)) {
        issues.push({ path: `${path}.unlockLevel`, message: "must be an integer" });
      }
    }
    if (archetype.unlockReputation !== undefined) {
      if (
        !Number.isFinite(archetype.unlockReputation) ||
        archetype.unlockReputation < 0 ||
        archetype.unlockReputation > 5
      ) {
        issues.push({
          path: `${path}.unlockReputation`,
          message: "must be between zero and five",
        });
      }
    }
    if (archetype.unlockPrerequisiteIds !== undefined) {
      if (
        new Set(archetype.unlockPrerequisiteIds).size !==
        archetype.unlockPrerequisiteIds.length
      ) {
        issues.push({
          path: `${path}.unlockPrerequisiteIds`,
          message: "must not contain duplicates",
        });
      }
      for (const prerequisiteId of archetype.unlockPrerequisiteIds) {
        if (!isValidSimulationId(prerequisiteId)) {
          issues.push({
            path: `${path}.unlockPrerequisiteIds`,
            message: "must contain only non-empty safe IDs",
          });
        }
      }
    }
    if (archetype.visitSchedule !== undefined) {
      const schedule = archetype.visitSchedule;
      if (
        !Number.isInteger(schedule.startHour) ||
        schedule.startHour < 0 ||
        schedule.startHour > 23
      ) {
        issues.push({ path: `${path}.visitSchedule.startHour`, message: "must be an hour from 0 to 23" });
      }
      if (
        !Number.isInteger(schedule.endHour) ||
        schedule.endHour < 1 ||
        schedule.endHour > 24 ||
        schedule.endHour <= schedule.startHour
      ) {
        issues.push({ path: `${path}.visitSchedule.endHour`, message: "must be later than startHour and at most 24" });
      }
      positiveNumber(
        schedule.peakMultiplier,
        `${path}.visitSchedule.peakMultiplier`,
        issues,
      );
    }
  }
  if (Object.keys(catalog.archetypes ?? {}).length === 0) {
    issues.push({ path: "archetypes", message: "must contain at least one archetype" });
  }
  return issues;
}

export function validateCatalog(catalog: SimulationCatalog): readonly ValidationIssue[] {
  try {
    return validateCatalogInternal(catalog);
  } catch (error) {
    return [{
      path: "catalog",
      message: `contains malformed data: ${error instanceof Error ? error.message : String(error)}`,
    }];
  }
}

export function assertValidCatalog(catalog: SimulationCatalog): void {
  const issues = validateCatalog(catalog);
  if (issues.length > 0) throw new CatalogValidationError(issues);
}
