/**
 * sim 控制器——GET /api/sim/demo
 *
 * 调用 @hwo/shared 的 simulate() 用 mock 对阵返回 SimOutput JSON，
 * 证明前后端类型共享 + sim 引擎在服务端可运行。
 */

import { Controller, Get } from "@nestjs/common";
import { simulate, DEFAULT_CONFIG, type SimOutput } from "@hwo/shared";
import { makeMockMatchup } from "./mock.js";

@Controller("api/sim")
export class SimController {
  @Get("demo")
  demo(): SimOutput {
    return simulate({
      matchup: makeMockMatchup(),
      seed: 12345,
      config: DEFAULT_CONFIG,
    });
  }
}
