import { supabase } from "@/integrations/supabase/client";
import { compressImage } from "@/lib/image-compress";

export const QUESTION_IMAGE_BUCKET = "question-images";
const MANUAL_PREFIX = "manual/";

/** Uploads a picture for a question and returns its storage path. */
export async function uploadQuestionImage(file: File): Promise<string> {
  const img = await compressImage(file, { maxEdge: 1600 });
  const path = `${MANUAL_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${img.ext}`;
  const { error } = await supabase.storage
    .from(QUESTION_IMAGE_BUCKET)
    .upload(path, img.file, { cacheControl: "3600", upsert: false, contentType: img.contentType });
  if (error) throw error;
  return path;
}

/** Removes a picture we uploaded ourselves; imported exam images are left alone. */
export async function deleteQuestionImage(path: string | null | undefined): Promise<void> {
  if (!path || !path.startsWith(MANUAL_PREFIX)) return;
  await supabase.storage.from(QUESTION_IMAGE_BUCKET).remove([path]);
}
