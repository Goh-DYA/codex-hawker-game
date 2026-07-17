"use client";

import { useEffect, useRef } from "react";

export type NutritionValueView =
  | { readonly status: "known"; readonly value: number }
  | { readonly status: "trace" }
  | { readonly status: "unavailable"; readonly reason?: string };

export interface NutritionProfileView {
  readonly status: "released" | "unavailable" | "quarantined";
  readonly servingLabel?: string;
  readonly energyKcal?: NutritionValueView;
  readonly proteinG?: NutritionValueView;
  readonly dietaryFibreG?: NutritionValueView;
  readonly sodiumMg?: NutritionValueView;
  readonly totalSugarG?: NutritionValueView;
  readonly intentFits?: Readonly<Record<string, number | undefined>>;
}

export interface NutritionVariantView {
  readonly id: string;
  readonly label: string;
  readonly unlockRank: number;
  readonly visualKey: string;
  readonly unlocked: boolean;
  readonly selected: boolean;
  readonly profile?: NutritionProfileView;
}

export interface NutritionFamilyView {
  readonly dishId: string;
  readonly defaultVariantId: string;
  readonly activeVariantId: string;
  readonly variants: readonly NutritionVariantView[];
}

export interface NutritionPulseView {
  readonly servedMeals: number;
  readonly profiledMeals: number;
  readonly intentRequests: number;
  readonly intentMatches: number;
  readonly intentMisses: number;
  readonly intentUnknowns: number;
  readonly averages: Readonly<{
    energyKcal?: number;
    proteinG?: number;
    dietaryFibreG?: number;
    sodiumMg?: number;
  }>;
  readonly knownCounts: Readonly<{
    energyKcal: number;
    proteinG: number;
    dietaryFibreG: number;
    sodiumMg: number;
  }>;
  readonly mostServedDishId?: string;
  readonly leadingUnmetIntent?: string;
}

export interface CustomerNutritionView {
  readonly customerId: string;
  readonly archetypeId: string;
  readonly status: string;
  readonly decisionReasons: readonly string[];
  readonly intentId?: string;
  readonly dishId?: string;
  readonly variantId?: string;
  readonly requestResult?: "matched" | "missed" | "unknown";
  readonly profile?: NutritionProfileView;
}

const INTENT_LABELS: Readonly<Record<string, string>> = {
  "lighter-energy": "Lighter energy",
  "protein-forward": "Protein-forward",
  "fibre-forward": "Fibre-forward",
  "sodium-aware": "Sodium-aware",
  "lower-total-sugar-drink": "Lower total sugar drink",
};

const INTENT_MATCH_COPY: Readonly<Record<string, string>> = {
  "lighter-energy": "Lighter energy",
  "protein-forward": "More protein",
  "fibre-forward": "More fibre",
  "sodium-aware": "Less sodium",
  "lower-total-sugar-drink": "Less total sugar",
};

const INTENT_TRADE_OFF_COPY: Readonly<Record<string, string>> = {
  "lighter-energy": "More energy",
  "protein-forward": "Less protein",
  "fibre-forward": "Less fibre",
  "sodium-aware": "More sodium",
  "lower-total-sugar-drink": "More total sugar",
};

const METRIC_COPY = {
  energyKcal: { label: "Energy", unit: "kcal", digits: 0 },
  proteinG: { label: "Protein", unit: "g", digits: 1 },
  dietaryFibreG: { label: "Fibre", unit: "g", digits: 1 },
  sodiumMg: { label: "Sodium", unit: "mg", digits: 0 },
  totalSugarG: { label: "Total sugar", unit: "g", digits: 1 },
} as const;

type ProfileMetric = keyof typeof METRIC_COPY;
const PULSE_METRICS = [
  "energyKcal",
  "proteinG",
  "dietaryFibreG",
  "sodiumMg",
] as const satisfies readonly ProfileMetric[];

export type DialogFocusAction = "close" | "container" | "first" | "last" | undefined;

