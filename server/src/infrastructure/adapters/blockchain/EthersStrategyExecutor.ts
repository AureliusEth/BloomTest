import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Contract, Wallet, JsonRpcProvider } from 'ethers';
import { IStrategyExecutor } from '../../../domain/ports/IStrategyExecutor';

@Injectable()
export class EthersStrategyExecutor implements IStrategyExecutor {
  private readonly logger = new Logger(EthersStrategyExecutor.name);
  private wallet: Wallet;
  private provider: JsonRpcProvider;

  private readonly STRATEGY_ABI = [
    'function rebalance() external',
    'function emergencyExit() external',
  ];

  constructor(private configService: ConfigService) {
    const rpcUrl = this.configService.get<string>('RPC_URL', 'http://localhost:8545');
    const privateKey = this.configService.get<string>('KEEPER_PRIVATE_KEY');

    this.provider = new JsonRpcProvider(rpcUrl);
    
    if (privateKey) {
      this.wallet = new Wallet(privateKey, this.provider);
    } else {
      this.logger.warn('No private key provided, execution will fail');
    }
  }

  async rebalance(strategyAddress: string): Promise<string> {
    return this.executeWithRetry(() => this._rebalance(strategyAddress), 'rebalance');
  }

  async emergencyExit(strategyAddress: string): Promise<string> {
      return this.executeWithRetry(() => this._emergencyExit(strategyAddress), 'emergencyExit');
  }

  private async _rebalance(strategyAddress: string): Promise<string> {
    if (!this.wallet) throw new Error('Keeper wallet not initialized');

    this.logger.log(`Executing rebalance on ${strategyAddress}...`);
    const contract = new Contract(strategyAddress, this.STRATEGY_ABI, this.wallet);
    
    // Estimate gas
    let gasLimit;
    try {
        gasLimit = await contract.rebalance.estimateGas();
        // Add buffer
        gasLimit = (gasLimit * 120n) / 100n;
    } catch (e) {
        this.logger.warn(`Gas estimation failed, using default: ${e.message}`);
        gasLimit = 3000000n; // Fallback
    }

    const tx = await contract.rebalance({ gasLimit });
    this.logger.log(`Transaction sent: ${tx.hash}`);
    
    const receipt = await tx.wait();
    this.logger.log(`Transaction confirmed: ${receipt.hash}`);
    
    return receipt.hash;
  }

  private async _emergencyExit(strategyAddress: string): Promise<string> {
    if (!this.wallet) throw new Error('Keeper wallet not initialized');
  
    this.logger.log(`Executing emergency exit on ${strategyAddress}...`);
    const contract = new Contract(strategyAddress, this.STRATEGY_ABI, this.wallet);
    
    const tx = await contract.emergencyExit();
    this.logger.log(`Transaction sent: ${tx.hash}`);
    
    const receipt = await tx.wait();
    return receipt.hash;
  }

  private async executeWithRetry<T>(operation: () => Promise<T>, context: string, retries = 3): Promise<T> {
      for (let i = 0; i < retries; i++) {
          try {
              return await operation();
          } catch (error) {
              this.logger.warn(`Attempt ${i + 1}/${retries} failed for ${context}: ${error.message}`);
              if (i === retries - 1) throw error;
              
              // Exponential backoff
              const delay = 1000 * Math.pow(2, i);
              await new Promise(resolve => setTimeout(resolve, delay));
          }
      }
      throw new Error('Unreachable');
  }
}
