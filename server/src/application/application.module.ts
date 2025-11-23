import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { DomainModule } from '../domain/domain.module';
import { GraphModule } from '../infrastructure/adapters/graph/graph.module';
import { PersistenceModule } from '../infrastructure/adapters/persistence/persistence.module';
import { BlockchainModule } from '../infrastructure/adapters/blockchain/blockchain.module';
import { BotService } from './services/BotService';
import { DeribitAdapter } from '../infrastructure/adapters/external/DeribitAdapter';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    DomainModule,
    GraphModule,
    PersistenceModule,
    BlockchainModule,
  ],
  providers: [BotService, DeribitAdapter],
  exports: [BotService],
})
export class ApplicationModule {}

