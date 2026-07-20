import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  customerVariantLabel,
  CustomerNutritionInspector,
  DishRatingSummary,
  dialogFocusAction,
  NutritionProfileSummary,
  NutritionPulseCard,
  VariantLabDialog,
} from "../app/game/NutritionEducation";

const root = new URL("../", import.meta.url);

describe("Hawker Balance nutrition education UI", () => {
  it("traps Variant Lab Tab focus and exposes an Escape close action", () => {
    expect(dialogFocusAction("Escape", false, 3, false, false)).toBe("close");
    expect(dialogFocusAction("Tab", true, 3, true, false)).toBe("last");
    expect(dialogFocusAction("Tab", false, 3, false, true)).toBe("first");
    expect(dialogFocusAction("Tab", false, 0, false, false)).toBe("container");
    expect(dialogFocusAction("Enter", false, 3, false, false)).toBeUndefined();
  });

  it("renders explicit profile states and every educational nutrient label", () => {
    const unavailable = renderToStaticMarkup(createElement(NutritionProfileSummary, {
      profile: { status: "unavailable" },
    }));
    expect(unavailable).toContain("Serving · Not available");
    for (const label of [
      "Energy",
      "Protein",
      "Total fat",
      "Saturated fat",
      "Trans fat",
      "Carbohydrate",
      "Total sugar",
      "Fibre",
      "Sodium",
      "Calcium",
      "Iron",
      "Water",
    ]) {
      expect(unavailable).toContain(label);
    }
    expect(unavailable).toContain("More nutrition details");

    const quarantined = renderToStaticMarkup(createElement(NutritionProfileSummary, {
      profile: { status: "quarantined" },
    }));
    expect(quarantined).toContain("Data under review");
  });

  it("renders Pulse empty states and separates health from popularity", () => {
    const empty = renderToStaticMarkup(createElement(NutritionPulseCard, {
      pulse: {
        servedMeals: 0,
        profiledMeals: 0,
        intentRequests: 0,
        intentMatches: 0,
        intentMisses: 0,
        intentUnknowns: 0,
        averages: {},
        knownCounts: { energyKcal: 0, proteinG: 0, dietaryFibreG: 0, sodiumMg: 0 },
      },
      dishLabel: (dishId: string) => dishId,
    }));
    expect(empty).toContain("No servings yet today");
    expect(empty).toContain("Health ≠ popularity");

    const populated = renderToStaticMarkup(createElement(NutritionPulseCard, {
      pulse: {
        servedMeals: 5,
        profiledMeals: 3,
        intentRequests: 4,
        intentMatches: 2,
        intentMisses: 1,
        intentUnknowns: 1,
        averages: { energyKcal: 500, proteinG: 18.25, dietaryFibreG: 4.5, sodiumMg: 720 },
        knownCounts: { energyKcal: 3, proteinG: 2, dietaryFibreG: 1, sodiumMg: 3 },
        mostServedDishId: "dish.kopi",
        leadingUnmetIntent: "sodium-aware",
      },
      dishLabel: () => "Kopi",
    }));
    expect(populated).toContain("3/5");
    expect(populated).toContain("2/4");
    expect(populated).toContain("500 kcal");
    expect(populated).toContain("2 known");
    expect(populated).toContain("Kopi is today");
    expect(populated).toContain("Sodium-aware is the leading unmet visit intent");
  });

  it("renders distinct accessible Health and Star ratings with condition detail", () => {
    const ratings = renderToStaticMarkup(createElement(DishRatingSummary, {
      healthRating: 4.2,
      starRating: 4.7,
    }));
    expect(ratings).toContain("Health rating: 4.2/5");
    expect(ratings).toContain("Star rating for taste and popularity: 4.7/5");

    const profile = renderToStaticMarkup(createElement(NutritionProfileSummary, {
      profile: {
        status: "released",
        servingLabel: "1 plate",
        healthRating: 4.2,
        conditionRatings: {
          diabetes: 4.4,
          hypertension: 3.8,
        },
      },
      starRating: 4.7,
    }));
    expect(profile).toContain("Health rating by condition");
    expect(profile).toContain("Managing diabetes");
    expect(profile).toContain("Managing hypertension");
  });

  it("renders rank locks, decision reasons, and neutral outcome wording", () => {
    const lab = renderToStaticMarkup(createElement(VariantLabDialog, {
      dishName: "Kopi",
      family: {
        dishId: "dish.kopi",
        defaultVariantId: "kopi-default",
        activeVariantId: "kopi-default",
        variants: [
          {
            id: "kopi-default",
            label: "Kopi",
            unlockRank: 1,
            visualKey: "kopi-milk-sugar-standard",
            unlocked: true,
            selected: true,
            profile: { status: "released", servingLabel: "1 cup" },
          },
          {
            id: "kopi-c",
            label: "Kopi C",
            unlockRank: 4,
            visualKey: "kopi-evaporated-milk-two-sugar",
            unlocked: false,
            selected: false,
            profile: { status: "released", servingLabel: "1 cup" },
          },
        ],
      },
      onChoose: () => undefined,
      onClose: () => undefined,
    }));
    expect(lab).toContain('role="radiogroup"');
    expect(lab).toContain("Unlocks at mastery rank 4");
    expect(lab).toContain("Changes apply to future orders only");

    const inspector = renderToStaticMarkup(createElement(CustomerNutritionInspector, {
      customer: {
        customerId: "customer-1",
        archetypeId: "regular",
        status: "eating",
        decisionReasons: ["Visit intent fit", "Price within visit budget", "Ignored"],
        intentId: "sodium-aware",
        dishId: "dish.kopi",
        variantId: "kopi-default",
        requestResult: "missed",
        healthConditionIds: ["hypertension"],
        personalizedHealthRating: 2.8,
        healthImpact: -0.02,
        healthPreferenceResult: "missed",
        healthDecisionReasons: [
          "Managing hypertension fit 2.8/5 is led by sodium and other nutrients",
        ],
      },
      dishLabel: () => "Kopi",
      starRating: () => 4.5,
      variantLabel: () => "Kopi",
      personaLabel: () => "Regular",
      onClose: () => undefined,
    }));
    expect(inspector).toContain("Trade-off · More sodium");
    expect(inspector).toContain("Why this choice");
    expect(inspector).toContain("Managing hypertension");
    expect(inspector).toContain("Personal health fit");
    expect(inspector).toContain("Star rating for taste and popularity: 4.5/5");
    expect(inspector).toContain("Customer stat effect");
    expect(inspector).toContain("-0.02 satisfaction");
    expect(inspector).toContain("Why this personal health fit");
    expect(inspector).not.toContain("Ignored");
  });

  it("uses player-facing labels for frozen serving selections", () => {
    expect(customerVariantLabel(
      [],
      "dish.poached-chicken-rice",
      "dish.poached-chicken-rice",
    )).toBe("Listed serving");
    expect(customerVariantLabel(
      [],
      "dish.poached-chicken-rice",
      "removed-internal-variant",
    )).toBeUndefined();
    expect(customerVariantLabel(
      [{
        dishId: "dish.kopi",
        defaultVariantId: "kopi-default",
        activeVariantId: "kopi-default",
        variants: [{
          id: "kopi-default",
          label: "Kopi",
          unlockRank: 1,
          visualKey: "kopi-milk-sugar-standard",
          unlocked: true,
          selected: true,
          profile: { status: "released", servingLabel: "1 cup" },
        }],
      }],
      "dish.kopi",
      "kopi-default",
    )).toBe("Kopi");
  });

  it("rebrands visible surfaces while preserving compatibility identifiers", async () => {
    const [layout, simulator, manifestSource, packageSource, serviceWorker] = await Promise.all([
      readFile(new URL("app/layout.tsx", root), "utf8"),
      readFile(new URL("app/game/HawkerSimulator.tsx", root), "utf8"),
      readFile(new URL("public/manifest.webmanifest", root), "utf8"),
      readFile(new URL("package.json", root), "utf8"),
      readFile(new URL("public/sw.js", root), "utf8"),
    ]);
    const manifest = JSON.parse(manifestSource);
    const packageJson = JSON.parse(packageSource);

    expect(layout).toContain("Hawker Balance — Run the centre. Read the plate.");
    expect(simulator).toContain('aria-label="Hawker Balance"');
    expect(simulator).toContain("Nutrition edition");
    expect(simulator).toContain("hawker-balance-day-");
    expect(simulator).toContain("performSave(controller.exportState())");
    expect(manifest.name).toBe("Hawker Balance");
    expect(packageJson.name).toBe("hawker-simulator");
    expect(serviceWorker).toContain('const CACHE_PREFIX = "hawker-simulator-"');
  });

  it("ships the Lens, Variant Lab, Pulse, visit inspector, and neutral disclosure", async () => {
    const [simulator, nutritionUi] = await Promise.all([
      readFile(new URL("app/game/HawkerSimulator.tsx", root), "utf8"),
      readFile(new URL("app/game/NutritionEducation.tsx", root), "utf8"),
    ]);

    expect(simulator).toContain("Nutrition Lens");
    expect(simulator).toContain("Compare health, popularity, and every nutrient per listed serving.");
    expect(simulator).toContain("Tune recipe");
    expect(simulator).toContain("aria-labelledby={dishTitleId}");
    expect(simulator).toContain("View nutrition for");
    expect(simulator).toContain("Tune recipe for");
    expect(simulator).toContain('["focus", "◎", "Focus"]');
    expect(nutritionUi).toContain("Variant Lab");
    expect(nutritionUi).toContain("Nutrition pulse");
    expect(nutritionUi).toContain("Trace amount");
    expect(nutritionUi).toContain("Data under review");
    expect(nutritionUi).toContain('label: "Total sugar"');
    expect(nutritionUi).toContain('label: "Saturated fat"');
    expect(nutritionUi).toContain('label: "Carbohydrate"');
    expect(nutritionUi).toContain("Health conditions and stat effects are simplified game traits");
    expect(nutritionUi).toContain("Star rating separately represents");
    expect(nutritionUi).toContain("Why this choice");
    expect(nutritionUi).toContain("Why this personal health fit");
    expect(nutritionUi).toContain('"sodium-aware": "More sodium"');
    expect(nutritionUi).toContain("Trade-off ·");
    expect(nutritionUi).toContain("onRestoreFocus");
    expect(nutritionUi).toContain("dialogFocusAction");
    expect(nutritionUi).toContain("not a diagnosis");
  });

  it("keeps objectives reachable and uses labelled mobile management sheets", async () => {
    const [simulator, css] = await Promise.all([
      readFile(new URL("app/game/HawkerSimulator.tsx", root), "utf8"),
      readFile(new URL("app/globals.css", root), "utf8"),
    ]);

    expect(simulator).toContain('className="focus-panel"');
    expect(simulator).toContain('aria-label="Close management sheet"');
    expect(simulator).toContain("managementReturnFocusRef");
    expect(simulator).toContain("returnFocus?.focus()");
    expect(simulator).toContain('role={managementSheetOpen ? "dialog" : undefined}');
    expect(simulator).toContain("dialogFocusAction(");
    expect(simulator).toContain("sheet.contains(document.activeElement)");
    expect(simulator).toContain('"summary"');
    expect(css).toContain("@media (max-width: 899px)");
    expect(css).toContain("width: 100vw");
    expect(css).toContain('.game-shell[data-management-open="false"] .catalogue-panel');
    expect(css).toContain(".sheet-close-button { display: grid; }");
  });

  it("contains the compact desktop Pulse within the left rail", async () => {
    const css = await readFile(new URL("app/globals.css", root), "utf8");
    const nutritionUi = await readFile(new URL("app/game/NutritionEducation.tsx", root), "utf8");

    expect(css).toMatch(/\.left-rail\s*\{[^}]*overflow-y:\s*auto/);
    expect(nutritionUi).toContain('className="nutrition-pulse-heading-meta"');
    expect(css).toContain(".nutrition-pulse-card.is-compact");
    expect(css).toMatch(
      /\.nutrition-pulse-card\.is-compact \.nutrition-pulse-kicker\s*\{[^}]*white-space:\s*nowrap/,
    );
    expect(css).toMatch(
      /\.nutrition-pulse-card\.is-compact \.nutrition-average-list,[\s\S]*?display:\s*none/,
    );
  });
});
