import type { Round } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db.js", () => ({
  prisma: {
    $transaction: vi.fn(),
    round: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn(),
    },
    team: { create: vi.fn(), deleteMany: vi.fn() },
    generationAudit: { create: vi.fn(), deleteMany: vi.fn() },
  },
}));

vi.mock("../config/env.js", () => ({
  env: {
    VOTE_WEEKDAYS: ["MON", "TUE", "WED", "THU", "FRI"],
    VOTE_OPEN_TIME: "08:30",
    VOTE_CLOSE_TIME: "11:30",
    TEAM_LOCATION_CLOSE_TIME: "11:40",
    FLOW_MODE: "LOCATION_FIRST",
    TARGET_GROUP_MIN_SIZE: 4,
    TARGET_GROUP_MAX_SIZE: 5,
    MAX_PARTICIPANTS_PER_ROUND: 26,
    HISTORY_WEEKS: 8,
    RANDOM_ATTEMPTS: 500,
    GENERATION_STALE_MINUTES: 5,
  },
}));

vi.mock("../realtime/publishers.js", () => ({ publishRoundEvent: vi.fn() }));

import { prisma } from "../db.js";
import { publishRoundEvent } from "../realtime/publishers.js";
import { deleteRoundTeams, ensureCurrentRound, openRoundNow, reopenRoundVoting, runSchedulerTick } from "./round-service.js";

const scheduledRound = {
  id: "11111111-1111-4111-8111-111111111111",
  status: "SCHEDULED",
} as Round;

describe("ensureCurrentRound", () => {
  beforeEach(() => vi.clearAllMocks());

  it("평일에는 한국 날짜별 회차를 08:30~11:30 일정으로 생성한다", async () => {
    const now = new Date("2026-07-20T00:00:00.000Z");
    const createdRound = { ...scheduledRound, weekKey: "2026-07-20", status: "OPEN" } as Round;
    vi.mocked(prisma.round.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.round.create).mockResolvedValue(createdRound);

    await expect(ensureCurrentRound(now)).resolves.toBe(createdRound);
    expect(prisma.round.findUnique).toHaveBeenCalledWith({ where: { weekKey: "2026-07-20" } });
    expect(prisma.round.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        weekKey: "2026-07-20",
        status: "OPEN",
        opensAt: new Date("2026-07-19T23:30:00.000Z"),
        closesAt: new Date("2026-07-20T02:30:00.000Z"),
      }),
    });
  });

  it("주말에는 다음 월요일 회차를 예약 상태로 생성한다", async () => {
    const now = new Date("2026-07-25T03:00:00.000Z");
    const createdRound = { ...scheduledRound, weekKey: "2026-07-27", status: "SCHEDULED" } as Round;
    vi.mocked(prisma.round.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.round.create).mockResolvedValue(createdRound);

    await expect(ensureCurrentRound(now)).resolves.toBe(createdRound);
    expect(prisma.round.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        weekKey: "2026-07-27",
        status: "SCHEDULED",
        opensAt: new Date("2026-07-26T23:30:00.000Z"),
        closesAt: new Date("2026-07-27T02:30:00.000Z"),
      }),
    });
  });
});

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

