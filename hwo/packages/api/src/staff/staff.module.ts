import { Module } from "@nestjs/common";
import { StaffController } from "./staff.controller.js";
import { StaffService } from "./staff.service.js";
import { PrismaModule } from "../prisma/prisma.module.js";
import { AuthModule } from "../auth/auth.module.js";

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [StaffController],
  providers: [StaffService],
  exports: [StaffService],
})
export class StaffModule {}
