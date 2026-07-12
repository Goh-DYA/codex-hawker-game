import { CUSTOMER_ENGLISH } from "./customers";
import { DISH_ENGLISH } from "./dishes";
import { PLACEABLE_ENGLISH } from "./placeables";
import { STALL_ENGLISH } from "./stalls";

export const ENGLISH_LOCALIZATION: Readonly<Record<string, string>> =
  Object.freeze({
    ...STALL_ENGLISH,
    ...DISH_ENGLISH,
    ...PLACEABLE_ENGLISH,
    ...CUSTOMER_ENGLISH,
  });
