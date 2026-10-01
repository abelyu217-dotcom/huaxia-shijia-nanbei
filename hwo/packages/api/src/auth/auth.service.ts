/**
 * AuthService——用户注册/登录 + JWT 签发
 *
 * - register: 邮箱注册，bcrypt 哈希密码，自动绑定一支空闲球队
 * - login: 验证凭据，返回 access token
 * - validateUser: JWT 策略回调用
 */

import {
  Injectable,
  Logger,
  ConflictException,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service.js";
import { AnalyticsService } from "../analytics/analytics.service.js";

export interface AuthResult {
  accessToken: string;
  user: {
    id: string;
    email: string;
    nickname: string;
    teamId: string | null;
  };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly analytics: AnalyticsService,
  ) {}

  async register(email: string, password: string, nickname: string): Promise<AuthResult> {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException("该邮箱已注册");
    }

    const passwordHash = await bcrypt.hash(password, 10);

    // P1-3b：注册时不自动分配球队，用户登录后在世界大厅选择世界 + 球队
    const user = await this.prisma.user.create({
      data: { email, passwordHash, nickname },
      include: { teams: { select: { id: true } } },
    });

    this.logger.log(`User registered: ${email}（待选择世界与球队）`);

    // M5 §6.3 埋点：注册 + 当日活跃
    await this.analytics.track({
      userId: user.id,
      event: "register",
      category: "auth",
      properties: { email, teamId: null },
    });

    return this.issueToken(user.id, user.email, user.nickname, null);
  }

  async login(email: string, password: string): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { teams: { select: { id: true } } },
    });
    if (!user) {
      throw new UnauthorizedException("邮箱或密码错误");
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException("邮箱或密码错误");
    }

    // M5 §6.3 埋点：登录 + 当日活跃
    await this.analytics.track({
      userId: user.id,
      event: "login",
      category: "auth",
      properties: { email },
    });

    return this.issueToken(user.id, user.email, user.nickname, user.teams[0]?.id ?? null);
  }

  /** JWT 策略回调：根据 userId 查用户 */
  async validateUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { teams: { select: { id: true } } },
    });
    if (!user) return null;
    return {
      id: user.id,
      email: user.email,
      nickname: user.nickname,
      teamId: user.teams[0]?.id ?? null,
    };
  }

  private issueToken(userId: string, email: string, nickname: string, teamId: string | null): AuthResult {
    const payload = { sub: userId, email, teamId };
    return {
      accessToken: this.jwtService.sign(payload),
      user: { id: userId, email, nickname, teamId },
    };
  }
}
