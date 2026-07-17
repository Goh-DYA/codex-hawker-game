import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  customerVariantLabel,
  CustomerNutritionInspector,
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
    for (const label of ["Energy", "Protein", "Fibre", "Sodium", "Total sugar"]) {
      expect(unavailable).toContain(label);
    }

    const quarantined = renderToStaticMarkup(createElement(NutritionProfileSummary, {
      profile: { status: "quarantined" },
    }));
    expect(quarantined).toContain("Data under review");
  });

  it("renders Pulse empty states and per-metric known denominators without a grade", () => {
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
    expect(empty).toContain("No grades");

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
      },
      dishLabel: () => "Kopi",
      variantLabel: () => "Kopi",
      personaLabel: () => "Regular",
      onClose: () => undefined,
    }));
    expect(inspector).toContain("Trade-off · More sodium");
    expect(inspector).toContain("Why this choice");
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
    expect(simulator).toContain("Compare values per listed serving.");
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
    expect(nutritionUi).toContain("Nutrition intents are fictional preferences for this visit");
    expect(nutritionUi).toContain("Why this choice");
    expect(nutritionUi).toContain('"sodium-aware": "More sodium"');
    expect(nutritionUi).toContain("Trade-off ·");
    expect(nutritionUi).toContain("onRestoreFocus");
    expect(nutritionUi).toContain("dialogFocusAction");
    expect(nutritionUi).toMatch(/balance means comparing\s+trade-offs/);
    expect(nutritionUi).not.toContain("healthy dish");
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

    expect(css).toMatch(/\.left-rail\s*\{[^}]*overflow-y:\s*auto/);
    expect(css).toContain(".nutrition-pulse-card.is-compact");
    expect(css).toMatch(
      /\.nutrition-pulse-card\.is-compact \.nutrition-average-list,[\s\S]*?display:\s*none/,
    );
  });
});
