-- P3-1: 三身份系统
-- Avatar: 球员化身，玩家自创球员进入本队
CREATE TABLE "Avatar" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'home_team',
    "controlMode" TEXT NOT NULL DEFAULT 'owner_controlled',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Avatar_pkey" PRIMARY KEY ("id")
);

-- Professional: 职业人身份，11 职选一
CREATE TABLE "Professional" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "line" TEXT NOT NULL,
    "job" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "proReputation" INTEGER NOT NULL DEFAULT 0,
    "experience" INTEGER NOT NULL DEFAULT 0,
    "skillPoints" JSONB NOT NULL DEFAULT '{}',
    "employmentStatus" TEXT NOT NULL DEFAULT 'unemployed',
    "employerTeamId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Professional_pkey" PRIMARY KEY ("id")
);

-- P3-3: 王朝与传承系统
CREATE TABLE "DynastyRecord" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "startSeason" INTEGER NOT NULL,
    "endSeason" INTEGER,
    "titles" INTEGER NOT NULL DEFAULT 0,
    "runnerUps" INTEGER NOT NULL DEFAULT 0,
    "signatureTags" JSONB NOT NULL DEFAULT '[]',
    "legacyScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DynastyRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HallOfFameEntry" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "legacyScore" DOUBLE PRECISION NOT NULL,
    "titles" INTEGER NOT NULL,
    "inductedSeason" INTEGER NOT NULL,
    "narrative" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HallOfFameEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EraTag" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "narrative" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EraTag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Legacy" (
    "id" TEXT NOT NULL,
    "fromPlayerId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "toRefId" TEXT NOT NULL,
    "effects" JSONB NOT NULL DEFAULT '{}',
    "season" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Legacy_pkey" PRIMARY KEY ("id")
);

-- P3-4: 球员家庭与人际关系系统
CREATE TABLE "PlayerRelationship" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "bond" INTEGER NOT NULL DEFAULT 50,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerRelationship_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlayerFamily" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "background" TEXT NOT NULL DEFAULT 'normal',
    "members" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerFamily_pkey" PRIMARY KEY ("id")
);

-- ── Indexes ──
CREATE UNIQUE INDEX "Avatar_userId_key" ON "Avatar"("userId");
CREATE UNIQUE INDEX "Avatar_playerId_key" ON "Avatar"("playerId");
CREATE INDEX "Avatar_userId_idx" ON "Avatar"("userId");

CREATE UNIQUE INDEX "Professional_userId_key" ON "Professional"("userId");
CREATE INDEX "Professional_userId_idx" ON "Professional"("userId");
CREATE INDEX "Professional_job_idx" ON "Professional"("job");

CREATE INDEX "DynastyRecord_teamId_idx" ON "DynastyRecord"("teamId");
CREATE INDEX "DynastyRecord_tier_idx" ON "DynastyRecord"("tier");

CREATE UNIQUE INDEX "HallOfFameEntry_playerId_key" ON "HallOfFameEntry"("playerId");
CREATE INDEX "HallOfFameEntry_tier_idx" ON "HallOfFameEntry"("tier");
CREATE INDEX "HallOfFameEntry_legacyScore_idx" ON "HallOfFameEntry"("legacyScore");

CREATE INDEX "EraTag_type_refId_idx" ON "EraTag"("type", "refId");
CREATE INDEX "EraTag_season_idx" ON "EraTag"("season");

CREATE INDEX "Legacy_fromPlayerId_idx" ON "Legacy"("fromPlayerId");
CREATE INDEX "Legacy_toRefId_idx" ON "Legacy"("toRefId");

CREATE INDEX "PlayerRelationship_sourceId_idx" ON "PlayerRelationship"("sourceId");
CREATE INDEX "PlayerRelationship_targetId_idx" ON "PlayerRelationship"("targetId");
CREATE UNIQUE INDEX "PlayerRelationship_sourceId_targetId_type_key" ON "PlayerRelationship"("sourceId", "targetId", "type");

CREATE UNIQUE INDEX "PlayerFamily_playerId_key" ON "PlayerFamily"("playerId");

-- ── Foreign Keys ──
ALTER TABLE "Avatar" ADD CONSTRAINT "Avatar_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Avatar" ADD CONSTRAINT "Avatar_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Professional" ADD CONSTRAINT "Professional_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DynastyRecord" ADD CONSTRAINT "DynastyRecord_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "HallOfFameEntry" ADD CONSTRAINT "HallOfFameEntry_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Legacy" ADD CONSTRAINT "Legacy_fromPlayerId_fkey" FOREIGN KEY ("fromPlayerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PlayerRelationship" ADD CONSTRAINT "PlayerRelationship_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlayerRelationship" ADD CONSTRAINT "PlayerRelationship_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PlayerFamily" ADD CONSTRAINT "PlayerFamily_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
