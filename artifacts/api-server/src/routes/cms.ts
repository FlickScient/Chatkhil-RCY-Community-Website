import {
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import {
  Router,
  type IRouter,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { and, count, desc, eq, ilike, or } from "drizzle-orm";
import {
  AdminLoginBody,
  AdminLoginResponse,
  AdminLogoutResponse,
  ChangeAdminPasswordBody,
  ChangeAdminPasswordResponse,
  CheckApplicationStatusQueryParams,
  CheckApplicationStatusResponse,
  CreateAdminContentBody,
  CreateAdminContentQueryParams,
  CreateAdminContentResponse,
  CreateAdminUserBody,
  CreateAdminUserResponse,
  GetEditorAccessRequestsResponse,
  ReviewEditorAccessRequestBody,
  ReviewEditorAccessRequestParams,
  ReviewEditorAccessRequestResponse,
  SubmitEditorAccessRequestBody,
  SubmitEditorAccessRequestResponse,
  DeleteAdminUserParams,
  DeleteAdminUserResponse,
  DeleteAdminContentParams,
  DeleteAdminContentResponse,
  GetAdminApplicationsQueryParams,
  GetAdminContentQueryParams,
  GetAdminMessagesResponse,
  GetAdminOverviewResponse,
  GetAdminSessionResponse,
  GetAdminSiteResponse,
  GetAdminUsersResponse,
  GetPublicContentItemParams,
  GetPublicContentItemResponse,
  GetPublicContentQueryParams,
  GetPublicContentResponse,
  GetSiteResponse,
  MarkAdminMessageReadParams,
  MarkAdminMessageReadResponse,
  SendContactMessageBody,
  SendContactMessageResponse,
  SubmitApplicationBody,
  SubmitApplicationResponse,
  UpdateAdminContentBody,
  UpdateAdminContentParams,
  UpdateAdminContentResponse,
  UpdateAdminSiteBody,
  UpdateAdminSiteResponse,
  UpdateAdminUserRoleBody,
  UpdateAdminUserRoleParams,
  UpdateAdminUserRoleResponse,
  UpdateApplicationStatusBody,
  UpdateApplicationStatusParams,
  UpdateApplicationStatusResponse,
} from "@workspace/api-zod";
import {
  adminSessionsTable,
  adminUsersTable,
  applicationsTable,
  contactMessagesTable,
  contentItemsTable,
  editorAccessRequestsTable,
  db,
  siteDataTable,
} from "@workspace/db";
import {
  clearAdminCookie,
  createAdminSession,
  getAdminSession,
  issueAdminCookie,
  removeAdminSession,
  requireAdmin,
  type AdminSession,
} from "../lib/adminSession";

const router: IRouter = Router();
const protectedRouter: IRouter = Router();
const contentCollections = new Set([
  "programs",
  "news",
  "events",
  "gallery",
  "people",
  "notices",
  "faq",
  "testimonials",
  "pages",
  "menu",
]);

const defaultSiteData = {
  settings: {
    siteName: { bn: "চাটখিল আর.সি.ওয়াই ইউনিট", en: "Chatkhil RCY Unit" },
    collegeName: {
      bn: "চাটখিল পাঁচগাঁও মাহবুব সরকারি কলেজ",
      en: "Chatkhil Panchgaon Mahbub Government College",
    },
    email: "Chatkhilcollege2023@gmail.com",
    phone: "032275002",
    website: "cmpe.edu.bd",
    minAge: null,
    maxAge: null,
    address: {
      bn: "চাটখিল, নোয়াখালী, বাংলাদেশ",
      en: "Chatkhil, Noakhali, Bangladesh",
    },
  },
  home: {},
};

function asIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function publicContentItem(item: typeof contentItemsTable.$inferSelect) {
  return {
    ...item,
    data: normalizeStoredContent(item.data) as Record<string, unknown>,
    updatedAt: asIso(item.updatedAt),
  };
}

function normalizeStoredContent(value: unknown): unknown {
  if (typeof value === "string") return value.replaceAll("\\n", "\n");
  if (Array.isArray(value)) return value.map(normalizeStoredContent);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key,
        normalizeStoredContent(nested),
      ]),
    );
  }
  return value;
}

