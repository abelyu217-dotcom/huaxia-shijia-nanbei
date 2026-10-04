import { Controller, Post, Body, UseGuards, Request, Delete } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import { PushService } from "./push.service.js";

@Controller("api/push")
@UseGuards(JwtAuthGuard)
export class PushController {
  constructor(private pushService: PushService) {}

  @Post("subscribe")
  subscribe(
    @Request() req: any,
    @Body() body: { endpoint: string; keys: { p256dh: string; auth: string } },
  ) {
    return this.pushService.subscribe(req.user.id, body);
  }

  @Delete("subscribe")
  unsubscribe(@Request() req: any, @Body() body: { endpoint: string }) {
    return this.pushService.unsubscribe(req.user.id, body.endpoint);
  }
}
