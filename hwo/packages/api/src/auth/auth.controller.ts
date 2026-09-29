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

  @Post("register")
  async register(@Body() body: RegisterDto): Promise<AuthResult> {
    return this.authService.register(body.email, body.password, body.nickname);
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
