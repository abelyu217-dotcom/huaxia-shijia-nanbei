/**
 * contract 模块——签约与合同
 *
 * 提供签约、续约、裁员、自由市场、合同推进。
 * 参见：开发计划.html §4.5 签约与合同
 */

import { Module } from "@nestjs/common";
import { ContractController } from "./contract.controller.js";
import { ContractService } from "./contract.service.js";

@Module({
  controllers: [ContractController],
  providers: [ContractService],
  exports: [ContractService],
})
export class ContractModule {}