export function dialogFocusAction(
  key: string,
  shiftKey: boolean,
  focusableCount: number,
  activeAtFirst: boolean,
  activeAtLast: boolean,
): DialogFocusAction {
  if (key === "Escape") return "close";
  if (key !== "Tab") return undefined;
  if (focusableCount === 0) return "container";
  if (shiftKey && activeAtFirst) return "last";
  if (!shiftKey && activeAtLast) return "first";
  return undefined;
}

export function customerVariantLabel(
  families: readonly NutritionFamilyView[],
  dishId: string,
  variantId: string,
): string | undefined {
  const family = families.find((candidate) => candidate.dishId === dishId);
  if (!family) return variantId === dishId ? "Listed serving" : undefined;
  return family.variants.find((variant) => variant.id === variantId)?.label;
}

function formatNumber(value: number, digits: number) {
  return value.toLocaleString("en-SG", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

export function nutritionValueText(
  value: NutritionValueView | undefined,
  metric: ProfileMetric,
) {
  if (!value || value.status === "unavailable") return "Not available";
  if (value.status === "trace") return "Trace amount";
  const copy = METRIC_COPY[metric];
  return `${formatNumber(value.value, copy.digits)} ${copy.unit}`;
}

export function intentLabel(intentId: string | undefined) {
  if (!intentId) return undefined;
  return INTENT_LABELS[intentId] ?? intentId.replaceAll("-", " ");
}

export function NutritionProfileSummary({
  profile,
  labelledBy,
}: {
  readonly profile?: NutritionProfileView;
  readonly labelledBy?: string;
}) {
  const dataState = !profile || profile.status === "unavailable"
    ? "Not available"
    : profile.status === "quarantined"
      ? "Data under review"
      : undefined;
  return (
    <div className="nutrition-summary" aria-labelledby={labelledBy}>
      <p>Serving · {profile?.servingLabel ?? dataState ?? "Not available"}</p>
      {dataState ? <p className="nutrition-data-state">{dataState}</p> : null}
      <dl>
        {(Object.keys(METRIC_COPY) as ProfileMetric[]).map((metric) => (
          <div key={metric}>
            <dt>{METRIC_COPY[metric].label}</dt>
            <dd>{dataState ?? nutritionValueText(profile?.[metric], metric)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function averageText(value: number | undefined, metric: ProfileMetric) {
  if (value === undefined) return "Not available";
  const copy = METRIC_COPY[metric];
  return `${formatNumber(value, copy.digits)} ${copy.unit}`;
}

export function NutritionPulseCard({
  pulse,
  dishLabel,
  onReview,
  compact = false,
}: {
  readonly pulse: NutritionPulseView;
  dishLabel(dishId: string): string;
  readonly onReview?: () => void;
  readonly compact?: boolean;
}) {
  const leadingIntent = intentLabel(pulse.leadingUnmetIntent);
  return (
    <section className={compact ? "nutrition-pulse-card is-compact" : "nutrition-pulse-card"}>
      <div className="section-heading">
        <div>
          <span>Today&apos;s menu read</span>
          <h2>Nutrition pulse</h2>
        </div>
        <span className="nutrition-neutral-badge">No grades</span>
      </div>
      {pulse.servedMeals === 0 ? (
        <div className="nutrition-empty-state">
          <strong>No servings yet today</strong>
          <p>Open the centre to build a picture from profiled dishes.</p>
        </div>
      ) : (
        <>
          <dl className="nutrition-pulse-totals">
            <div>
              <dt>Profiled servings</dt>
              <dd>{pulse.profiledMeals}/{pulse.servedMeals}</dd>
            </div>
            <div>
              <dt>Intent matches</dt>
              <dd>{pulse.intentMatches}/{pulse.intentRequests}</dd>
            </div>
            <div>
              <dt>Missed</dt>
              <dd>{pulse.intentMisses}</dd>
            </div>
            <div>
              <dt>Unknown data</dt>
              <dd>{pulse.intentUnknowns}</dd>
            </div>
          </dl>
          <dl className="nutrition-average-list" aria-label="Average nutrition per profiled serving">
            {PULSE_METRICS.map((metric) => (
              <div key={metric}>
                <dt>{METRIC_COPY[metric].label}</dt>
                <dd>
                  {averageText(pulse.averages[metric], metric)}
                  <small>{pulse.knownCounts[metric]} known</small>
                </dd>
              </div>
            ))}
          </dl>
          <div className="nutrition-pulse-note">
            <strong>Most served</strong>
            <p>
              {pulse.mostServedDishId
                ? `${dishLabel(pulse.mostServedDishId)} is today’s most-served profiled dish.`
                : "Keep serving reviewed dishes to reveal the day’s leading choice."}
            </p>
          </div>
          <div className="nutrition-pulse-note">
            <strong>Next menu action</strong>
            <p>
              {leadingIntent
                ? `${leadingIntent} is the leading unmet visit intent. Compare reviewed variants in Menu planning.`
                : "No leading unmet nutrition intent yet. Keep the menu varied and reviewed."}
            </p>
          </div>
        </>
      )}
      {onReview ? (
        <button type="button" className="nutrition-review-button" onClick={onReview}>
          Review menu trade-offs <span aria-hidden="true">→</span>
        </button>
      ) : null}
    </section>
  );
}

function comparisonText(
  current: NutritionValueView | undefined,
  candidate: NutritionValueView | undefined,
) {
  if (!current || !candidate || current.status !== "known" || candidate.status !== "known") {
    return "Not available";
  }
  if (Math.abs(current.value - candidate.value) < 0.05) return "Same";
  return candidate.value > current.value ? "Higher" : "Lower";
}

export function VariantLabDialog({
  dishName,
  family,
  onChoose,
  onClose,
}: {
  readonly dishName: string;
  readonly family: NutritionFamilyView;
  onChoose(variantId: string): void;
  onClose(): void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  const current = family.variants.find((variant) => variant.id === family.activeVariantId)
    ?? family.variants[0];

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const selector = "button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex='-1'])";
    const focusables = () => Array.from(dialog.querySelectorAll<HTMLElement>(selector));
    requestAnimationFrame(() => focusables()[0]?.focus());
    const handleKey = (event: KeyboardEvent) => {
      const available = focusables();
      const first = available[0];
      const last = available.at(-1);
      const action = dialogFocusAction(
        event.key,
        event.shiftKey,
        available.length,
        document.activeElement === first,
        document.activeElement === last,
      );
      if (action === "close") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (action === "container") {
        event.preventDefault();
        dialog.focus();
      } else if (action === "last") {
        event.preventDefault();
        last?.focus();
      } else if (action === "first") {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      requestAnimationFrame(() => previousFocus?.focus());
    };
  }, []);

  return (
    <div className="modal-backdrop nutrition-lab-backdrop" role="presentation">
      <section
        ref={dialogRef}
        className="nutrition-lab-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="nutrition-lab-title"
        tabIndex={-1}
      >
        <header>
          <div>
            <span>Variant Lab</span>
            <h2 id="nutrition-lab-title">Tune {dishName}</h2>
          </div>
          <button type="button" aria-label="Close Variant Lab" onClick={onClose}>×</button>
        </header>
        <p className="nutrition-lab-intro">
          Choose the version this stall will serve. Nutrition values are estimates for the listed
          serving; game service timing and prices stay with the dish family.
        </p>
        <div className="nutrition-variant-list" role="radiogroup" aria-label={`${dishName} version`}>
          {family.variants.map((variant) => {
            const profile = variant.profile;
            const inputId = `nutrition-variant-${variant.id}`;
            return (
              <article key={variant.id} data-locked={!variant.unlocked} data-selected={variant.selected}>
                <label htmlFor={inputId}>
                  <input
                    id={inputId}
                    type="radio"
                    name={`variant-${family.dishId}`}
                    checked={variant.selected}
                    disabled={!variant.unlocked}
                    onChange={() => onChoose(variant.id)}
                  />
                  <span>
                    <strong>{variant.label}</strong>
                    <small>{variant.unlocked ? (variant.selected ? "Currently served" : "Available now") : `Unlocks at mastery rank ${variant.unlockRank}`}</small>
                  </span>
                </label>
                <NutritionProfileSummary profile={profile} />
                {current && current.id !== variant.id ? (
                  <dl className="nutrition-delta-list" aria-label={`Compared with ${current.label}`}>
                    {(Object.keys(METRIC_COPY) as ProfileMetric[]).map((metric) => (
                      <div key={metric}>
                        <dt>{METRIC_COPY[metric].label}</dt>
                        <dd>{comparisonText(current.profile?.[metric], profile?.[metric])}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
              </article>
            );
          })}
        </div>
        <footer>
          <p>Changes apply to future orders only and are freely reversible.</p>
          <button type="button" className="primary-button" onClick={onClose}>Done</button>
        </footer>
      </section>
    </div>
  );
}

export function CustomerNutritionInspector({
  customer,
  dishLabel,
  variantLabel,
  personaLabel,
  onClose,
  onRestoreFocus,
}: {
  readonly customer: CustomerNutritionView;
  dishLabel(dishId: string): string;
  variantLabel(dishId: string, variantId: string): string | undefined;
  personaLabel(archetypeId: string): string;
  onClose(): void;
  onRestoreFocus?(): void;
}) {
  const inspectorRef = useRef<HTMLElement>(null);
  const ownsFocusRef = useRef(false);
  const restoreFocusRef = useRef(onRestoreFocus);
  useEffect(() => {
    restoreFocusRef.current = onRestoreFocus;
  }, [onRestoreFocus]);
  useEffect(() => () => {
    if (ownsFocusRef.current) {
      requestAnimationFrame(() => restoreFocusRef.current?.());
    }
  }, []);
  const intent = intentLabel(customer.intentId);
  const selectedVariantLabel = customer.dishId && customer.variantId
    ? variantLabel(customer.dishId, customer.variantId)
    : undefined;
  const resultCopy = customer.requestResult === "matched"
    ? `Matched · ${INTENT_MATCH_COPY[customer.intentId ?? ""] ?? "Visit intent"}`
    : customer.requestResult === "missed"
      ? `Trade-off · ${INTENT_TRADE_OFF_COPY[customer.intentId ?? ""] ?? "Another factor won the choice"}`
      : customer.requestResult === "unknown"
        ? "Data note · Comparison not available"
        : undefined;
  return (
    <section
      ref={inspectorRef}
      className="customer-nutrition-inspector"
      aria-labelledby="customer-inspector-title"
      onFocusCapture={() => {
        ownsFocusRef.current = true;
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          ownsFocusRef.current = false;
        }
      }}
    >
      <header>
        <div>
          <span>Selected guest</span>
          <h3 id="customer-inspector-title">{personaLabel(customer.archetypeId)}</h3>
        </div>
        <button type="button" aria-label="Close customer inspector" onClick={onClose}>×</button>
      </header>
      <p className="customer-state">{customer.status.replaceAll("-", " ")}</p>
      <div className="customer-reason-chips">
        {intent ? <span>Intent · {intent}</span> : <span>No nutrition intent this visit</span>}
        {resultCopy ? <span data-result={customer.requestResult}>{resultCopy}</span> : null}
      </div>
      {customer.decisionReasons.length > 0 ? (
        <div className="customer-decision-reasons">
          <strong>Why this choice</strong>
          <ul>
            {customer.decisionReasons.slice(0, 2).map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {customer.dishId ? (
        <div className="customer-order-summary">
          <strong>{dishLabel(customer.dishId)}</strong>
          {selectedVariantLabel ? <small>{selectedVariantLabel}</small> : null}
        </div>
      ) : null}
      <NutritionProfileSummary profile={customer.profile} />
      <p className="nutrition-fiction-note">
        Nutrition intents are fictional preferences for this visit, not health conditions.
      </p>
    </section>
  );
}

export function NutritionDisclosure() {
  return (
    <details className="nutrition-disclosure">
      <summary>Nutrition data &amp; education note</summary>
      <p>
        Hawker Balance is an educational game, not medical or dietary advice. Nutrition values
        describe the listed serving in the source data; recipes and portions vary. Daily reference
        ranges are general guidance for Singaporean adults and do not represent individual needs.
        Total sugar is not the same as added sugar. In Hawker Balance, balance means comparing
        trade-offs—not labelling a dish good or bad.
      </p>
    </details>
  );
}
