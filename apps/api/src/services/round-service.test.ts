import type { Round } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db.js", () => ({
  prisma: {
    $transaction: vi.fn(),
    round: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
    team: { deleteMany: vi.fn() },
    generationAudit: { deleteMany: vi.fn() },
  },
}));

vi.mock("../realtime/publishers.js", () => ({ publishRoundEvent: vi.fn() }));

import { prisma } from "../db.js";
import { publishRoundEvent } from "../realtime/publishers.js";
import { openRoundNow, reopenRoundVoting } from "./round-service.js";

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

describe("reopenRoundVoting", () => {
  beforeEach(() => vi.clearAllMocks());

  it("조 편성을 삭제하고 참가자를 유지한 채 투표를 30분 동안 다시 연다", async () => {
    const now = new Date("2026-07-20T01:00:00.000Z");
    const completedRound = { ...scheduledRound, status: "COMPLETED", flowMode: "LOCATION_FIRST" } as Round;
    const reopenedRound = {
      ...completedRound,
      status: "OPEN",
      opensAt: now,
      closesAt: new Date("2026-07-20T01:30:00.000Z"),
    } as Round;
    vi.mocked(prisma.round.findUnique).mockResolvedValue(completedRound);
    vi.mocked(prisma.team.deleteMany).mockReturnValue({} as never);
    vi.mocked(prisma.generationAudit.deleteMany).mockReturnValue({} as never);
    vi.mocked(prisma.round.update).mockReturnValue({} as never);
    vi.mocked(prisma.$transaction).mockResolvedValue([{ count: 2 }, { count: 1 }, reopenedRound] as never);

    await expect(reopenRoundVoting(completedRound.id, now)).resolves.toBe(reopenedRound);
    expect(prisma.team.deleteMany).toHaveBeenCalledWith({ where: { roundId: completedRound.id } });
    expect(prisma.generationAudit.deleteMany).toHaveBeenCalledWith({ where: { roundId: completedRound.id } });
    expect(prisma.round.update).toHaveBeenCalledWith({
      where: { id: completedRound.id },
      data: {
        status: "OPEN",
        opensAt: now,
        closesAt: new Date("2026-07-20T01:30:00.000Z"),
        locationClosesAt: null,
        randomSeed: null,
        generationStartedAt: null,
        generatedAt: null,
        completedAt: null,
      },
    });
    expect(publishRoundEvent).toHaveBeenCalledWith(completedRound.id, "round.updated", { status: "OPEN" });
    expect(publishRoundEvent).toHaveBeenCalledWith(completedRound.id, "results.updated", { available: false });
  });

  it("조 편성 전 회차는 재투표 대상으로 받지 않는다", async () => {
    vi.mocked(prisma.round.findUnique).mockResolvedValue({ ...scheduledRound, status: "OPEN" });

    await expect(reopenRoundVoting(scheduledRound.id)).rejects.toMatchObject({
      status: 409,
      code: "ROUND_NOT_OPEN",
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
