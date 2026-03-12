import type { StatResult } from "../shared/types";

function normalCdf(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);

  const t = 1.0 / (1.0 + p * x);
  const y =
    1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return 0.5 * (1.0 + sign * y);
}

export function twoProportionZTest(
  successA: number,
  totalA: number,
  successB: number,
  totalB: number,
  confidence: number = 0.95
): { zScore: number; pValue: number; isSignificant: boolean } {
  if (totalA === 0 || totalB === 0) {
    return { zScore: 0, pValue: 1, isSignificant: false };
  }

  const pA = successA / totalA;
  const pB = successB / totalB;
  const pPooled = (successA + successB) / (totalA + totalB);

  const se = Math.sqrt(pPooled * (1 - pPooled) * (1 / totalA + 1 / totalB));
  if (se === 0) return { zScore: 0, pValue: 1, isSignificant: false };

  const zScore = (pA - pB) / se;
  const pValue = 2 * (1 - normalCdf(Math.abs(zScore)));
  const alpha = 1 - confidence;

  return { zScore, pValue, isSignificant: pValue < alpha };
}

export function compareVariants(
  aId: string,
  bId: string,
  aMetrics: { sent: number; opens: number; clicks: number },
  bMetrics: { sent: number; opens: number; clicks: number },
  confidence: number = 0.95
): StatResult[] {
  const results: StatResult[] = [];

  for (const metric of ["opens", "clicks"] as const) {
    const test = twoProportionZTest(
      aMetrics[metric],
      aMetrics.sent,
      bMetrics[metric],
      bMetrics.sent,
      confidence
    );

    const rateA = aMetrics.sent > 0 ? ((aMetrics[metric] / aMetrics.sent) * 100).toFixed(1) : "0";
    const rateB = bMetrics.sent > 0 ? ((bMetrics[metric] / bMetrics.sent) * 100).toFixed(1) : "0";
    const winner = test.zScore > 0 ? "A" : "B";
    const conf = ((1 - test.pValue) * 100).toFixed(0);

    const metricLabel = metric === "opens" ? "open rate" : "click-through rate";
    const explanation = test.isSignificant
      ? `Variant ${winner}'s ${metricLabel} is ${winner === "A" ? rateA : rateB}% vs ${winner === "A" ? rateB : rateA}%. We're ${conf}% confident ${winner} is better.`
      : `Not enough data yet to determine a winner for ${metricLabel} (${rateA}% vs ${rateB}%).`;

    results.push({
      variantAId: aId,
      variantBId: bId,
      metric: metricLabel,
      zScore: test.zScore,
      pValue: test.pValue,
      isSignificant: test.isSignificant,
      confidence: 1 - test.pValue,
      explanation,
    });
  }

  return results;
}
