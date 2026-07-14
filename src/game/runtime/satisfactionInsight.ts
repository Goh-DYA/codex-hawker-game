import type { VisitRatingComponents } from "@/src/game/core";

export type SatisfactionFactor = keyof VisitRatingComponents;

export interface SatisfactionTip {
  readonly factor: SatisfactionFactor;
  readonly label: string;
  readonly score: number;
  readonly action: string;
}

const FACTOR_GUIDANCE: Readonly<Record<SatisfactionFactor, {
  readonly label: string;
  readonly weight: number;
  readonly action: string;
}>> = {
  foodQuality: {
    label: "Food quality",
    weight: 0.3,
    action: "Choose higher-quality dishes and buy stall mastery upgrades that raise quality.",
  },
  wait: {
    label: "Wait times",
    weight: 0.2,
    action: "Open more stalls, spread popular queues apart, or upgrade service speed and capacity.",
  },
  value: {
    label: "Value",
    weight: 0.15,
    action: "Add a lower-cost menu option and choose dishes whose prices better suit visitor budgets.",
  },
  walking: {
    label: "Walking and flow",
    weight: 0.1,
    action: "Clear direct routes between entrances, stalls, seats, tray returns and exits.",
  },
  comfort: {
    label: "Comfort",
    weight: 0.1,
    action: "Add enough seating and place fans, lighting or décor near dining tables.",
  },
  cleanliness: {
    label: "Cleanliness",
    weight: 0.1,
    action: "Add visible tray returns and cleaning facilities near dining and exit routes.",
  },
  ambience: {
    label: "Ambience",
    weight: 0.05,
    action: "Add plants, lighting, fans and décor without narrowing important walking paths.",
  },
};

export function deriveSatisfactionTips(
  breakdown: VisitRatingComponents | undefined,
  limit = 2,
): readonly SatisfactionTip[] {
  if (!breakdown || limit <= 0) return [];

  return (Object.keys(FACTOR_GUIDANCE) as SatisfactionFactor[])
    .map((factor) => {
      const guidance = FACTOR_GUIDANCE[factor];
      const score = Math.max(0, Math.min(100, breakdown[factor]));
      return {
        factor,
        label: guidance.label,
        score,
        action: guidance.action,
        impactGap: (100 - score) * guidance.weight,
      };
    })
    .sort((left, right) => right.impactGap - left.impactGap || left.score - right.score || left.label.localeCompare(right.label))
    .slice(0, limit)
    .map((tip) => ({
      factor: tip.factor,
      label: tip.label,
      score: tip.score,
      action: tip.action,
    }));
}
