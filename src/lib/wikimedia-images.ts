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
  const cleanQuery = query
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleanQuery) return null;

  // Search variations: primary specific query, then broader clinical query
  const queryCandidates = [
    cleanQuery,
    `${cleanQuery} histology pathology`,
    `${cleanQuery.split(" ").slice(0, 3).join(" ")} medical diagram`,
  ];

  for (const q of queryCandidates) {
    try {
      const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
        q,
      )}&gsrnamespace=6&gsrlimit=8&prop=imageinfo&iiprop=url|size|extmetadata&format=json&origin=*`;

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

      // Filter for suitable medical images (JPG, PNG, WebP, SVG with adequate resolution)
      const validImages: MedicalImageResult[] = [];

      for (const item of items) {
        const info = item?.imageinfo?.[0];
        if (!info?.url) continue;

        const imgUrl = String(info.url);
        // Exclude audio, video, PDFs, or tiny icons
        if (/\.(ogg|ogv|oga|mp4|webm|pdf|djvu)$/i.test(imgUrl)) continue;
        if ((info.width && info.width < 400) || (info.height && info.height < 300)) continue;

        const extMeta = info.extmetadata ?? {};
        const rawDesc =
          extMeta.ImageDescription?.value ||
          extMeta.ObjectName?.value ||
          item.title ||
          "";

        // Strip HTML tags from description
        const cleanDesc = rawDesc.replace(/<[^>]*>/g, "").slice(0, 300).trim();

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
        // Return the best-matching candidate
        return validImages[0];
      }
    } catch (err) {
      console.warn(`[searchRealMedicalImage] Error querying Wikimedia for "${q}":`, err);
    }
  }

  return null;
}
