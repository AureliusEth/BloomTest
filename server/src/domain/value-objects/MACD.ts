export class MACD {
  constructor(
    public readonly macdLine: number,
    public readonly signalLine: number,
    public readonly histogram: number,
  ) {}

  /**
   * Returns true if MACD indicates a bullish trend (MACD > Signal)
   */
  isBullish(): boolean {
    return this.macdLine > this.signalLine;
  }

  /**
   * Returns true if MACD indicates a bearish trend (MACD < Signal)
   */
  isBearish(): boolean {
    return this.macdLine < this.signalLine;
  }

  /**
   * Returns the strength of the trend signal (0-1)
   * Higher values indicate stronger momentum
   */
  getSignalStrength(): number {
    const diff = Math.abs(this.histogram);
    // Normalize to 0-1 range (assuming histogram typically ranges from -0.1 to 0.1 for most assets)
    return Math.min(1, diff * 10);
  }

  /**
   * Returns true if there's a bullish crossover (MACD crosses above Signal)
   */
  hasBullishCrossover(previous: MACD): boolean {
    return (
      previous.macdLine <= previous.signalLine &&
      this.macdLine > this.signalLine
    );
  }

  /**
   * Returns true if there's a bearish crossover (MACD crosses below Signal)
   */
  hasBearishCrossover(previous: MACD): boolean {
    return (
      previous.macdLine >= previous.signalLine &&
      this.macdLine < this.signalLine
    );
  }
}
