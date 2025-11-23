import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PersistenceModule } from './infrastructure/adapters/persistence/persistence.module';
import { GraphModule } from './infrastructure/adapters/graph/graph.module';
import { ApplicationModule } from './application/application.module';
import { BotStateEntity } from './infrastructure/adapters/persistence/entities/BotState.entity';
import { CandleEntity } from './infrastructure/adapters/persistence/entities/Candle.entity';
import { BotController } from './infrastructure/controllers/BotController';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('DB_HOST', 'localhost'),
        port: configService.get<number>('DB_PORT', 5432),
        username: configService.get<string>('DB_USERNAME', 'postgres'),
        password: configService.get<string>('DB_PASSWORD', 'postgres'),
        database: configService.get<string>('DB_DATABASE', 'bloom_bot'),
        entities: [BotStateEntity, CandleEntity],
        synchronize: true,
      }),
      inject: [ConfigService],
    }),
    PersistenceModule,
    GraphModule,
    ApplicationModule,
  ],
  controllers: [BotController],
  providers: [],
})
export class AppModule {}
