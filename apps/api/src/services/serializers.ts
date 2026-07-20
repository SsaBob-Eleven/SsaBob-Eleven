import type { Prisma } from "@prisma/client";

export function serializeRound(round: {
  id: string;
  weekKey: string;
  flowMode: string;
  status: string;
  opensAt: Date;
  closesAt: Date;
  locationClosesAt: Date | null;
  groupSizePolicy: string;
  targetGroupMinSize: number;
  targetGroupMaxSize: number;
  maxParticipants: number;
  generatedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: round.id,
    weekKey: round.weekKey,
    flowMode: round.flowMode,
    status: round.status,
    opensAt: round.opensAt.toISOString(),
    closesAt: round.closesAt.toISOString(),
    locationClosesAt: round.locationClosesAt?.toISOString() ?? null,
    groupSizePolicy: round.groupSizePolicy,
    targetGroupMinSize: round.targetGroupMinSize,
    targetGroupMaxSize: round.targetGroupMaxSize,
    maxParticipants: round.maxParticipants,
    generatedAt: round.generatedAt?.toISOString() ?? null,
    completedAt: round.completedAt?.toISOString() ?? null,
    createdAt: round.createdAt.toISOString(),
    updatedAt: round.updatedAt.toISOString(),
  };
}
type RegistrationWithParticipant = Prisma.RegistrationGetPayload<{ include: { participant: true } }>;

export function serializeRegistration(registration: RegistrationWithParticipant) {
  return {
    id: registration.id,
    roundId: registration.roundId,
    participant: {
      id: registration.participantId,
      name: registration.displayName,
    },
    preferredLocation: registration.preferredLocation,
    createdAt: registration.createdAt.toISOString(),
    updatedAt: registration.updatedAt.toISOString(),
  };
}

type TeamWithMembers = Prisma.TeamGetPayload<{
  include: { members: { include: { registration: { include: { participant: true } } } } };
}>;

export function serializeTeam(team: TeamWithMembers) {
  return {
    id: team.id,
    roundId: team.roundId,
    sequence: team.sequence,
    location: team.location,
    sizeAdjusted: team.sizeAdjusted,
    members: team.members.map(({ registration }) => ({
      registrationId: registration.id,
      participant: {
        id: registration.participantId,
        name: registration.displayName,
      },
    })),
    locationSelectedAt: team.locationSelectedAt?.toISOString() ?? null,
  };
}
