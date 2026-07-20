import type {
  CustomerArchetypeDefinition,
  DishDefinition,
  PlaceableCategory,
  StallDefinition,
} from "@/src/content";
import type { CustomerStatus } from "@/src/game/core";

export type PlaceableMaterial =
  | "laminate"
  | "timber"
  | "terrazzo"
  | "moulded-plastic"
  | "upholstery"
  | "stainless-steel"
  | "powder-coated-metal"
  | "glass"
  | "ceramic"
  | "woven-fibre"
  | "fabric"
  | "masonry"
  | "living-foliage"
  | "painted-board"
  | "composite";

/** A deterministic, renderer-friendly contract for code-native placeable art. */
export interface PlaceableVisualRecipe {
  readonly id: string;
  readonly category: PlaceableCategory;
  /** Semantic catalogue motif, for example `round-cafe-table` or `tray-return-arrow-sign`. */
  readonly motif: string;
  /** Broad physical form that renderers can use instead of parsing the id. */
  readonly form: string;
  /** Dominant real-world material and finish. */
  readonly material: PlaceableMaterial;
  /** Drawable construction or identity cues, sourced from catalogue tags and id vocabulary. */
  readonly detailCues: readonly string[];
  /** Stable semantic identity that does not depend on colour or hash variants. */
  readonly semanticKey: string;
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

const GENERIC_PLACEABLE_WORDS = new Set([
  "item",
  "table",
  "seat",
  "station",
  "fixture",
  "facility",
  "decor",
]);

const PLACEABLE_FORM_RULES: readonly (readonly [RegExp, string])[] = [
  [/terrazzo|round-cafe/, "round-pedestal"],
  [/compact-square/, "compact-square-top"],
  [/long-communal/, "long-communal-slab"],
  [/family-trestle/, "wide-trestle"],
  [/accessible-end/, "accessible-notched-top"],
  [/snack-ledge/, "raised-narrow-ledge"],
  [/folding-overflow/, "folding-cross-brace"],
  [/acoustic-booth/, "high-back-booth"],
  [/bench/, "multi-place-bench"],
  [/stool|perch/, "pedestal-stool"],
  [/arm-chair/, "support-arm-chair"],
  [/chair/, "backed-chair"],
  [/display-case/, "glazed-display-case"],
  [/ticket-dispenser/, "ticket-pedestal"],
  [/counter/, "service-counter"],
  [/shelf|rack|tray-return/, "open-rack"],
  [/cart|trolley/, "wheeled-cart"],
  [/sorter/, "multi-stream-receptacle"],
  [/waste-bin|general-waste/, "lidded-receptacle"],
  [/tube-light/, "linear-light"],
  [/pendant/, "suspended-shade"],
  [/lantern/, "lantern-cluster"],
  [/string-light/, "festoon-cable"],
  [/path-light/, "low-bollard"],
  [/skylight/, "glazed-ceiling-panel"],
  [/task-light/, "focused-luminaire"],
  [/column-fan/, "tower-fan"],
  [/exhaust/, "boxed-extractor"],
  [/ceiling-fan/, "suspended-rotor"],
  [/wall-circulation/, "caged-wall-rotor"],
  [/fan/, "caged-floor-rotor"],
  [/trellis/, "climbing-trellis"],
  [/hanging/, "hanging-basket"],
  [/trough|border-bed/, "linear-planter"],
  [/planter|garden-pot/, "floor-planter"],
  [/directory|preview-board|identity-sign/, "information-board"],
  [/sign|marker/, "wayfinding-sign"],
  [/queue-rail/, "post-and-belt"],
  [/wind-screen/, "transparent-screen"],
  [/half-wall/, "solid-half-wall"],
  [/divider|screen/, "freestanding-screen"],
  [/sink|basin/, "wash-basin"],
  [/fountain/, "drinking-fountain"],
  [/cupboard|cabinet/, "wall-cabinet"],
  [/utility-point/, "protected-service-box"],
  [/mural/, "wall-mural"],
  [/noticeboard/, "pin-board"],
  [/bunting/, "hanging-bunting"],
  [/flower-vase/, "tabletop-vase"],
  [/clock/, "feature-clock"],
];

function placeableForm(motif: string, category: PlaceableCategory): string {
  return PLACEABLE_FORM_RULES.find(([pattern]) => pattern.test(motif))?.[1] ?? `${category}-form`;
}

function placeableMaterial(
  motif: string,
  category: PlaceableCategory,
  tags: readonly string[],
): PlaceableMaterial {
  const context = `${motif} ${tags.join(" ")}`;
  if (category === "plant") return "living-foliage";
  if (/terrazzo/.test(context)) return "terrazzo";
  if (/laminate/.test(context)) return "laminate";
  if (/clear|glass|skylight|display-case/.test(context)) return "glass";
  if (/tile|mural/.test(context)) return "ceramic";
  if (/woven|lantern/.test(context)) return "woven-fibre";
  if (/fabric|bunting/.test(context)) return "fabric";
  if (/acoustic|cushion|upholster/.test(context)) return "upholstery";
  if (/moulded|stacking|booster/.test(context)) return "moulded-plastic";
  if (/timber|trestle|communal|bench|noticeboard/.test(context)) return "timber";
  if (/concrete|masonry/.test(context)) return "masonry";
  if (category === "stall-fixture" || category === "tray-waste" || category === "facility") {
    return "stainless-steel";
  }
  if (category === "fan" || category === "lighting" || category === "seat") {
    return "powder-coated-metal";
  }
  if (category === "signage" || category === "decor") return "painted-board";
  if (category === "table" || category === "divider") return "timber";
  return "composite";
}

function placeableDetailCues(motif: string, tags: readonly string[]): readonly string[] {
  const motifCues = motif
    .split("-")
    .filter((word) => word.length > 3 && !GENERIC_PLACEABLE_WORDS.has(word));
  return [...new Set([...tags, ...motifCues])].slice(0, 5);
}

export function visualRecipeForPlaceable(
  id: string,
  category: PlaceableCategory,
  tags: readonly string[] = [],
): PlaceableVisualRecipe {
  const seed = stableVisualHash(`${category}:${id}`);
  const motif = id.replace(/^item\./, "");
  const form = placeableForm(motif, category);
  const material = placeableMaterial(motif, category, tags);
  const detailCues = placeableDetailCues(motif, tags);
  const semanticKey = `${category}:${form}:${material}:${detailCues.join("+")}`;
  const silhouetteVariant = seed % 7;
  const detailVariant = Math.floor(seed / 7) % 9;
  const makerMark = Math.floor(seed / 63) & 0x7f;
  const accent = ACCENTS[Math.floor(seed / 8_001) % ACCENTS.length] as number;
  return {
    id,
    category,
    motif,
    form,
    material,
    detailCues,
    semanticKey,
    seed,
    silhouetteVariant,
    detailVariant,
    accent,
    makerMark,
    contractKey: `${semanticKey}:${silhouetteVariant}:${detailVariant}:${makerMark}:${accent.toString(16)}`,
  };
}

export type DishVesselProfile =
  | "ceramic-plate"
  | "deep-ceramic-bowl"
  | "kopitiam-cup-and-saucer"
  | "tall-drinking-glass"
  | "banana-leaf-lined-plate"
  | "shared-oval-platter"
  | "bamboo-steamer";

export type DishPortionShape =
  | "rice-mound"
  | "porridge"
  | "noodle-tangle"
  | "broth"
  | "liquid"
  | "shaved-ice"
  | "flatbread"
  | "cake-cubes"
  | "omelette"
  | "fritters"
  | "dumplings"
  | "skewers"
  | "grilled-pieces"
  | "pudding"
  | "whole-seafood"
  | "leaf-parcel"
  | "buns"
  | "braised-scoop"
  | "vegetable-scoop";

export interface DishPresentationProfile {
  readonly source: "catalogue" | "inferred";
  /** Recognisable plated composition rather than a palette-only variant. */
  readonly motif: string;
  readonly vessel: DishVesselProfile;
  readonly portionShape: DishPortionShape;
  /** Main real-world ingredients a renderer should depict. */
  readonly ingredientCues: readonly string[];
  /** Garnish, sauce, wrapping, or arrangement cues that distinguish similar dishes. */
  readonly detailCues: readonly string[];
  readonly semanticKey: string;
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
  readonly presentation: DishPresentationProfile;
  /** Variant composition key used by renderers for geometry, arrangement, and garnish cues. */
  readonly variantVisualKey?: string;
  /** Non-colour cue that must remain legible in high-contrast rendering. */
  readonly variantGeometryCue?: string;
  readonly variantVisualFamily?: DishVariantVisualFamily;
  readonly contractKey: string;
}

export type DishVariantVisualFamily =
  | "drink"
  | "nasi-lemak"
  | "carrot-cake"
  | "prata"
  | "fish-soup"
  | "bak-chor"
  | "murtabak"
  | "briyani"
  | "thosai"
  | "yong-tau-foo"
  | "ban-mian"
  | "bak-kut-teh"
  | "duck-rice"
  | "fallback";

export function variantVisualFamilyForKey(visualKey: string): DishVariantVisualFamily {
  if (visualKey.startsWith("kopi-") || visualKey.startsWith("teh-")) return "drink";
  if (visualKey.startsWith("nasi-")) return "nasi-lemak";
  if (visualKey.startsWith("carrot-cake-")) return "carrot-cake";
  if (visualKey.startsWith("prata-")) return "prata";
  if (visualKey.startsWith("fish-")) return "fish-soup";
  if (visualKey.startsWith("bak-chor-")) return "bak-chor";
  if (visualKey.startsWith("murtabak-")) return "murtabak";
  if (visualKey.startsWith("briyani-")) return "briyani";
  if (visualKey.startsWith("thosai-")) return "thosai";
  if (visualKey.startsWith("ytf-")) return "yong-tau-foo";
  if (visualKey.startsWith("ban-mian-")) return "ban-mian";
  if (visualKey.startsWith("bak-kut-teh-")) return "bak-kut-teh";
  if (visualKey.startsWith("duck-rice-")) return "duck-rice";
  return "fallback";
}

interface DishPresentationSeed {
  readonly motif: string;
  readonly portionShape: DishPortionShape;
  readonly ingredients: readonly string[];
  readonly details: readonly string[];
}

function dishProfile(
  motif: string,
  portionShape: DishPortionShape,
  ingredients: readonly string[],
  details: readonly string[],
): DishPresentationSeed {
  return { motif, portionShape, ingredients, details };
}

const DISH_PRESENTATIONS: Readonly<Record<string, DishPresentationSeed>> = {
  "poached-chicken-rice": dishProfile("poached-chicken-slices-beside-rice", "rice-mound", ["fragrant-rice", "poached-chicken", "cucumber"], ["dark-soy", "chilli-cup"]),
  "roast-chicken-rice": dishProfile("roast-chicken-slices-over-rice", "rice-mound", ["fragrant-rice", "roast-chicken", "cucumber"], ["crisp-skin", "dark-soy"]),
  "soya-tofu-rice": dishProfile("vegetarian-chicken-and-greens-over-rice", "rice-mound", ["rice", "plant-based-chicken", "leafy-greens"], ["soy-glaze", "spring-onion"]),
  "chicken-congee": dishProfile("silky-congee-with-chicken-shreds", "porridge", ["rice-porridge", "shredded-chicken", "ginger"], ["fried-shallot", "spring-onion"]),
  "nasi-lemak": dishProfile("coconut-rice-with-clustered-sides", "rice-mound", ["coconut-rice", "egg", "anchovy", "peanut", "cucumber"], ["banana-leaf", "sambal"]),
  "mee-rebus": dishProfile("yellow-noodles-in-thick-gravy", "noodle-tangle", ["yellow-noodles", "egg", "bean-sprout"], ["spiced-gravy", "lime"]),
  "soto-ayam": dishProfile("chicken-and-rice-cake-in-clear-broth", "broth", ["chicken", "rice-cake", "clear-broth"], ["coriander", "fried-shallot"]),
  "lontong-sayur": dishProfile("rice-cake-cubes-in-coconut-gravy", "broth", ["rice-cake", "cabbage", "tofu"], ["coconut-gravy", "sambal"]),
  kopi: dishProfile("dark-kopi-with-creamy-surface", "liquid", ["coffee", "condensed-milk"], ["kopitiam-cup", "coffee-rim"]),
  "sugarcane-juice": dishProfile("pale-sugarcane-juice-over-ice", "liquid", ["sugarcane-juice", "ice"], ["tall-glass", "citrus-wedge"]),
  "ice-kacang": dishProfile("rainbow-syrup-over-shaved-ice", "shaved-ice", ["shaved-ice", "red-bean", "jelly"], ["rainbow-syrup", "condensed-milk"]),
  "char-kway-teow": dishProfile("dark-flat-noodles-with-seafood", "noodle-tangle", ["flat-rice-noodles", "prawn", "cockle", "egg"], ["dark-soy", "garlic-chive"]),
  "hokkien-prawn-mee": dishProfile("golden-noodles-with-prawn-and-squid", "noodle-tangle", ["yellow-noodles", "prawn", "squid", "egg"], ["prawn-stock", "lime"]),
  "fried-carrot-cake": dishProfile("radish-cake-cubes-scrambled-with-egg", "cake-cubes", ["radish-cake", "egg", "preserved-radish"], ["white-style", "spring-onion"]),
  "oyster-omelette": dishProfile("crisp-omelette-with-plump-oysters", "omelette", ["egg", "oyster", "starch-crisp"], ["coriander", "chilli-sauce"]),
  "roti-prata": dishProfile("folded-prata-with-curry-side", "flatbread", ["layered-flatbread", "curry"], ["folded-quarters", "curry-cup"]),
  "mee-goreng-mamak": dishProfile("red-wok-noodles-with-egg-and-tofu", "noodle-tangle", ["yellow-noodles", "egg", "tofu"], ["chilli-tomato-sauce", "lime"]),
  "chicken-murtabak": dishProfile("stuffed-murtabak-cut-into-squares", "flatbread", ["stuffed-flatbread", "minced-chicken", "onion"], ["cut-squares", "curry-cup"]),
  "nasi-briyani": dishProfile("spiced-rice-with-large-chicken-piece", "rice-mound", ["briyani-rice", "chicken", "cucumber"], ["fried-onion", "curry-gravy"]),
  "masala-thosai": dishProfile("rolled-thosai-with-potato-filling", "flatbread", ["thosai", "masala-potato", "sambar"], ["rolled-crepe", "chutney-cups"]),
  "idli-sambar": dishProfile("three-idli-cakes-in-sambar", "dumplings", ["idli", "sambar", "coconut-chutney"], ["three-white-cakes", "curry-leaf"]),
  "vadai-set": dishProfile("two-crisp-vadai-rings-with-dips", "fritters", ["two-lentil-vadai", "sambar", "coconut-chutney"], ["ring-shape", "curry-leaf"]),
  "lemon-rice": dishProfile("yellow-lemon-rice-with-peanuts", "rice-mound", ["lemon-rice", "peanut", "mustard-seed"], ["curry-leaf", "lemon-wedge"]),
  "nyonya-laksa": dishProfile("noodles-in-orange-coconut-laksa", "broth", ["rice-noodles", "prawn", "fish-cake", "egg"], ["coconut-laksa", "laksa-leaf"]),
  "ayam-buah-keluak": dishProfile("ayam-pongteh-plated-stew-scoop", "braised-scoop", ["braised-chicken", "potato"], ["fermented-soy-gravy", "coriander"]),
  "chap-chye": dishProfile("nonya-vegetable-plated-scoop", "vegetable-scoop", ["cabbage", "carrot", "baby-corn", "black-fungus"], ["tender-stir-fry", "mixed-vegetable-colours"]),
  "babi-pongteh": dishProfile("babi-pongteh-plated-braise-scoop", "braised-scoop", ["braised-pork", "potato", "mushroom"], ["fermented-soy-gravy", "coriander"]),
  "sambal-stingray": dishProfile("stingray-fillet-on-banana-leaf", "whole-seafood", ["stingray", "sambal"], ["banana-leaf", "lime-wedge"]),
  "sliced-fish-soup": dishProfile("fish-slices-and-greens-in-clear-soup", "broth", ["fish-slices", "leafy-greens", "clear-broth"], ["tomato", "spring-onion"]),
  "black-pepper-crab": dishProfile("crab-pincers-in-black-pepper-sauce", "whole-seafood", ["crab-pincers", "black-pepper"], ["visible-claws", "pepper-sauce"]),
  "bak-chor-mee": dishProfile("mee-pok-with-minced-pork-and-mushroom", "noodle-tangle", ["mee-pok", "minced-pork", "mushroom", "fishball"], ["chilli-vinegar", "spring-onion"]),
  "fishball-mee-pok": dishProfile("flat-noodles-with-round-fishballs", "noodle-tangle", ["mee-pok", "fishball", "leafy-greens"], ["fishball-cluster", "light-soy"]),
  "lor-mee": dishProfile("thick-noodles-in-dark-starchy-gravy", "noodle-tangle", ["thick-noodles", "braised-egg", "fish-cake"], ["dark-lor-gravy", "garlic-vinegar"]),
  "teochew-fish-dumpling-soup": dishProfile("round-fishballs-in-clear-broth", "broth", ["fishball", "lettuce", "clear-broth"], ["fishball-cluster", "spring-onion"]),
  "chicken-satay-set": dishProfile("ten-chicken-satay-skewers-with-peanut-sauce", "skewers", ["ten-chicken-satay", "cucumber", "rice-cake"], ["bamboo-skewers", "peanut-sauce"]),
  "bbq-chicken-wings": dishProfile("three-charred-chicken-wings-in-a-row", "grilled-pieces", ["three-chicken-wings", "charred-glaze"], ["grill-marks", "lime-wedge"]),
  "beef-satay-set": dishProfile("ten-beef-satay-skewers-with-peanut-sauce", "skewers", ["ten-beef-satay", "cucumber", "rice-cake"], ["bamboo-skewers", "peanut-sauce"]),
  "sambal-grilled-squid": dishProfile("salted-egg-squid-pieces", "whole-seafood", ["squid", "salted-egg-sauce"], ["golden-crumb", "curry-leaf"]),
  "har-gow": dishProfile("four-prawn-dumplings-with-vegetables-in-light-soup", "broth", ["four-prawn-dumplings", "bamboo-shoot", "vegetables"], ["light-soup", "pleated-wrapper", "ceramic-bowl"]),
  "siew-mai": dishProfile("open-topped-siew-mai-in-bamboo-basket", "dumplings", ["pork-dumpling", "prawn"], ["open-wrapper", "diced-carrot", "bamboo-steamer"]),
  "char-siew-bao": dishProfile("white-char-siew-buns-in-bamboo-basket", "buns", ["steamed-bun", "char-siew"], ["split-top", "bamboo-steamer"]),
  "lotus-leaf-rice": dishProfile("opened-lotus-leaf-rice-parcel", "leaf-parcel", ["glutinous-rice", "lap-cheong", "char-siew", "mushroom"], ["lotus-leaf-wrap", "parcel-folds"]),
  chendol: dishProfile("green-chendol-jelly-in-coconut-ice", "shaved-ice", ["chendol-jelly", "coconut-milk", "shaved-ice"], ["palm-sugar", "red-bean"]),
  "tau-huay": dishProfile("silky-beancurd-with-toppings", "pudding", ["beancurd", "syrup", "toppings"], ["silky-surface", "ceramic-bowl"]),
  "teh-tarik": dishProfile("frothy-pulled-tea-in-glass", "liquid", ["black-tea", "condensed-milk"], ["foam-cap", "pulled-tea-bubbles"]),
  "pulut-hitam": dishProfile("black-glutinous-rice-with-coconut-swirl", "pudding", ["black-glutinous-rice", "coconut-milk"], ["white-coconut-swirl", "thick-pudding"]),
  "yong-tau-foo": dishProfile("assorted-stuffed-tofu-and-vegetables-in-broth", "broth", ["stuffed-tofu", "fish-paste", "bitter-gourd", "leafy-greens"], ["pick-and-mix-pieces", "clear-broth"]),
  "ban-mian": dishProfile("hand-torn-noodles-with-minced-pork-and-egg", "noodle-tangle", ["flat-noodles", "minced-pork", "egg", "leafy-greens"], ["anchovy", "spring-onion"]),
  "thunder-tea-rice": dishProfile("herbed-rice-with-green-tea-soup", "rice-mound", ["brown-rice", "chopped-greens", "tofu", "peanut"], ["green-tea-broth", "separated-toppings"]),
  popiah: dishProfile("fresh-popiah-roll-cut-in-two", "flatbread", ["thin-wrapper", "turnip", "carrot", "egg"], ["sweet-sauce", "cut-roll"]),
  "bak-kut-teh": dishProfile("pork-ribs-in-peppery-herbal-broth", "broth", ["pork-ribs", "garlic", "herbal-broth"], ["claypot-bowl", "pepper-specks"]),
  "duck-rice": dishProfile("braised-duck-slices-over-dark-rice", "rice-mound", ["braised-duck", "seasoned-rice", "cucumber"], ["dark-braising-sauce", "chilli-cup"]),
  "kway-chap": dishProfile("broad-rice-sheets-in-dark-broth", "broth", ["broad-rice-sheets", "braised-pork", "tofu", "egg"], ["dark-herbal-broth", "fried-garlic"]),
  "claypot-chicken-rice": dishProfile("chicken-rice-in-charred-claypot", "rice-mound", ["rice", "chicken", "chinese-sausage", "mushroom"], ["claypot-crust", "dark-soy"]),
};

function parseHexColour(value: string, fallback: number) {
  const parsed = Number.parseInt(value.replace("#", ""), 16);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function dishVesselProfile(frame: string): DishVesselProfile {
  if (frame.includes("leaf")) return "banana-leaf-lined-plate";
  if (frame.includes("platter")) return "shared-oval-platter";
  if (frame.includes("glass")) return "tall-drinking-glass";
  if (frame.includes("cup")) return "kopitiam-cup-and-saucer";
  if (frame.includes("bowl")) return "deep-ceramic-bowl";
  return "ceramic-plate";
}

function fallbackDishPresentation(dish: DishDefinition, identity: string): DishPresentationSeed {
  const portionShape: DishPortionShape =
    dish.category === "rice"
      ? "rice-mound"
      : dish.category === "noodles"
        ? "noodle-tangle"
        : dish.category === "soup"
          ? "broth"
          : dish.category === "bread"
            ? "flatbread"
            : dish.category === "drink"
              ? "liquid"
              : dish.category === "dessert"
                ? dish.preferenceTags.includes("cold") ? "shaved-ice" : "pudding"
                : dish.category === "seafood"
                  ? "whole-seafood"
                  : "grilled-pieces";
  const ingredientCues = [...new Set([dish.category, ...dish.preferenceTags])]
    .filter((cue) => !["comfort", "filling", "premium", "shareable"].includes(cue))
    .slice(0, 4);
  return dishProfile(
    `${identity}-${portionShape}`,
    portionShape,
    ingredientCues.length > 0 ? ingredientCues : [dish.category],
    dish.dietaryTags.includes("spicy") ? ["chilli-garnish"] : ["catalogue-garnish"],
  );
}

export function visualRecipeForDish(dish: DishDefinition): DishVisualRecipe {
  const seed = stableVisualHash(dish.id);
  const identity = dish.foodSprite.frame || dish.id.replace(/^dish\./, "");
  const knownPresentation = DISH_PRESENTATIONS[identity]
    ?? DISH_PRESENTATIONS[dish.id.replace(/^dish\./, "")];
  const presentationSeed = knownPresentation ?? fallbackDishPresentation(dish, identity);
  const vesselProfile = presentationSeed.details.includes("bamboo-steamer")
    ? "bamboo-steamer"
    : dishVesselProfile(dish.containerSprite.frame);
  const semanticKey = [
    presentationSeed.motif,
    vesselProfile,
    presentationSeed.portionShape,
    presentationSeed.ingredients.join("+"),
    presentationSeed.details.join("+"),
  ].join(":");
  const presentation: DishPresentationProfile = {
    source: knownPresentation ? "catalogue" : "inferred",
    motif: presentationSeed.motif,
    vessel: vesselProfile,
    portionShape: presentationSeed.portionShape,
    ingredientCues: presentationSeed.ingredients,
    detailCues: presentationSeed.details,
    semanticKey,
  };
  const vessel: DishVisualRecipe["vessel"] =
    vesselProfile === "kopitiam-cup-and-saucer" || vesselProfile === "tall-drinking-glass"
      ? "cup"
      : vesselProfile === "deep-ceramic-bowl"
        ? "bowl"
        : vesselProfile === "banana-leaf-lined-plate" ||
            vesselProfile === "shared-oval-platter" ||
            vesselProfile === "bamboo-steamer"
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
    presentation,
    contractKey: `${dish.id}:${semanticKey}:${vessel}:${foodForm}:${dish.portionColour}:${garnishColour.toString(16)}:${dish.foodSprite.frame}:${dish.containerSprite.frame}`,
  };
}

/**
 * Resolves a reviewed nutrition variant into a visual recipe. The visual key is
 * deliberately carried separately from colour so canvas, catalogue, and
 * high-contrast renderers can all express a composition change.
 */
export function visualRecipeForDishVariant(
  dish: DishDefinition,
  visualKey?: string,
): DishVisualRecipe {
  const base = visualRecipeForDish(dish);
  if (!visualKey) return base;
  const variantSeed = stableVisualHash(`${dish.id}:${visualKey}`);
  const garnishColour = ACCENTS[(variantSeed >>> 8) % ACCENTS.length] as number;
  const geometryCue = visualKey;
  const presentation: DishPresentationProfile = {
    ...base.presentation,
    motif: `${base.presentation.motif}-${geometryCue}`,
    detailCues: [...base.presentation.detailCues, geometryCue],
    semanticKey: `${base.presentation.semanticKey}:variant:${geometryCue}`,
  };
  return {
    ...base,
    garnishColour,
    garnishCount: 1 + ((variantSeed >>> 13) % 4),
    presentation,
    variantVisualKey: visualKey,
    variantGeometryCue: geometryCue,
    variantVisualFamily: variantVisualFamilyForKey(visualKey),
    contractKey: `${base.contractKey}:variant:${geometryCue}:${garnishColour.toString(16)}`,
  };
}

export interface CustomerVisualRecipe {
  readonly id: string;
  readonly outfitSilhouette: CustomerArchetypeDefinition["visualRules"]["outfitSilhouette"];
  readonly garmentPattern: CustomerArchetypeDefinition["visualRules"]["garmentPattern"];
  readonly accessory: CustomerArchetypeDefinition["visualRules"]["carryProp"];
  readonly accessoryChance: number;
  /** Visual treatment excluding the already-unique content ID. */
  readonly renderSignature: string;
  readonly contractKey: string;
}

export interface CustomerAppearance {
  readonly skin: number;
  readonly clothing: number;
  readonly accent: number;
}

const SKIN_TONES = [0xe2b08a, 0xc98e68, 0xaa7256, 0x845642, 0x6f4737] as const;
const CLOTHING = [0x355e78, 0xc8624c, 0x6d8e5d, 0x9a5e77, 0xd69a35, 0x4d7390, 0x287f75, 0x7b669b] as const;

export function visualRecipeForCustomer(
  archetype: CustomerArchetypeDefinition,
): CustomerVisualRecipe {
  const renderSignature = [
    archetype.visualRules.outfitSilhouette,
    archetype.visualRules.garmentPattern,
    archetype.visualRules.carryProp,
  ].join(":");
  return {
    id: archetype.id,
    outfitSilhouette: archetype.visualRules.outfitSilhouette,
    garmentPattern: archetype.visualRules.garmentPattern,
    accessory: archetype.visualRules.carryProp,
    accessoryChance: archetype.visualRules.accessoryChance,
    renderSignature,
    contractKey: `${archetype.id}:${renderSignature}`,
  };
}

/**
 * Keeps skin tone and clothing colours independent from behavioural personas.
 * Appearance is stable per customer so rerenders do not make people flicker.
 */
export function customerAppearanceForId(customerId: string): CustomerAppearance {
  const seed = stableVisualHash(customerId);
  const skin = SKIN_TONES[(seed >>> 3) % SKIN_TONES.length] as number;
  const clothing = CLOTHING[(seed >>> 9) % CLOTHING.length] as number;
  const accent = ACCENTS[(seed >>> 15) % ACCENTS.length] as number;
  return { skin, clothing, accent };
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
  readonly indicator: CustomerIndicator;
  readonly signature: string;
}

export type CustomerIndicator =
  | "question"
  | "footsteps"
  | "queue"
  | "order"
  | "clock"
  | "seat"
  | "meal"
  | "return"
  | "exit";

export interface CustomerIndicatorLegendEntry {
  readonly indicator: CustomerIndicator;
  readonly label: string;
  readonly description: string;
}

export const CUSTOMER_INDICATOR_LEGEND = [
  {
    indicator: "question",
    label: "Choosing a stall",
    description: "Comparing open stalls and their available dishes.",
  },
  {
    indicator: "footsteps",
    label: "On the move",
    description: "Moving towards a queue or a reserved seat.",
  },
  {
    indicator: "queue",
    label: "In the queue",
    description: "Waiting in line to place an order.",
  },
  {
    indicator: "order",
    label: "Ordering",
    description: "Placing an order at the stall counter.",
  },
  {
    indicator: "clock",
    label: "Waiting for food",
    description: "Waiting for the stall to finish preparing the dish.",
  },
  {
    indicator: "seat",
    label: "Finding a seat",
    description: "Looking for an available, reachable seat.",
  },
  {
    indicator: "meal",
    label: "Eating",
    description: "Dining at the reserved seat.",
  },
  {
    indicator: "return",
    label: "Returning a tray",
    description: "Finding or walking to a tray-return point.",
  },
  {
    indicator: "exit",
    label: "Leaving",
    description: "Walking to an exit after finishing or leaving early.",
  },
] as const satisfies readonly CustomerIndicatorLegendEntry[];

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

export type StallVendorActivity = "idle" | "order" | "prepare";

export type StallVendorHairStyle =
  | "cropped"
  | "side-part"
  | "wavy"
  | "coiled"
  | "tied-back"
  | "close-cut";

export type StallVendorApronStyle = "bib" | "cross-back" | "waist" | "utility";

export type StallVendorHeadwear =
  | "service-cap"
  | "visor"
  | "headband"
  | "hair-wrap"
  | "chef-cap"
  | "hairnet";

export type StallVendorTool =
  | "cleaver"
  | "ladle"
  | "long-spout-kettle"
  | "wok-spatula"
  | "noodle-basket"
  | "griddle-spatula"
  | "measuring-cup"
  | "grill-tongs"
  | "batter-cup"
  | "steamer-cloth"
  | "braising-ladle"
  | "fish-turner"
  | "ingredient-tongs"
  | "claypot-ladle";

export type StallVendorWorkAction =
  | "chop"
  | "ladle"
  | "pour"
  | "wok-toss"
  | "blanch"
  | "griddle-turn"
  | "layer-dessert"
  | "turn-skewers"
  | "spread-batter"
  | "lift-steamer"
  | "stir-braise"
  | "chargrill"
  | "pick-pieces"
  | "tend-claypot";

export type StallVendorEmblem =
  | "sunburst"
  | "lime-leaf"
  | "coffee-cup"
  | "flame"
  | "noodle-ribbon"
  | "lantern"
  | "raindrop"
  | "compass"
  | "tamarind-leaf"
  | "bamboo-knot"
  | "hearth-tile"
  | "harbour-wave"
  | "ingredient-grid"
  | "claypot-steam";

/** A stable, renderer-ready identity for the worker assigned to a stall. */
export interface StallVendorRecipe {
  readonly stallId: string;
  readonly seed: number;
  readonly skin: number;
  readonly hair: number;
  readonly shirt: number;
  readonly apron: number;
  readonly apronTrim: number;
  readonly hairStyle: StallVendorHairStyle;
  readonly apronStyle: StallVendorApronStyle;
  readonly headwear: StallVendorHeadwear;
  readonly tool: StallVendorTool;
  readonly workAction: StallVendorWorkAction;
  readonly emblem: StallVendorEmblem;
  /** Visual treatment excluding the already-unique stall ID. */
  readonly renderSignature: string;
  readonly contractKey: string;
}

export interface StallVendorAnimationPose {
  readonly activity: StallVendorActivity;
  /** Vertical body offset in pixels. */
  readonly bob: number;
  /** Horizontal torso offset in pixels. */
  readonly lean: number;
  /** Horizontal head offset in pixels. */
  readonly headTurn: number;
  /** Normalized working-arm pose in the range -1 to 1. */
  readonly workingArm: number;
  /** Normalized support-arm pose in the range -1 to 1. */
  readonly supportArm: number;
  /** Tool rotation in radians. */
  readonly toolAngle: number;
  /** Vertical tool offset in pixels, where positive values lift the tool. */
  readonly toolLift: number;
  /** Horizontal reach towards the counter or customer in pixels. */
  readonly reach: number;
  readonly signature: string;
}

interface StallVendorProfileSeed {
  readonly skinIndex: number;
  readonly hairIndex: number;
  readonly shirtIndex: number;
  readonly apronIndex: number;
  readonly hairStyle: StallVendorHairStyle;
  readonly apronStyle: StallVendorApronStyle;
  readonly headwear: StallVendorHeadwear;
  readonly tool: StallVendorTool;
  readonly workAction: StallVendorWorkAction;
  readonly emblem: StallVendorEmblem;
}

const VENDOR_HAIR = [0x211915, 0x3a281f, 0x553927, 0x2d2524] as const;
const VENDOR_APRONS = [
  0xe8dfcf,
  0x315f54,
  0x6d5140,
  0x313b45,
  0xc76f55,
  0x5d6177,
  0xd6c6a1,
  0x394f67,
  0x647044,
  0xb54f43,
  0x30766d,
  0x35556e,
] as const;

const STALL_VENDOR_PROFILES: Readonly<Record<string, StallVendorProfileSeed>> = {
  "stall.sunrise-roost": {
    skinIndex: 2,
    hairIndex: 0,
    shirtIndex: 4,
    apronIndex: 0,
    hairStyle: "cropped",
    apronStyle: "bib",
    headwear: "service-cap",
    tool: "cleaver",
    workAction: "chop",
    emblem: "sunburst",
  },
  "stall.coconut-lime": {
    skinIndex: 4,
    hairIndex: 2,
    shirtIndex: 6,
    apronIndex: 1,
    hairStyle: "tied-back",
    apronStyle: "cross-back",
    headwear: "hair-wrap",
    tool: "ladle",
    workAction: "ladle",
    emblem: "lime-leaf",
  },
  "stall.kopi-canopy": {
    skinIndex: 0,
    hairIndex: 1,
    shirtIndex: 2,
    apronIndex: 2,
    hairStyle: "side-part",
    apronStyle: "waist",
    headwear: "visor",
    tool: "long-spout-kettle",
    workAction: "pour",
    emblem: "coffee-cup",
  },
  "stall.cinder-wok": {
    skinIndex: 3,
    hairIndex: 3,
    shirtIndex: 0,
    apronIndex: 3,
    hairStyle: "close-cut",
    apronStyle: "utility",
    headwear: "headband",
    tool: "wok-spatula",
    workAction: "wok-toss",
    emblem: "flame",
  },
  "stall.mee-pok-junction": {
    skinIndex: 1,
    hairIndex: 0,
    shirtIndex: 5,
    apronIndex: 4,
    hairStyle: "wavy",
    apronStyle: "bib",
    headwear: "chef-cap",
    tool: "noodle-basket",
    workAction: "blanch",
    emblem: "noodle-ribbon",
  },
  "stall.tiffin-lantern": {
    skinIndex: 2,
    hairIndex: 1,
    shirtIndex: 7,
    apronIndex: 5,
    hairStyle: "coiled",
    apronStyle: "cross-back",
    headwear: "hairnet",
    tool: "griddle-spatula",
    workAction: "griddle-turn",
    emblem: "lantern",
  },
  "stall.sweet-monsoon": {
    skinIndex: 4,
    hairIndex: 2,
    shirtIndex: 3,
    apronIndex: 6,
    hairStyle: "cropped",
    apronStyle: "waist",
    headwear: "service-cap",
    tool: "measuring-cup",
    workAction: "layer-dessert",
    emblem: "raindrop",
  },
  "stall.satay-meridian": {
    skinIndex: 1,
    hairIndex: 3,
    shirtIndex: 1,
    apronIndex: 7,
    hairStyle: "tied-back",
    apronStyle: "utility",
    headwear: "hair-wrap",
    tool: "grill-tongs",
    workAction: "turn-skewers",
    emblem: "compass",
  },
  "stall.tamarind-leaf": {
    skinIndex: 3,
    hairIndex: 1,
    shirtIndex: 6,
    apronIndex: 8,
    hairStyle: "side-part",
    apronStyle: "bib",
    headwear: "visor",
    tool: "batter-cup",
    workAction: "spread-batter",
    emblem: "tamarind-leaf",
  },
  "stall.bamboo-basket": {
    skinIndex: 0,
    hairIndex: 0,
    shirtIndex: 4,
    apronIndex: 9,
    hairStyle: "close-cut",
    apronStyle: "cross-back",
    headwear: "headband",
    tool: "steamer-cloth",
    workAction: "lift-steamer",
    emblem: "bamboo-knot",
  },
  "stall.straits-hearth": {
    skinIndex: 2,
    hairIndex: 3,
    shirtIndex: 2,
    apronIndex: 10,
    hairStyle: "wavy",
    apronStyle: "waist",
    headwear: "chef-cap",
    tool: "braising-ladle",
    workAction: "stir-braise",
    emblem: "hearth-tile",
  },
  "stall.harbour-ember": {
    skinIndex: 4,
    hairIndex: 2,
    shirtIndex: 5,
    apronIndex: 11,
    hairStyle: "coiled",
    apronStyle: "utility",
    headwear: "hairnet",
    tool: "fish-turner",
    workAction: "chargrill",
    emblem: "harbour-wave",
  },
  "stall.pick-and-mix": {
    skinIndex: 1,
    hairIndex: 2,
    shirtIndex: 7,
    apronIndex: 12,
    hairStyle: "tied-back",
    apronStyle: "utility",
    headwear: "visor",
    tool: "ingredient-tongs",
    workAction: "pick-pieces",
    emblem: "ingredient-grid",
  },
  "stall.herbal-cauldron": {
    skinIndex: 3,
    hairIndex: 0,
    shirtIndex: 3,
    apronIndex: 13,
    hairStyle: "cropped",
    apronStyle: "bib",
    headwear: "chef-cap",
    tool: "claypot-ladle",
    workAction: "tend-claypot",
    emblem: "claypot-steam",
  },
};

const VENDOR_HAIR_STYLES = [
  "cropped",
  "side-part",
  "wavy",
  "coiled",
  "tied-back",
  "close-cut",
] as const satisfies readonly StallVendorHairStyle[];
const VENDOR_APRON_STYLES = ["bib", "cross-back", "waist", "utility"] as const satisfies readonly StallVendorApronStyle[];
const VENDOR_HEADWEAR = [
  "service-cap",
  "visor",
  "headband",
  "hair-wrap",
  "chef-cap",
  "hairnet",
] as const satisfies readonly StallVendorHeadwear[];
const VENDOR_EMBLEMS = [
  "sunburst",
  "lime-leaf",
  "coffee-cup",
  "flame",
  "noodle-ribbon",
  "lantern",
  "raindrop",
  "compass",
  "tamarind-leaf",
  "bamboo-knot",
  "hearth-tile",
  "harbour-wave",
  "ingredient-grid",
  "claypot-steam",
] as const satisfies readonly StallVendorEmblem[];

const VENDOR_ACTION_RULES: readonly (readonly [RegExp, StallVendorTool, StallVendorWorkAction])[] = [
  [/chop/, "cleaver", "chop"],
  [/wok/, "wok-spatula", "wok-toss"],
  [/noodle|blanch/, "noodle-basket", "blanch"],
  [/skewer/, "grill-tongs", "turn-skewers"],
  [/spread/, "batter-cup", "spread-batter"],
  [/steamer/, "steamer-cloth", "lift-steamer"],
  [/braise/, "braising-ladle", "stir-braise"],
  [/chargrill|grill/, "fish-turner", "chargrill"],
  [/griddle/, "griddle-spatula", "griddle-turn"],
  [/coconut-pour|glass-pull/, "measuring-cup", "layer-dessert"],
  [/pour/, "long-spout-kettle", "pour"],
  [/ladle/, "ladle", "ladle"],
];

function fallbackVendorProfile(stall: StallDefinition, seed: number): StallVendorProfileSeed {
  const animationKey = stall.animationReferences.join(":");
  const action = VENDOR_ACTION_RULES.find(([pattern]) => pattern.test(animationKey));
  return {
    skinIndex: seed >>> 3,
    hairIndex: seed >>> 7,
    shirtIndex: seed >>> 11,
    apronIndex: seed >>> 15,
    hairStyle: VENDOR_HAIR_STYLES[(seed >>> 5) % VENDOR_HAIR_STYLES.length] as StallVendorHairStyle,
    apronStyle: VENDOR_APRON_STYLES[(seed >>> 9) % VENDOR_APRON_STYLES.length] as StallVendorApronStyle,
    headwear: VENDOR_HEADWEAR[(seed >>> 13) % VENDOR_HEADWEAR.length] as StallVendorHeadwear,
    tool: action?.[1] ?? "ladle",
    workAction: action?.[2] ?? "ladle",
    emblem: VENDOR_EMBLEMS[(seed >>> 17) % VENDOR_EMBLEMS.length] as StallVendorEmblem,
  };
}

function parseVendorColour(value: string, fallback: number) {
  const parsed = Number.parseInt(value.replace("#", ""), 16);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function visualRecipeForStallVendor(stall: StallDefinition): StallVendorRecipe {
  const seed = stableVisualHash(`vendor:${stall.id}`);
  const profile = STALL_VENDOR_PROFILES[stall.id] ?? fallbackVendorProfile(stall, seed);
  const skin = SKIN_TONES[profile.skinIndex % SKIN_TONES.length] as number;
  const hair = VENDOR_HAIR[profile.hairIndex % VENDOR_HAIR.length] as number;
  const shirt = CLOTHING[profile.shirtIndex % CLOTHING.length] as number;
  const apron = VENDOR_APRONS[profile.apronIndex % VENDOR_APRONS.length] as number;
  const apronTrim = parseVendorColour(stall.visual.palette[2], ACCENTS[seed % ACCENTS.length] as number);
  const renderSignature = [
    skin.toString(16),
    hair.toString(16),
    shirt.toString(16),
    apron.toString(16),
    apronTrim.toString(16),
    profile.hairStyle,
    profile.apronStyle,
    profile.headwear,
    profile.tool,
    profile.workAction,
    profile.emblem,
  ].join(":");
  return {
    stallId: stall.id,
    seed,
    skin,
    hair,
    shirt,
    apron,
    apronTrim,
    hairStyle: profile.hairStyle,
    apronStyle: profile.apronStyle,
    headwear: profile.headwear,
    tool: profile.tool,
    workAction: profile.workAction,
    emblem: profile.emblem,
    renderSignature,
    contractKey: `${stall.id}:${renderSignature}`,
  };
}

export function vendorAnimationPoseForStall(
  recipe: StallVendorRecipe,
  tick: number,
  reducedMotion: boolean,
  activity: StallVendorActivity,
): StallVendorAnimationPose {
  const signature = `${activity}:${recipe.workAction}:${reducedMotion ? "still" : "motion"}`;
  if (reducedMotion) {
    return {
      activity,
      bob: 0,
      lean: 0,
      headTurn: 0,
      workingArm: 0,
      supportArm: 0,
      toolAngle: 0,
      toolLift: 0,
      reach: 0,
      signature,
    };
  }

  const seedPhase = (recipe.seed % 29) * 0.17;
  const phase = tick * (activity === "prepare" ? 0.62 : activity === "order" ? 0.39 : 0.21) + seedPhase;
  const wave = Math.sin(phase);
  const crossWave = Math.cos(phase * 0.73 + seedPhase * 0.5);
  if (activity === "idle") {
    return {
      activity,
      bob: wave * 0.55,
      lean: crossWave * 0.3,
      headTurn: Math.sin(phase * 0.47) * 0.8,
      workingArm: wave * 0.08,
      supportArm: -wave * 0.06,
      toolAngle: crossWave * 0.025,
      toolLift: Math.max(0, wave) * 0.25,
      reach: 0,
      signature,
    };
  }
  if (activity === "order") {
    return {
      activity,
      bob: wave * 0.3,
      lean: 0.8 + crossWave * 0.25,
      headTurn: 0.9 + wave * 0.45,
      workingArm: 0.35 + wave * 0.14,
      supportArm: -0.18 + crossWave * 0.1,
      toolAngle: wave * 0.04,
      toolLift: Math.max(0, crossWave) * 0.4,
      reach: 2.8 + wave * 0.7,
      signature,
    };
  }

  const liftingAction = recipe.workAction === "pour" || recipe.workAction === "lift-steamer";
  const sweepingAction =
    recipe.workAction === "spread-batter" ||
    recipe.workAction === "stir-braise" ||
    recipe.workAction === "pick-pieces" ||
    recipe.workAction === "tend-claypot";
  return {
    activity,
    bob: crossWave * 0.45,
    lean: 0.55 + Math.abs(wave) * 0.8,
    headTurn: wave * 0.45,
    workingArm: wave * (liftingAction ? 0.72 : 0.9),
    supportArm: crossWave * (sweepingAction ? 0.52 : 0.34),
    toolAngle: wave * (liftingAction ? 0.58 : sweepingAction ? 0.42 : 0.32),
    toolLift: liftingAction ? (wave + 1) * 1.8 : Math.abs(wave) * 1.15,
    reach: sweepingAction ? crossWave * 2.2 : 1.1 + Math.abs(crossWave) * 1.2,
    signature,
  };
}
