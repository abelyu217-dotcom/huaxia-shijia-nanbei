import { Controller, Get, Post, Body, Query, UseGuards, Request } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import { CosmeticService } from "./cosmetic.service.js";

@Controller("api/cosmetics")
@UseGuards(JwtAuthGuard)
export class CosmeticController {
  constructor(private cosmeticService: CosmeticService) {}

  @Get()
  listCosmetics(@Query("type") type?: string) {
    return this.cosmeticService.listCosmetics(type);
  }

  @Get("owned")
  listOwned(@Request() req: any) {
    return this.cosmeticService.listOwned(req.user.id);
  }

  @Post("buy")
  buy(@Request() req: any, @Body() body: { itemId: string }) {
    return this.cosmeticService.buy(req.user.id, body.itemId);
  }

  @Post("equip")
  equip(@Request() req: any, @Body() body: { itemId: string }) {
    return this.cosmeticService.equip(req.user.id, body.itemId);
  }
}
