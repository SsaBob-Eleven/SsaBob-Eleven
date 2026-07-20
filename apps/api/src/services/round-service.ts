import { randomBytes } from "node:crypto";
import type { GenerationTrigger, Location } from "@prisma/client";
import { env } from "../config/env.js";
import { prisma } from "../db.js";
import { AppError } from "../errors.js";
import { publishRoundEvent } from "../realtime/publishers.js";
import { addMinutes, getIsoWeekKey, getWeeklySchedule } from "../utils/dates.js";
import { generateTeamDrafts, pairKey, type PairPenaltyMap } from "./team-generator.js";

export async function ensureCurrentRound(now = new Date()) {
  const weekKey = getIsoWeekKey(now);
  const existing = await prisma.round.findUnique({ where: { weekKey } });
  if (existing) return existing;

  const schedule = getWeeklySchedule(
    now,
    env.VOTE_OPEN_DAY,
    env.VOTE_OPEN_TIME,
    env.EVENT_WEEKDAY,
    env.VOTE_CLOSE_TIME,
    env.TEAM_LOCATION_CLOSE_TIME,
  );
  const status = now < schedule.opensAt ? "SCHEDULED" : "OPEN";

  return prisma.round.create({
    data: {
      weekKey,
      flowMode: env.FLOW_MODE,
      status,
      opensAt: schedule.opensAt,
      closesAt: schedule.closesAt,
      locationClosesAt: env.FLOW_MODE === "TEAM_FIRST" ? schedule.locationClosesAt : null,
      groupSizePolicy: "ADAPTIVE",
      targetGroupMinSize: env.TARGET_GROUP_MIN_SIZE,
      targetGroupMaxSize: env.TARGET_GROUP_MAX_SIZE,
      maxParticipants: env.MAX_PARTICIPANTS_PER_ROUND,
      historyWeeks: env.HISTORY_WEEKS,
      randomAttempts: env.RANDOM_ATTEMPTS,
    },
  });
}

export function registrationRules(round: { status: string; flowMode: string }) {
  return {
    registrationOpen: round.status === "OPEN",
    preferredLocationRequired: round.flowMode === "LOCATION_FIRST",
    preferredLocationAllowed: round.flowMode === "LOCATION_FIRST",
    resultAvailable: round.status === "LOCATION_SELECTION" || round.status === "COMPLETED",
    teamLocationSelectable: round.flowMode === "TEAM_FIRST" && round.status === "LOCATION_SELECTION",
  };
}

export async function openRoundNow(roundId: string, now = new Date()) {
  const round = await prisma.round.findUnique({ where: { id: roundId } });
  if (!round) throw new AppError(404, "ROUND_NOT_FOUND", "회차를 찾을 수 없습니다.");
  if (round.status !== "SCHEDULED") {
    throw new AppError(409, "ROUND_NOT_OPEN", "예약 상태인 회차만 즉시 열 수 있습니다.");
  }

  const opened = await prisma.round.updateMany({
    where: { id: roundId, status: "SCHEDULED" },
    data: { status: "OPEN", opensAt: now },
  });
  if (opened.count !== 1) {
    throw new AppError(409, "ROUND_NOT_OPEN", "다른 요청에서 회차 상태가 변경되었습니다.");
  }

  const updated = await prisma.round.findUniqueOrThrow({ where: { id: roundId } });
  publishRoundEvent(roundId, "round.updated", { status: updated.status });
  return updated;
}

export async function reopenRoundVoting(roundId: string, now = new Date()) {
  const round = await prisma.round.findUnique({ where: { id: roundId } });
  if (!round) throw new AppError(404, "ROUND_NOT_FOUND", "회차를 찾을 수 없습니다.");
  if (round.status !== "LOCATION_SELECTION" && round.status !== "COMPLETED") {
    throw new AppError(409, "ROUND_NOT_OPEN", "조 편성이 완료된 회차만 투표를 다시 열 수 있습니다.");
  }

  const closesAt = addMinutes(now, 30);
  const locationClosesAt = round.flowMode === "TEAM_FIRST" ? addMinutes(now, 40) : null;
  const [, , updated] = await prisma.$transaction([
    prisma.team.deleteMany({ where: { roundId } }),
    prisma.generationAudit.deleteMany({ where: { roundId } }),
    prisma.round.update({
      where: { id: roundId },
      data: {
        status: "OPEN",
        opensAt: now,
        closesAt,
        locationClosesAt,
        randomSeed: null,
        generationStartedAt: null,
        generatedAt: null,
        completedAt: null,
      },
    }),
  ]);

  publishRoundEvent(roundId, "round.updated", { status: updated.status });
  publishRoundEvent(roundId, "results.updated", { available: false });
  return updated;
}

async function buildPairPenalties(roundId: string, historyWeeks: number): Promise<PairPenaltyMap> {
  if (historyWeeks === 0) return new Map();
  const current = await prisma.round.findUniqueOrThrow({ where: { id: roundId } });
  const cutoff = new Date(current.closesAt.getTime() - historyWeeks * 7 * 24 * 60 * 60 * 1000);
  const previousTeams = await prisma.team.findMany({
    where: {
      roundId: { not: roundId },
      round: { closesAt: { gte: cutoff, lt: current.closesAt }, status: "COMPLETED" },
    },
    include: {
      round: true,
      members: { include: { registration: true } },
    },
  });

  const penalties: PairPenaltyMap = new Map();
  for (const team of previousTeams) {
    const weeksAgo = Math.max(1, Math.round((current.closesAt.getTime() - team.round.closesAt.getTime()) / (7 * 24 * 60 * 60 * 1000)));
    const penalty = 10 + Math.max(0, historyWeeks - weeksAgo) * 2;
    for (let left = 0; left < team.members.length; left += 1) {
      for (let right = left + 1; right < team.members.length; right += 1) {
        const key = pairKey(team.members[left]!.registration.participantId, team.members[right]!.registration.participantId);
        penalties.set(key, (penalties.get(key) ?? 0) + penalty);
      }
    }
  }
  return penalties;
}

