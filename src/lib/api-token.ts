import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { z } from "zod";
import { apiTokenScopes, type ApiTokenScope } from "@/lib/api-token-scopes";
import { prisma } from "@/lib/prisma";

export const apiTokenInputSchema = z.object({
  name: z.string().trim().min(2).max(80),
  scopes: z.array(z.enum(apiTokenScopes)).min(1, "Select at least one scope.").transform((values) => [...new Set(values)]),
  expiresAt: z.union([z.literal(""), z.iso.datetime()]).optional(),
});

export function hashApiToken(raw: string) {
  return createHash("sha256").update(raw).digest("hex");
}

export function verifyApiTokenHash(raw: string, expectedHash: string) {
  const actual = Buffer.from(hashApiToken(raw), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function generateApiToken() {
  const raw = `vfl_${randomBytes(32).toString("base64url")}`;
  return { raw, prefix: raw.slice(0, 12), tokenHash: hashApiToken(raw) };
}

export function apiError(status: number, code: string, message: string, details?: unknown) {
  return Response.json({ error: { code, message, ...(details === undefined ? {} : { details }) } }, { status });
}

export async function authenticateApiToken(request: Request, requiredScope: ApiTokenScope) {
  const authorization = request.headers.get("authorization");
  const match = authorization?.match(/^Bearer\s+(vfl_[A-Za-z0-9_-]+)$/);
  if (!match) return { ok: false as const, response: apiError(401, "unauthorized", "A valid bearer token is required.") };
  const token = await prisma.apiToken.findUnique({ where: { tokenHash: hashApiToken(match[1]) }, select: { id: true, projectId: true, prefix: true, scopes: true, expiresAt: true, revokedAt: true } });
  if (!token) return { ok: false as const, response: apiError(401, "unauthorized", "The bearer token is invalid.") };
  const now = new Date();
  if (token.revokedAt) {
    auditFailure(token, "revoked");
    return { ok: false as const, response: apiError(401, "token_revoked", "The bearer token has been revoked.") };
  }
  if (token.expiresAt && token.expiresAt <= now) {
    auditFailure(token, "expired");
    return { ok: false as const, response: apiError(401, "token_expired", "The bearer token has expired.") };
  }
  const scopes = z.array(z.enum(apiTokenScopes)).safeParse(token.scopes);
  if (!scopes.success) return { ok: false as const, response: apiError(401, "unauthorized", "The bearer token is invalid.") };
  after(() => prisma.apiToken.update({ where: { id: token.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined));
  if (!scopes.data.includes(requiredScope)) {
    auditFailure(token, "insufficient_scope", requiredScope);
    return { ok: false as const, response: apiError(403, "insufficient_scope", `This endpoint requires the ${requiredScope} scope.`) };
  }
  return { ok: true as const, token: { id: token.id, projectId: token.projectId, prefix: token.prefix, scopes: scopes.data } };
}

function auditFailure(token: { id: string; projectId: string; prefix: string }, reason: string, requiredScope?: string) {
  after(() => prisma.auditEvent.create({ data: { projectId: token.projectId, action: "API_TOKEN_AUTH_FAILED", metadata: { tokenId: token.id, prefix: token.prefix, reason, ...(requiredScope ? { requiredScope } : {}) } } }).catch(() => undefined));
}
