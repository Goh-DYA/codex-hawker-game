import type {
  CustomerArchetypeDefinition,
  DishDefinition,
  PlaceableCategory,
} from "@/src/content";
import type { CustomerStatus } from "@/src/game/core";

/**
 * A small, deterministic visual contract for code-native placeable art.
 *
 * The runtime deliberately does not depend on downloaded sprite sheets. Every
 * catalogue entry receives a stable accent, silhouette variant, detail variant,
 * and seven-bit maker's mark from its content id. Category renderers combine
 * these with semantic motifs (chair backs, planter leaves, display cases, etc.).
 */
export interface PlaceableVisualRecipe {
  readonly id: string;
  readonly category: PlaceableCategory;
  /** Semantic catalogue motif, for example `round-cafe-table` or `tray-return-arrow-sign`. */
  readonly motif: string;
  readonly seed: number;
  readonly silhouetteVariant: number;
  readonly detailVariant: number;
  readonly accent: number;
  readonly makerMark: number;
  readonly contractKey: string;
}

const ACCENTS = [
  0x287f75,
  0xc8624c,
  0xd69a35,
  0x4d7390,
  0x7b669b,
  0x56875c,
  0xb8667a,
  0x477c86,
  0xa56c3f,
  0x6e7e42,
] as const;

