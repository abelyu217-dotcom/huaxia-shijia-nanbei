/**
 * MatchStreamController——比赛实时观战 SSE 端点
 *
 * - GET /api/matches/:id/stream  订阅比赛 PBP 实时事件流（text/event-stream）
 *
 * 前端使用 EventSource 连接，接收格式：
 *   data: {"type":"pbp","event":{...}}
 *   data: {"type":"final","data":{...}}
 */

import { Controller, Param, Query, Sse } from "@nestjs/common";
import { Observable } from "rxjs";
import { MatchStreamService } from "./match-stream.service.js";

@Controller("api/matches")
export class MatchStreamController {
  constructor(private readonly streamService: MatchStreamService) {}

  /**
   * 订阅比赛 PBP 实时事件流
   * @param id 比赛 ID
   * @param speed 可选流速倍率（比赛秒/真实秒），默认 4；设为 1 即 1:1 真实流速
   */
  @Sse(":id/stream")
  async stream(
    @Param("id") id: string,
    @Query("speed") speed?: string,
  ): Promise<Observable<MessageEvent>> {
    const speedNum = speed != null ? Number(speed) : undefined;
    return this.streamService.streamMatch(id, speedNum);
  }
}
