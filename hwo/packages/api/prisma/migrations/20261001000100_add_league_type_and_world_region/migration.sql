-- 两级联赛系统：国内联赛 + 国际联赛
-- 参照 basketpulse：每国(world)有国内联赛(L1/L2)，另有跨国家的国际联赛

-- World 增加 region 字段（地区/国家标识，用于国际联赛分组）
ALTER TABLE "World" ADD COLUMN "region" TEXT NOT NULL DEFAULT 'CN';

-- League 增加 type 字段（domestic=国内联赛, international=国际联赛）
ALTER TABLE "League" ADD COLUMN "type" TEXT NOT NULL DEFAULT 'domestic';

-- 联赛-球队多对多关联表（国际联赛参赛资格）
CREATE TABLE "LeagueTeam" (
    "leagueId" TEXT NOT NULL,
    "teamId"   TEXT NOT NULL,
    CONSTRAINT "LeagueTeam_pkey" PRIMARY KEY ("leagueId", "teamId")
);

CREATE INDEX "LeagueTeam_teamId_idx" ON "LeagueTeam"("teamId");

ALTER TABLE "LeagueTeam"
    ADD CONSTRAINT "LeagueTeam_leagueId_fkey"
    FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE;

ALTER TABLE "LeagueTeam"
    ADD CONSTRAINT "LeagueTeam_teamId_fkey"
    FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE;
