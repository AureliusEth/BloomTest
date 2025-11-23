import { Controller, Get, Post, Param, Inject } from '@nestjs/common';
import { BotService } from '../../application/services/BotService';
import { IBotStateRepository } from '../../domain/ports/IBotStateRepository';

@Controller('bot')
export class BotController {
  constructor(
    private readonly botService: BotService,
    @Inject('IBotStateRepository') private readonly botStateRepo: any, // Changed to any to avoid decorator metadata issues
  ) {}

  @Post('analyze')
  async triggerAnalysis() {
    await this.botService.handleCron();
    return { message: 'Analysis triggered manually' };
  }

  @Post('analyze/:poolAddress')
  async analyzePool(@Param('poolAddress') poolAddress: string) {
    // Basic lookup for name
    const name = 'Manual Run';
    const strategyAddress = '0x0000000000000000000000000000000000000000'; // Default for manual run
    await this.botService.processPool({
      address: poolAddress,
      name,
      strategyAddress,
    });
    return { message: `Analysis triggered for ${poolAddress}` };
  }

  @Get('status/:poolAddress')
  async getStatus(@Param('poolAddress') poolAddress: string) {
    const state = await this.botStateRepo.findByPoolId(poolAddress);
    if (!state) {
      return { message: 'No state found for this pool' };
    }
    return {
      poolId: state.poolId,
      range: {
        lower: state.priceLower,
        upper: state.priceUpper,
      },
      lastRebalance: {
        price: state.lastRebalancePrice,
        at: state.lastRebalanceAt,
      },
      metrics: {
        volatility: state.currentVolatility?.toString(),
        hurst: state.currentHurst?.value,
      },
      isActive: state.isActive,
    };
  }
}
