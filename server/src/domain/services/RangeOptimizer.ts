import { Volatility } from '../value-objects/Volatility';
import { DriftVelocity } from '../value-objects/DriftVelocity';

export interface OptimizationResult {
  optimalWidth: number; // Percentage (e.g., 0.10 for 10%)
  estimatedNetApy: number;
}

export class RangeOptimizer {
  private readonly REBALANCE_COST_USD = 50; // Estimated gas + swap cost

  optimize(
    volatility: Volatility,
    drift: DriftVelocity,
    positionValueUSD: number,
    feeApr: number,
  ): OptimizationResult {
    let bestWidth = 0.05; // Default 5%
    let maxNetApy = -Infinity;

    // Scan widths from 0.5% to 20%
    const candidateWidths: number[] = [];
    for (let w = 0.005; w <= 0.2; w += 0.005) {
      candidateWidths.push(w);
    }

    for (const width of candidateWidths) {
      const netApy = this.calculateNetApy(
        width,
        volatility.value,
        drift.clampedValue,
        positionValueUSD,
        feeApr,
      );

      if (netApy > maxNetApy) {
        maxNetApy = netApy;
        bestWidth = width;
      }
    }

    return {
      optimalWidth: bestWidth,
      estimatedNetApy: maxNetApy,
    };
  }

  private calculateNetApy(
    width: number,
    volatility: number,
    drift: number,
    positionValue: number,
    baseFeeApr: number,
  ): number {
    const referenceWidth = 0.1;
    const concentrationFactor = referenceWidth / width;
    const grossFeeApr = baseFeeApr * concentrationFactor;

    const diffusionRate = Math.pow(volatility, 2) / (Math.pow(width, 2)); // Variance ~ Time. Time ~ Dist^2 / Vol^2
    const driftRate = Math.abs(drift) / width;
    const rebalanceFrequency = diffusionRate + driftRate; // Annual rebalances

    const annualCost = rebalanceFrequency * this.REBALANCE_COST_USD;
    const costDrag = annualCost / positionValue;

    return grossFeeApr - costDrag;
  }
}
