import { Module } from '@nestjs/common';
import { StatisticalAnalyst } from './services/StatisticalAnalyst';
import { RangeOptimizer } from './services/RangeOptimizer';
import { GarchService } from './services/GarchService';

@Module({
  providers: [StatisticalAnalyst, RangeOptimizer, GarchService],
  exports: [StatisticalAnalyst, RangeOptimizer, GarchService],
})
export class DomainModule {}

