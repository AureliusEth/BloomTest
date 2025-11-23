import { MACD } from './MACD';

describe('MACD', () => {
  it('should create MACD with correct values', () => {
    const macd = new MACD(0.5, 0.3, 0.2);
    expect(macd.macdLine).toBe(0.5);
    expect(macd.signalLine).toBe(0.3);
    expect(macd.histogram).toBe(0.2);
  });

  it('should identify bullish trend', () => {
    const macd = new MACD(0.5, 0.3, 0.2); // MACD > Signal
    expect(macd.isBullish()).toBe(true);
    expect(macd.isBearish()).toBe(false);
  });

  it('should identify bearish trend', () => {
    const macd = new MACD(0.3, 0.5, -0.2); // MACD < Signal
    expect(macd.isBullish()).toBe(false);
    expect(macd.isBearish()).toBe(true);
  });

  it('should calculate signal strength', () => {
    const macd = new MACD(0.5, 0.3, 0.2);
    const strength = macd.getSignalStrength();
    expect(strength).toBeGreaterThanOrEqual(0);
    expect(strength).toBeLessThanOrEqual(1);
  });

  it('should detect bullish crossover', () => {
    const previous = new MACD(0.3, 0.4, -0.1); // MACD was below signal
    const current = new MACD(0.5, 0.4, 0.1); // MACD crossed above signal
    expect(current.hasBullishCrossover(previous)).toBe(true);
  });

  it('should detect bearish crossover', () => {
    const previous = new MACD(0.5, 0.4, 0.1); // MACD was above signal
    const current = new MACD(0.3, 0.4, -0.1); // MACD crossed below signal
    expect(current.hasBearishCrossover(previous)).toBe(true);
  });

  it('should not detect crossover when no crossover occurred', () => {
    const previous = new MACD(0.5, 0.4, 0.1);
    const current = new MACD(0.6, 0.5, 0.1); // Both still bullish, no crossover
    expect(current.hasBullishCrossover(previous)).toBe(false);
    expect(current.hasBearishCrossover(previous)).toBe(false);
  });
});
