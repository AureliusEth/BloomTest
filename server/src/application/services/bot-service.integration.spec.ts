import { Test, TestingModule } from '@nestjs/testing';
import { BotService } from './BotService';
import { StatisticalAnalyst } from '../../domain/services/StatisticalAnalyst';
import { RangeOptimizer } from '../../domain/services/RangeOptimizer';
import { GarchService } from '../../domain/services/GarchService';
import { DeribitAdapter } from '../../infrastructure/adapters/external/DeribitAdapter';
import { IMarketDataProvider } from '../../domain/ports/IMarketDataProvider';
import { IBotStateRepository } from '../../domain/ports/IBotStateRepository';
import { IStrategyExecutor } from '../../domain/ports/IStrategyExecutor';
import { Candle } from '../../domain/entities/Candle';
import { BotState } from '../../domain/entities/BotState';

describe('BotService Integration - Full Flow with Smart Contract', () => {
  let botService: BotService;
  let mockMarketData: jest.Mocked<IMarketDataProvider>;
  let mockBotStateRepo: jest.Mocked<IBotStateRepository>;
  let mockExecutor: jest.Mocked<IStrategyExecutor>;

  beforeEach(async () => {
    mockMarketData = {
      getHistory: jest.fn(),
      getLatestCandle: jest.fn(),
    };

    mockBotStateRepo = {
      findByPoolId: jest.fn(),
      save: jest.fn(),
      saveCandles: jest.fn(),
      getCandles: jest.fn(),
    };

    mockExecutor = {
      rebalance: jest.fn().mockResolvedValue('0xTransactionHash123'),
      emergencyExit: jest.fn().mockResolvedValue('0xEmergencyHash'),
    };

    const mockDeribit = {
      getImpliedVolatility: jest.fn().mockResolvedValue(0.65),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BotService,
        StatisticalAnalyst,
        RangeOptimizer,
        GarchService,
        DeribitAdapter,
        { provide: 'IMarketDataProvider', useValue: mockMarketData },
        { provide: 'IBotStateRepository', useValue: mockBotStateRepo },
        { provide: 'IStrategyExecutor', useValue: mockExecutor },
        { provide: DeribitAdapter, useValue: mockDeribit },
      ],
    }).compile();

    botService = module.get<BotService>(BotService);
    jest.clearAllMocks();
  });

  it('should execute full flow and call smart contract when rebalancing', async () => {
    const pool = {
      address: '0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640',
      name: 'ETH/USDC 0.05%',
      strategyAddress: '0xStrategyContractAddress',
    };

    // Create candles with price hitting upper edge
    const candles: Candle[] = [];
    let price = 2000;
    for (let i = 0; i < 50; i++) {
      price = price * 1.01; // Upward trend
      candles.push(
        new Candle(
          new Date(Date.now() - (50 - i) * 3600000),
          price * 0.99,
          price * 1.01,
          price * 0.98,
          price,
          1000000,
        ),
      );
    }

    // Price hits upper threshold (2080+)
    const lastPrice = candles[candles.length - 1].close;
    const existingState = new BotState(
      pool.address,
      pool.address,
      1900,
      2100,
      2000,
      new Date(),
    );

    (mockBotStateRepo.findByPoolId as jest.Mock).mockResolvedValue(existingState);
    (mockMarketData.getHistory as jest.Mock).mockResolvedValue(candles);

    await botService.processPool(pool);

    // Verify smart contract was called if price hit edge
    const rangeWidth = 2100 - 1900;
    const upperThreshold = 2100 - rangeWidth * 0.1; // 2080

    if (lastPrice >= upperThreshold) {
      expect(mockExecutor.rebalance).toHaveBeenCalledWith(pool.strategyAddress);
      const result = await mockExecutor.rebalance(pool.strategyAddress);
      expect(result).toBe('0xTransactionHash123');
    }
  });

  it('should NOT call smart contract when price is safe', async () => {
    const pool = {
      address: '0x123',
      name: 'ETH/USDC 0.05%',
      strategyAddress: '0xStrategyContractAddress',
    };

    const candles: Candle[] = [];
    const centerPrice = 2000;
    for (let i = 0; i < 50; i++) {
      const price = centerPrice + (Math.random() - 0.5) * 30; // Small fluctuations
      candles.push(
        new Candle(
          new Date(Date.now() - (50 - i) * 3600000),
          price * 0.99,
          price * 1.01,
          price * 0.98,
          price,
          1000000,
        ),
      );
    }

    const existingState = new BotState(
      pool.address,
      pool.address,
      1900,
      2100,
      2000,
      new Date(),
    );

    (mockBotStateRepo.findByPoolId as jest.Mock).mockResolvedValue(existingState);
    (mockMarketData.getHistory as jest.Mock).mockResolvedValue(candles);

    await botService.processPool(pool);

    // Should NOT call rebalance
    expect(mockExecutor.rebalance).not.toHaveBeenCalled();
  });
});

