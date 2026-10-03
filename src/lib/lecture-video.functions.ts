import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { canOpenLectureFile, getCaller } from "@/lib/auth-guards.server";

/**
 * Server function to securely resolve playable URLs for lecture videos.
 * Uses supabaseAdmin so RLS on private buckets (e.g. lecture-videos)
 * does not block intro/preview videos or authorized student playback.
 */
export const resolveLectureVideoUrlServer = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      videoUrl: z.string().nullable().optional(),
      storagePath: z.string().nullable().optional(),
      courseId: z.string().uuid().optional(),
      itemId: z.string().uuid().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { videoUrl, storagePath } = data;

    // External URLs (YouTube, Vimeo, Drive, direct CDN) can be used as-is
    if (!storagePath && videoUrl) {
      return { url: videoUrl };
    }

    if (!storagePath) {
      return { url: null };
    }

    const caller = await getCaller();
    const { supabaseAdmin } = caller;

    // Intro/Preview videos (path starts with "intro/" or matched to a course intro)
    const isIntro = storagePath.startsWith("intro/") || storagePath.includes("/intro/");

    if (isIntro) {
      // Intro videos are course previews — accessible to all prospective and enrolled students
      const { data: signed, error } = await supabaseAdmin.storage
        .from("lecture-videos")
        .createSignedUrl(storagePath, 60 * 60 * 4);

      if (signed?.signedUrl) {
        return { url: signed.signedUrl };
      }
      if (error) {
        console.warn("[resolveLectureVideoUrlServer] Error signing intro video:", error.message);
      }
    } else {
      // Lesson video: only people who may watch the course get a link
      if (!(await canOpenLectureFile(caller, storagePath, "video", data.courseId))) {
        return { url: null };
      }
      const { data: signed, error } = await supabaseAdmin.storage
        .from("lecture-videos")
        .createSignedUrl(storagePath, 60 * 60 * 4);

      if (signed?.signedUrl) {
        return { url: signed.signedUrl };
      }
      if (error) {
        console.warn("[resolveLectureVideoUrlServer] Error signing lesson video:", error.message);
      }
    }

    return { url: videoUrl ?? null };
  });

/**
 * Server function to securely resolve PDF URLs for lecture slides / handouts.
 */
export const resolveLecturePdfUrlServer = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      pdfUrl: z.string().nullable().optional(),
      storagePath: z.string().nullable().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { pdfUrl, storagePath } = data;

    if (!storagePath && pdfUrl) {
      return { url: pdfUrl };
    }

    if (!storagePath) {
      return { url: null };
    }

    const caller = await getCaller();
    const { supabaseAdmin } = caller;
    if (!(await canOpenLectureFile(caller, storagePath, "pdf"))) {
      return { url: null };
    }

    const { data: signed, error } = await supabaseAdmin.storage
      .from("lecture-pdfs")
      .createSignedUrl(storagePath, 60 * 60 * 2);

    if (signed?.signedUrl) {
      return { url: signed.signedUrl };
    }

    if (error) {
      console.warn("[resolveLecturePdfUrlServer] Error signing PDF:", error.message);
    }

    return { url: pdfUrl ?? null };
  });
