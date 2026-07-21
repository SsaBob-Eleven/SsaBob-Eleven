import "dotenv/config";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  Prisma,
  PrismaClient,
  type FlowMode,
  type GenerationTrigger,
  type Location,
  type RoundStatus,
} from "@prisma/client";

type SqliteValue = string | number | bigint | null;
type ParticipantRow = {
  id: string;
  name: string;
  normalizedName: string;
  active: number;
  createdAt: number;
  updatedAt: number;
};
type RoundRow = {
  id: string;
  weekKey: string;
  flowMode: string;
  status: string;
  opensAt: number;
  closesAt: number;
  locationClosesAt: number | null;
  groupSizePolicy: string;
  targetGroupMinSize: number;
  targetGroupMaxSize: number;
  maxParticipants: number;
  historyWeeks: number;
  randomAttempts: number;
  randomSeed: string | null;
  generationStartedAt: number | null;
  generatedAt: number | null;
  completedAt: number | null;
  createdAt: number;
  updatedAt: number;
};
type RegistrationRow = {
  id: string;
  roundId: string;
  participantId: string;
  displayName: string;
  preferredLocation: string | null;
  editTokenHash: string;
  createdAt: number;
  updatedAt: number;
};
type TeamRow = {
  id: string;
  roundId: string;
  sequence: number;
  location: string | null;
  sizeAdjusted: number;
  locationSelectedByRegistrationId: string | null;
  locationSelectedAt: number | null;
  createdAt: number;
  updatedAt: number;
};
type TeamMemberRow = { teamId: string; registrationId: string; createdAt: number };
type GenerationAuditRow = {
  id: string;
  roundId: string;
  algorithmVersion: string;
  trigger: string;
  triggerReason: string | null;
  candidateCount: number;
  bestScore: number;
  repeatedPairCount: number;
  sizeAdjustedTeamCount: number;
  durationMs: number;
  createdAt: number;
};

const sourcePath = process.env.SQLITE_SOURCE_PATH?.trim();
if (!sourcePath) throw new Error("SQLITE_SOURCE_PATH must point to an existing SQLite database file");

const absoluteSourcePath = resolve(sourcePath);
if (!existsSync(absoluteSourcePath)) throw new Error(`SQLite source file not found: ${absoluteSourcePath}`);

const sqlite = new DatabaseSync(absoluteSourcePath, { readOnly: true });
const prisma = new PrismaClient();

function readRows<T>(table: string): T[] {
  return sqlite.prepare(`SELECT * FROM "${table}"`).all() as unknown as T[];
}

function toDate(value: SqliteValue): Date {
  if (value === null) throw new Error("A required SQLite timestamp is null");
  return new Date(Number(value));
}

function toNullableDate(value: SqliteValue): Date | null {
  return value === null ? null : toDate(value);
}

async function main() {
  const participants = readRows<ParticipantRow>("Participant");
  const rounds = readRows<RoundRow>("Round");
  const registrations = readRows<RegistrationRow>("Registration");
  const teams = readRows<TeamRow>("Team");
  const teamMembers = readRows<TeamMemberRow>("TeamMember");
  const generationAudits = readRows<GenerationAuditRow>("GenerationAudit");
  const counts = {
    participants: participants.length,
    rounds: rounds.length,
    registrations: registrations.length,
    teams: teams.length,
    teamMembers: teamMembers.length,
    generationAudits: generationAudits.length,
  };

  if (process.argv.includes("--dry-run")) {
    console.log(JSON.stringify({ event: "sqlite.import.dry-run", source: absoluteSourcePath, counts }));
    return;
  }

  const targetRowCount = await Promise.all([
    prisma.participant.count(),
    prisma.round.count(),
    prisma.registration.count(),
    prisma.team.count(),
    prisma.teamMember.count(),
    prisma.generationAudit.count(),
  ]);
  if (targetRowCount.some((count) => count > 0)) {
    throw new Error("The PostgreSQL target is not empty. SQLite import was cancelled to prevent duplicate data.");
  }

  await prisma.$transaction(async (transaction) => {
    await transaction.participant.createMany({
      data: participants.map((row): Prisma.ParticipantCreateManyInput => ({
        id: row.id,
        name: row.name,
        normalizedName: row.normalizedName,
        active: Boolean(row.active),
        createdAt: toDate(row.createdAt),
        updatedAt: toDate(row.updatedAt),
      })),
    });
    await transaction.round.createMany({
      data: rounds.map((row): Prisma.RoundCreateManyInput => ({
        ...row,
        flowMode: row.flowMode as FlowMode,
        status: row.status as RoundStatus,
        opensAt: toDate(row.opensAt),
        closesAt: toDate(row.closesAt),
        locationClosesAt: toNullableDate(row.locationClosesAt),
        generationStartedAt: toNullableDate(row.generationStartedAt),
        generatedAt: toNullableDate(row.generatedAt),
        completedAt: toNullableDate(row.completedAt),
        createdAt: toDate(row.createdAt),
        updatedAt: toDate(row.updatedAt),
      })),
    });
    await transaction.registration.createMany({
      data: registrations.map((row): Prisma.RegistrationCreateManyInput => ({
        ...row,
        preferredLocation: row.preferredLocation as Location | null,
        createdAt: toDate(row.createdAt),
        updatedAt: toDate(row.updatedAt),
      })),
    });
    await transaction.team.createMany({
      data: teams.map((row): Prisma.TeamCreateManyInput => ({
        ...row,
        location: row.location as Location | null,
        sizeAdjusted: Boolean(row.sizeAdjusted),
        locationSelectedAt: toNullableDate(row.locationSelectedAt),
        createdAt: toDate(row.createdAt),
        updatedAt: toDate(row.updatedAt),
      })),
    });
    await transaction.teamMember.createMany({
      data: teamMembers.map((row): Prisma.TeamMemberCreateManyInput => ({
        ...row,
        createdAt: toDate(row.createdAt),
      })),
    });
    await transaction.generationAudit.createMany({
      data: generationAudits.map((row): Prisma.GenerationAuditCreateManyInput => ({
        ...row,
        trigger: row.trigger as GenerationTrigger,
        createdAt: toDate(row.createdAt),
      })),
    });
  });

  console.log(
    JSON.stringify({
      event: "sqlite.import.completed",
      source: absoluteSourcePath,
      counts,
    }),
  );
}

main()
  .finally(async () => {
    sqlite.close();
    await prisma.$disconnect();
  });
