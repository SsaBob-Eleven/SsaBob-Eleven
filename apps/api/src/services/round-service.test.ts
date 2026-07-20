import type { Round } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db.js", () => ({
  prisma: {
    round: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
  },
}));

vi.mock("../realtime/publishers.js", () => ({ publishRoundEvent: vi.fn() }));

import { prisma } from "../db.js";
import { publishRoundEvent } from "../realtime/publishers.js";
import { openRoundNow } from "./round-service.js";

const scheduledRound = {
  id: "11111111-1111-4111-8111-111111111111",
  status: "SCHEDULED",
} as Round;

describe("openRoundNow", () => {
  beforeEach(() => vi.clearAllMocks());

  it("예약 회차를 현재 시각에 열고 변경 이벤트를 발행한다", async () => {
    const now = new Date("2026-07-20T01:00:00.000Z");
    const openedRound = { ...scheduledRound, status: "OPEN", opensAt: now } as Round;
    vi.mocked(prisma.round.findUnique).mockResolvedValue(scheduledRound);
    vi.mocked(prisma.round.updateMany).mockResolvedValue({ count: 1 });
    vi.mocked(prisma.round.findUniqueOrThrow).mockResolvedValue(openedRound);

    await expect(openRoundNow(scheduledRound.id, now)).resolves.toBe(openedRound);
    expect(prisma.round.updateMany).toHaveBeenCalledWith({
      where: { id: scheduledRound.id, status: "SCHEDULED" },
      data: { status: "OPEN", opensAt: now },
    });
    expect(publishRoundEvent).toHaveBeenCalledWith(scheduledRound.id, "round.updated", { status: "OPEN" });
  });

  it("존재하지 않는 회차는 거절한다", async () => {
    vi.mocked(prisma.round.findUnique).mockResolvedValue(null);

    await expect(openRoundNow(scheduledRound.id)).rejects.toMatchObject({
      status: 404,
      code: "ROUND_NOT_FOUND",
    });
    expect(prisma.round.updateMany).not.toHaveBeenCalled();
  });

  it("예약 상태가 아닌 회차는 다시 열지 않는다", async () => {
    vi.mocked(prisma.round.findUnique).mockResolvedValue({ ...scheduledRound, status: "OPEN" });

    await expect(openRoundNow(scheduledRound.id)).rejects.toMatchObject({
      status: 409,
      code: "ROUND_NOT_OPEN",
    });
    expect(prisma.round.updateMany).not.toHaveBeenCalled();
  });
});
