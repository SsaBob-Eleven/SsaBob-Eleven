import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";

export const ROUND_EVENT_TYPES = [
  "registration.count.changed",
  "registration.updated",
  "round.updated",
  "results.updated",
  "team.updated",
] as const;

export type RoundEventType = (typeof ROUND_EVENT_TYPES)[number];

export type RoundEvent = {
  id: string;
  type: RoundEventType;
  roundId: string;
  occurredAt: string;
  data: Record<string, unknown>;
};

type Listener = (event: RoundEvent) => void;

export class RoundEventBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(100);
  }

  publish(roundId: string, type: RoundEventType, data: Record<string, unknown> = {}) {
    const event: RoundEvent = {
      id: randomUUID(),
      type,
      roundId,
      occurredAt: new Date().toISOString(),
      data,
    };
    this.emitter.emit(roundId, event);
  }

  subscribe(roundId: string, listener: Listener) {
    this.emitter.on(roundId, listener);
    return () => this.emitter.off(roundId, listener);
  }

  subscriberCount(roundId: string) {
    return this.emitter.listenerCount(roundId);
  }
}

export const roundEventBus = new RoundEventBus();
