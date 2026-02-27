import { Module } from '@nestjs/common';
import { HanaController } from './hana.controller';
import { HanaService } from './hana.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports:     [AuthModule],
  controllers: [HanaController],
  providers:   [HanaService],
})
export class HanaModule {}
