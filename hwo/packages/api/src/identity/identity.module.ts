import { Module } from "@nestjs/common";
import { IdentityService } from "./identity.service.js";
import { IdentityController } from "./identity.controller.js";

@Module({
  controllers: [IdentityController],
  providers: [IdentityService],
  exports: [IdentityService],
})
export class IdentityModule {}
