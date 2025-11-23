import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BotStateEntity } from './entities/BotState.entity';
import { CandleEntity } from './entities/Candle.entity';
import { PostgresBotStateRepository } from './PostgresBotStateRepository';

@Module({
  imports: [TypeOrmModule.forFeature([BotStateEntity, CandleEntity])],
  providers: [
    {
      provide: 'IBotStateRepository',
      useClass: PostgresBotStateRepository,
    },
  ],
  exports: ['IBotStateRepository'],
})
export class PersistenceModule {}

