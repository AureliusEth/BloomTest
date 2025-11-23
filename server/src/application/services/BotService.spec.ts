import { Test, TestingModule } from '@nestjs/testing';
import { BotService } from './BotService';
import { StatisticalAnalyst } from '../../domain/services/StatisticalAnalyst';
import { RangeOptimizer } from '../../domain/services/RangeOptimizer';
import { IMarketDataProvider } from '../../domain/ports/IMarketDataProvider';
import { IBotStateRepository } from '../../domain/ports/IBotStateRepository';
import { IStrategyExecutor } from '../../domain/ports/IStrategyExecutor';
import { Candle } from '../../domain/entities/Candle';
import { BotState } from '../../domain/entities/BotState';
import { Volatility } from '../../domain/value-objects/Volatility';
import { HurstExponent } from '../../domain/value-objects/HurstExponent';
import { DriftVelocity } from '../../domain/value-objects/DriftVelocity';
import { MACD } from '../../domain/value-objects/MACD';
import { DeribitAdapter } from '../../infrastructure/adapters/external/DeribitAdapter';

// Mock implementations
const mockMarketData: IMarketDataProvider = {
  getHistory: jest.fn(),
  getLatestCandle: jest.fn(),
};

const mockBotStateRepo: IBotStateRepository = {
  findByPoolId: jest.fn(),
  save: jest.fn(),
  saveCandles: jest.fn(),
  getCandles: jest.fn(),
};

const mockExecutor: IStrategyExecutor = {
  rebalance: jest.fn().mockResolvedValue('0xTxHash'),
  emergencyExit: jest.fn().mockResolvedValue('0xTxHash'),
};

const mockAnalyst = {
  analyze: jest.fn(),
};

const mockOptimizer = {
  optimize: jest.fn(),
};

const mockDeribit = {
  getImpliedVolatility: jest.fn(),
};

