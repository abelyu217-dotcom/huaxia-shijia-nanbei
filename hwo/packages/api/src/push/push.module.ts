import { Module } from "@nestjs/common";
import { PushController } from "./push.controller.js";
import { PushService } from "./push.service.js";
import { PrismaModule } from "../prisma/prisma.module.js";

@Module({
  imports: [PrismaModule],
  controllers: [PushController],
  providers: [PushService],
  exports: [PushService],
})
export class PushModule {}
