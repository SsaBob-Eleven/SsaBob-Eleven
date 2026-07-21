import "dotenv/config";
import { z } from "zod";
import type { Weekday } from "../utils/dates.js";

const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;
const weekdaysPattern = /^(MON|TUE|WED|THU|FRI|SAT|SUN)(,(MON|TUE|WED|THU|FRI|SAT|SUN))*$/;
const postgresUrlPattern = /^postgres(?:ql)?:\/\//;

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(3000),
    DATABASE_URL: z.string().regex(postgresUrlPattern).default("postgresql://postgres:postgres@localhost:5432/ssabap"),
    DIRECT_URL: z.string().regex(postgresUrlPattern).default("postgresql://postgres:postgres@localhost:5432/ssabap"),
    APP_TIMEZONE: z.literal("Asia/Seoul").default("Asia/Seoul"),
    APP_LOCALE: z.literal("ko-KR").default("ko-KR"),
    MAX_PARTICIPANTS_PER_ROUND: z.coerce.number().int().min(1).max(26).default(26),
    FLOW_MODE: z.enum(["LOCATION_FIRST", "TEAM_FIRST"]).default("LOCATION_FIRST"),
    VOTE_WEEKDAYS: z
      .string()
      .regex(weekdaysPattern)
      .default("MON,TUE,WED,THU,FRI")
      .transform((value) => [...new Set(value.split(","))] as Weekday[]),
    VOTE_OPEN_TIME: z.string().regex(timePattern).default("08:30"),
    VOTE_CLOSE_TIME: z.string().regex(timePattern).default("11:30"),
    TEAM_LOCATION_CLOSE_TIME: z.string().regex(timePattern).default("11:40"),
    GROUP_SIZE_POLICY: z.literal("ADAPTIVE").default("ADAPTIVE"),
    TARGET_GROUP_MIN_SIZE: z.coerce.number().int().positive().default(4),
    TARGET_GROUP_MAX_SIZE: z.coerce.number().int().positive().default(5),
    HISTORY_WEEKS: z.coerce.number().int().min(0).max(52).default(8),
    RANDOM_ATTEMPTS: z.coerce.number().int().min(1).max(5000).default(500),
    GENERATION_STALE_MINUTES: z.coerce.number().int().min(1).max(60).default(5),
    SCHEDULER_POLL_INTERVAL_MS: z.coerce.number().int().min(5000).default(30000),
    SSE_HEARTBEAT_INTERVAL_MS: z.coerce.number().int().min(5000).max(60000).default(20000),
    WEB_ORIGIN: z.string().default("http://localhost:5173"),
    ADMIN_TOKEN: z.string().min(16).default("development-admin-token-change-me"),
    EDIT_TOKEN_PEPPER: z.string().min(16).default("development-edit-token-pepper-change-me"),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  })
  .superRefine((value, context) => {
    if (value.VOTE_OPEN_TIME >= value.VOTE_CLOSE_TIME) {
      context.addIssue({
        code: "custom",
        path: ["VOTE_CLOSE_TIME"],
        message: "VOTE_CLOSE_TIME must be later than VOTE_OPEN_TIME for a daily round",
      });
    }
    if (value.FLOW_MODE === "TEAM_FIRST" && value.VOTE_CLOSE_TIME >= value.TEAM_LOCATION_CLOSE_TIME) {
      context.addIssue({
        code: "custom",
        path: ["TEAM_LOCATION_CLOSE_TIME"],
        message: "TEAM_LOCATION_CLOSE_TIME must be later than VOTE_CLOSE_TIME in TEAM_FIRST mode",
      });
    }
    if (value.TARGET_GROUP_MIN_SIZE > value.TARGET_GROUP_MAX_SIZE) {
      context.addIssue({
        code: "custom",
        path: ["TARGET_GROUP_MIN_SIZE"],
        message: "TARGET_GROUP_MIN_SIZE must be less than or equal to TARGET_GROUP_MAX_SIZE",
      });
    }
    if (
      value.NODE_ENV === "production" &&
      (value.ADMIN_TOKEN.startsWith("development-") || value.EDIT_TOKEN_PEPPER.startsWith("development-"))
    ) {
      context.addIssue({
        code: "custom",
        path: ["ADMIN_TOKEN"],
        message: "Production secrets must not use development defaults",
      });
    }
  });

export const env = schema.parse(process.env);
