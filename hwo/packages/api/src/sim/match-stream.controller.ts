/**
 * MatchStreamController——比赛实时观战 SSE 端点
 *
 * - GET /api/matches/:id/stream  订阅比赛 PBP 实时事件流（text/event-stream）
 *
 * 前端使用 EventSource 连接，接收格式：
 *   data: {"type":"pbp","event":{...}}
 *   data: {"type":"final","data":{...}}
 */

import { Controller, Param, Sse } from "@nestjs/common";
import { Observable } from "rxjs";
import { MatchStreamService } from "./match-stream.service.js";

@Controller("api/matches")
export class MatchStreamController {
  constructor(private readonly streamService: MatchStreamService) {}

  @Sse(":id/stream")
  async stream(@Param("id") id: string): Promise<Observable<MessageEvent>> {
    return this.streamService.streamMatch(id);
  }
}
