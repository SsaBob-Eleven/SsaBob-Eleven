import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import type { FlowMode, Location, RoundStatus } from "@prisma/client";
import { isValidParticipantName } from "@ssabap/shared";
import { z } from "zod";
import { prisma } from "../db.js";
import { AppError } from "../errors.js";
import { getEditToken, requireAdmin } from "../middleware/auth.js";
import { publishRegistrationCount, publishRoundEvent } from "../realtime/publishers.js";
import {
  createRegistration,
  deleteRegistration,
  requireEditableRegistration,
  updateRegistration,
} from "../services/registration-service.js";
import { ensureCurrentRound, generateRound, registrationRules } from "../services/round-service.js";
import { serializeRegistration, serializeRound, serializeTeam } from "../services/serializers.js";
import { clearTeamLocation, resultTeamInclude, selectTeamLocation } from "../services/team-service.js";
import { cleanDisplayName, normalizeName } from "../utils/name.js";
import { devRouter } from "./dev.js";
import { eventsRouter } from "./events.js";

const idSchema = z.string().uuid();
const locationSchema = z.enum(["FLOOR_10", "FLOOR_20", "OUTSIDE"]);
const nameSchema = z
  .string()
  .transform(cleanDisplayName)
  .refine(isValidParticipantName, "이름은 공백 없이 정확히 3글자로 입력해야 합니다.");

const registrationLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler(request, response) {
    response.status(429).json({
      error: {
        code: "RATE_LIMITED",
        message: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
        details: null,
        requestId: String(response.getHeader("X-Request-Id") ?? request.header("X-Request-Id") ?? "unknown"),
      },
    });
  },
});

export const apiRouter = Router();

apiRouter.use("/events", eventsRouter);
apiRouter.use("/dev", devRouter);

apiRouter.get("/health/live", (_request, response) => {
  response.json({ status: "ok", timestamp: new Date().toISOString() });
});

apiRouter.get("/health/ready", async (_request, response) => {
  await prisma.$queryRawUnsafe("SELECT 1");
  response.json({ status: "ok", timestamp: new Date().toISOString() });
});

apiRouter.get("/rounds/current", async (_request, response) => {
  const round = await ensureCurrentRound();
  const registrationCount = await prisma.registration.count({ where: { roundId: round.id } });
  response.json({
    data: {
      serverTime: new Date().toISOString(),
      round: serializeRound(round),
      rules: registrationRules(round),
      registrationCount,
    },
  });
});

apiRouter.post("/rounds/:roundId/registrations", registrationLimiter, async (request, response) => {
  const roundId = idSchema.parse(request.params.roundId);
  const body = z
    .object({
      name: nameSchema,
      preferredLocation: locationSchema.nullish(),
    })
    .strict()
    .parse(request.body);
  const created = await createRegistration(roundId, body.name, body.preferredLocation as Location | null | undefined);
  response.status(201).json({
    data: {
      registration: serializeRegistration(created.registration),
      editToken: created.editToken,
    },
  });
});

apiRouter.get("/registrations/:registrationId", async (request, response) => {
  const registrationId = idSchema.parse(request.params.registrationId);
  const registration = await requireEditableRegistration(registrationId, getEditToken(request));
  const teamMember = await prisma.teamMember.findUnique({
    where: { registrationId },
    include: { team: { include: resultTeamInclude } },
  });
  response.json({
    data: {
      registration: serializeRegistration(registration),
      team: teamMember ? serializeTeam(teamMember.team) : null,
    },
  });
});

apiRouter.patch("/registrations/:registrationId", registrationLimiter, async (request, response) => {
  const registrationId = idSchema.parse(request.params.registrationId);
  const body = z
    .object({ name: nameSchema.optional(), preferredLocation: locationSchema.nullable().optional() })
    .strict()
    .refine((value) => value.name !== undefined || value.preferredLocation !== undefined, "수정할 값이 필요합니다.")
    .parse(request.body);
  const registration = await updateRegistration(registrationId, getEditToken(request), {
    ...(body.name !== undefined ? { name: body.name } : {}),
    ...(body.preferredLocation !== undefined
      ? { preferredLocation: body.preferredLocation as Location | null }
      : {}),
  });
  response.json({ data: { registration: serializeRegistration(registration) } });
});

apiRouter.delete("/registrations/:registrationId", registrationLimiter, async (request, response) => {
  const registrationId = idSchema.parse(request.params.registrationId);
  await deleteRegistration(registrationId, getEditToken(request));
  response.status(204).send();
});

