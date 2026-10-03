-- AlterTable
ALTER TABLE "League" ADD COLUMN     "worldId" TEXT;

-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "worldId" TEXT;

-- CreateTable
CREATE TABLE "World" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "World_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeOffer" (
    "id" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "offerorTeamId" TEXT NOT NULL,
    "offereeTeamId" TEXT NOT NULL,
    "offerorPlayers" JSONB NOT NULL,
    "offereePlayers" JSONB NOT NULL,
    "offerorCash" INTEGER NOT NULL DEFAULT 0,
    "offereeCash" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "round" INTEGER NOT NULL DEFAULT 1,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TradeOffer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TradeOffer_worldId_status_idx" ON "TradeOffer"("worldId", "status");

-- CreateIndex
CREATE INDEX "TradeOffer_offerorTeamId_status_idx" ON "TradeOffer"("offerorTeamId", "status");

-- CreateIndex
CREATE INDEX "TradeOffer_offereeTeamId_status_idx" ON "TradeOffer"("offereeTeamId", "status");

-- AddForeignKey
ALTER TABLE "World" ADD CONSTRAINT "World_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "League" ADD CONSTRAINT "League_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeOffer" ADD CONSTRAINT "TradeOffer_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeOffer" ADD CONSTRAINT "TradeOffer_offerorTeamId_fkey" FOREIGN KEY ("offerorTeamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeOffer" ADD CONSTRAINT "TradeOffer_offereeTeamId_fkey" FOREIGN KEY ("offereeTeamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
