-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "phase" TEXT NOT NULL DEFAULT 'regular',
ADD COLUMN     "playoffSeriesId" TEXT;

-- CreateTable
CREATE TABLE "PlayoffSeries" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "slot" INTEGER NOT NULL,
    "bestOf" INTEGER NOT NULL DEFAULT 5,
    "teamAId" TEXT,
    "teamBId" TEXT,
    "seedA" INTEGER,
    "seedB" INTEGER,
    "winsA" INTEGER NOT NULL DEFAULT 0,
    "winsB" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "winnerId" TEXT,
    "nextRound" INTEGER,
    "nextSlot" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayoffSeries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamCash" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 5000000,
    "sponsorTier" TEXT NOT NULL DEFAULT 'C',
    "ticketPrice" INTEGER NOT NULL DEFAULT 50,
    "debt" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamCash_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashLedger" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "day" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "subType" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "refId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sponsor" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "basePerSeason" INTEGER NOT NULL,
    "bonusPerWin" INTEGER NOT NULL,
    "titleBonus" INTEGER NOT NULL,
    "satisfaction" INTEGER NOT NULL DEFAULT 60,
    "expectedWinRate" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "expectedPlayoff" BOOLEAN NOT NULL DEFAULT true,
    "contractSeasons" INTEGER NOT NULL DEFAULT 2,
    "startSeason" INTEGER NOT NULL,
    "endSeason" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sponsor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoardDirector" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "loyalty" INTEGER NOT NULL DEFAULT 60,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BoardDirector_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeasonGoal" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "expectedWinRate" DOUBLE PRECISION NOT NULL,
    "expectedPlayoff" BOOLEAN NOT NULL,
    "expectedChampionship" BOOLEAN NOT NULL,
    "expectedRank" INTEGER,
    "basisNote" TEXT NOT NULL,
    "achievedNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeasonGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoardProposal" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "day" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "votes" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BoardProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeagueAnnouncement" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT,
    "worldId" TEXT,
    "seasonId" TEXT NOT NULL,
    "day" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "refId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeagueAnnouncement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamMessage" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "day" INTEGER NOT NULL,
    "channel" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "refId" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaNews" (
    "id" TEXT NOT NULL,
    "worldId" TEXT,
    "seasonId" TEXT NOT NULL,
    "day" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "refId" TEXT,
    "tags" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaNews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FanCenter" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "fanCount" INTEGER NOT NULL DEFAULT 1000,
    "morale" INTEGER NOT NULL DEFAULT 60,
    "loyalty" INTEGER NOT NULL DEFAULT 60,
    "seasonTicketsSold" INTEGER NOT NULL DEFAULT 0,
    "merchandiseRevenue" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FanCenter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FanEvent" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "day" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "impact" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FanEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingPlan" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "focusByPosition" JSONB NOT NULL DEFAULT '{}',
    "teamFocus" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingLog" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "day" INTEGER NOT NULL,
    "playerId" TEXT NOT NULL,
    "abilityKey" TEXT NOT NULL,
    "beforeVal" INTEGER NOT NULL,
    "afterVal" INTEGER NOT NULL,
    "gain" DOUBLE PRECISION NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainingLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoutMission" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "scoutId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetRef" TEXT,
    "region" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "report" JSONB,
    "accuracy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ScoutMission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransferMarketPhase" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "phase" TEXT NOT NULL DEFAULT 'closed',
    "freeAgencyEndDay" INTEGER,
    "restrictedStartDay" INTEGER,
    "restrictedEndDay" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransferMarketPhase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PendingSigning" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "day" INTEGER NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetRef" TEXT NOT NULL,
    "targetName" TEXT NOT NULL,
    "cost" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingSigning_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamNews" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "day" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "refId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamNews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlayoffSeries_seasonId_leagueId_idx" ON "PlayoffSeries"("seasonId", "leagueId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayoffSeries_seasonId_leagueId_round_slot_key" ON "PlayoffSeries"("seasonId", "leagueId", "round", "slot");

-- CreateIndex
CREATE UNIQUE INDEX "TeamCash_teamId_key" ON "TeamCash"("teamId");

-- CreateIndex
CREATE INDEX "CashLedger_teamId_seasonId_day_idx" ON "CashLedger"("teamId", "seasonId", "day");

-- CreateIndex
CREATE INDEX "CashLedger_teamId_category_idx" ON "CashLedger"("teamId", "category");

-- CreateIndex
CREATE INDEX "Sponsor_teamId_idx" ON "Sponsor"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "SeasonGoal_teamId_seasonId_key" ON "SeasonGoal"("teamId", "seasonId");

-- CreateIndex
CREATE INDEX "BoardProposal_teamId_status_idx" ON "BoardProposal"("teamId", "status");

-- CreateIndex
CREATE INDEX "LeagueAnnouncement_seasonId_day_idx" ON "LeagueAnnouncement"("seasonId", "day");

-- CreateIndex
CREATE INDEX "TeamMessage_teamId_read_idx" ON "TeamMessage"("teamId", "read");

-- CreateIndex
CREATE INDEX "MediaNews_seasonId_day_idx" ON "MediaNews"("seasonId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "FanCenter_teamId_key" ON "FanCenter"("teamId");

-- CreateIndex
CREATE INDEX "FanEvent_teamId_seasonId_day_idx" ON "FanEvent"("teamId", "seasonId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingPlan_teamId_key" ON "TrainingPlan"("teamId");

-- CreateIndex
CREATE INDEX "TrainingLog_teamId_seasonId_day_idx" ON "TrainingLog"("teamId", "seasonId", "day");

-- CreateIndex
CREATE INDEX "ScoutMission_teamId_status_idx" ON "ScoutMission"("teamId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TransferMarketPhase_seasonId_key" ON "TransferMarketPhase"("seasonId");

-- CreateIndex
CREATE INDEX "PendingSigning_teamId_status_idx" ON "PendingSigning"("teamId", "status");

-- CreateIndex
CREATE INDEX "PendingSigning_seasonId_status_idx" ON "PendingSigning"("seasonId", "status");

-- CreateIndex
CREATE INDEX "TeamNews_teamId_seasonId_day_idx" ON "TeamNews"("teamId", "seasonId", "day");

-- CreateIndex
CREATE INDEX "Match_phase_idx" ON "Match"("phase");

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_playoffSeriesId_fkey" FOREIGN KEY ("playoffSeriesId") REFERENCES "PlayoffSeries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamCash" ADD CONSTRAINT "TeamCash_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashLedger" ADD CONSTRAINT "CashLedger_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sponsor" ADD CONSTRAINT "Sponsor_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardDirector" ADD CONSTRAINT "BoardDirector_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeasonGoal" ADD CONSTRAINT "SeasonGoal_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardProposal" ADD CONSTRAINT "BoardProposal_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueAnnouncement" ADD CONSTRAINT "LeagueAnnouncement_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMessage" ADD CONSTRAINT "TeamMessage_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaNews" ADD CONSTRAINT "MediaNews_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FanCenter" ADD CONSTRAINT "FanCenter_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FanEvent" ADD CONSTRAINT "FanEvent_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingPlan" ADD CONSTRAINT "TrainingPlan_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingLog" ADD CONSTRAINT "TrainingLog_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferMarketPhase" ADD CONSTRAINT "TransferMarketPhase_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingSigning" ADD CONSTRAINT "PendingSigning_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamNews" ADD CONSTRAINT "TeamNews_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