apiRouter.get("/rounds/:roundId/results", async (request, response) => {
  const roundId = idSchema.parse(request.params.roundId);
  const round = await prisma.round.findUnique({
    where: { id: roundId },
    include: { teams: { orderBy: { sequence: "asc" }, include: resultTeamInclude } },
  });
  if (!round) throw new AppError(404, "ROUND_NOT_FOUND", "회차를 찾을 수 없습니다.");
  if (round.status !== "LOCATION_SELECTION" && round.status !== "COMPLETED") {
    throw new AppError(409, "RESULT_NOT_READY", "아직 조 편성 결과가 준비되지 않았습니다.");
  }
  const registrationCount = await prisma.registration.count({ where: { roundId } });
  response.json({
    data: {
      serverTime: new Date().toISOString(),
      round: serializeRound(round),
      summary: {
        registrationCount,
        teamCount: round.teams.length,
        sizeAdjustedTeamCount: round.teams.filter((team) => team.sizeAdjusted).length,
        unselectedLocationCount: round.teams.filter((team) => !team.location).length,
      },
      teams: round.teams.map(serializeTeam),
    },
  });
});

apiRouter.patch("/teams/:teamId/location", registrationLimiter, async (request, response) => {
  const teamId = idSchema.parse(request.params.teamId);
  const body = z.object({ location: locationSchema }).strict().parse(request.body);
  const team = await selectTeamLocation(teamId, getEditToken(request), body.location as Location);
  response.json({ data: { team: serializeTeam(team) } });
});

apiRouter.delete("/teams/:teamId/location", registrationLimiter, async (request, response) => {
  const teamId = idSchema.parse(request.params.teamId);
  await clearTeamLocation(teamId, getEditToken(request));
  response.status(204).send();
});

const adminRouter = Router();
adminRouter.use(requireAdmin);

adminRouter.get("/rounds", async (request, response) => {
  const query = z
    .object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20) })
    .parse(request.query);
  const [rounds, totalItems] = await Promise.all([
    prisma.round.findMany({
      orderBy: { opensAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: { _count: { select: { registrations: true, teams: true } } },
    }),
    prisma.round.count(),
  ]);
  response.json({
    data: {
      items: rounds.map((round) => ({
        round: serializeRound(round),
        registrationCount: round._count.registrations,
        teamCount: round._count.teams,
      })),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / query.pageSize),
      },
    },
  });
});

adminRouter.post("/rounds", async (request, response) => {
  const body = z
    .object({
      weekKey: z.string().regex(/^\d{4}-W\d{2}$/),
      flowMode: z.enum(["LOCATION_FIRST", "TEAM_FIRST"]),
      opensAt: z.coerce.date(),
      closesAt: z.coerce.date(),
      locationClosesAt: z.coerce.date().nullable().optional(),
      groupSizePolicy: z.literal("ADAPTIVE"),
      targetGroupMinSize: z.number().int().positive().default(4),
      targetGroupMaxSize: z.number().int().positive().default(5),
      maxParticipants: z.number().int().min(1).max(26).default(26),
      historyWeeks: z.number().int().min(0).max(52).default(8),
      randomAttempts: z.number().int().min(1).max(5000).default(500),
    })
    .strict()
    .refine((value) => value.targetGroupMinSize <= value.targetGroupMaxSize, "목표 최소 인원은 최대 인원보다 클 수 없습니다.")
    .refine((value) => value.flowMode !== "TEAM_FIRST" || Boolean(value.locationClosesAt), "팀 우선 모드에는 장소 선택 마감이 필요합니다.")
    .parse(request.body);
  const now = new Date();
  const status: RoundStatus = now < body.opensAt ? "SCHEDULED" : "OPEN";
  const round = await prisma.round.create({
    data: {
      ...body,
      flowMode: body.flowMode as FlowMode,
      status,
      locationClosesAt: body.locationClosesAt ?? null,
    },
  });
  response.status(201).json({ data: { round: serializeRound(round) } });
});

adminRouter.get("/rounds/:roundId", async (request, response) => {
  const roundId = idSchema.parse(request.params.roundId);
  const round = await prisma.round.findUnique({
    where: { id: roundId },
    include: {
      registrations: { include: { participant: true }, orderBy: { createdAt: "asc" } },
      teams: { include: resultTeamInclude, orderBy: { sequence: "asc" } },
      generationAudit: true,
    },
  });
  if (!round) throw new AppError(404, "ROUND_NOT_FOUND", "회차를 찾을 수 없습니다.");
  response.json({
    data: {
      round: serializeRound(round),
      registrations: round.registrations.map(serializeRegistration),
      teams: round.teams.map(serializeTeam),
      generationAudit: round.generationAudit
        ? { ...round.generationAudit, createdAt: round.generationAudit.createdAt.toISOString() }
        : null,
    },
  });
});

