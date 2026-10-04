import { Controller, Get, Post, Body, UseGuards, Request } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import { VipService } from "./vip.service.js";

@Controller("api/vip")
@UseGuards(JwtAuthGuard)
export class VipController {
  constructor(private vipService: VipService) {}

  @Get()
  getSubscription(@Request() req: any) {
    return this.vipService.getSubscription(req.user.id);
  }

  @Get("plans")
  getPlans() {
    return this.vipService.getPlans();
  }

  @Post("subscribe")
  subscribe(@Request() req: any, @Body() body: { type: "monthly" | "seasonal" }) {
    return this.vipService.subscribe(req.user.id, body.type);
  }
}
