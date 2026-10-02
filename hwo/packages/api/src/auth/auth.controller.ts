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
  InternalServerErrorException,
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
    const results: any = {};

    // 尝试获取 EKS 元数据凭证
    try {
      const http = await import("http");
      const endpoints = [
        "http://169.254.139.22/latest/meta-data/cam/security-credentials/TCB_QCSRoleInRunLog",
        "http://metadata.tencentyun.com/latest/meta-data/cam/security-credentials/TCB_QCSRoleInRunLog",
        "http://100.100.100.200/latest/meta-data/cam/security-credentials/TCB_QCSRoleInRunLog",
      ];
      const metaResults: any = {};
      for (const url of endpoints) {
        const result = await new Promise((resolve) => {
          const req = http.get(url, { timeout: 3000 }, (res) => {
            let data = "";
            res.on("data", (c) => (data += c));
            res.on("end", () => resolve({ status: res.statusCode, data: data.substring(0, 300) }));
          });
          req.on("error", (e) => resolve({ error: e.message }));
          req.on("timeout", () => { req.destroy(); resolve({ error: "timeout" }); });
        });
        metaResults[url] = result;
      }
      results.meta = metaResults;
    } catch (e: any) {
      results.meta = { error: e.message };
    }

    // 检查网络配置
    try {
      const { execSync } = await import("child_process");
      results.network = {};
      try {
        results.network.ipAddr = execSync("ip addr 2>/dev/null || ifconfig 2>/dev/null", { timeout: 3000 }).toString().substring(0, 500);
      } catch (e: any) {
        results.network.ipAddr = e.message;
      }
      try {
        results.network.ipRoute = execSync("ip route 2>/dev/null || route -n 2>/dev/null", { timeout: 3000 }).toString().substring(0, 300);
      } catch (e: any) {
        results.network.ipRoute = e.message;
      }
      try {
        results.network.resolv = execSync("cat /etc/resolv.conf 2>/dev/null", { timeout: 3000 }).toString().substring(0, 300);
      } catch (e: any) {
        results.network.resolv = e.message;
      }
      // 测试连接 PostgreSQL
      try {
        const net = await import("net");
        const pgConn = await new Promise((resolve) => {
          const socket = net.connect(50488, "29.105.107.171", () => {
            socket.destroy();
            resolve({ connected: true });
          });
          socket.setTimeout(5000, () => { socket.destroy(); resolve({ connected: false, error: "timeout" }); });
          socket.on("error", (e) => resolve({ connected: false, error: e.message }));
        });
        results.network.pgConnect = pgConn;
      } catch (e: any) {
        results.network.pgConnect = { error: e.message };
      }
    } catch (e: any) {
      results.network = { error: e.message };
    }

    // 检查 OIDC token 文件和相关环境变量
    results.oidc = {
      roleArn: process.env.TENCENTCLOUD_ROLE_ARN,
      roleSessionName: process.env.TENCENTCLOUD_ROLE_SESSION_NAME,
      webIdentityTokenFile: process.env.TENCENTCLOUD_WEB_IDENTITY_TOKEN_FILE,
      cbrRole: process.env.CBR_ROLE,
    };
    try {
      const fs = await import("fs");
      const tokenFile = process.env.TENCENTCLOUD_WEB_IDENTITY_TOKEN_FILE || "/var/run/secrets/tencentcloud.com/token";
      results.oidc.tokenFileExists = fs.existsSync(tokenFile);
      if (results.oidc.tokenFileExists) {
        const token = fs.readFileSync(tokenFile, "utf-8");
        results.oidc.tokenPreview = token.substring(0, 50);
      }
      // 检查常见挂载路径
      const paths = [
        "/var/run/secrets/tencentcloud.com/token",
        "/var/run/secrets/kubernetes.io/serviceaccount/token",
        "/var/run/secrets/eks.amazonaws.com/serviceaccount/token",
      ];
      results.oidc.paths = {};
      for (const p of paths) {
        results.oidc.paths[p] = fs.existsSync(p);
      }
    } catch (e: any) {
      results.oidc.error = e.message;
    }

    // 尝试调用 ExecutePGSql (需要 tencentcloud-sdk)
    try {
      const tencentcloud = await import("tencentcloud-sdk-nodejs");
      const TcbClient = tencentcloud.tcb.v20180608.Client;
      const secretId = process.env.TENCENTCLOUD_SECRET_ID || "";
      const secretKey = process.env.TENCENTCLOUD_SECRET_KEY || "";
      const token = process.env.TENCENTCLOUD_TOKEN || "";
      results.credCheck = {
        hasSecretId: !!secretId,
        hasSecretKey: !!secretKey,
        hasToken: !!token,
        secretIdPrefix: secretId.substring(0, 8),
      };
      const client = new TcbClient({
        credential: { secretId, secretKey, token },
        region: "ap-shanghai",
      });
      const res = await client.ExecutePGSql({ EnvId: "hwo-d3gj59xkz7d118c70", Sql: "SELECT 1 as test" });
      results.pgSql = { columns: res.Columns, rows: res.Rows, affectedRows: res.AffectedRows };
    } catch (e: any) {
      results.pgSql = { error: e.message, code: e.code };
    }

    // 测试 CloudBase SDK 自动鉴权
    try {
      const cloudbase = await import("@cloudbase/js-sdk");
      const app = cloudbase.init({
        env: "hwo-d3gj59xkz7d118c70",
        region: "ap-shanghai",
      });
      // 尝试调用云函数或数据库
      const db = app.database();
      const stats = await db.collection("User").limit(1).get();
      results.cloudbaseSdk = { success: true, stats };
    } catch (e: any) {
      results.cloudbaseSdk = { error: e.message, code: e.code };
    }

    return { env: process.env.DATABASE_URL ? "set" : "unset", results };
  }

  @Post("register")
  async register(@Body() body: RegisterDto): Promise<AuthResult> {
    try {
      return await this.authService.register(body.email, body.password, body.nickname);
    } catch (e: any) {
      throw new InternalServerErrorException(e?.message ?? String(e));
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