describe('BotService', () => {
  let service: BotService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BotService,
        { provide: 'IMarketDataProvider', useValue: mockMarketData },
        { provide: 'IBotStateRepository', useValue: mockBotStateRepo },
        { provide: 'IStrategyExecutor', useValue: mockExecutor },
        { provide: StatisticalAnalyst, useValue: mockAnalyst },
        { provide: RangeOptimizer, useValue: mockOptimizer },
        { provide: DeribitAdapter, useValue: mockDeribit },
      ],
    }).compile();

    service = module.get<BotService>(BotService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should process pool and update metrics', async () => {
    const pool = { address: '0x123', name: 'Test Pool', strategyAddress: '0xStrategy' };
    const candles = Array(50).fill(new Candle(new Date(), 100, 110, 90, 105, 1000));
    
    // Mocks
    (mockBotStateRepo.findByPoolId as jest.Mock).mockResolvedValue(
        new BotState('0x123', '0x123', 90, 110, 100, new Date())
    );
    (mockMarketData.getHistory as jest.Mock).mockResolvedValue(candles);
    (mockAnalyst.analyze as jest.Mock).mockReturnValue({
        volatility: new Volatility(0.5),
        garchVolatility: new Volatility(0.6),
        hurst: new HurstExponent(0.6),
        drift: new DriftVelocity(0.1),
        macd: new MACD(0.5, 0.3, 0.2),
    });
    (mockDeribit.getImpliedVolatility as jest.Mock).mockRejectedValue(new Error('Mock error'));
    (mockOptimizer.optimize as jest.Mock).mockReturnValue({
        optimalWidth: 0.1,
        estimatedNetApy: 0.2
    });

    await service.processPool(pool);

    expect(mockBotStateRepo.findByPoolId).toHaveBeenCalledWith(pool.address);
    expect(mockMarketData.getHistory).toHaveBeenCalled();
    expect(mockAnalyst.analyze).toHaveBeenCalled();
    expect(mockOptimizer.optimize).toHaveBeenCalled();
    expect(mockBotStateRepo.save).toHaveBeenCalled(); // Should save updated metrics
  });

  it('should trigger rebalance and call executor when price hits edge', async () => {
    const pool = { address: '0x123', name: 'Test Pool', strategyAddress: '0xStrategy' };
    const currentPrice = 109.5; // Near upper edge of [90, 110]
    const candles = Array(50).fill(new Candle(new Date(), 100, 110, 90, currentPrice, 1000));
    
    const mockState = new BotState('0x123', '0x123', 90, 110, 100, new Date());
    
    (mockBotStateRepo.findByPoolId as jest.Mock).mockResolvedValue(mockState);
    (mockMarketData.getHistory as jest.Mock).mockResolvedValue(candles);
    (mockAnalyst.analyze as jest.Mock).mockReturnValue({
        volatility: new Volatility(0.5),
        garchVolatility: new Volatility(0.5),
        hurst: new HurstExponent(0.5), // Neutral
        drift: new DriftVelocity(0),
        macd: new MACD(0.3, 0.4, -0.1), // Bearish
    });
    (mockDeribit.getImpliedVolatility as jest.Mock).mockRejectedValue(new Error('Mock error'));
    (mockOptimizer.optimize as jest.Mock).mockReturnValue({
        optimalWidth: 0.1, // 10%
        estimatedNetApy: 0.2
    });

    await service.processPool(pool);

    // Verify executor was called
    expect(mockExecutor.rebalance).toHaveBeenCalledWith(pool.strategyAddress);
    
    // Verify state update
    expect(mockBotStateRepo.save).toHaveBeenCalledTimes(2); // Once for metrics, once for rebalance
    const savedState = (mockBotStateRepo.save as jest.Mock).mock.calls[1][0] as BotState;
    expect(savedState.lastRebalancePrice).toBe(currentPrice);
  });

  it('should use Deribit IV when available', async () => {
    const pool = { address: '0x123', name: 'ETH/USDC 0.05%', strategyAddress: '0xStrategy' };
    const candles = Array(50).fill(new Candle(new Date(), 100, 110, 90, 105, 1000));
    
    (mockBotStateRepo.findByPoolId as jest.Mock).mockResolvedValue(
        new BotState('0x123', '0x123', 90, 110, 100, new Date())
    );
    (mockMarketData.getHistory as jest.Mock).mockResolvedValue(candles);
    (mockAnalyst.analyze as jest.Mock).mockReturnValue({
        volatility: new Volatility(0.5),
        garchVolatility: new Volatility(0.6),
        hurst: new HurstExponent(0.5),
        drift: new DriftVelocity(0),
        macd: new MACD(0.5, 0.3, 0.2),
    });
    (mockDeribit.getImpliedVolatility as jest.Mock).mockResolvedValue(0.75); // 75% IV
    (mockOptimizer.optimize as jest.Mock).mockReturnValue({
        optimalWidth: 0.1,
        estimatedNetApy: 0.2
    });

    await service.processPool(pool);

    expect(mockDeribit.getImpliedVolatility).toHaveBeenCalledWith('ETH');
    // Optimizer should be called with IV-based volatility (0.75) instead of GARCH
    expect(mockOptimizer.optimize).toHaveBeenCalledWith(
      expect.objectContaining({ value: 0.75 }),
      expect.any(DriftVelocity),
      10000,
      0.1
    );
  });

  it('should detect trending regime with MACD', async () => {
    const pool = { address: '0x123', name: 'ETH/USDC 0.05%', strategyAddress: '0xStrategy' };
    const candles = Array(50).fill(new Candle(new Date(), 100, 110, 90, 105, 1000));
    
    (mockBotStateRepo.findByPoolId as jest.Mock).mockResolvedValue(
        new BotState('0x123', '0x123', 90, 110, 100, new Date())
    );
    (mockMarketData.getHistory as jest.Mock).mockResolvedValue(candles);
    (mockAnalyst.analyze as jest.Mock).mockReturnValue({
        volatility: new Volatility(0.5),
        garchVolatility: new Volatility(0.6),
        hurst: new HurstExponent(0.4), // Mean reverting by Hurst
        drift: new DriftVelocity(0),
        macd: new MACD(0.5, 0.3, 0.2), // But bullish MACD with strong signal
    });
    (mockDeribit.getImpliedVolatility as jest.Mock).mockRejectedValue(new Error('Mock error'));
    (mockOptimizer.optimize as jest.Mock).mockReturnValue({
        optimalWidth: 0.1,
        estimatedNetApy: 0.2
    });

    await service.processPool(pool);

    // Should log trending signal due to MACD
    expect(mockAnalyst.analyze).toHaveBeenCalled();
  });
});
