import {
  Controller,
  Post,
  Get,
  Body,
  Headers,
  HttpCode,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @ApiOperation({ summary: 'Login with HANA credentials' })
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Get('me')
  @ApiOperation({ summary: 'Get current session info' })
  async me(@Headers('x-session-token') token: string) {
    if (!token) throw new UnauthorizedException('Missing x-session-token header');
    const info = this.authService.getSessionInfo(token);
    if (!info) throw new UnauthorizedException('Invalid or expired session token');
    return info;
  }

  @Post('logout')
  @HttpCode(204)
  @ApiOperation({ summary: 'Logout and destroy session' })
  async logout(@Headers('x-session-token') token: string) {
    if (token) {
      await this.authService.logout(token);
    }
  }
}
