import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const siteDataTable = pgTable("rcy_site_data", {
  key: text("key").primaryKey(),
  settings: jsonb("settings").$type<Record<string, unknown>>().notNull(),
  home: jsonb("home").$type<Record<string, unknown>>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const contentItemsTable = pgTable(
  "rcy_content_items",
  {
    id: text("id").primaryKey(),
    collection: text("collection").notNull(),
    slug: text("slug").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull(),
    status: text("status").notNull().default("draft"),
    position: integer("position").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("rcy_content_collection_slug_uq").on(
      table.collection,
      table.slug,
    ),
    index("rcy_content_collection_status_idx").on(
      table.collection,
      table.status,
    ),
  ],
);

export const applicationsTable = pgTable(
  "rcy_applications",
  {
    id: text("id").primaryKey(),
    applicationId: text("application_id").notNull().unique(),
    academicYear: text("academic_year").notNull(),
    rollNo: text("roll_no").notNull(),
    name: text("name").notNull(),
    guardianMobile: text("guardian_mobile").notNull(),
    photoPath: text("photo_path").notNull(),
    status: text("status").notNull().default("pending"),
    note: text("note"),
    data: jsonb("data").$type<Record<string, unknown>>().notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("rcy_application_year_roll_uq").on(
      table.academicYear,
      table.rollNo,
    ),
    index("rcy_application_status_idx").on(table.status),
  ],
);

export const contactMessagesTable = pgTable(
  "rcy_contact_messages",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    subject: text("subject").notNull(),
    message: text("message").notNull(),
    read: boolean("read").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("rcy_contact_created_idx").on(table.createdAt)],
);

export const adminSessionsTable = pgTable(
  "rcy_admin_sessions",
  {
    sessionId: text("session_id").primaryKey(),
    email: text("email").notNull(),
    role: text("role").notNull().default("super_admin"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("rcy_admin_session_expiry_idx").on(table.expiresAt)],
);

export const adminUsersTable = pgTable(
  "rcy_admin_users",
  {
    email: text("email").primaryKey(),
    passwordHash: text("password_hash").notNull(),
    role: text("role").notNull().default("editor"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("rcy_admin_user_role_idx").on(table.role)],
);

export const editorAccessRequestsTable = pgTable(
  "rcy_editor_access_requests",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    passwordHash: text("password_hash"),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedBy: text("reviewed_by"),
  },
  (table) => [
    uniqueIndex("rcy_editor_access_email_uq").on(table.email),
    index("rcy_editor_access_status_created_idx").on(
      table.status,
      table.createdAt,
    ),
  ],
);

export const insertContentItemSchema = createInsertSchema(contentItemsTable).omit({
  updatedAt: true,
});
export const insertApplicationSchema = createInsertSchema(applicationsTable).omit({
  submittedAt: true,
});
export const insertContactMessageSchema = createInsertSchema(
  contactMessagesTable,
).omit({ createdAt: true });

export type ContentItem = typeof contentItemsTable.$inferSelect;
export type ApplicationRecord = typeof applicationsTable.$inferSelect;
export type ContactMessage = typeof contactMessagesTable.$inferSelect;
export type SiteData = {
  settings: Record<string, unknown>;
  home: Record<string, unknown>;
};
export type ContentInsert = z.infer<typeof insertContentItemSchema>;