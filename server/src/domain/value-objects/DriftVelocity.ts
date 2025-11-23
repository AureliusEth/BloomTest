export class DriftVelocity {
  constructor(public readonly value: number) {
    // Value is typically annualized log return
  }

  // Clamped value as per strategy (max 5.0)
  get clampedValue(): number {
    return Math.min(5.0, Math.abs(this.value)) * Math.sign(this.value);
  }
}

