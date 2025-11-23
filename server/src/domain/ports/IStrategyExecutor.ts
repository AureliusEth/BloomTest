import { Contract, Wallet, JsonRpcProvider } from 'ethers';

export interface IStrategyExecutor {
  rebalance(strategyAddress: string): Promise<string>;
  emergencyExit(strategyAddress: string): Promise<string>;
}