export async function generateRound(
  roundId: string,
  trigger: GenerationTrigger,
  triggerReason: string | null = null,
) {
  const startedAt = new Date();
  const claimed = await prisma.round.updateMany({
    where: { id: roundId, status: "OPEN" },
    data: { status: "GENERATING", generationStartedAt: startedAt },
  });
  if (claimed.count !== 1) {
    throw new AppError(409, "ROUND_NOT_OPEN", "조를 생성할 수 있는 회차 상태가 아닙니다.");
  }
  publishRoundEvent(roundId, "round.updated", { status: "GENERATING" });

  try {
    const round = await prisma.round.findUniqueOrThrow({
      where: { id: roundId },
      include: { registrations: true },
    });
    const seed = round.randomSeed ?? randomBytes(16).toString("hex");
    if (!round.randomSeed) await prisma.round.update({ where: { id: round.id }, data: { randomSeed: seed } });

    const penalties = await buildPairPenalties(round.id, round.historyWeeks);
    const generated = generateTeamDrafts({
      registrations: round.registrations.map((registration) => ({
        id: registration.id,
        participantId: registration.participantId,
        preferredLocation: registration.preferredLocation as Location | null,
      })),
      flowMode: round.flowMode,
      targetMin: round.targetGroupMinSize,
      targetMax: round.targetGroupMaxSize,
      attempts: round.randomAttempts,
      penalties,
      seed,
    });

    const completedImmediately = round.flowMode === "LOCATION_FIRST" || generated.teams.length === 0;
    await prisma.$transaction(async (transaction) => {
      let sequence = 1;
      for (const draft of generated.teams) {
        await transaction.team.create({
          data: {
            roundId: round.id,
            sequence,
            location: draft.location as Location | null,
            sizeAdjusted: draft.sizeAdjusted,
            members: {
              create: draft.registrationIds.map((registrationId) => ({ registrationId })),
            },
          },
        });
        sequence += 1;
      }
      await transaction.generationAudit.create({
        data: {
          roundId: round.id,
          algorithmVersion: "adaptive-random-v1",
          trigger,
          triggerReason,
          candidateCount: generated.candidateCount,
          bestScore: generated.bestScore,
          repeatedPairCount: generated.repeatedPairCount,
          sizeAdjustedTeamCount: generated.teams.filter((team) => team.sizeAdjusted).length,
          durationMs: Date.now() - startedAt.getTime(),
        },
      });
      await transaction.round.update({
        where: { id: round.id },
        data: {
          status: completedImmediately ? "COMPLETED" : "LOCATION_SELECTION",
          generatedAt: new Date(),
          completedAt: completedImmediately ? new Date() : null,
        },
      });
    });
  } catch (error) {
    await prisma.round.updateMany({
      where: { id: roundId, status: "GENERATING" },
      data: { status: "OPEN", generationStartedAt: null },
    });
    publishRoundEvent(roundId, "round.updated", { status: "OPEN" });
    throw error;
  }

  const result = await prisma.round.findUniqueOrThrow({ where: { id: roundId } });
  publishRoundEvent(roundId, "round.updated", { status: result.status });
  publishRoundEvent(roundId, "results.updated", { available: true });
  return result;
}

export async function runSchedulerTick(now = new Date()) {
  await ensureCurrentRound(now);
  const openingRounds = await prisma.round.findMany({ where: { status: "SCHEDULED", opensAt: { lte: now } } });
  if (openingRounds.length > 0) {
    await prisma.round.updateMany({
      where: { id: { in: openingRounds.map((round) => round.id) }, status: "SCHEDULED" },
      data: { status: "OPEN" },
    });
    for (const round of openingRounds) publishRoundEvent(round.id, "round.updated", { status: "OPEN" });
  }

  const staleBefore = addMinutes(now, -env.GENERATION_STALE_MINUTES);
  const staleRounds = await prisma.round.findMany({
    where: { status: "GENERATING", generationStartedAt: { lte: staleBefore } },
  });
  for (const round of staleRounds) {
    await prisma.round.update({ where: { id: round.id }, data: { status: "OPEN", generationStartedAt: null } });
    await generateRound(round.id, "RECOVERY", "stale generation recovery");
  }

  const dueRounds = await prisma.round.findMany({ where: { status: "OPEN", closesAt: { lte: now } } });
  for (const round of dueRounds) {
    await generateRound(round.id, "SCHEDULER");
  }

  const completingRounds = await prisma.round.findMany({
    where: { status: "LOCATION_SELECTION", locationClosesAt: { lte: now } },
  });
  if (completingRounds.length > 0) {
    await prisma.round.updateMany({
      where: { id: { in: completingRounds.map((round) => round.id) }, status: "LOCATION_SELECTION" },
      data: { status: "COMPLETED", completedAt: now },
    });
    for (const round of completingRounds) {
      publishRoundEvent(round.id, "round.updated", { status: "COMPLETED" });
      publishRoundEvent(round.id, "results.updated", { available: true });
    }
  }
}
