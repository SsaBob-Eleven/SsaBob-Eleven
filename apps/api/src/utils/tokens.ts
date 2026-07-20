import { createHmac, randomBytes } from "node:crypto";
import { env } from "../config/env.js";

export function createEditToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashEditToken(token) };
}
export function hashEditToken(token: string): string {
  return createHmac("sha256", env.EDIT_TOKEN_PEPPER).update(token).digest("hex");
}
