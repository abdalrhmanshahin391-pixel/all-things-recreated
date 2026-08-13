import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useServerFn } from "@tanstack/react-start";
import { extractGermanPairsFromImage, saveGermanPairs } from "@/lib/jarvis-german.functions";
import { Upload, X, Loader2, Sparkles, Check, Trash2 } from "lucide-react";
import { toast } from "sonner";

type Kind = "words" | "sentences";
type Pair = { german: string; english: string; _ok: boolean };

async function fileToBase64(f: File): Promise<{ base64: string; mimeType: string; preview: string }> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result || "");
      const i = s.indexOf(",");
      resolve({ base64: i >= 0 ? s.slice(i + 1) : s, mimeType: f.type || "image/jpeg", preview: s });
    };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(f);
  });
}

export function GermanImageImporter({
  open,
  onOpenChange,
  subjectId,
  defaultKind,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  subjectId: string;
  defaultKind: Kind;
  onDone: () => void;
}) {
  const [kind, setKind] = useState<Kind>(defaultKind);
  const [provider, setProvider] = useState<"lovable" | "gemini">("lovable");
  const [images, setImages] = useState<{ name: string; base64: string; mimeType: string; preview: string }[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [saving, setSaving] = useState(false);

  const extract = useServerFn(extractGermanPairsFromImage);
  const save = useServerFn(saveGermanPairs);

  async function handleFiles(files: FileList | null) {
    if (!files) return;
    const arr = Array.from(files).slice(0, 20 - images.length);
    const out: typeof images = [];
    for (const f of arr) {
      if (!f.type.startsWith("image/")) {
        toast.error(`${f.name} is not an image.`);
        continue;
      }
      if (f.size > 10 * 1024 * 1024) {
        toast.error(`${f.name} is over 10 MB.`);
        continue;
      }
      const d = await fileToBase64(f);
      out.push({ name: f.name, ...d });
    }
    setImages((p) => [...p, ...out].slice(0, 20));
  }

  async function runExtract() {
    if (images.length === 0) {
      toast.error("Add at least one image.");
      return;
    }
    setExtracting(true);
    setProgress({ done: 0, total: images.length });
    const collected: Pair[] = [];
    const seen = new Set<string>();
    try {
      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        try {
          const res = await extract({
            data: { imageBase64: img.base64, mimeType: img.mimeType, kind, provider },
          });
          for (const p of (res as any).pairs as { german: string; english: string }[]) {
            const k = p.german.trim().toLowerCase();
            if (seen.has(k)) continue;
            seen.add(k);
            collected.push({ german: p.german, english: p.english, _ok: true });
          }
        } catch (e: any) {
          toast.error(`Image ${i + 1}: ${e?.message || "extract failed"}`);
        }
        setProgress({ done: i + 1, total: images.length });
      }
      if (!collected.length) {
        toast.error("No vocabulary detected.");
      } else {
        toast.success(`Detected ${collected.length} ${kind}.`);
      }
      setPairs(collected);
    } finally {
      setExtracting(false);
    }
  }

  async function runSave() {
    const accepted = pairs.filter((p) => p._ok && p.german.trim() && p.english.trim());
    if (!accepted.length) {
      toast.error("Nothing to save.");
      return;
    }
    setSaving(true);
    try {
      const res = await save({
        data: {
          subjectId,
          kind,
          pairs: accepted.map((p) => ({ german: p.german.trim(), english: p.english.trim() })),
        },
      });
      toast.success(`Saved ${(res as any).inserted} ${kind}.`);
      setImages([]);
      setPairs([]);
      onDone();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-600" />
            Jarvis · Import German from images
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Settings */}
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs font-bold uppercase text-slate-500">Save as</span>
            {(["words", "sentences"] as Kind[]).map((k) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                className={`text-xs font-bold px-3 py-1.5 rounded-full ${
                  kind === k ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-700"
                }`}
              >
                {k === "words" ? "Words" : "Sentences"}
              </button>
            ))}
            <span className="ml-3 text-xs font-bold uppercase text-slate-500">Engine</span>
            {(["lovable", "gemini"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setProvider(p)}
                className={`text-xs font-bold px-3 py-1.5 rounded-full ${
                  provider === p ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"
                }`}
              >
                {p === "lovable" ? "Lovable AI" : "Gemini (saved key)"}
              </button>
            ))}
          </div>

          {/* Drop zone */}
          <label className="block cursor-pointer rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-6 text-center hover:border-emerald-400">
            <Upload className="mx-auto text-slate-400" />
            <p className="mt-2 text-sm font-bold text-slate-700">Click or drop pages / screenshots</p>
            <p className="text-xs text-slate-500">JPG / PNG · up to 20 images · 10 MB each</p>
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
          </label>

          {images.length > 0 && (
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
              {images.map((p, i) => (
                <div key={i} className="relative group rounded-lg overflow-hidden border border-slate-200">
                  <img src={p.preview} alt={p.name} className="w-full h-20 object-cover" />
                  <button
                    onClick={() => setImages((arr) => arr.filter((_, j) => j !== i))}
                    className="absolute top-1 right-1 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              onClick={runExtract}
              disabled={extracting || images.length === 0}
              className="inline-flex items-center gap-2 rounded-full bg-emerald-600 text-white text-sm font-bold px-4 py-2 disabled:opacity-50"
            >
              {extracting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {extracting && progress
                ? `Reading ${progress.done}/${progress.total}…`
                : "Extract with Jarvis"}
            </button>
            {pairs.length > 0 && (
              <button
                onClick={runSave}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-full bg-slate-900 text-white text-sm font-bold px-4 py-2 disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Save {pairs.filter((p) => p._ok).length} {kind}
              </button>
            )}
          </div>

          {/* Review table */}
          {pairs.length > 0 && (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="grid grid-cols-[auto_1fr_1fr_auto] gap-2 px-3 py-2 bg-slate-50 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                <div></div>
                <div>Deutsch</div>
                <div>English</div>
                <div></div>
              </div>
              <div className="divide-y divide-slate-100 max-h-[40vh] overflow-y-auto">
                {pairs.map((p, i) => (
                  <div
                    key={i}
                    className={`grid grid-cols-[auto_1fr_1fr_auto] gap-2 items-center px-3 py-2 ${
                      p._ok ? "" : "opacity-40 line-through"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={p._ok}
                      onChange={(e) =>
                        setPairs((arr) =>
                          arr.map((x, j) => (j === i ? { ...x, _ok: e.target.checked } : x)),
                        )
                      }
                    />
                    <input
                      value={p.german}
                      onChange={(e) =>
                        setPairs((arr) =>
                          arr.map((x, j) => (j === i ? { ...x, german: e.target.value } : x)),
                        )
                      }
                      className="rounded border border-slate-200 px-2 py-1 text-sm"
                    />
                    <input
                      value={p.english}
                      onChange={(e) =>
                        setPairs((arr) =>
                          arr.map((x, j) => (j === i ? { ...x, english: e.target.value } : x)),
                        )
                      }
                      className="rounded border border-slate-200 px-2 py-1 text-sm"
                    />
                    <button
                      onClick={() => setPairs((arr) => arr.filter((_, j) => j !== i))}
                      className="p-1 rounded text-slate-400 hover:text-rose-500"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
