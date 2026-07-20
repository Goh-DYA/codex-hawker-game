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
  readonly totalFatG?: NutritionValueView;
  readonly saturatedFatG?: NutritionValueView;
  readonly transFatG?: NutritionValueView;
  readonly carbohydrateG?: NutritionValueView;
  readonly dietaryFibreG?: NutritionValueView;
  readonly sodiumMg?: NutritionValueView;
  readonly totalSugarG?: NutritionValueView;
  readonly calciumMg?: NutritionValueView;
  readonly ironMg?: NutritionValueView;
  readonly waterG?: NutritionValueView;
  readonly healthRating?: number;
  readonly conditionRatings?: Readonly<Record<string, number | undefined>>;
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
  readonly starRating?: number;
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
  readonly healthConditionIds?: readonly string[];
  readonly personalizedHealthRating?: number;
  readonly healthImpact?: number;
  readonly healthPreferenceResult?: "matched" | "missed" | "unknown";
  readonly healthDecisionReasons?: readonly string[];
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
  totalFatG: { label: "Total fat", unit: "g", digits: 1 },
  saturatedFatG: { label: "Saturated fat", unit: "g", digits: 1 },
  transFatG: { label: "Trans fat", unit: "g", digits: 2 },
  carbohydrateG: { label: "Carbohydrate", unit: "g", digits: 1 },
  dietaryFibreG: { label: "Fibre", unit: "g", digits: 1 },
  sodiumMg: { label: "Sodium", unit: "mg", digits: 0 },
  totalSugarG: { label: "Total sugar", unit: "g", digits: 1 },
  calciumMg: { label: "Calcium", unit: "mg", digits: 0 },
  ironMg: { label: "Iron", unit: "mg", digits: 1 },
  waterG: { label: "Water", unit: "g", digits: 1 },
} as const;

type ProfileMetric = keyof typeof METRIC_COPY;
const PRIMARY_PROFILE_METRICS = [
  "energyKcal",
  "proteinG",
  "totalFatG",
  "carbohydrateG",
  "totalSugarG",
  "dietaryFibreG",
  "sodiumMg",
] as const satisfies readonly ProfileMetric[];
const ADDITIONAL_PROFILE_METRICS = [
  "saturatedFatG",
  "transFatG",
  "calciumMg",
  "ironMg",
  "waterG",
] as const satisfies readonly ProfileMetric[];
const COMPARISON_METRICS = [
  "energyKcal",
  "totalFatG",
  "carbohydrateG",
  "totalSugarG",
  "dietaryFibreG",
  "sodiumMg",
] as const satisfies readonly ProfileMetric[];
const PULSE_METRICS = [
  "energyKcal",
  "proteinG",
  "dietaryFibreG",
  "sodiumMg",
] as const satisfies readonly ProfileMetric[];

const HEALTH_CONDITION_LABELS: Readonly<Record<string, string>> = {
  "high-cholesterol": "Managing high cholesterol",
  obesity: "Managing obesity",
  diabetes: "Managing diabetes",
  hypertension: "Managing hypertension",
};

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

function ratingText(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? `${Math.max(0, Math.min(5, value)).toFixed(1)}/5`
    : "Not rated";
}

export function DishRatingSummary({
  healthRating,
  starRating,
  healthLabel = "Health rating",
}: {
  readonly healthRating?: number;
  readonly starRating?: number;
  readonly healthLabel?: string;
}) {
  return (
    <div className="dish-rating-summary" aria-label="Dish health and star ratings">
      <span
        className="dish-rating-badge is-health"
        aria-label={`${healthLabel}: ${ratingText(healthRating)}`}
      >
        <i aria-hidden="true">♥</i>
        <span><small>{healthLabel}</small><strong>{ratingText(healthRating)}</strong></span>
      </span>
      <span
        className="dish-rating-badge is-star"
        aria-label={`Star rating for taste and popularity: ${ratingText(starRating)}`}
      >
        <i aria-hidden="true">★</i>
        <span><small>Star rating</small><strong>{ratingText(starRating)}</strong></span>
      </span>
    </div>
  );
}