describe("deleteRoundTeams", () => {
  beforeEach(() => vi.clearAllMocks());

  it("조 편성과 생성 기록을 삭제하고 회차를 일시 중지한다", async () => {
    const completedRound = { ...scheduledRound, status: "COMPLETED", flowMode: "LOCATION_FIRST" } as Round;
    const pausedRound = { ...completedRound, status: "PAUSED" } as Round;
    vi.mocked(prisma.round.findUnique).mockResolvedValue(completedRound);
    vi.mocked(prisma.team.deleteMany).mockReturnValue({} as never);
    vi.mocked(prisma.generationAudit.deleteMany).mockReturnValue({} as never);
    vi.mocked(prisma.round.update).mockReturnValue({} as never);
    vi.mocked(prisma.$transaction).mockResolvedValue([{ count: 2 }, { count: 1 }, pausedRound] as never);

    await expect(deleteRoundTeams(completedRound.id)).resolves.toBe(pausedRound);
    expect(prisma.team.deleteMany).toHaveBeenCalledWith({ where: { roundId: completedRound.id } });
    expect(prisma.generationAudit.deleteMany).toHaveBeenCalledWith({ where: { roundId: completedRound.id } });
    expect(prisma.round.update).toHaveBeenCalledWith({
      where: { id: completedRound.id },
      data: {
        status: "PAUSED",
        randomSeed: null,
        generationStartedAt: null,
        generatedAt: null,
        completedAt: null,
      },
    });
    expect(publishRoundEvent).toHaveBeenCalledWith(completedRound.id, "round.updated", { status: "PAUSED" });
    expect(publishRoundEvent).toHaveBeenCalledWith(completedRound.id, "results.updated", { available: false });
  });

  it("조 편성 전 회차는 삭제 대상으로 받지 않는다", async () => {
    vi.mocked(prisma.round.findUnique).mockResolvedValue({ ...scheduledRound, status: "OPEN" });

    await expect(deleteRoundTeams(scheduledRound.id)).rejects.toMatchObject({
      status: 409,
      code: "ROUND_NOT_OPEN",
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("reopenRoundVoting", () => {
  beforeEach(() => vi.clearAllMocks());

  it("일시 중지 회차의 투표를 참가자 유지 상태로 30분 동안 다시 연다", async () => {
    const now = new Date("2026-07-20T01:00:00.000Z");
    const pausedRound = { ...scheduledRound, status: "PAUSED", flowMode: "LOCATION_FIRST" } as Round;
    const reopenedRound = {
      ...pausedRound,
      status: "OPEN",
      opensAt: now,
      closesAt: new Date("2026-07-20T01:30:00.000Z"),
      locationClosesAt: null,
    } as Round;
    vi.mocked(prisma.round.findUnique).mockResolvedValue(pausedRound);
    vi.mocked(prisma.round.updateMany).mockResolvedValue({ count: 1 });
    vi.mocked(prisma.round.findUniqueOrThrow).mockResolvedValue(reopenedRound);

    await expect(reopenRoundVoting(pausedRound.id, now)).resolves.toBe(reopenedRound);
    expect(prisma.round.updateMany).toHaveBeenCalledWith({
      where: { id: pausedRound.id, status: "PAUSED" },
      data: {
        status: "OPEN",
        opensAt: now,
        closesAt: new Date("2026-07-20T01:30:00.000Z"),
        locationClosesAt: null,
      },
    });
    expect(publishRoundEvent).toHaveBeenCalledWith(pausedRound.id, "round.updated", { status: "OPEN" });
  });

  it("일시 중지 상태가 아닌 회차는 다시 열지 않는다", async () => {
    vi.mocked(prisma.round.findUnique).mockResolvedValue({ ...scheduledRound, status: "COMPLETED" });

    await expect(reopenRoundVoting(scheduledRound.id)).rejects.toMatchObject({
      status: 409,
      code: "ROUND_NOT_OPEN",
    });
    expect(prisma.round.updateMany).not.toHaveBeenCalled();
  });
});

describe("runSchedulerTick", () => {
  beforeEach(() => vi.resetAllMocks());

  it("예약 시각이 지난 SCHEDULED 회차를 기존 스케줄대로 연다", async () => {
    const now = new Date("2026-07-22T00:00:00.000Z");
    const round = { ...scheduledRound, opensAt: new Date("2026-07-21T23:59:00.000Z") } as Round;
    vi.mocked(prisma.round.findUnique).mockResolvedValue(round);
    vi.mocked(prisma.round.findMany)
      .mockResolvedValueOnce([round])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    vi.mocked(prisma.round.updateMany).mockResolvedValue({ count: 1 });

    await runSchedulerTick(now);

    expect(prisma.round.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [round.id] }, status: "SCHEDULED" },
      data: { status: "OPEN" },
    });
    expect(publishRoundEvent).toHaveBeenCalledWith(round.id, "round.updated", { status: "OPEN" });
  });

  it("마감 시각이 지난 OPEN 회차를 기존 스케줄대로 자동 편성한다", async () => {
    const now = new Date("2026-07-22T02:31:00.000Z");
    const dueRound = {
      ...scheduledRound,
      status: "OPEN",
      flowMode: "LOCATION_FIRST",
      closesAt: new Date("2026-07-22T02:30:00.000Z"),
      randomSeed: "scheduler-seed",
      historyWeeks: 0,
      targetGroupMinSize: 4,
      targetGroupMaxSize: 5,
      randomAttempts: 10,
      registrations: [],
    };
    const completedRound = { ...dueRound, status: "COMPLETED" };
    vi.mocked(prisma.round.findUnique).mockResolvedValue(dueRound as never);
    vi.mocked(prisma.round.findMany)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([dueRound] as never)
      .mockResolvedValueOnce([]);
    vi.mocked(prisma.round.updateMany).mockResolvedValue({ count: 1 });
    vi.mocked(prisma.round.findUniqueOrThrow)
      .mockResolvedValueOnce(dueRound as never)
      .mockResolvedValueOnce(completedRound as never);
    vi.mocked(prisma.generationAudit.create).mockResolvedValue({} as never);
    vi.mocked(prisma.round.update).mockResolvedValue(completedRound as never);
    vi.mocked(prisma.$transaction).mockImplementation(async (operation) => {
      if (typeof operation === "function") return operation(prisma as never) as never;
      return Promise.all(operation as never) as never;
    });

    await runSchedulerTick(now);

    expect(prisma.generationAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ roundId: dueRound.id, trigger: "SCHEDULER" }),
    });
    expect(prisma.round.update).toHaveBeenCalledWith({
      where: { id: dueRound.id },
      data: expect.objectContaining({ status: "COMPLETED" }),
    });
    expect(publishRoundEvent).toHaveBeenCalledWith(dueRound.id, "results.updated", { available: true });
  });

  it("PAUSED 회차는 scheduler가 자동으로 열거나 편성하지 않는다", async () => {
    const pausedRound = { ...scheduledRound, status: "PAUSED" } as Round;
    vi.mocked(prisma.round.findUnique).mockResolvedValue(pausedRound);
    vi.mocked(prisma.round.findMany).mockResolvedValue([]);

    await runSchedulerTick(new Date("2026-07-22T02:31:00.000Z"));

    expect(prisma.round.updateMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(publishRoundEvent).not.toHaveBeenCalled();
  });

  it("장소 선택 마감이 지난 LOCATION_SELECTION 회차를 자동 완료한다", async () => {
    const now = new Date("2026-07-22T02:41:00.000Z");
    const selectingRound = {
      ...scheduledRound,
      status: "LOCATION_SELECTION",
      locationClosesAt: new Date("2026-07-22T02:40:00.000Z"),
    } as Round;
    vi.mocked(prisma.round.findUnique).mockResolvedValue(selectingRound);
    vi.mocked(prisma.round.findMany)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([selectingRound]);
    vi.mocked(prisma.round.updateMany).mockResolvedValue({ count: 1 });

    await runSchedulerTick(now);

    expect(prisma.round.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [selectingRound.id] }, status: "LOCATION_SELECTION" },
      data: { status: "COMPLETED", completedAt: now },
    });
    expect(publishRoundEvent).toHaveBeenCalledWith(selectingRound.id, "round.updated", { status: "COMPLETED" });
    expect(publishRoundEvent).toHaveBeenCalledWith(selectingRound.id, "results.updated", { available: true });
  });
});
