// Browser-only helper: split a PDF File into small 2-page Blobs using pdf-lib.
// This exists to keep pdf.js inputs tiny on iPad Safari, where opening a full
// multi-page PDF frequently hangs past the 60–90s timeout.

export type MiniPdf = {
  chunkIndex: number;
  pageFrom: number; // 1-indexed, inclusive
  pageTo: number;   // 1-indexed, inclusive
  blob: Blob;
};

export async function splitPdfInto2PageBlobs(
  file: File,
  onProgress?: (done: number, total: number) => void,
  pagesPerPiece = 2,
): Promise<MiniPdf[]> {
  const { PDFDocument, ParseSpeeds } = await import("pdf-lib");
  const buf = await file.arrayBuffer();
  const src = await PDFDocument.load(buf, {
    ignoreEncryption: true,
    parseSpeed: ParseSpeeds.Fastest,
    updateMetadata: false,
  } as any);
  const total = src.getPageCount();
  const size = Math.max(1, Math.min(2, Math.floor(pagesPerPiece || 2)));
  const groups: { pageFrom: number; pageTo: number }[] = [];
  for (let i = 0; i < total; i += size) {
    groups.push({ pageFrom: i + 1, pageTo: Math.min(i + size, total) });
  }
  const out: MiniPdf[] = [];
  for (let idx = 0; idx < groups.length; idx++) {
    const g = groups[idx];
    const mini = await PDFDocument.create();
    const pageIndices: number[] = [];
    for (let p = g.pageFrom - 1; p <= g.pageTo - 1; p++) pageIndices.push(p);
    const copied = await mini.copyPages(src, pageIndices);
    for (const page of copied) mini.addPage(page);
    const bytes = await mini.save({ useObjectStreams: false });
    // Copy into a fresh buffer so the Blob is independent of the WASM/lib memory
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    out.push({
      chunkIndex: idx,
      pageFrom: g.pageFrom,
      pageTo: g.pageTo,
      blob: new Blob([copy], { type: "application/pdf" }),
    });
    onProgress?.(idx + 1, groups.length);
    // Yield to the event loop so iPad Safari stays responsive.
    if ((idx & 3) === 3) await new Promise((r) => setTimeout(r, 0));
  }
  return out;
}

/** Wrap a Blob as a File so downstream helpers that expect a File still work. */
export function miniPdfAsFile(mini: MiniPdf, baseName: string): File {
  const name = `${baseName.replace(/\.pdf$/i, "")}__p${mini.pageFrom}-${mini.pageTo}.pdf`;
  return new File([mini.blob], name, { type: "application/pdf", lastModified: Date.now() });
}
