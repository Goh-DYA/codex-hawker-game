import { CUSTOMER_ARCHETYPES } from "./customers";
import { DISHES } from "./dishes";
import { ECONOMY } from "./economy";
import { ENGLISH_LOCALIZATION } from "./localization";
import { PLACEABLES } from "./placeables";
import { STALLS } from "./stalls";
import type { LaunchContent } from "./types";

export const LAUNCH_CONTENT = {
  version: "1.1.0",
  economy: ECONOMY,
  stalls: STALLS,
  dishes: DISHES,
  placeables: PLACEABLES,
  customerArchetypes: CUSTOMER_ARCHETYPES,
  localization: ENGLISH_LOCALIZATION,
} as const satisfies LaunchContent;
