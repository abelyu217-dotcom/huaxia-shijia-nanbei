import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { JwtStrategy } from "./jwt.strategy.js";
import { AnalyticsModule } from "../analytics/analytics.module.js";

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? "hwo_dev_secret_change_in_prod",
      signOptions: { expiresIn: "7d" },
    }),
    AnalyticsModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
