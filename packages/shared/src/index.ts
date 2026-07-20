export const FLOW_MODES = ["LOCATION_FIRST", "TEAM_FIRST"] as const;
export type FlowMode = (typeof FLOW_MODES)[number];

export const ROUND_STATUSES = [
  "SCHEDULED",
  "OPEN",
  "GENERATING",
  "PAUSED",
  "LOCATION_SELECTION",
  "COMPLETED",
] as const;
export type RoundStatus = (typeof ROUND_STATUSES)[number];

export const LOCATIONS = ["FLOOR_10", "FLOOR_20", "OUTSIDE"] as const;
export type Location = (typeof LOCATIONS)[number];

export const LOCATION_LABELS: Record<Location, string> = {
  FLOOR_10: "10층",
  FLOOR_20: "20층",
  OUTSIDE: "밖에서 먹기",
};

export const REQUIRED_PARTICIPANT_NAME_LENGTH = 3;

export function cleanParticipantName(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ");
}

export function isValidParticipantName(value: string): boolean {
  const cleaned = cleanParticipantName(value);
  return !/\s/u.test(cleaned) && Array.from(cleaned).length === REQUIRED_PARTICIPANT_NAME_LENGTH;
}

export type ParticipantDto = {
  id: string;
  name: string;
};

export type RegistrationDto = {
  id: string;
  roundId: string;
  participant: ParticipantDto;
  preferredLocation: Location | null;
  createdAt: string;
  updatedAt: string;
};

export type TeamDto = {
  id: string;
  roundId: string;
  sequence: number;
  location: Location | null;
  sizeAdjusted: boolean;
  members: Array<{
    registrationId: string;
    participant: ParticipantDto;
  }>;
  locationSelectedAt: string | null;
};

export type RoundDto = {
  id: string;
  weekKey: string;
  flowMode: FlowMode;
  status: RoundStatus;
  opensAt: string;
  closesAt: string;
  locationClosesAt: string | null;
  groupSizePolicy: "ADAPTIVE";
  targetGroupMinSize: number;
  targetGroupMaxSize: number;
  maxParticipants: number;
  generatedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RegistrationRulesDto = {
  registrationOpen: boolean;
  preferredLocationRequired: boolean;
  preferredLocationAllowed: boolean;
  resultAvailable: boolean;
  teamLocationSelectable: boolean;
};

export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    details: unknown;
    requestId: string;
  };
};
