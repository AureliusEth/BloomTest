import { Candle } from '../entities/Candle';

export interface IMarketDataProvider {
  getHistory(poolAddress: string, hours: number): Promise<Candle[]>;
  getLatestCandle(poolAddress: string): Promise<Candle>;
}

