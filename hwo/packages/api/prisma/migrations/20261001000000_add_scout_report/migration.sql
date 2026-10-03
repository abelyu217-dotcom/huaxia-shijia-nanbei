-- The Fog 迷雾系统：球探报告表
-- 参见：球探系统设计 §3-§6
-- 表：ScoutReport（球队对球员的球探报告，记录 fog 收窄状态）

CREATE TABLE "ScoutReport" (
    "id"            TEXT        NOT NULL,
    "teamId"        TEXT        NOT NULL,
    "playerId"      TEXT        NOT NULL,
    "abilityFog"    JSONB       NOT NULL DEFAULT '{}',
    "peakFog"       JSONB,
    "traitHints"    JSONB       NOT NULL DEFAULT '[]',
    "lastScoutedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scoutCount"    INTEGER     NOT NULL DEFAULT 0,
    "scoutLevel"    INTEGER     NOT NULL DEFAULT 3,
    "totalCost"     INTEGER     NOT NULL DEFAULT 0,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScoutReport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ScoutReport_teamId_playerId_key" ON "ScoutReport"("teamId", "playerId");
CREATE INDEX "ScoutReport_teamId_idx" ON "ScoutReport"("teamId");
CREATE INDEX "ScoutReport_playerId_idx" ON "ScoutReport"("playerId");
