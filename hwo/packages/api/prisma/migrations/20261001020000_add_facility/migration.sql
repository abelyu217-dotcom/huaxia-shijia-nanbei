-- P2-3: 球馆设施系统
-- 训练馆等级影响训练成长倍率；主场馆等级影响比赛日营收与主场优势
CREATE TABLE "Facility" (
    "id"             TEXT     NOT NULL,
    "teamId"         TEXT     NOT NULL,
    "trainingHallLv" INTEGER  NOT NULL DEFAULT 1,
    "arenaLv"        INTEGER  NOT NULL DEFAULT 1,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Facility_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Facility_teamId_key" ON "Facility"("teamId");

ALTER TABLE "Facility"
    ADD CONSTRAINT "Facility_teamId_fkey"
    FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE;
