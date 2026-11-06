import { Module } from "@nestjs/common";
import { AuditService } from "./audit.service.js";
import { AuditController } from "./audit.controller.js";
import { PrismaModule } from "../prisma/prisma.module.js";
import { TeamModule } from "../team/team.module.js";

@Module({
  imports: [PrismaModule, TeamModule],
  providers: [AuditService],
  controllers: [AuditController],
  exports: [AuditService],
})
export class AuditModule {}