export function stableVisualHash(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function visualRecipeForPlaceable(
  id: string,
  category: PlaceableCategory,
): PlaceableVisualRecipe {
  const seed = stableVisualHash(`${category}:${id}`);
  const motif = id.replace(/^item\./, "");
  const silhouetteVariant = seed % 7;
  const detailVariant = Math.floor(seed / 7) % 9;
  const makerMark = Math.floor(seed / 63) & 0x7f;
  const accent = ACCENTS[Math.floor(seed / 8_001) % ACCENTS.length] as number;
  return {
    id,
    category,
    motif,
    seed,
    silhouetteVariant,
    detailVariant,
    accent,
    makerMark,
    contractKey: `${category}:${motif}:${silhouetteVariant}:${detailVariant}:${makerMark}:${accent.toString(16)}`,
  };
}

export interface DishVisualRecipe {
  readonly id: string;
  readonly vessel: "plate" | "bowl" | "cup" | "tray";
  readonly foodForm: "rice" | "noodles" | "broth" | "bread" | "dessert" | "seafood" | "snack" | "drink";
  readonly portionColour: number;
  readonly garnishColour: number;
  readonly garnishCount: number;
  readonly steam: DishDefinition["steamEffect"];
  readonly foodFrame: string;
  readonly containerFrame: string;
  readonly contractKey: string;
}

function parseHexColour(value: string, fallback: number) {
  const parsed = Number.parseInt(value.replace("#", ""), 16);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function visualRecipeForDish(dish: DishDefinition): DishVisualRecipe {
  const seed = stableVisualHash(dish.id);
  const vessel: DishVisualRecipe["vessel"] =
    dish.category === "drink"
      ? "cup"
      : dish.category === "soup" || dish.category === "noodles" || dish.category === "dessert"
        ? "bowl"
        : dish.category === "small-plate"
          ? "tray"
          : "plate";
  const foodForm: DishVisualRecipe["foodForm"] =
    dish.category === "rice"
      ? "rice"
      : dish.category === "noodles"
        ? "noodles"
        : dish.category === "soup"
          ? "broth"
          : dish.category === "bread"
            ? "bread"
            : dish.category === "dessert"
              ? "dessert"
              : dish.category === "seafood"
                ? "seafood"
                : dish.category === "drink"
                  ? "drink"
                  : "snack";
  const garnishColour = ACCENTS[(seed >>> 8) % ACCENTS.length] as number;
  return {
    id: dish.id,
    vessel,
    foodForm,
    portionColour: parseHexColour(dish.portionColour, 0xd69a35),
    garnishColour,
    garnishCount: 1 + ((seed >>> 13) % 4),
    steam: dish.steamEffect,
    foodFrame: `${dish.foodSprite.atlas}:${dish.foodSprite.frame}`,
    containerFrame: `${dish.containerSprite.atlas}:${dish.containerSprite.frame}`,
    contractKey: `${dish.id}:${vessel}:${foodForm}:${dish.portionColour}:${garnishColour.toString(16)}:${dish.foodSprite.frame}:${dish.containerSprite.frame}`,
  };
}

export interface CustomerVisualRecipe {
  readonly id: string;
  readonly skin: number;
  readonly clothing: number;
  readonly accent: number;
  readonly bodyVariant: number;
  readonly accessory: CustomerArchetypeDefinition["visualRules"]["carryProp"];
  readonly accessoryChance: number;
  readonly bodyFrames: readonly string[];
  readonly paletteNames: readonly string[];
  readonly contractKey: string;
}

const SKIN_TONES = [0xe2b08a, 0xc98e68, 0xaa7256, 0x845642, 0x6f4737] as const;
const CLOTHING = [0x355e78, 0xc8624c, 0x6d8e5d, 0x9a5e77, 0xd69a35, 0x4d7390, 0x287f75, 0x7b669b] as const;

export function visualRecipeForCustomer(
  archetype: CustomerArchetypeDefinition,
): CustomerVisualRecipe {
  const seed = stableVisualHash(archetype.id);
  const skin = SKIN_TONES[(seed >>> 3) % SKIN_TONES.length] as number;
  const clothing = CLOTHING[(seed >>> 9) % CLOTHING.length] as number;
  const accent = ACCENTS[(seed >>> 15) % ACCENTS.length] as number;
  const bodyVariant = (seed >>> 20) % Math.max(1, archetype.visualRules.bodyFrames.length);
  return {
    id: archetype.id,
    skin,
    clothing,
    accent,
    bodyVariant,
    accessory: archetype.visualRules.carryProp,
    accessoryChance: archetype.visualRules.accessoryChance,
    bodyFrames: archetype.visualRules.bodyFrames,
    paletteNames: archetype.visualRules.clothingPalettes,
    contractKey: `${archetype.id}:${archetype.visualRules.bodyFrames.join(",")}:${archetype.visualRules.clothingPalettes.join(",")}:${archetype.visualRules.carryProp}`,
  };
}

export interface CustomerAnimationPose {
  readonly state: CustomerStatus;
  readonly pose: "consider" | "walk" | "queue" | "order" | "wait" | "seek" | "sit" | "eat" | "return" | "leave";
  readonly bob: number;
  readonly stride: number;
  readonly armSwing: number;
  readonly carriesFood: boolean;
  readonly showsMeal: boolean;
  readonly showsTray: boolean;
  readonly indicator: "question" | "footsteps" | "queue" | "order" | "clock" | "seat" | "meal" | "return" | "exit";
  readonly signature: string;
}

const POSE_BY_STATUS: Readonly<Record<CustomerStatus, Omit<CustomerAnimationPose, "state" | "bob" | "stride" | "armSwing" | "signature">>> = {
  "choosing-stall": { pose: "consider", carriesFood: false, showsMeal: false, showsTray: false, indicator: "question" },
  "walking-to-queue": { pose: "walk", carriesFood: false, showsMeal: false, showsTray: false, indicator: "footsteps" },
  queued: { pose: "queue", carriesFood: false, showsMeal: false, showsTray: false, indicator: "queue" },
  ordering: { pose: "order", carriesFood: false, showsMeal: false, showsTray: false, indicator: "order" },
  "waiting-for-food": { pose: "wait", carriesFood: false, showsMeal: false, showsTray: false, indicator: "clock" },
  "seeking-seat": { pose: "seek", carriesFood: true, showsMeal: false, showsTray: true, indicator: "seat" },
  "walking-to-seat": { pose: "walk", carriesFood: true, showsMeal: false, showsTray: true, indicator: "footsteps" },
  eating: { pose: "eat", carriesFood: false, showsMeal: true, showsTray: true, indicator: "meal" },
  "seeking-tray-return": { pose: "return", carriesFood: false, showsMeal: false, showsTray: true, indicator: "return" },
  "walking-to-tray-return": { pose: "walk", carriesFood: false, showsMeal: false, showsTray: true, indicator: "return" },
  "walking-to-exit": { pose: "leave", carriesFood: false, showsMeal: false, showsTray: false, indicator: "exit" },
};

export function animationPoseForCustomer(
  status: CustomerStatus,
  tick: number,
  seed: number,
  reducedMotion: boolean,
): CustomerAnimationPose {
  const base = POSE_BY_STATUS[status];
  const moving = base.pose === "walk" || base.pose === "leave";
  const phase = reducedMotion ? 0 : (tick * 0.58 + (seed % 17) * 0.31);
  const bob = reducedMotion ? 0 : moving ? Math.sin(phase * 2) * 1.4 : base.pose === "eat" ? Math.sin(phase) * 0.7 : 0;
  const stride = reducedMotion || !moving ? 0 : Math.sin(phase) * 4;
  const armSwing = reducedMotion ? 0 : base.pose === "eat" ? Math.sin(phase * 1.4) * 3 : moving ? -stride * 0.65 : 0;
  return {
    state: status,
    ...base,
    bob,
    stride,
    armSwing,
    signature: `${status}:${base.pose}:${base.indicator}:${base.carriesFood ? 1 : 0}:${base.showsMeal ? 1 : 0}:${base.showsTray ? 1 : 0}`,
  };
}
