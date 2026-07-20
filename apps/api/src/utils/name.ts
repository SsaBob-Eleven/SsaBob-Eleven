import { cleanParticipantName } from "@ssabap/shared";

export function normalizeName(value: string): string {
  return cleanParticipantName(value).toLocaleLowerCase("ko-KR");
}

export function cleanDisplayName(value: string): string {
  return cleanParticipantName(value);
}
