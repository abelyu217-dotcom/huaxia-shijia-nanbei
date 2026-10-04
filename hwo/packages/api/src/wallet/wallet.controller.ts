import { Controller, Get, Post, Body, UseGuards, Request } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import { WalletService } from "./wallet.service.js";

@Controller("api/wallet")
@UseGuards(JwtAuthGuard)
export class WalletController {
  constructor(private walletService: WalletService) {}

  @Get()
  getBalance(@Request() req: any) {
    return this.walletService.getBalance(req.user.id);
  }

  @Post("spend-coins")
  spendCoins(@Request() req: any, @Body() body: { amount: number; reason: string }) {
    return this.walletService.spendCoins(req.user.id, body.amount, body.reason);
  }

  @Post("spend-credits")
  spendCredits(@Request() req: any, @Body() body: { amount: number; reason: string }) {
    return this.walletService.spendCredits(req.user.id, body.amount, body.reason);
  }
}
