import { prisma } from "../db.js";
import { roundEventBus, type RoundEventType } from "./round-event-bus.js";

export async function publishRegistrationCount(roundId: string) {
  const registrationCount = await prisma.registration.count({ where: { roundId } });
  roundEventBus.publish(roundId, "registration.count.changed", { registrationCount });
}
export function publishRoundEvent(roundId: string, type: RoundEventType, data: Record<string, unknown> = {}) {
  roundEventBus.publish(roundId, type, data);
}
