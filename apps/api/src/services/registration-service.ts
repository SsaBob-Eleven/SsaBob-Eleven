import type { Location } from "@prisma/client";
import { prisma } from "../db.js";
import { AppError } from "../errors.js";
import { publishRegistrationCount, publishRoundEvent } from "../realtime/publishers.js";
import { cleanDisplayName, normalizeName } from "../utils/name.js";
import { createEditToken, hashEditToken } from "../utils/tokens.js";

async function requireOpenRound(roundId: string) {
  const round = await prisma.round.findUnique({ where: { id: roundId } });
  if (!round) throw new AppError(404, "ROUND_NOT_FOUND", "회차를 찾을 수 없습니다.");
  if (round.status !== "OPEN" || new Date() >= round.closesAt) {
    throw new AppError(409, "ROUND_NOT_OPEN", "현재 회차의 참가 등록이 마감되었습니다.");
  }
  return round;
}

function validateLocation(flowMode: string, location: Location | null | undefined) {
  if (flowMode === "LOCATION_FIRST" && !location) {
    throw new AppError(409, "LOCATION_REQUIRED", "장소 우선 모드에서는 장소를 선택해야 합니다.");
  }
  if (flowMode === "TEAM_FIRST" && location) {
    throw new AppError(409, "LOCATION_NOT_ALLOWED", "팀 우선 모드에서는 참가 등록 때 장소를 선택하지 않습니다.");
  }
}

export async function createRegistration(roundId: string, rawName: string, preferredLocation?: Location | null) {
  const round = await requireOpenRound(roundId);
  validateLocation(round.flowMode, preferredLocation);
  const displayName = cleanDisplayName(rawName);
  const normalizedName = normalizeName(rawName);
  const editToken = createEditToken();

  const registration = await prisma.$transaction(async (transaction) => {
    const count = await transaction.registration.count({ where: { roundId } });
    if (count >= round.maxParticipants) {
      throw new AppError(409, "ROUND_CAPACITY_REACHED", `이번 회차는 최대 ${round.maxParticipants}명까지 참여할 수 있습니다.`);
    }

    let participant = await transaction.participant.findUnique({ where: { normalizedName } });
    if (!participant) {
      participant = await transaction.participant.create({ data: { name: displayName, normalizedName } });
    }
    const duplicate = await transaction.registration.findUnique({
      where: { roundId_participantId: { roundId, participantId: participant.id } },
    });
    if (duplicate) {
      throw new AppError(409, "REGISTRATION_ALREADY_EXISTS", "이미 이번 회차에 등록된 이름입니다.");
    }

    return transaction.registration.create({
      data: {
        roundId,
        participantId: participant.id,
        displayName,
        preferredLocation: preferredLocation ?? null,
        editTokenHash: editToken.hash,
      },
      include: { participant: true },
    });
  });

  await publishRegistrationCount(roundId);
  return { registration, editToken: editToken.token };
}

export async function requireEditableRegistration(registrationId: string, token: string) {
  const registration = await prisma.registration.findUnique({
    where: { id: registrationId },
    include: { participant: true, round: true },
  });
  if (!registration) throw new AppError(404, "REGISTRATION_NOT_FOUND", "참가 등록을 찾을 수 없습니다.");
  if (registration.editTokenHash !== hashEditToken(token)) {
    throw new AppError(401, "INVALID_EDIT_TOKEN", "편집 토큰이 올바르지 않습니다.");
  }
  return registration;
}

export async function findRegistrationByToken(token: string) {
  const registration = await prisma.registration.findUnique({
    where: { editTokenHash: hashEditToken(token) },
    include: { participant: true, round: true },
  });
  if (!registration) throw new AppError(401, "INVALID_EDIT_TOKEN", "편집 토큰이 올바르지 않습니다.");
  return registration;
}

export async function updateRegistration(
  registrationId: string,
  token: string,
  input: { name?: string; preferredLocation?: Location | null },
) {
  const current = await requireEditableRegistration(registrationId, token);
  await requireOpenRound(current.roundId);
  validateLocation(current.round.flowMode, input.preferredLocation ?? current.preferredLocation);

  const updated = await prisma.$transaction(async (transaction) => {
    let participantId = current.participantId;
    let displayName = current.displayName;

    if (input.name !== undefined) {
      displayName = cleanDisplayName(input.name);
      const normalizedName = normalizeName(input.name);
      if (normalizedName !== current.participant.normalizedName) {
        const target = await transaction.participant.findUnique({ where: { normalizedName } });
        if (target) {
          const duplicate = await transaction.registration.findUnique({
            where: { roundId_participantId: { roundId: current.roundId, participantId: target.id } },
          });
          if (duplicate && duplicate.id !== current.id) {
            throw new AppError(409, "REGISTRATION_ALREADY_EXISTS", "이미 이번 회차에 등록된 이름입니다.");
          }
          participantId = target.id;
        } else {
          const updated = await transaction.participant.update({
            where: { id: current.participantId },
            data: { name: displayName, normalizedName },
          });
          participantId = updated.id;
        }
      } else {
        await transaction.participant.update({ where: { id: current.participantId }, data: { name: displayName } });
      }
    }

    return transaction.registration.update({
      where: { id: registrationId },
      data: {
        participantId,
        displayName,
        ...(input.preferredLocation !== undefined ? { preferredLocation: input.preferredLocation } : {}),
      },
      include: { participant: true },
    });
  });
  publishRoundEvent(current.roundId, "registration.updated", { registrationId });
  return updated;
}

export async function deleteRegistration(registrationId: string, token: string) {
  const registration = await requireEditableRegistration(registrationId, token);
  await requireOpenRound(registration.roundId);
  await prisma.registration.delete({ where: { id: registrationId } });
  await publishRegistrationCount(registration.roundId);
}
