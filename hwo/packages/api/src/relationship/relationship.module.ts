import { Module } from "@nestjs/common";
import { RelationshipService } from "./relationship.service.js";
import { RelationshipController } from "./relationship.controller.js";

@Module({
  controllers: [RelationshipController],
  providers: [RelationshipService],
  exports: [RelationshipService],
})
export class RelationshipModule {}
