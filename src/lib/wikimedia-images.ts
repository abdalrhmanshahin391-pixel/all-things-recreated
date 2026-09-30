/**
 * Wikimedia Commons Scientific Medical Image Fetcher
 *
 * Searches Wikimedia Commons for authentic, high-resolution medical photographs,
 * histology slides, pathology specimens, electron micrographs, and anatomical schematics.
 * Completely replaces synthetic AI image blobs with 100% real medical literature imagery.
 */

export interface MedicalImageResult {
  url: string;
  thumbnailUrl: string;
  title: string;
  description: string;
  sourceUrl: string;
  width: number;
  height: number;
}

/**
 * Searches Wikimedia Commons for verified medical imagery matching the query.
 * Falls back to broader medical terms if a highly specific query returns no results.
 */
export async function searchRealMedicalImage(query: string): Promise<MedicalImageResult | null> {
  // Strip non-alphanumeric characters and meta-instruction words
  const cleanQuery = query
    .replace(/\b(recall|objective|chapter|mcq|question|undefined|exam|form|test|step)\b/gi, " ")
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleanQuery) return null;

  const coreWords = cleanQuery.split(" ").filter((w) => w.length > 2);
  const core3 = coreWords.slice(0, 3).join(" ");
  const core2 = coreWords.slice(0, 2).join(" ");

  // Search variations: primary specific query, then broader clinical queries, all with filetype:bitmap
  const queryCandidates = [
    `${cleanQuery} filetype:bitmap`,
    `${core3} pathology histology filetype:bitmap`,
    `${core3} histology filetype:bitmap`,
    `${core2} pathology filetype:bitmap`,
    `${core2} medical diagram filetype:bitmap`,
    `${core2} anatomy filetype:bitmap`,
  ].filter((q, idx, arr) => arr.indexOf(q) === idx && q.length > 18);

  for (const q of queryCandidates) {
    try {
      const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
        q,
      )}&gsrnamespace=6&gsrlimit=10&prop=imageinfo&iiprop=url|size|mime|extmetadata&format=json&origin=*`;

      const res = await fetch(url, {
        headers: {
          "User-Agent": "AquaQBank-MedicalMCQForge/2.0 (medical educational platform)",
          Accept: "application/json",
        },
      });

      if (!res.ok) continue;

      const data = await res.json();
      const pages = data?.query?.pages;
      if (!pages) continue;

      const items = Object.values(pages) as any[];
      const validImages: MedicalImageResult[] = [];

      for (const item of items) {
        const info = item?.imageinfo?.[0];
        if (!info?.url) continue;

        const imgUrl = String(info.url);
        const cleanPath = imgUrl.split("?")[0].toLowerCase();
        const title = String(item.title || "");

        // 1. Strict MIME verification: Must be an actual image
        const mime = String(info.mime || "").toLowerCase();
        if (mime && !mime.startsWith("image/")) continue;

        // 2. Strict extension verification (strip query parameters first)
        if (!/\.(jpe?g|png|webp|svg)$/i.test(cleanPath)) continue;

        // 3. Exclude scanned antique books, Internet Archive documents, PDFs, audio/video
        if (/\(IA\s+|\.pdf|\.djvu|\.ogg|\.mp4|\.webm/i.test(title) || /\(IA\s+/i.test(cleanPath)) continue;

        // 4. Exclude tiny icons or corrupted files
        if ((info.width && info.width < 300) || (info.height && info.height < 200)) continue;

        const extMeta = info.extmetadata ?? {};
        const rawDesc =
          extMeta.ImageDescription?.value ||
          extMeta.ObjectName?.value ||
          item.title ||
          "";

        // Strip HTML tags from description
        const cleanDesc = String(rawDesc).replace(/<[^>]*>/g, "").slice(0, 300).trim();

        validImages.push({
          url: imgUrl,
          thumbnailUrl: info.thumburl || imgUrl,
          title: String(item.title || "").replace(/^File:/i, "").replace(/\.[^.]+$/, ""),
          description: cleanDesc,
          sourceUrl: info.descriptionurl || imgUrl,
          width: info.width || 800,
          height: info.height || 600,
        });
      }

      if (validImages.length > 0) {
        return validImages[0];
      }
    } catch (err) {
      console.warn(`[searchRealMedicalImage] Error querying Wikimedia for "${q}":`, err);
    }
  }

  // 5. Final fallback to verified high-res histology/pathology specimen if nothing matched
  try {
    const fallbackUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
      "histopathology cell injury necrosis filetype:bitmap",
    )}&gsrnamespace=6&gsrlimit=5&prop=imageinfo&iiprop=url|size|mime|extmetadata&format=json&origin=*`;
    const fRes = await fetch(fallbackUrl, {
      headers: { "User-Agent": "AquaQBank-MedicalMCQForge/2.0" },
    });
    if (fRes.ok) {
      const fData = await fRes.json();
      const fPages = Object.values(fData?.query?.pages || {}) as any[];
      for (const p of fPages) {
        const fInfo = p?.imageinfo?.[0];
        const fClean = String(fInfo?.url || "").split("?")[0].toLowerCase();
        if (fInfo?.url && /\.(jpe?g|png|webp)$/i.test(fClean) && fInfo?.mime?.startsWith("image/")) {
          return {
            url: fInfo.url,
            thumbnailUrl: fInfo.thumburl || fInfo.url,
            title: String(p.title || "").replace(/^File:/i, "").replace(/\.[^.]+$/, ""),
            description: "High-resolution medical histology micrograph reference.",
            sourceUrl: fInfo.descriptionurl || fInfo.url,
            width: fInfo.width || 800,
            height: fInfo.height || 600,
          };
        }
      }
    }
  } catch (fbErr) {
    console.warn("[searchRealMedicalImage] Fallback error:", fbErr);
  }

  return null;
}
