import { Module } from "@nestjs/common";
import { WalletController } from "./wallet.controller.js";
import { WalletService } from "./wallet.service.js";
import { PrismaModule } from "../prisma/prisma.module.js";

@Module({
  imports: [PrismaModule],
  controllers: [WalletController],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}