adminRouter.post("/rounds/:roundId/generate", async (request, response) => {
  const roundId = idSchema.parse(request.params.roundId);
  const body = z.object({ reason: z.string().min(1).max(200).default("관리자 수동 마감") }).parse(request.body ?? {});
  await generateRound(roundId, "ADMIN", body.reason);
  const round = await prisma.round.findUniqueOrThrow({
    where: { id: roundId },
    include: { teams: { include: resultTeamInclude, orderBy: { sequence: "asc" } } },
  });
  const registrationCount = await prisma.registration.count({ where: { roundId } });
  response.json({
    data: {
      serverTime: new Date().toISOString(),
      round: serializeRound(round),
      summary: {
        registrationCount,
        teamCount: round.teams.length,
        sizeAdjustedTeamCount: round.teams.filter((team) => team.sizeAdjusted).length,
        unselectedLocationCount: round.teams.filter((team) => !team.location).length,
      },
      teams: round.teams.map(serializeTeam),
    },
  });
});

adminRouter.patch("/registrations/:registrationId", async (request, response) => {
  const registrationId = idSchema.parse(request.params.registrationId);
  const body = z
    .object({ name: nameSchema.optional(), preferredLocation: locationSchema.nullable().optional(), reason: z.string().max(200).optional() })
    .strict()
    .parse(request.body);
  const current = await prisma.registration.findUnique({ where: { id: registrationId }, include: { round: true, participant: true } });
  if (!current) throw new AppError(404, "REGISTRATION_NOT_FOUND", "참가 등록을 찾을 수 없습니다.");
  if (current.round.status !== "SCHEDULED" && current.round.status !== "OPEN") {
    throw new AppError(409, "ROUND_NOT_OPEN", "조 생성 후에는 참가 등록을 수정할 수 없습니다.");
  }
  if (body.name) {
    const displayName = cleanDisplayName(body.name);
    await prisma.participant.update({
      where: { id: current.participantId },
      data: { name: displayName, normalizedName: normalizeName(displayName) },
    });
    await prisma.registration.update({ where: { id: registrationId }, data: { displayName } });
  }
  const registration = await prisma.registration.update({
    where: { id: registrationId },
    data: body.preferredLocation !== undefined ? { preferredLocation: body.preferredLocation as Location | null } : {},
    include: { participant: true },
  });
  publishRoundEvent(current.roundId, "registration.updated", { registrationId });
  response.json({ data: { registration: serializeRegistration(registration) } });
});

adminRouter.delete("/registrations/:registrationId", async (request, response) => {
  const registrationId = idSchema.parse(request.params.registrationId);
  const registration = await prisma.registration.findUnique({ where: { id: registrationId }, include: { round: true } });
  if (!registration) throw new AppError(404, "REGISTRATION_NOT_FOUND", "참가 등록을 찾을 수 없습니다.");
  if (registration.round.status !== "SCHEDULED" && registration.round.status !== "OPEN") {
    throw new AppError(409, "ROUND_NOT_OPEN", "조 생성 후에는 참가 등록을 삭제할 수 없습니다.");
  }
  await prisma.registration.delete({ where: { id: registrationId } });
  await publishRegistrationCount(registration.roundId);
  response.status(204).send();
});

adminRouter.put("/teams/:teamId/location", async (request, response) => {
  const teamId = idSchema.parse(request.params.teamId);
  const body = z.object({ location: locationSchema.nullable() }).strict().parse(request.body);
  const existing = await prisma.team.findUnique({ where: { id: teamId }, include: { round: true } });
  if (!existing) throw new AppError(404, "TEAM_NOT_FOUND", "조를 찾을 수 없습니다.");
  if (existing.round.status !== "LOCATION_SELECTION") {
    throw new AppError(409, "TEAM_LOCATION_NOT_OPEN", "현재는 조의 장소를 지정할 수 없습니다.");
  }
  const team = await prisma.team.update({
    where: { id: teamId },
    data: { location: body.location as Location | null, locationSelectedAt: body.location ? new Date() : null },
    include: resultTeamInclude,
  });
  publishRoundEvent(existing.roundId, "team.updated", { teamId, location: body.location });
  response.json({ data: { team: serializeTeam(team) } });
});

apiRouter.use("/admin", adminRouter);
