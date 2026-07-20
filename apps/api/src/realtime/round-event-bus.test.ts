import { describe, expect, it, vi } from "vitest";
import { RoundEventBus } from "./round-event-bus.js";

describe("RoundEventBus", () => {
  it("delivers events only to subscribers for the same round", () => {
    const bus = new RoundEventBus();
    const currentRoundListener = vi.fn();
    const otherRoundListener = vi.fn();

    bus.subscribe("round-a", currentRoundListener);
    bus.subscribe("round-b", otherRoundListener);
    bus.publish("round-a", "registration.count.changed", { registrationCount: 7 });

    expect(currentRoundListener).toHaveBeenCalledOnce();
    expect(currentRoundListener).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "registration.count.changed",
        roundId: "round-a",
        data: { registrationCount: 7 },
      }),
    );
    expect(otherRoundListener).not.toHaveBeenCalled();
  });

  it("stops delivery after unsubscribe", () => {
    const bus = new RoundEventBus();
    const listener = vi.fn();
    const unsubscribe = bus.subscribe("round-a", listener);

    expect(bus.subscriberCount("round-a")).toBe(1);
    unsubscribe();
    bus.publish("round-a", "round.updated", { status: "COMPLETED" });

    expect(bus.subscriberCount("round-a")).toBe(0);
    expect(listener).not.toHaveBeenCalled();
  });
});
