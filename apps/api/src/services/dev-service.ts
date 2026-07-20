import { createHmac, randomUUID } from "node:crypto";
import type { Location } from "@prisma/client";
import { env } from "../config/env.js";
import { prisma } from "../db.js";
import { AppError } from "../errors.js";
import { publishRegistrationCount, publishRoundEvent } from "../realtime/publishers.js";
import { generateRound } from "./round-service.js";

export const DEV_ACTIONS = [
  "OPEN_VOTING",
  "GENERATE_TEAMS",
  "COMPLETE_ROUND",
  "ADD_SAMPLE_PARTICIPANTS",
  "CLEAR_ALL",
] as const;
export type DevAction = (typeof DEV_ACTIONS)[number];

async function requireRound(roundId: string) {
  const round = await prisma.round.findUnique({ where: { id: roundId } });
  if (!round) throw new AppError(404, "ROUND_NOT_FOUND", "회차를 찾을 수 없습니다.");
  return round;
}

async function clearGeneratedResults(roundId: string) {
  await prisma.$transaction([
    prisma.team.deleteMany({ where: { roundId } }),
    prisma.generationAudit.deleteMany({ where: { roundId } }),
    prisma.round.update({
      where: { id: roundId },
      data: {
        randomSeed: null,
        generationStartedAt: null,
        generatedAt: null,
        completedAt: null,
      },
    }),
  ]);
}

async function openVoting(roundId: string) {
  const round = await requireRound(roundId);
  await clearGeneratedResults(roundId);
  const now = new Date();
  const closesAt = new Date(now.getTime() + 30 * 60 * 1000);
  const locationClosesAt = new Date(now.getTime() + 40 * 60 * 1000);
  const updated = await prisma.round.update({
    where: { id: roundId },
    data: {
      status: "OPEN",
      opensAt: now,
      closesAt,
      locationClosesAt: round.flowMode === "TEAM_FIRST" ? locationClosesAt : null,
    },
  });
  publishRoundEvent(roundId, "round.updated", { status: updated.status });
  publishRoundEvent(roundId, "results.updated", { available: false });
  return updated;
}

async function addSampleParticipants(roundId: string, requestedCount: number) {
  const round = await requireRound(roundId);
  if (round.status !== "OPEN") {
    throw new AppError(409, "ROUND_NOT_OPEN", "샘플 참가자를 추가하려면 먼저 투표를 열어 주세요.");
  }
  const currentCount = await prisma.registration.count({ where: { roundId } });
  const addCount = Math.min(requestedCount, round.maxParticipants - currentCount);
  if (addCount <= 0) throw new AppError(409, "ROUND_CAPACITY_REACHED", "이미 최대 인원까지 등록되어 있습니다.");

  const locations: Location[] = ["FLOOR_10", "FLOOR_20", "OUTSIDE"];
  let added = 0;
  for (let index = 1; index <= 200 && added < addCount; index += 1) {
    const displayName = `테${String(index).padStart(2, "0")}`;
    const normalizedName = displayName.toLocaleLowerCase("ko-KR");
    const participant = await prisma.participant.upsert({
      where: { normalizedName },
      update: { name: displayName },
      create: { name: displayName, normalizedName },
    });
    const exists = await prisma.registration.findUnique({
      where: { roundId_participantId: { roundId, participantId: participant.id } },
    });
    if (exists) continue;
    const editTokenHash = createHmac("sha256", env.EDIT_TOKEN_PEPPER)
      .update(`dev:${roundId}:${index}:${randomUUID()}`)
      .digest("hex");
    await prisma.registration.create({
      data: {
        roundId,
        participantId: participant.id,
        displayName,
        preferredLocation: round.flowMode === "LOCATION_FIRST" ? locations[added % locations.length]! : null,
        editTokenHash,
      },
    });
    added += 1;
  }
  await publishRegistrationCount(roundId);
  return { added };
}

export async function executeDevAction(roundId: string, action: DevAction, count = 5) {
  await requireRound(roundId);

  if (action === "OPEN_VOTING") {
    const round = await openVoting(roundId);
    return { round, message: "투표를 30분 동안 강제로 열었습니다." };
  }

  if (action === "GENERATE_TEAMS") {
    await openVoting(roundId);
    const round = await generateRound(roundId, "ADMIN", "development force generation");
    return { round, message: "현재 참가자로 조를 즉시 생성했습니다." };
  }

  if (action === "COMPLETE_ROUND") {
    const round = await prisma.round.update({
      where: { id: roundId },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    publishRoundEvent(roundId, "round.updated", { status: round.status });
    publishRoundEvent(roundId, "results.updated", { available: true });
    return { round, message: "회차를 강제로 완료했습니다." };
  }

  if (action === "ADD_SAMPLE_PARTICIPANTS") {
    const result = await addSampleParticipants(roundId, count);
    return { round: await requireRound(roundId), message: `샘플 참가자 ${result.added}명을 추가했습니다.` };
  }

  await prisma.$transaction([
    prisma.team.deleteMany({ where: { roundId } }),
    prisma.generationAudit.deleteMany({ where: { roundId } }),
    prisma.registration.deleteMany({ where: { roundId } }),
  ]);
  const round = await openVoting(roundId);
  await publishRegistrationCount(roundId);
  return { round, message: "참가자와 편성 결과를 모두 초기화했습니다." };
}
