import { RangeOptimizer } from './RangeOptimizer';
import { Volatility } from '../value-objects/Volatility';
import { DriftVelocity } from '../value-objects/DriftVelocity';

describe('RangeOptimizer', () => {
  let optimizer: RangeOptimizer;

  beforeEach(() => {
    optimizer = new RangeOptimizer();
  });

  it('should recommend a wider range for high volatility', () => {
    const lowVol = new Volatility(0.05); // 5% - Very low to encourage tight range
    const highVol = new Volatility(2.0); // 200% - Extreme to force wide range
    const drift = new DriftVelocity(0);
    const positionValue = 10000;
    const feeApr = 0.5; // High fees to make optimization sensitive

    const resultLow = optimizer.optimize(lowVol, drift, positionValue, feeApr);
    const resultHigh = optimizer.optimize(highVol, drift, positionValue, feeApr);

    // Higher volatility -> higher diffusion -> more rebalancing -> wider range needed to reduce costs
    expect(resultHigh.optimalWidth).toBeGreaterThan(resultLow.optimalWidth);
  });

  it('should recommend a wider range for high drift', () => {
    const vol = new Volatility(0.2); // Moderate constant volatility
    const lowDrift = new DriftVelocity(0);
    const highDrift = new DriftVelocity(5.0); // Max drift
    const positionValue = 10000;
    const feeApr = 0.5;

    const resultLow = optimizer.optimize(vol, lowDrift, positionValue, feeApr);
    const resultHigh = optimizer.optimize(vol, highDrift, positionValue, feeApr);

    // Higher drift -> exiting range faster -> wider range needed
    expect(resultHigh.optimalWidth).toBeGreaterThan(resultLow.optimalWidth);
  });

  it('should recommend a tighter range when fees are extremely high', () => {
    const vol = new Volatility(0.5);
    const drift = new DriftVelocity(0);
    const positionValue = 10000;
    
    const lowFeeResult = optimizer.optimize(vol, drift, positionValue, 0.1); // 10% fee APR
    const highFeeResult = optimizer.optimize(vol, drift, positionValue, 5.0); // 500% fee APR

    // Higher potential fees -> incentive to tighten range to capture more
    expect(highFeeResult.optimalWidth).toBeLessThanOrEqual(lowFeeResult.optimalWidth);
  });

  it('should handle negative drift by using absolute value', () => {
    const vol = new Volatility(0.5);
    const posDrift = new DriftVelocity(1.0);
    const negDrift = new DriftVelocity(-1.0);
    const positionValue = 10000;
    const feeApr = 0.5;

    const resultPos = optimizer.optimize(vol, posDrift, positionValue, feeApr);
    const resultNeg = optimizer.optimize(vol, negDrift, positionValue, feeApr);

    expect(resultPos.optimalWidth).toBe(resultNeg.optimalWidth);
  });
});

