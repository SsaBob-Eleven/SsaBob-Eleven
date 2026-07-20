import type { Location } from "@prisma/client";
import { prisma } from "../db.js";
import { AppError } from "../errors.js";
import { publishRoundEvent } from "../realtime/publishers.js";
import { findRegistrationByToken } from "./registration-service.js";

const teamInclude = {
  members: { include: { registration: { include: { participant: true } } } },
} as const;

export async function selectTeamLocation(teamId: string, editToken: string, location: Location) {
  const registration = await findRegistrationByToken(editToken);
  const team = await prisma.team.findUnique({ where: { id: teamId }, include: { round: true, members: true } });
  if (!team) throw new AppError(404, "TEAM_NOT_FOUND", "조를 찾을 수 없습니다.");
  if (team.round.flowMode !== "TEAM_FIRST" || team.round.status !== "LOCATION_SELECTION") {
    throw new AppError(409, "TEAM_LOCATION_NOT_OPEN", "현재는 조의 장소를 선택할 수 없습니다.");
  }
  if (!team.members.some((member) => member.registrationId === registration.id)) {
    throw new AppError(409, "NOT_A_TEAM_MEMBER", "해당 조의 구성원만 장소를 선택할 수 있습니다.");
  }
  if (team.locationSelectedByRegistrationId && team.locationSelectedByRegistrationId !== registration.id) {
    throw new AppError(409, "TEAM_LOCATION_ALREADY_SELECTED", "다른 팀원이 이미 장소를 확정했습니다.");
  }
  const updated = await prisma.team.update({
    where: { id: teamId },
    data: {
      location,
      locationSelectedByRegistrationId: registration.id,
      locationSelectedAt: new Date(),
    },
    include: teamInclude,
  });
  publishRoundEvent(team.roundId, "team.updated", { teamId, location });
  return updated;
}

export async function clearTeamLocation(teamId: string, editToken: string) {
  const registration = await findRegistrationByToken(editToken);
  const team = await prisma.team.findUnique({ where: { id: teamId }, include: { round: true } });
  if (!team) throw new AppError(404, "TEAM_NOT_FOUND", "조를 찾을 수 없습니다.");
  if (team.round.status !== "LOCATION_SELECTION") {
    throw new AppError(409, "TEAM_LOCATION_NOT_OPEN", "현재는 조의 장소를 변경할 수 없습니다.");
  }
  if (team.locationSelectedByRegistrationId !== registration.id) {
    throw new AppError(409, "TEAM_LOCATION_ALREADY_SELECTED", "최초 장소 선택자만 선택을 취소할 수 있습니다.");
  }
  await prisma.team.update({
    where: { id: teamId },
    data: { location: null, locationSelectedByRegistrationId: null, locationSelectedAt: null },
  });
  publishRoundEvent(team.roundId, "team.updated", { teamId, location: null });
}

export const resultTeamInclude = teamInclude;
