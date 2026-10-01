/**
 * 应用根模块
 */

import { Module } from "@nestjs/common";
import { SimModule } from "./sim/sim.module.js";
import { TeamModule } from "./team/team.module.js";
import { TacticModule } from "./tactic/tactic.module.js";
import { PrismaModule } from "./prisma/prisma.module.js";
import { SeasonModule } from "./season/season.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { AiManagerModule } from "./ai/ai-manager.module.js";
import { WorldModule } from "./world/world.module.js";
import { TradeModule } from "./trade/trade.module.js";
import { CareerModule } from "./career/career.module.js";
import { AcademyModule } from "./academy/academy.module.js";
import { DraftModule } from "./draft/draft.module.js";
import { ContractModule } from "./contract/contract.module.js";
import { WalletModule } from "./wallet/wallet.module.js";
import { VipModule } from "./vip/vip.module.js";
import { CosmeticModule } from "./cosmetic/cosmetic.module.js";
import { PaymentModule } from "./payment/payment.module.js";
import { PushModule } from "./push/push.module.js";
import { SimconfigModule } from "./simconfig/simconfig.module.js";
import { AuditModule } from "./audit/audit.module.js";
import { AnalyticsModule } from "./analytics/analytics.module.js";
import { ScoutModule } from "./scout/scout.module.js";
import { FacilityModule } from "./facility/facility.module.js";
import { IdentityModule } from "./identity/identity.module.js";
import { DynastyModule } from "./dynasty/dynasty.module.js";
import { RelationshipModule } from "./relationship/relationship.module.js";

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    SimModule,
    TeamModule,
    TacticModule,
    SeasonModule,
    AiManagerModule,
    WorldModule,
    TradeModule,
    CareerModule,
    AcademyModule,
    DraftModule,
    ContractModule,
    WalletModule,
    VipModule,
    CosmeticModule,
    PaymentModule,
    PushModule,
    SimconfigModule,
    AuditModule,
    AnalyticsModule,
    ScoutModule,
    FacilityModule,
    IdentityModule,
    DynastyModule,
    RelationshipModule,
  ],
})
export class AppModule {}
