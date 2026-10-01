import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { and, eq, gt } from "drizzle-orm";
import { adminSessionsTable, adminUsersTable, db } from "@workspace/db";

const cookieName = "rcy_admin";
const sessionLifetimeMs = 7 * 24 * 60 * 60 * 1000;

export type AdminSession = {
  email: string;
  role: "super_admin" | "editor";
};

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value) throw new Error("SESSION_SECRET is required to sign admin sessions");
  return value;
}

function sign(sessionId: string): string {
  return createHmac("sha256", secret()).update(sessionId).digest("hex");
}

function readCookie(request: Request): string | null {
  const header = request.headers.cookie;
  if (!header) return null;
  const cookie = header
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${cookieName}=`));
  return cookie ? decodeURIComponent(cookie.slice(cookieName.length + 1)) : null;
}

export function issueAdminCookie(response: Response, sessionId: string): void {
  const secure =
    process.env.NODE_ENV === "production" ? "; Secure" : "";
  response.setHeader(
    "Set-Cookie",
    `${cookieName}=${encodeURIComponent(`${sessionId}.${sign(sessionId)}`)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor(sessionLifetimeMs / 1000)}${secure}`,
  );
}

export function clearAdminCookie(response: Response): void {
  const secure =
    process.env.NODE_ENV === "production" ? "; Secure" : "";
  response.setHeader(
    "Set-Cookie",
    `${cookieName}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`,
  );
}

export async function getAdminSession(
  request: Request,
): Promise<AdminSession | null> {
  const token = readCookie(request);
  if (!token) return null;
  const [sessionId, suppliedSignature] = token.split(".");
  if (!sessionId || !suppliedSignature) return null;

  const expectedSignature = sign(sessionId);
  const supplied = Buffer.from(suppliedSignature, "hex");
  const expected = Buffer.from(expectedSignature, "hex");
  if (
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  ) {
    return null;
  }

  const [session] = await db
    .select({
      email: adminUsersTable.email,
      role: adminUsersTable.role,
    })
    .from(adminSessionsTable)
    .innerJoin(
      adminUsersTable,
      eq(adminSessionsTable.email, adminUsersTable.email),
    )
    .where(
      and(
        eq(adminSessionsTable.sessionId, sessionId),
        gt(adminSessionsTable.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (!session) return null;
  return {
    email: session.email,
    role: session.role === "editor" ? "editor" : "super_admin",
  };
}

export async function requireAdmin(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const admin = await getAdminSession(request);
    if (!admin) {
      response.status(401).json({ error: "Admin sign-in required" });
      return;
    }
    response.locals.admin = admin;
    next();
  } catch (error) {
    request.log.error({ err: error }, "Failed to validate admin session");
    response.status(500).json({ error: "Unable to validate admin session" });
  }
}

export async function createAdminSession(
  sessionId: string,
  admin: AdminSession,
): Promise<Date> {
  const expiresAt = new Date(Date.now() + sessionLifetimeMs);
  await db.insert(adminSessionsTable).values({
    sessionId,
    email: admin.email,
    role: admin.role,
    expiresAt,
  });
  return expiresAt;
}

export async function removeAdminSession(request: Request): Promise<void> {
  const token = readCookie(request);
  if (!token) return;
  const [sessionId, suppliedSignature] = token.split(".");
  if (!sessionId || !suppliedSignature) return;
  const supplied = Buffer.from(suppliedSignature, "hex");
  const expected = Buffer.from(sign(sessionId), "hex");
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    return;
  }
  await db.delete(adminSessionsTable).where(eq(adminSessionsTable.sessionId, sessionId));
}