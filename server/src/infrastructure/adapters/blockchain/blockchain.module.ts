import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EthersStrategyExecutor } from './EthersStrategyExecutor';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: 'IStrategyExecutor',
      useClass: EthersStrategyExecutor,
    },
  ],
  exports: ['IStrategyExecutor'],
})
export class BlockchainModule {}


