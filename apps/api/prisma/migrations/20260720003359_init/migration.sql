-- CreateTable
CREATE TABLE "Participant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Round" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "weekKey" TEXT NOT NULL,
    "flowMode" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "opensAt" DATETIME NOT NULL,
    "closesAt" DATETIME NOT NULL,
    "locationClosesAt" DATETIME,
    "groupSizePolicy" TEXT NOT NULL DEFAULT 'ADAPTIVE',
    "targetGroupMinSize" INTEGER NOT NULL DEFAULT 4,
    "targetGroupMaxSize" INTEGER NOT NULL DEFAULT 5,
    "maxParticipants" INTEGER NOT NULL DEFAULT 26,
    "historyWeeks" INTEGER NOT NULL DEFAULT 8,
    "randomAttempts" INTEGER NOT NULL DEFAULT 500,
    "randomSeed" TEXT,
    "generationStartedAt" DATETIME,
    "generatedAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Registration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roundId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "preferredLocation" TEXT,
    "editTokenHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Registration_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Registration_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roundId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "location" TEXT,
    "sizeAdjusted" BOOLEAN NOT NULL DEFAULT false,
    "locationSelectedByRegistrationId" TEXT,
    "locationSelectedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Team_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Team_locationSelectedByRegistrationId_fkey" FOREIGN KEY ("locationSelectedByRegistrationId") REFERENCES "Registration" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TeamMember" (
    "teamId" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("teamId", "registrationId"),
    CONSTRAINT "TeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TeamMember_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GenerationAudit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roundId" TEXT NOT NULL,
    "algorithmVersion" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "triggerReason" TEXT,
    "candidateCount" INTEGER NOT NULL,
    "bestScore" REAL NOT NULL,
    "repeatedPairCount" INTEGER NOT NULL,
    "sizeAdjustedTeamCount" INTEGER NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GenerationAudit_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round" ("id") ON DELETE CASCADE ON UPDATE CASCADE
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
