import type { ApiErrorBody, Location, RegistrationDto, RoundDto, TeamDto } from "@ssabap/shared";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000/api/v1";

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
    throw new ApiError(body?.error.code ?? "REQUEST_FAILED", body?.error.message ?? "요청에 실패했습니다.", response.status);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export type CurrentRoundResponse = {
  data: {
    serverTime: string;
    round: RoundDto;
    rules: {
      registrationOpen: boolean;
      preferredLocationRequired: boolean;
      preferredLocationAllowed: boolean;
      resultAvailable: boolean;
      teamLocationSelectable: boolean;
    };
    registrationCount: number;
  };
};

export type RegistrationContextResponse = {
  data: { registration: RegistrationDto; team: TeamDto | null };
};

export type ResultsResponse = {
  data: {
    serverTime: string;
    round: RoundDto;
    summary: {
      registrationCount: number;
      teamCount: number;
      sizeAdjustedTeamCount: number;
      unselectedLocationCount: number;
    };
    teams: TeamDto[];
  };
};

export const DEV_ACTIONS = [
  "OPEN_VOTING",
  "GENERATE_TEAMS",
  "COMPLETE_ROUND",
  "ADD_SAMPLE_PARTICIPANTS",
  "CLEAR_ALL",
] as const;

export type DevAction = (typeof DEV_ACTIONS)[number];

export type RoundEvent = {
  id: string;
  type:
    | "connected"
    | "registration.count.changed"
    | "registration.updated"
    | "round.updated"
    | "results.updated"
    | "team.updated";
  roundId: string;
  occurredAt: string;
  data: Record<string, unknown>;
};

export function subscribeRoundEvents(
  roundId: string,
  onEvent: (event: RoundEvent) => void,
  onConnectionChange?: (connected: boolean) => void,
) {
  const source = new EventSource(`${API_BASE_URL}/events?roundId=${encodeURIComponent(roundId)}`);
  source.onopen = () => onConnectionChange?.(true);
  source.onerror = () => onConnectionChange?.(false);
  source.onmessage = (message) => {
    try {
      onEvent(JSON.parse(message.data) as RoundEvent);
    } catch {
      // Ignore malformed events and keep the browser-managed SSE reconnection alive.
    }
  };
  return () => source.close();
}

export const api = {
  currentRound: () => request<CurrentRoundResponse>("/rounds/current"),
  createRegistration: (roundId: string, body: { name: string; preferredLocation?: Location | null }) =>
    request<{ data: { registration: RegistrationDto; editToken: string } }>(`/rounds/${roundId}/registrations`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  getRegistration: (registrationId: string, editToken: string) =>
    request<RegistrationContextResponse>(`/registrations/${registrationId}`, {
      headers: { "X-Edit-Token": editToken },
    }),
  updateRegistration: (
    registrationId: string,
    editToken: string,
    body: { name?: string; preferredLocation?: Location | null },
  ) =>
    request<{ data: { registration: RegistrationDto } }>(`/registrations/${registrationId}`, {
      method: "PATCH",
      headers: { "X-Edit-Token": editToken },
      body: JSON.stringify(body),
    }),
  deleteRegistration: (registrationId: string, editToken: string) =>
    request<void>(`/registrations/${registrationId}`, {
      method: "DELETE",
      headers: { "X-Edit-Token": editToken },
    }),
  results: (roundId: string) => request<ResultsResponse>(`/rounds/${roundId}/results`),
  selectTeamLocation: (teamId: string, editToken: string, location: Location) =>
    request<{ data: { team: TeamDto } }>(`/teams/${teamId}/location`, {
      method: "PATCH",
      headers: { "X-Edit-Token": editToken },
      body: JSON.stringify({ location }),
    }),
  adminRounds: (token: string) =>
    request<{ data: { items: Array<{ round: RoundDto; registrationCount: number; teamCount: number }> } }>("/admin/rounds", {
      headers: { Authorization: `Bearer ${token}` },
    }),
  adminRound: (token: string, roundId: string) =>
    request<{ data: { round: RoundDto; registrations: RegistrationDto[]; teams: TeamDto[]; generationAudit: unknown } }>(
      `/admin/rounds/${roundId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    ),
  adminGenerate: (token: string, roundId: string) =>
    request<ResultsResponse>(`/admin/rounds/${roundId}/generate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ reason: "관리자 화면에서 수동 생성" }),
    }),
  devAction: (token: string, roundId: string, action: DevAction, count?: number) =>
    request<{ data: { round: RoundDto; message: string } }>(`/dev/rounds/${roundId}/actions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action, ...(count === undefined ? {} : { count }) }),
    }),
};

export type StoredRegistration = { registrationId: string; editToken: string; participantName: string };

export function loadStoredRegistration(roundId: string): StoredRegistration | null {
  try {
    const raw = localStorage.getItem(`lunch-registration:${roundId}`);
    return raw ? (JSON.parse(raw) as StoredRegistration) : null;
  } catch {
    return null;
  }
}

export function saveStoredRegistration(roundId: string, value: StoredRegistration) {
  localStorage.setItem(`lunch-registration:${roundId}`, JSON.stringify(value));
}

export function clearStoredRegistration(roundId: string) {
  localStorage.removeItem(`lunch-registration:${roundId}`);
}
