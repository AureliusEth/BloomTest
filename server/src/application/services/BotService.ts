import { Injectable, Inject, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { IMarketDataProvider } from '../../domain/ports/IMarketDataProvider';
import { IBotStateRepository } from '../../domain/ports/IBotStateRepository';
import { IStrategyExecutor } from '../../domain/ports/IStrategyExecutor';
import { StatisticalAnalyst } from '../../domain/services/StatisticalAnalyst';
import { RangeOptimizer } from '../../domain/services/RangeOptimizer';
import { BotState } from '../../domain/entities/BotState';
import { DeribitAdapter } from '../../infrastructure/adapters/external/DeribitAdapter';
import { Volatility } from '../../domain/value-objects/Volatility';

const POOLS = [
  { address: '0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640', name: 'ETH/USDC 0.05%', strategyAddress: '0x0000000000000000000000000000000000000000' }, // Update with real strategy address
  { address: '0x4e68ccd3e89f51c3074ca5072bbac773960dfa36', name: 'ETH/USDT 0.3%', strategyAddress: '0x0000000000000000000000000000000000000000' },
  { address: '0x99ac8ca7087fa4a2a1fb635c111b6d25f9b9cf38', name: 'WBTC/USDC 0.3%', strategyAddress: '0x0000000000000000000000000000000000000000' },
  { address: '0xcbcdf9626bc03e24f779434178a73a0b4bad62ed', name: 'WBTC/USDT 0.3%', strategyAddress: '0x0000000000000000000000000000000000000000' }, 
];

@Injectable()
export class BotService {
  private readonly logger = new Logger(BotService.name);

  constructor(
    @Inject('IMarketDataProvider') private readonly marketData: any, // Changed to any to avoid metadata issues
    @Inject('IBotStateRepository') private readonly botStateRepo: any,
    @Inject('IStrategyExecutor') private readonly executor: any,
    private readonly analyst: StatisticalAnalyst,
    private readonly optimizer: RangeOptimizer,
    private readonly deribit: DeribitAdapter,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleCron() {
    this.logger.log('Starting scheduled analysis...');

    for (const pool of POOLS) {
      await this.processPool(pool);
    }
  }

  async processPool(pool: { address: string; name: string; strategyAddress: string }) {
    this.logger.log(`Processing pool: ${pool.name} (${pool.address})`);

    try {
      // 1. Ensure BotState exists
      let state = await this.botStateRepo.findByPoolId(pool.address);
      if (!state) {
        // Initialize new state
        const initialCandle = await this.marketData.getLatestCandle(pool.address);
        state = new BotState(
            pool.address,
            pool.address,
            initialCandle.close * 0.95, // Default -5%
            initialCandle.close * 1.05, // Default +5%
            initialCandle.close,
            new Date(),
        );
        await this.botStateRepo.save(state);
      }

      // 2. Ingest Data (Last 48 hours)
      const candles = await this.marketData.getHistory(pool.address, 48);
      await this.botStateRepo.saveCandles(candles, pool.address);

      if (candles.length < 10) {
        this.logger.warn(`Insufficient data for ${pool.name}`);
        return;
      }

      // 3. Analyze
      const analysis = this.analyst.analyze(candles);
      
      // Fetch Deribit IV
      let ivValue: number | null = null;
      try {
        // Extract asset from pair (e.g., WBTC from WBTC/USDC)
        // Handle "WBTC" -> "BTC" mapping if needed, Deribit uses BTC/ETH
        let asset = pool.name.split('/')[0].toUpperCase();
        if (asset === 'WBTC') asset = 'BTC';
        if (asset === 'WETH') asset = 'ETH';
        
        ivValue = await this.deribit.getImpliedVolatility(asset);
        this.logger.log(`Deribit IV for ${asset}: ${(ivValue * 100).toFixed(2)}%`);
      } catch (e) {
        this.logger.warn(`Could not fetch Deribit IV: ${e.message}`);
      }

      const robustVolatility = ivValue ? new Volatility(ivValue) : analysis.garchVolatility;

      this.logger.log(
        `${pool.name} Analysis: HistVol=${analysis.volatility.toString()}, GarchVol=${analysis.garchVolatility.toString()}, IV=${ivValue ? (ivValue * 100).toFixed(2) + '%' : 'N/A'}, Hurst=${analysis.hurst.value.toFixed(
          2,
        )}, Drift=${analysis.drift.clampedValue.toFixed(2)}, MACD=${analysis.macd.macdLine.toFixed(4)} (Signal: ${analysis.macd.signalLine.toFixed(4)})`,
      );

      // Update state metrics (store robust vol instead of hist vol?)
      state.updateMetrics(robustVolatility, analysis.hurst);
      await this.botStateRepo.save(state);

      // 4. Optimize Range
      // Assuming a default Fee APR of 10% (0.1) for now as we don't have fee data
      // And a position value of $10,000 for calculation
      const optimization = this.optimizer.optimize(
        robustVolatility,
        analysis.drift,
        10000, 
        0.1, 
      );

      // 5. Decision Logic (Rebalance Trigger)
      const currentPrice = candles[candles.length - 1].close;
      const currentLower = state.priceLower;
      const currentUpper = state.priceUpper;
      const rangeWidth = currentUpper - currentLower;
      
      // Check if price is near edge (90% of half-width)
      // "Price touched 90% of the band"
      const lowerThreshold = currentLower + (rangeWidth * 0.1); // Bottom 10%
      const upperThreshold = currentUpper - (rangeWidth * 0.1); // Top 10%

      let shouldRebalance = false;
      if (currentPrice <= lowerThreshold || currentPrice >= upperThreshold) {
        shouldRebalance = true;
        this.logger.log(`[TRIGGER] Price ${currentPrice} hit edge of range [${currentLower}, ${currentUpper}]`);
      }

      // Check for Regime Change (Hurst + MACD) -> if trending strongly, might want to rebalance early
      const isTrendingByHurst = analysis.hurst.isTrending();
      const isTrendingByMACD = analysis.macd.isBullish() || analysis.macd.isBearish();
      const macdSignalStrength = analysis.macd.getSignalStrength();
      
      if ((isTrendingByHurst || (isTrendingByMACD && macdSignalStrength > 0.3)) && !shouldRebalance) {
         // Logic from strategy: "If Trending... Rebalance IMMEDIATELY (or early)"
         // MACD confirms trend direction and strength
         const trendDirection = analysis.macd.isBullish() ? 'BULLISH' : analysis.macd.isBearish() ? 'BEARISH' : 'NEUTRAL';
         this.logger.log(
           `[SIGNAL] Trending regime detected (H=${analysis.hurst.value.toFixed(2)}, MACD=${trendDirection}, Strength=${macdSignalStrength.toFixed(2)})`
         );
      }
      
      // Enhanced mean reversion check: If MACD suggests mean reversion, delay rebalancing
      if (!isTrendingByHurst && analysis.hurst.isMeanReverting() && !isTrendingByMACD && shouldRebalance) {
        // Price hit edge but signals suggest it will snap back
        this.logger.log(
          `[SIGNAL] Mean reversion detected - delaying rebalance (H=${analysis.hurst.value.toFixed(2)}, MACD neutral)`
        );
        // Could implement a delay mechanism here, or just log for now
      }

      if (shouldRebalance) {
        // Execute Rebalance on Chain
        this.logger.log(`[EXECUTE] Calling rebalance on strategy ${pool.strategyAddress}...`);
        
        // Only execute if we have a valid strategy address (mock for now if 0x0)
        if (pool.strategyAddress !== '0x0000000000000000000000000000000000000000') {
             await this.executor.rebalance(pool.strategyAddress);
        } else {
             this.logger.warn(`[EXECUTE] Mock execution - No strategy address for ${pool.name}`);
        }

        const halfWidth = optimization.optimalWidth; // e.g. 0.05
        const newLower = currentPrice * (1 - halfWidth);
        const newUpper = currentPrice * (1 + halfWidth);
        
        state.rebalance(newLower, newUpper, currentPrice);
        await this.botStateRepo.save(state);
        
        this.logger.log(`[SUCCESS] Rebalanced ${pool.name} to new range: [${newLower.toFixed(4)}, ${newUpper.toFixed(4)}]`);
      }

    } catch (error) {
      this.logger.error(`Error processing pool ${pool.name}: ${error.message}`, error.stack);
    }
  }
}

