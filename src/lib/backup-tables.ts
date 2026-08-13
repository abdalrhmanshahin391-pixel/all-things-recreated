/**
 * Client-safe backup metadata shared by the server functions and the admin UI.
 * Keeping it out of *.functions.ts keeps the server-fn modules thin.
 */

export const BACKUP_FORMAT = "lovable-site-backup";
export const BACKUP_VERSION = 2;

/** Full-site transfer package (code-independent clone of everything the app owns). */
export const TRANSFER_FORMAT = "aquaqbank-site-transfer";
export const TRANSFER_VERSION = 1;

export type TransferMode = "data" | "images" | "all";

export type TransferOverview = {
  counts: Record<string, number>;
  files: Array<{ bucket: string; path: string }>;
  drive_files: number;
  site_name: string | null;
  exported_at: string;
};

/**
 * Every table we back up, in strict parent-before-child order.
 * Restore walks this list top-down so a row is never written before the rows
 * it references. committee_semesters MUST stay above committee_subjects.
 */
export const BACKUP_TABLES = [
  "universities",
  "universities_settings",
  "university_tiles",
  "courses",
  "course_options",
  "subject_groups",
  "subjects",
  "questions",
  "question_options",
  "committee_years",
  "committee_semesters",
  "committee_modules",
  "committee_subjects",
  "committee_categories",
  "committee_resources",
  "committee_subject_courses",
  "study_plan_stages",
  "study_plan_subjects",
  "packages",
  "package_courses",
  "coupons",
  "coupon_courses",
  "lecture_subjects",
  "lecture_items",
  "lecture_quizzes",
  "lecture_quiz_questions",
  "lecture_quiz_options",
  "german_courses",
  "german_subjects",
  "german_items",
  "german_sentence_entries",
  "german_word_entries",
  "german_quizzes",
  "german_quiz_questions",
  "german_quiz_options",
  "site_settings",
  "site_content",
  "site_pages",
  "site_sections",
  "site_blocks",
  "site_nav_items",
  "about_blocks",
  "guides",
  "study_hub_tiles",
  "study_subjects",
  "study_topics",
  "study_exams",
  "site_announcements",
  "support_settings",
  "support_channels",
  "mentor_categories",
  "mentor_tasks",
  "mentor_entries",
  "mentor_treasures",
  "mentor_journal",
  "mentor_task_completions",
  "admin_hub_layout",
  "admin_ai_model_limits",
  "support_requests",
  "notes",
  "summaries",
  "coupon_redemptions",
  "content_consents",
  "sonic_pdfs",
  "sonic_jobs",
  "sonic_chunks",
  "jarvis_batch_jobs",
  "jarvis_batch_v2_jobs",
  "jarvis_batch_v2_chunks",
  "device_security_settings",
  "profiles",
  "user_roles",
  "user_courses",
  "user_lecture_courses",
  "package_purchases",
  "user_groups",
  "user_group_members",
  "announcement_audiences",
  "user_devices",
  "jarvis_batch_v2_ipad_jobs",
  "jarvis_batch_v2_ipad_chunks",
  "jarvis_batch_german_ipad_jobs",
  "jarvis_batch_german_ipad_chunks",
] as const;

export type BackupTable = (typeof BACKUP_TABLES)[number];

export const BACKUP_TABLE_LIST: string[] = [...BACKUP_TABLES];

/**
 * Tables included in an export for the record, but never written back on a
 * restore (history must not be overwritten).
 */
export const EXPORT_ONLY_TABLES = [
  "committee_activity_log",
  "payment_events",
  "content_events",
  "device_unlock_attempts",
  "user_login_events",
  "user_sessions",
  "question_attempts",
  "question_flags",
  "lecture_quiz_attempts",
  "german_attempts",
  "german_flags",
  "german_voice_attempts",
  "german_shadowing_sessions",
  "study_focus_sessions",
  "question_gen_batches",
] as const;
export const EXPORT_TABLE_LIST: string[] = [...BACKUP_TABLE_LIST, ...EXPORT_ONLY_TABLES];
export const isExportOnlyTable = (t: string) =>
  (EXPORT_ONLY_TABLES as readonly string[]).includes(t);

export function tableOrder(table: string) {
  const i = BACKUP_TABLE_LIST.indexOf(table);
  return i === -1 ? Number.MAX_SAFE_INTEGER : i;
}

/** Tables whose rows can point at another row in the SAME table. */
export const SELF_PARENT_COLUMNS: Record<string, string> = {
  committee_resources: "parent_resource_id",
  site_sections: "parent_section_id",
};

/** Tables tied to auth users — failures are expected on a fresh project. */
const USER_TABLES = new Set<string>([
  "profiles", "user_roles", "user_courses", "user_lecture_courses",
  "package_purchases", "user_group_members", "user_devices",
  "notes", "summaries", "support_requests", "mentor_journal",
  "mentor_task_completions", "mentor_treasures", "coupon_redemptions",
  "content_consents",
]);

export const isUserTable = (t: string) => USER_TABLES.has(t);

export type BackupMode = "db" | "images" | "all";

export type SiteBackup = {
  format: typeof BACKUP_FORMAT;
  version: number;
  exported_at: string;
  mode: BackupMode;
  tables: Record<string, any[]>;
  files: Array<{ bucket: string; path: string }>;
  /** PDFs hosted on Google Drive — links only, no bytes needed */
  drive_files: Array<{ id: string; title: string; drive_file_id: string | null }>;
};

export type ImportTableResult = {
  table: string;
  attempted: number;
  written: number;
  failed: Array<{ id: string | null; error: string }>;
};

/** Best-effort MIME type from a file path, so restored PDFs/videos open properly. */
export function guessContentType(path: string): string {
  const ext = path.toLowerCase().split(".").pop() ?? "";
  const map: Record<string, string> = {
    pdf: "application/pdf",
    mp4: "video/mp4",
    m4v: "video/x-m4v",
    mov: "video/quicktime",
    webm: "video/webm",
    mkv: "video/x-matroska",
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    wav: "audio/wav",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
    svg: "image/svg+xml",
  };
  return map[ext] ?? "application/octet-stream";
}
