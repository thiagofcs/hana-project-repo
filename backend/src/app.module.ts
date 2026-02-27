import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { HanaModule } from './hana/hana.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal:    true,
      envFilePath: '../.env',
    }),
    AuthModule,
    HanaModule,
  ],
})
export class AppModule {}
