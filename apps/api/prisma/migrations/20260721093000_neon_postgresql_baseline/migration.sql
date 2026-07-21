-- CreateEnum
CREATE TYPE "FlowMode" AS ENUM ('LOCATION_FIRST', 'TEAM_FIRST');

-- CreateEnum
CREATE TYPE "RoundStatus" AS ENUM ('SCHEDULED', 'OPEN', 'GENERATING', 'PAUSED', 'LOCATION_SELECTION', 'COMPLETED');

-- CreateEnum
CREATE TYPE "Location" AS ENUM ('FLOOR_10', 'FLOOR_20', 'OUTSIDE');

-- CreateEnum
CREATE TYPE "GenerationTrigger" AS ENUM ('SCHEDULER', 'ADMIN', 'RECOVERY');

-- CreateTable
CREATE TABLE "Participant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Participant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Round" (
    "id" TEXT NOT NULL,
    "weekKey" TEXT NOT NULL,
    "flowMode" "FlowMode" NOT NULL,
    "status" "RoundStatus" NOT NULL,
    "opensAt" TIMESTAMP(3) NOT NULL,
    "closesAt" TIMESTAMP(3) NOT NULL,
    "locationClosesAt" TIMESTAMP(3),
    "groupSizePolicy" TEXT NOT NULL DEFAULT 'ADAPTIVE',
    "targetGroupMinSize" INTEGER NOT NULL DEFAULT 4,
    "targetGroupMaxSize" INTEGER NOT NULL DEFAULT 5,
    "maxParticipants" INTEGER NOT NULL DEFAULT 26,
    "historyWeeks" INTEGER NOT NULL DEFAULT 8,
    "randomAttempts" INTEGER NOT NULL DEFAULT 500,
    "randomSeed" TEXT,
    "generationStartedAt" TIMESTAMP(3),
    "generatedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Round_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Registration" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "preferredLocation" "Location",
    "editTokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Registration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "location" "Location",
    "sizeAdjusted" BOOLEAN NOT NULL DEFAULT false,
    "locationSelectedByRegistrationId" TEXT,
    "locationSelectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamMember" (
    "teamId" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("teamId","registrationId")
);

-- CreateTable
CREATE TABLE "GenerationAudit" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "algorithmVersion" TEXT NOT NULL,
    "trigger" "GenerationTrigger" NOT NULL,
    "triggerReason" TEXT,
    "candidateCount" INTEGER NOT NULL,
    "bestScore" DOUBLE PRECISION NOT NULL,
    "repeatedPairCount" INTEGER NOT NULL,
    "sizeAdjustedTeamCount" INTEGER NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GenerationAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Participant_normalizedName_key" ON "Participant"("normalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "Round_weekKey_key" ON "Round"("weekKey");

-- CreateIndex
CREATE INDEX "Round_status_closesAt_idx" ON "Round"("status", "closesAt");

-- CreateIndex
CREATE UNIQUE INDEX "Registration_editTokenHash_key" ON "Registration"("editTokenHash");

-- CreateIndex
CREATE INDEX "Registration_roundId_idx" ON "Registration"("roundId");

-- CreateIndex
CREATE UNIQUE INDEX "Registration_roundId_participantId_key" ON "Registration"("roundId", "participantId");

-- CreateIndex
CREATE INDEX "Team_roundId_idx" ON "Team"("roundId");

-- CreateIndex
CREATE UNIQUE INDEX "Team_roundId_sequence_key" ON "Team"("roundId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "TeamMember_registrationId_key" ON "TeamMember"("registrationId");

-- CreateIndex
CREATE UNIQUE INDEX "GenerationAudit_roundId_key" ON "GenerationAudit"("roundId");

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_locationSelectedByRegistrationId_fkey" FOREIGN KEY ("locationSelectedByRegistrationId") REFERENCES "Registration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationAudit" ADD CONSTRAINT "GenerationAudit_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;
