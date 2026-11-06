/**
 * AuthController——认证端点
 *
 * - POST /api/auth/register  注册
 * - POST /api/auth/login     登录
 * - GET  /api/auth/me        当前用户信息（需 JWT）
 */

import {
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
  Request,
  HttpException,
} from "@nestjs/common";
import { AuthService, type AuthResult } from "./auth.service.js";
import { JwtAuthGuard } from "./jwt-auth.guard.js";

interface RegisterDto {
  email: string;
  password: string;
  nickname: string;
}

interface LoginDto {
  email: string;
  password: string;
}

@Controller("api/auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get("debug")
  async debug() {
    return {
      env: process.env.CLOUDBASE_ENV_ID ? "cloudbase-gateway" : "tcp",
      nodeEnv: process.env.NODE_ENV,
      time: new Date().toISOString(),
    };
  }

  @Post("register")
  async register(@Body() body: RegisterDto): Promise<AuthResult> {
    try {
      return await this.authService.register(body.email, body.password, body.nickname);
    } catch (e: any) {
      // 保留 NestJS HttpException 的状态码与消息（如 ConflictException 409）
      if (e instanceof HttpException) throw e;
      throw e;
    }
  }

  @Post("login")
  async login(@Body() body: LoginDto): Promise<AuthResult> {
    return this.authService.login(body.email, body.password);
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  me(@Request() req: { user: { id: string; email: string; nickname: string; teamId: string | null } }) {
    return req.user;
  }
}