function applicationRecord(item: typeof applicationsTable.$inferSelect) {
  return {
    id: item.id,
    applicationId: item.applicationId,
    academicYear: item.academicYear,
    name: item.name,
    rollNo: item.rollNo,
    guardianMobile: item.guardianMobile,
    photoPath: item.photoPath,
    status: item.status as "pending" | "approved" | "rejected",
    note: item.note,
    submittedAt: asIso(item.submittedAt),
    data: item.data,
  };
}

function contactMessage(item: typeof contactMessagesTable.$inferSelect) {
  return {
    ...item,
    createdAt: asIso(item.createdAt),
  };
}

function recordId(request: Request, key = "id"): string | null {
  const raw = request.params[key];
  return typeof raw === "string" ? raw : raw?.[0] ?? null;
}

function isMobileNumber(value: string): boolean {
  return /^01[0-9]{9}$/.test(value);
}

function calculateAge(dateValue: Date | string): number | null {
  const dob =
    dateValue instanceof Date
      ? dateValue
      : new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(dob.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDelta = today.getMonth() - dob.getMonth();
  if (
    monthDelta < 0 ||
    (monthDelta === 0 && today.getDate() < dob.getDate())
  ) {
    age -= 1;
  }
  return age;
}

function getAgeLimit(settings: Record<string, unknown> | undefined, key: "minAge" | "maxAge"): number | undefined {
  const value = settings?.[key];
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 120
    ? value
    : undefined;
}

function hasInvalidAgeLimit(value: unknown): boolean {
  return value !== null && value !== undefined &&
    (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 120);
}

function matchesPassword(password: string, storedHash: string): boolean {
  const [algorithm, saltHex, digestHex] = storedHash.split("$");
  if (
    algorithm !== "scrypt" ||
    !saltHex ||
    !digestHex ||
    !/^[a-f0-9]{32}$/i.test(saltHex) ||
    !/^[a-f0-9]{128}$/i.test(digestHex)
  ) {
    return false;
  }
  const expected = Buffer.from(digestHex, "hex");
  const actual = scryptSync(password, Buffer.from(saltHex, "hex"), 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const digest = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${digest.toString("hex")}`;
}

function adminRole(role: string): AdminSession["role"] {
  return role === "editor" ? "editor" : "super_admin";
}

function validateCollection(value: unknown): value is string {
  return typeof value === "string" && contentCollections.has(value);
}

function requireSuperAdmin(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const admin = response.locals.admin as AdminSession | undefined;
  if (!admin || admin.role !== "super_admin") {
    response.status(403).json({ error: "Super Admin access required" });
    return;
  }
  next();
}

router.get("/site", async (_request, response): Promise<void> => {
  const [site] = await db
    .select()
    .from(siteDataTable)
    .where(eq(siteDataTable.key, "main"))
    .limit(1);
  response.json(
    GetSiteResponse.parse(
      site
        ? {
            settings: {
              ...defaultSiteData.settings,
              ...(normalizeStoredContent(site.settings) as Record<string, unknown>),
            },
            home: normalizeStoredContent(site.home) as Record<string, unknown>,
          }
        : defaultSiteData,
    ),
  );
});

router.get("/content", async (request, response): Promise<void> => {
  const parsed = GetPublicContentQueryParams.safeParse(request.query);
  if (!parsed.success || !validateCollection(parsed.data.collection)) {
    response.status(400).json({ error: "Unknown content collection" });
    return;
  }
  const items = await db
    .select()
    .from(contentItemsTable)
    .where(
      and(
        eq(contentItemsTable.collection, parsed.data.collection),
        eq(contentItemsTable.status, "published"),
      ),
    )
    .orderBy(contentItemsTable.position, desc(contentItemsTable.updatedAt));
  response.json(
    GetPublicContentResponse.parse(items.map(publicContentItem)),
  );
});

router.get("/content/:slug", async (request, response): Promise<void> => {
  const parsed = GetPublicContentItemParams.safeParse(request.params);
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid content slug" });
    return;
  }
  const [item] = await db
    .select()
    .from(contentItemsTable)
    .where(
      and(
        eq(contentItemsTable.slug, parsed.data.slug),
        eq(contentItemsTable.status, "published"),
      ),
    )
    .limit(1);
  if (!item) {
    response.status(404).json({ error: "Content not found" });
    return;
  }
  response.json(
    GetPublicContentItemResponse.parse(publicContentItem(item)),
  );
});

router.post("/applications", async (request, response): Promise<void> => {
  const parsed = SubmitApplicationBody.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.message });
    return;
  }
  const data = parsed.data;
  if (!isMobileNumber(data.guardianMobile)) {
    response.status(400).json({ error: "Use a Bangladeshi mobile number in 01XXXXXXXXX format." });
    return;
  }
  const [site] = await db
    .select({ settings: siteDataTable.settings })
    .from(siteDataTable)
    .where(eq(siteDataTable.key, "main"))
    .limit(1);
  const settings = site?.settings as Record<string, unknown> | undefined;
  const minAge = getAgeLimit(settings, "minAge");
  const maxAge = getAgeLimit(settings, "maxAge");
  const age = calculateAge(data.dateOfBirth);
  if (
    (minAge !== undefined || maxAge !== undefined) &&
    (age === null || (minAge !== undefined && age < minAge) || (maxAge !== undefined && age > maxAge))
  ) {
    response.status(400).json({ error: "Applicant age is outside the configured limits." });
    return;
  }
  const applicationId = `RCY-${new Date().getFullYear()}-${randomUUID()
    .replaceAll("-", "")
    .slice(0, 8)
    .toUpperCase()}`;
  try {
    const [record] = await db
      .insert(applicationsTable)
      .values({
        id: randomUUID(),
        applicationId,
        academicYear: data.academicYear,
        rollNo: data.rollNo,
        name: data.name,
        guardianMobile: data.guardianMobile,
        photoPath: data.photoPath,
        data: normalizeStoredContent((({ photoPath: _photo, ...rest }) => rest)(data)) as Record<string, unknown>,
      })
      .returning();
    response.status(201).json(
      SubmitApplicationResponse.parse({
        applicationId: record.applicationId,
        status: record.status,
        submittedAt: record.submittedAt.toISOString(),
      }),
    );
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23505"
    ) {
      response.status(409).json({
        error: "An application already exists for this roll number and academic year.",
      });
      return;
    }
    throw error;
  }
});

router.get("/applications/status", async (request, response): Promise<void> => {
  const parsed = CheckApplicationStatusQueryParams.safeParse(request.query);
  if (!parsed.success || !isMobileNumber(parsed.data.mobile)) {
    response.status(400).json({ error: "Enter a valid application ID and mobile number." });
    return;
  }
  const [record] = await db
    .select()
    .from(applicationsTable)
    .where(
      and(
        eq(applicationsTable.applicationId, parsed.data.applicationId),
        eq(applicationsTable.guardianMobile, parsed.data.mobile),
      ),
    )
    .limit(1);
  if (!record) {
    response.status(404).json({ error: "Application not found" });
    return;
  }
  response.json(
    CheckApplicationStatusResponse.parse({
      applicationId: record.applicationId,
      status: record.status,
      note: record.note,
      submittedAt: record.submittedAt.toISOString(),
    }),
  );
});

router.post("/contact", async (request, response): Promise<void> => {
  const parsed = SendContactMessageBody.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.message });
    return;
  }
  const data = parsed.data;
  await db.insert(contactMessagesTable).values({
    id: randomUUID(),
    name: normalizeStoredContent(data.name.trim()) as string,
    email: (normalizeStoredContent(data.email.trim()) as string).toLowerCase(),
    phone: data.phone ? (normalizeStoredContent(data.phone.trim()) as string) || null : null,
    subject: normalizeStoredContent(data.subject.trim()) as string,
    message: normalizeStoredContent(data.message.trim()) as string,
  });
  response.status(201).json(
    SendContactMessageResponse.parse({
      success: true,
      message: "Your message has been received.",
    }),
  );
});

router.post("/admin/auth/login", async (request, response): Promise<void> => {
  const parsed = AdminLoginBody.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Enter your email and password." });
    return;
  }
  const email = parsed.data.email.trim().toLowerCase();
  const [existingUser] = await db
    .select()
    .from(adminUsersTable)
    .where(eq(adminUsersTable.email, email))
    .limit(1);
  let user = existingUser;
  if (!user) {
    const configuredEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const configuredHash = process.env.ADMIN_PASSWORD_HASH;
    if (!configuredEmail || !configuredHash) {
      response.status(503).json({
        error:
          "Admin sign-in is not configured. Set ADMIN_EMAIL and ADMIN_PASSWORD_HASH in Secrets.",
      });
      return;
    }
    if (email === configuredEmail && matchesPassword(parsed.data.password, configuredHash)) {
      await db
        .insert(adminUsersTable)
        .values({
          email,
          passwordHash: configuredHash,
          role: "super_admin",
        })
        .onConflictDoNothing();
      const [createdUser] = await db
        .select()
        .from(adminUsersTable)
        .where(eq(adminUsersTable.email, email))
        .limit(1);
      user = createdUser;
    }
  }
  if (!user || !matchesPassword(parsed.data.password, user.passwordHash)) {
    response.status(401).json({ error: "Email or password is incorrect." });
    return;
  }
  const admin: AdminSession = {
    email: user.email,
    role: adminRole(user.role),
  };
  const sessionId = randomUUID();
  await createAdminSession(sessionId, admin);
  issueAdminCookie(response, sessionId);
  response.json(AdminLoginResponse.parse(admin));
});

router.post("/admin/auth/logout", async (request, response): Promise<void> => {
  await removeAdminSession(request);
  clearAdminCookie(response);
  response.json(
    AdminLogoutResponse.parse({
      success: true,
      message: "Signed out.",
    }),
  );
});

router.get("/admin/auth/me", async (request, response): Promise<void> => {
  const admin = await getAdminSession(request);
  if (!admin) {
    response.status(401).json({ error: "Admin sign-in required" });
    return;
  }
  response.json(GetAdminSessionResponse.parse(admin));
});

router.post("/admin/editor-access-requests", async (request, response): Promise<void> => {
  const parsed = SubmitEditorAccessRequestBody.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.message });
    return;
  }

  const email = parsed.data.email.trim().toLowerCase();
  const acknowledgement = {
    success: true,
    message: "Request received. If approved, you can sign in with this email and password.",
  };
  const [existingUser] = await db
    .select({ email: adminUsersTable.email })
    .from(adminUsersTable)
    .where(eq(adminUsersTable.email, email))
    .limit(1);
  if (existingUser) {
    response.status(202).json(SubmitEditorAccessRequestResponse.parse(acknowledgement));
    return;
  }

  const [existingRequest] = await db
    .select()
    .from(editorAccessRequestsTable)
    .where(eq(editorAccessRequestsTable.email, email))
    .limit(1);
  if (existingRequest && existingRequest.status !== "rejected") {
    response.status(202).json(SubmitEditorAccessRequestResponse.parse(acknowledgement));
    return;
  }

  const passwordHash = hashPassword(parsed.data.password);
  if (existingRequest) {
    await db
      .update(editorAccessRequestsTable)
      .set({ passwordHash, status: "pending", createdAt: new Date(), reviewedAt: null, reviewedBy: null })
      .where(eq(editorAccessRequestsTable.id, existingRequest.id));
  } else {
    try {
      await db.insert(editorAccessRequestsTable).values({
        id: randomUUID(), email, passwordHash, status: "pending",
      });
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
        response.status(202).json(SubmitEditorAccessRequestResponse.parse(acknowledgement));
        return;
      }
      throw error;
    }
  }

  response.status(202).json(SubmitEditorAccessRequestResponse.parse(acknowledgement));
});

protectedRouter.use(requireAdmin);

protectedRouter.get(
  "/admin/editor-access-requests",
  requireSuperAdmin,
  async (_request, response): Promise<void> => {
    const requests = await db
      .select({ id: editorAccessRequestsTable.id, email: editorAccessRequestsTable.email, createdAt: editorAccessRequestsTable.createdAt })
      .from(editorAccessRequestsTable)
      .where(eq(editorAccessRequestsTable.status, "pending"))
      .orderBy(desc(editorAccessRequestsTable.createdAt));
    response.json(GetEditorAccessRequestsResponse.parse(requests.map((item) => ({
      ...item,
      createdAt: item.createdAt.toISOString(),
    }))));
  },
);

protectedRouter.patch(
  "/admin/editor-access-requests/:requestId",
  requireSuperAdmin,
  async (request, response): Promise<void> => {
    const params = ReviewEditorAccessRequestParams.safeParse(request.params);
    const parsed = ReviewEditorAccessRequestBody.safeParse(request.body);
    if (!params.success || !parsed.success) {
      response.status(400).json({ error: "Invalid editor access review." });
      return;
    }

    const admin = response.locals.admin as AdminSession;
    let result: "success" | "missing" | "invalid_password";
    try {
      result = await db.transaction(async (tx) => {
        const [editorRequest] = await tx
          .select()
          .from(editorAccessRequestsTable)
          .where(and(
            eq(editorAccessRequestsTable.id, params.data.requestId),
            eq(editorAccessRequestsTable.status, "pending"),
          ))
          .limit(1);
        if (!editorRequest) return "missing";
        if (parsed.data.decision === "approve" && !editorRequest.passwordHash) return "invalid_password";

        const approved = parsed.data.decision === "approve";
        const [updated] = await tx
          .update(editorAccessRequestsTable)
          .set({
            status: approved ? "approved" : "rejected",
            passwordHash: null,
            reviewedAt: new Date(),
            reviewedBy: admin.email,
          })
          .where(and(
            eq(editorAccessRequestsTable.id, editorRequest.id),
            eq(editorAccessRequestsTable.status, "pending"),
          ))
          .returning({ id: editorAccessRequestsTable.id });
        if (!updated) return "missing";

        if (approved) {
          const [createdUser] = await tx
            .insert(adminUsersTable)
            .values({ email: editorRequest.email, passwordHash: editorRequest.passwordHash!, role: "editor" })
            .onConflictDoNothing()
            .returning({ email: adminUsersTable.email });
          if (!createdUser) throw new Error("EDITOR_ACCESS_ACCOUNT_EXISTS");
        }
        return "success";
      });
    } catch (error) {
      if (error instanceof Error && error.message === "EDITOR_ACCESS_ACCOUNT_EXISTS") {
        response.status(409).json({ error: "An admin with that email already exists." });
        return;
      }
      throw error;
    }

    if (result === "missing") {
      response.status(404).json({ error: "Editor access request is no longer pending." });
      return;
    }
    if (result === "invalid_password") {
      response.status(409).json({ error: "Editor access request is incomplete." });
      return;
    }
    response.json(ReviewEditorAccessRequestResponse.parse({
      success: true,
      message: parsed.data.decision === "approve" ? "Editor access approved." : "Editor access request rejected.",
    }));
  },
);

protectedRouter.post(
  "/admin/auth/change-password",
  async (request, response): Promise<void> => {
    const parsed = ChangeAdminPasswordBody.safeParse(request.body);
    const admin = response.locals.admin as AdminSession;
    if (!parsed.success) {
      response.status(400).json({ error: parsed.error.message });
      return;
    }
    const [user] = await db
      .select()
      .from(adminUsersTable)
      .where(eq(adminUsersTable.email, admin.email))
      .limit(1);
    if (!user || !matchesPassword(parsed.data.currentPassword, user.passwordHash)) {
      response.status(401).json({ error: "Current password is incorrect." });
      return;
    }
    await db
      .update(adminUsersTable)
      .set({
        passwordHash: hashPassword(parsed.data.newPassword),
        updatedAt: new Date(),
      })
      .where(eq(adminUsersTable.email, admin.email));
    await db
      .delete(adminSessionsTable)
      .where(eq(adminSessionsTable.email, admin.email));
    const sessionId = randomUUID();
    await createAdminSession(sessionId, admin);
    issueAdminCookie(response, sessionId);
    response.json(ChangeAdminPasswordResponse.parse(admin));
  },
);

protectedRouter.get(
  "/admin/users",
  requireSuperAdmin,
  async (_request, response): Promise<void> => {
    const users = await db
      .select({
        email: adminUsersTable.email,
        role: adminUsersTable.role,
        createdAt: adminUsersTable.createdAt,
      })
      .from(adminUsersTable)
      .orderBy(adminUsersTable.createdAt);
    response.json(
      GetAdminUsersResponse.parse(
        users.map((user) => ({ ...user, role: adminRole(user.role) })),
      ),
    );
  },
);

protectedRouter.post(
  "/admin/users",
  requireSuperAdmin,
  async (request, response): Promise<void> => {
    const parsed = CreateAdminUserBody.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: parsed.error.message });
      return;
    }
    try {
      const [user] = await db
        .insert(adminUsersTable)
        .values({
          email: parsed.data.email.trim().toLowerCase(),
          passwordHash: hashPassword(parsed.data.password),
          role: parsed.data.role,
        })
        .returning({
          email: adminUsersTable.email,
          role: adminUsersTable.role,
          createdAt: adminUsersTable.createdAt,
        });
      response.status(201).json(
        CreateAdminUserResponse.parse({
          ...user,
          role: adminRole(user.role),
        }),
      );
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "23505"
      ) {
        response.status(409).json({ error: "An admin with that email already exists." });
        return;
      }
      throw error;
    }
  },
);

protectedRouter.patch(
  "/admin/users/:email/role",
  requireSuperAdmin,
  async (request, response): Promise<void> => {
    const parsedParams = UpdateAdminUserRoleParams.safeParse(request.params);
    const parsedBody = UpdateAdminUserRoleBody.safeParse(request.body);
    if (!parsedParams.success || !parsedBody.success) {
      response.status(400).json({ error: "Invalid admin role update." });
      return;
    }
    const targetEmail = parsedParams.data.email.toLowerCase();
    const [existing] = await db
      .select()
      .from(adminUsersTable)
      .where(eq(adminUsersTable.email, targetEmail))
      .limit(1);
    if (!existing) {
      response.status(404).json({ error: "Admin account not found." });
      return;
    }
    if (existing.role === "super_admin" && parsedBody.data.role !== "super_admin") {
      const [superAdmins] = await db
        .select({ value: count() })
        .from(adminUsersTable)
        .where(eq(adminUsersTable.role, "super_admin"));
      if ((superAdmins?.value ?? 0) <= 1) {
        response.status(409).json({ error: "At least one Super Admin must remain." });
        return;
      }
    }
    const [updated] = await db
      .update(adminUsersTable)
      .set({ role: parsedBody.data.role, updatedAt: new Date() })
      .where(eq(adminUsersTable.email, targetEmail))
      .returning({
        email: adminUsersTable.email,
        role: adminUsersTable.role,
        createdAt: adminUsersTable.createdAt,
      });
    response.json(
      UpdateAdminUserRoleResponse.parse({
        ...updated,
        role: adminRole(updated.role),
      }),
    );
  },
);

protectedRouter.delete(
  "/admin/users/:email",
  requireSuperAdmin,
  async (request, response): Promise<void> => {
    const parsed = DeleteAdminUserParams.safeParse(request.params);
    const admin = response.locals.admin as AdminSession;
    if (!parsed.success) {
      response.status(400).json({ error: "Invalid admin email." });
      return;
    }
    const targetEmail = parsed.data.email.toLowerCase();
    if (targetEmail === admin.email) {
      response.status(400).json({ error: "You cannot delete your own account." });
      return;
    }
    const [target] = await db
      .select()
      .from(adminUsersTable)
      .where(eq(adminUsersTable.email, targetEmail))
      .limit(1);
    if (!target) {
      response.status(404).json({ error: "Admin account not found." });
      return;
    }
    if (target.role === "super_admin") {
      const [superAdmins] = await db
        .select({ value: count() })
        .from(adminUsersTable)
        .where(eq(adminUsersTable.role, "super_admin"));
      if ((superAdmins?.value ?? 0) <= 1) {
        response.status(409).json({ error: "At least one Super Admin must remain." });
        return;
      }
    }
    await db
      .delete(adminSessionsTable)
      .where(eq(adminSessionsTable.email, targetEmail));
    await db
      .delete(adminUsersTable)
      .where(eq(adminUsersTable.email, targetEmail));
    response.json(
      DeleteAdminUserResponse.parse({
        success: true,
        message: "Admin account deleted.",
      }),
    );
  },
);

protectedRouter.get("/admin/overview", async (_request, response): Promise<void> => {
  const [pending] = await db
    .select({ value: count() })
    .from(applicationsTable)
    .where(eq(applicationsTable.status, "pending"));
  const [approved] = await db
    .select({ value: count() })
    .from(applicationsTable)
    .where(eq(applicationsTable.status, "approved"));
  const [rejected] = await db
    .select({ value: count() })
    .from(applicationsTable)
    .where(eq(applicationsTable.status, "rejected"));
  const [unread] = await db
    .select({ value: count() })
    .from(contactMessagesTable)
    .where(eq(contactMessagesTable.read, false));
  const recentApplications = await db
    .select({
      applicationId: applicationsTable.applicationId,
      name: applicationsTable.name,
      status: applicationsTable.status,
      submittedAt: applicationsTable.submittedAt,
    })
    .from(applicationsTable)
    .orderBy(desc(applicationsTable.submittedAt))
    .limit(5);
  response.json(
    GetAdminOverviewResponse.parse({
      applications: {
        pending: pending?.value ?? 0,
        approved: approved?.value ?? 0,
        rejected: rejected?.value ?? 0,
      },
      unreadMessages: unread?.value ?? 0,
      recentActivity: recentApplications.map((item) => ({
        ...item,
        submittedAt: item.submittedAt.toISOString(),
      })),
    }),
  );
});

protectedRouter.get("/admin/site", async (_request, response): Promise<void> => {
  const [site] = await db
    .select()
    .from(siteDataTable)
    .where(eq(siteDataTable.key, "main"))
    .limit(1);
  response.json(
    GetAdminSiteResponse.parse(
      site
        ? {
            settings: {
              ...defaultSiteData.settings,
              ...(normalizeStoredContent(site.settings) as Record<string, unknown>),
            },
            home: normalizeStoredContent(site.home) as Record<string, unknown>,
          }
        : defaultSiteData,
    ),
  );
});

protectedRouter.put(
  "/admin/site",
  requireSuperAdmin,
  async (request, response): Promise<void> => {
    const parsed = UpdateAdminSiteBody.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: parsed.error.message });
      return;
    }
    const minAgeValue = parsed.data.settings.minAge;
    const maxAgeValue = parsed.data.settings.maxAge;
    if (
      hasInvalidAgeLimit(minAgeValue) ||
      hasInvalidAgeLimit(maxAgeValue) ||
      (typeof minAgeValue === "number" &&
        typeof maxAgeValue === "number" &&
        minAgeValue > maxAgeValue)
    ) {
      response.status(400).json({ error: "Age limits must be whole numbers from 0 to 120, with minimum no greater than maximum." });
      return;
    }
    const [existingSite] = await db
      .select()
      .from(siteDataTable)
      .where(eq(siteDataTable.key, "main"))
      .limit(1);
    const settings = {
      ...defaultSiteData.settings,
      ...(existingSite?.settings ?? {}),
      ...(normalizeStoredContent(parsed.data.settings) as Record<string, unknown>),
    };
    const home = {
      ...(existingSite?.home ?? {}),
      ...(normalizeStoredContent(parsed.data.home) as Record<string, unknown>),
    };
    const [site] = await db
      .insert(siteDataTable)
      .values({
        key: "main",
        settings,
        home,
      })
      .onConflictDoUpdate({
        target: siteDataTable.key,
        set: {
          settings,
          home,
          updatedAt: new Date(),
        },
      })
      .returning();
    response.json(
      UpdateAdminSiteResponse.parse({
        settings: site.settings,
        home: site.home,
      }),
    );
  },
);

protectedRouter.get("/admin/content", async (request, response): Promise<void> => {
  const parsed = GetAdminContentQueryParams.safeParse(request.query);
  if (!parsed.success || !validateCollection(parsed.data.collection)) {
    response.status(400).json({ error: "Unknown content collection" });
    return;
  }
  const items = await db
    .select()
    .from(contentItemsTable)
    .where(eq(contentItemsTable.collection, parsed.data.collection))
    .orderBy(contentItemsTable.position, desc(contentItemsTable.updatedAt));
  response.json(items.map(publicContentItem));
});

protectedRouter.post("/admin/content", async (request, response): Promise<void> => {
  const parsedQuery = CreateAdminContentQueryParams.safeParse(request.query);
  const parsedBody = CreateAdminContentBody.safeParse(request.body);
  if (
    !parsedQuery.success ||
    !validateCollection(parsedQuery.data.collection) ||
    !parsedBody.success
  ) {
    response.status(400).json({ error: "Invalid collection or content item." });
    return;
  }
  try {
    const [item] = await db
      .insert(contentItemsTable)
      .values({
        id: randomUUID(),
        collection: parsedQuery.data.collection,
        slug: parsedBody.data.slug,
        data: normalizeStoredContent(parsedBody.data.data) as Record<string, unknown>,
        status: parsedBody.data.status ?? "draft",
        position: parsedBody.data.position ?? 0,
      })
      .returning();
    response.status(201).json(
      CreateAdminContentResponse.parse(publicContentItem(item)),
    );
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23505"
    ) {
      response.status(409).json({ error: "That slug is already in use." });
      return;
    }
    throw error;
  }
});

protectedRouter.patch(
  "/admin/content/:id",
  async (request, response): Promise<void> => {
    const parsedParams = UpdateAdminContentParams.safeParse(request.params);
    const parsedBody = UpdateAdminContentBody.safeParse(request.body);
    if (!parsedParams.success || !parsedBody.success) {
      response.status(400).json({ error: "Invalid content item." });
      return;
    }
    const [item] = await db
      .update(contentItemsTable)
      .set({
        slug: parsedBody.data.slug,
        data: normalizeStoredContent(parsedBody.data.data) as Record<string, unknown>,
        ...(parsedBody.data.status ? { status: parsedBody.data.status } : {}),
        ...(parsedBody.data.position !== undefined
          ? { position: parsedBody.data.position }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(contentItemsTable.id, parsedParams.data.id))
      .returning();
    if (!item) {
      response.status(404).json({ error: "Content item not found." });
      return;
    }
    response.json(
      UpdateAdminContentResponse.parse(publicContentItem(item)),
    );
  },
);

protectedRouter.delete(
  "/admin/content/:id",
  async (request, response): Promise<void> => {
    const parsed = DeleteAdminContentParams.safeParse(request.params);
    if (!parsed.success) {
      response.status(400).json({ error: "Invalid content item ID." });
      return;
    }
    const [deleted] = await db
      .delete(contentItemsTable)
      .where(eq(contentItemsTable.id, parsed.data.id))
      .returning({ id: contentItemsTable.id });
    if (!deleted) {
      response.status(404).json({ error: "Content item not found." });
      return;
    }
    response.json(
      DeleteAdminContentResponse.parse({
        success: true,
        message: "Content item deleted.",
      }),
    );
  },
);

protectedRouter.get(
  "/admin/applications",
  async (request, response): Promise<void> => {
    const parsed = GetAdminApplicationsQueryParams.safeParse(request.query);
    if (!parsed.success) {
      response.status(400).json({ error: "Invalid application filters." });
      return;
    }
    const filters = [];
    if (parsed.data.status) {
      filters.push(eq(applicationsTable.status, parsed.data.status));
    }
    if (parsed.data.year) {
      filters.push(eq(applicationsTable.academicYear, parsed.data.year));
    }
    if (parsed.data.search?.trim()) {
      const needle = `%${parsed.data.search.trim()}%`;
      filters.push(
        or(
          ilike(applicationsTable.name, needle),
          ilike(applicationsTable.applicationId, needle),
          ilike(applicationsTable.rollNo, needle),
          ilike(applicationsTable.guardianMobile, needle),
        )!,
      );
    }
    const records = await db
      .select()
      .from(applicationsTable)
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(applicationsTable.submittedAt));
    response.json(records.map(applicationRecord));
  },
);

protectedRouter.patch(
  "/admin/applications/:id/status",
  async (request, response): Promise<void> => {
    const parsedParams = UpdateApplicationStatusParams.safeParse(request.params);
    const parsedBody = UpdateApplicationStatusBody.safeParse(request.body);
    if (!parsedParams.success || !parsedBody.success) {
      response.status(400).json({ error: "Invalid application decision." });
      return;
    }
    const [record] = await db
      .update(applicationsTable)
      .set({
        status: parsedBody.data.status,
        note: parsedBody.data.note?.trim() || null,
      })
      .where(eq(applicationsTable.id, parsedParams.data.id))
      .returning();
    if (!record) {
      response.status(404).json({ error: "Application not found." });
      return;
    }
    response.json(
      UpdateApplicationStatusResponse.parse(applicationRecord(record)),
    );
  },
);

protectedRouter.get(
  "/admin/messages",
  async (_request, response): Promise<void> => {
    const messages = await db
      .select()
      .from(contactMessagesTable)
      .orderBy(desc(contactMessagesTable.createdAt))
      .limit(300);
    response.json(
      GetAdminMessagesResponse.parse(messages.map(contactMessage)),
    );
  },
);

protectedRouter.patch(
  "/admin/messages/:id/read",
  async (request, response): Promise<void> => {
    const parsed = MarkAdminMessageReadParams.safeParse(request.params);
    if (!parsed.success) {
      response.status(400).json({ error: "Invalid message ID." });
      return;
    }
    const [message] = await db
      .update(contactMessagesTable)
      .set({ read: true })
      .where(eq(contactMessagesTable.id, parsed.data.id))
      .returning();
    if (!message) {
      response.status(404).json({ error: "Message not found." });
      return;
    }
    response.json(
      MarkAdminMessageReadResponse.parse(contactMessage(message)),
    );
  },
);

router.use(protectedRouter);

export default router;
