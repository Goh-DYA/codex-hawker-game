import generatedNutrition from "./nutrition.generated.json";
import { nutritionContentSchema } from "./schemas";
import type {
  NutritionContent,
  NutritionIntentDefinition,
  NutritionIntentId,
  NutritionProfile,
  NutritionVariant,
  NutritionVariantFamily,
} from "./types";

export const NUTRITION_CONTENT = nutritionContentSchema.parse(
  generatedNutrition,
) as NutritionContent;

const profileById = new Map(
  NUTRITION_CONTENT.profiles.map((profile) => [profile.id, profile]),
);
const primaryProfileByDishId = new Map(
  NUTRITION_CONTENT.profiles
    .filter((profile) => profile.id === profile.dishId)
    .map((profile) => [profile.dishId, profile]),
);
const variantFamilyByDishId = new Map(
  NUTRITION_CONTENT.variantFamilies.map((family) => [family.dishId, family]),
);
const intentById = new Map(
  NUTRITION_CONTENT.intents.map((intent) => [intent.id, intent]),
);

export const getNutritionVariantFamily = (
  dishId: string,
): NutritionVariantFamily | undefined => variantFamilyByDishId.get(dishId);

export const getNutritionVariant = (
  dishId: string,
  variantId?: string,
): NutritionVariant | undefined => {
  const family = getNutritionVariantFamily(dishId);
  if (!family) return undefined;
  const resolvedVariantId = variantId ?? family.defaultVariantId;
  return family.variants.find((variant) => variant.id === resolvedVariantId);
};

export const getNutritionProfile = (
  dishId: string,
  variantId?: string,
): NutritionProfile | undefined => {
  const variant = getNutritionVariant(dishId, variantId);
  if (variant) return profileById.get(variant.profileId);
  return primaryProfileByDishId.get(dishId);
};

export const getNutritionIntent = (
  intentId: NutritionIntentId,
): NutritionIntentDefinition | undefined => intentById.get(intentId);