function ConditionRatingDetails({
  ratings,
}: {
  readonly ratings?: Readonly<Record<string, number | undefined>>;
}) {
  const entries = Object.entries(ratings ?? {}).filter(
    (entry): entry is [string, number] =>
      typeof entry[1] === "number" && Number.isFinite(entry[1]),
  );
  if (entries.length === 0) return null;
  return (
    <details className="condition-rating-details">
      <summary>Health rating by condition</summary>
      <dl aria-label="Condition-specific health ratings">
        {entries.map(([condition, rating]) => (
          <div key={condition}>
            <dt>{HEALTH_CONDITION_LABELS[condition] ?? condition.replaceAll("-", " ")}</dt>
            <dd>{ratingText(rating)}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

export function NutritionProfileSummary({
  profile,
  starRating,
  healthRating,
  healthLabel,
  labelledBy,
}: {
  readonly profile?: NutritionProfileView;
  readonly starRating?: number;
  readonly healthRating?: number;
  readonly healthLabel?: string;
  readonly labelledBy?: string;
}) {
  const dataState = !profile || profile.status === "unavailable"
    ? "Not available"
    : profile.status === "quarantined"
      ? "Data under review"
      : undefined;
  return (
    <div className="nutrition-summary" aria-labelledby={labelledBy}>
      <DishRatingSummary
        healthRating={healthRating ?? profile?.healthRating}
        starRating={starRating}
        healthLabel={healthLabel}
      />
      <p>Serving · {profile?.servingLabel ?? dataState ?? "Not available"}</p>
      {dataState ? <p className="nutrition-data-state">{dataState}</p> : null}
      <dl aria-label="Key nutrition per listed serving">
        {PRIMARY_PROFILE_METRICS.map((metric) => (
          <div key={metric}>
            <dt>{METRIC_COPY[metric].label}</dt>
            <dd>{dataState ?? nutritionValueText(profile?.[metric], metric)}</dd>
          </div>
        ))}
      </dl>
      <details className="nutrition-more-details">
        <summary>More nutrition details</summary>
        <dl aria-label="Additional nutrition per listed serving">
          {ADDITIONAL_PROFILE_METRICS.map((metric) => (
            <div key={metric}>
              <dt>{METRIC_COPY[metric].label}</dt>
              <dd>{dataState ?? nutritionValueText(profile?.[metric], metric)}</dd>
            </div>
          ))}
        </dl>
      </details>
      <ConditionRatingDetails ratings={profile?.conditionRatings} />
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
      <div className="nutrition-pulse-heading">
        <div className="nutrition-pulse-heading-meta">
          <span className="nutrition-pulse-kicker">Today&apos;s menu read</span>
          <span className="nutrition-neutral-badge">Health ≠ popularity</span>
        </div>
        <h2>Nutrition pulse</h2>
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
          Choose the version this stall will serve. Every variant has its own nutrition and health
          ratings; the dish&apos;s taste-and-popularity star rating stays the same.
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
                <NutritionProfileSummary profile={profile} starRating={family.starRating} />
                {current && current.id !== variant.id ? (
                  <dl className="nutrition-delta-list" aria-label={`Compared with ${current.label}`}>
                    {COMPARISON_METRICS.map((metric) => (
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
  starRating,
  variantLabel,
  personaLabel,
  onClose,
  onRestoreFocus,
}: {
  readonly customer: CustomerNutritionView;
  dishLabel(dishId: string): string;
  starRating?(dishId: string): number | undefined;
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
  const healthConditions = customer.healthConditionIds ?? [];
  const healthDecisionReasons = customer.healthDecisionReasons ?? [];
  const orderedStarRating = customer.dishId ? starRating?.(customer.dishId) : undefined;
  const resultCopy = customer.requestResult === "matched"
    ? `Matched · ${INTENT_MATCH_COPY[customer.intentId ?? ""] ?? "Visit intent"}`
    : customer.requestResult === "missed"
      ? `Trade-off · ${INTENT_TRADE_OFF_COPY[customer.intentId ?? ""] ?? "Another factor won the choice"}`
      : customer.requestResult === "unknown"
        ? "Data note · Comparison not available"
        : undefined;
  const healthResultCopy = customer.healthPreferenceResult === "matched"
    ? "Health preference matched"
    : customer.healthPreferenceResult === "missed"
      ? "Health trade-off"
      : customer.healthPreferenceResult === "unknown"
        ? "Health comparison unavailable"
        : undefined;
  const healthImpactCopy = typeof customer.healthImpact === "number"
    ? `${customer.healthImpact >= 0 ? "+" : ""}${customer.healthImpact.toFixed(2)} satisfaction`
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
        {healthResultCopy ? (
          <span data-result={customer.healthPreferenceResult}>{healthResultCopy}</span>
        ) : null}
      </div>
      <div className="customer-health-context">
        <strong>Health needs affecting this visit</strong>
        {healthConditions.length > 0 ? (
          <ul aria-label="Customer simulated health conditions">
            {healthConditions.map((condition) => (
              <li key={condition}>
                {HEALTH_CONDITION_LABELS[condition] ?? condition.replaceAll("-", " ")}
              </li>
            ))}
          </ul>
        ) : (
          <p>No simulated chronic condition affects this visit.</p>
        )}
        {healthImpactCopy ? (
          <p className="customer-health-impact">
            <strong>Customer stat effect</strong> · {healthImpactCopy}
          </p>
        ) : null}
      </div>
      {healthDecisionReasons.length > 0 ? (
        <div className="customer-decision-reasons is-health">
          <strong>Why this personal health fit</strong>
          <ul>
            {healthDecisionReasons.slice(0, 4).map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      ) : null}
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
      <NutritionProfileSummary
        profile={customer.profile}
        starRating={orderedStarRating}
        healthRating={customer.personalizedHealthRating}
        healthLabel={healthConditions.length > 0 ? "Personal health fit" : "Health rating"}
      />
      <p className="nutrition-fiction-note">
        Health conditions and stat effects are simplified game traits, not a diagnosis or advice.
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
        describe the listed serving in the supplied CSV data; recipes and portions vary. The Health
        rating is a comparative in-game balance score derived from that serving and can change by
        variant. The Star rating separately represents taste and popularity. A customer&apos;s personal
        health fit also reflects their fictional condition and can slightly affect satisfaction.
        These scores are game mechanics—not a diagnosis, health certification, or personal medical
        advice. Total sugar is not the same as added sugar.
      </p>
    </details>
  );
}
