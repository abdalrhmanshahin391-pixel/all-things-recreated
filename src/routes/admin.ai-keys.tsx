import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { guardRedirect } from "@/lib/guard-redirect";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Key, Check, Loader2, Trash2, ExternalLink, ArrowLeft, Sparkles, Zap, Sliders } from "lucide-react";
import { toast } from "sonner";
import { SiteHeader } from "@/components/SiteHeader";
import { useAuth } from "@/hooks/useAuth";
import {
  saveAiKey,
  deleteAiKey,
  listAiKeyStatus,
  savePreferredGeminiModel,
  listGeminiModelLimits,
  updateGeminiModelLimit,
  resetGeminiModelStatus,
} from "@/lib/jarvis.functions";

export const Route = createFileRoute("/admin/ai-keys")({
  head: () => ({ meta: [{ title: "AI keys — AquaQBank" }] }),
  component: AiKeysPage,
});

const FALLBACK_MODELS = [
  { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite" },
];

const SINGLE_PROVIDERS: {
  id: "openai" | "anthropic";
  name: string;
  tier: string;
  model: string;
  color: string;
  url: string;
  steps: string[];
}[] = [
  {
    id: "openai",
    name: "OpenAI",
    tier: "Cheap (< $1 / 1K images)",
    model: "gpt-4o-mini",
    color: "from-emerald-400 to-teal-500",
    url: "https://platform.openai.com/api-keys",
    steps: [
      "Go to platform.openai.com → API keys.",
      "Add a payment method (vision needs a paid project).",
      "Click ‘Create new secret key’, copy the sk-… value.",
      "Paste it here. We use gpt-4o-mini for ultra-cheap vision.",
    ],
  },
  {
    id: "anthropic",
    name: "Anthropic Claude",
    tier: "Premium ($5–$10 / 1K)",
    model: "claude-sonnet-4-5",
    color: "from-fuchsia-400 to-rose-500",
    url: "https://console.anthropic.com/settings/keys",
    steps: [
      "Go to console.anthropic.com → Settings → API Keys.",
      "Add credits to your workspace.",
      "Click ‘Create Key’, copy the sk-ant-… value.",
      "Paste it here. Best quality answers + tables.",
    ],
  },
];

function AiKeysPage() {
  const { user, isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const list = useServerFn(listAiKeyStatus);
  const save = useServerFn(saveAiKey);
  const del = useServerFn(deleteAiKey);
  const setModel = useServerFn(savePreferredGeminiModel);

  // gemini[slot] = updated_at | null
  const [geminiSlots, setGeminiSlots] = useState<(string | null)[]>([null, null, null, null, null]);
  const [preferredModel, setPreferredModel] = useState<string>("gemini-2.0-flash");
  const [models, setModels] = useState(FALLBACK_MODELS);

  // single-provider status
  const [singleStatus, setSingleStatus] = useState<Record<"openai" | "anthropic", string | null>>({
    openai: null,
    anthropic: null,
  });

  // drafts
  const [geminiDraft, setGeminiDraft] = useState<string[]>(["", "", "", "", ""]);
  const [singleDraft, setSingleDraft] = useState<Record<"openai" | "anthropic", string>>({
    openai: "",
    anthropic: "",
  });
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
    else if (!loading && user && !isAdmin) guardRedirect(navigate);
  }, [loading, user, isAdmin, navigate]);

  async function refresh() {
    try {
      const r: any = await list();
      const slots: (string | null)[] = [null, null, null, null, null];
      const single: Record<"openai" | "anthropic", string | null> = { openai: null, anthropic: null };
      for (const k of r.keys ?? []) {
        if (k.provider === "gemini") {
          const idx = Math.min(Math.max((k.slot ?? 1) - 1, 0), 4);
          slots[idx] = k.updated_at;
        } else if (k.provider === "openai") {
          single.openai = k.updated_at;
        } else if (k.provider === "anthropic") {
          single.anthropic = k.updated_at;
        }
      }
      setGeminiSlots(slots);
      setSingleStatus(single);
      setPreferredModel(r.preferredModel || "gemini-2.0-flash");
      if (Array.isArray(r.models) && r.models.length) setModels(r.models);
    } catch {
      // ignore on first render
    }
  }
  useEffect(() => {
    if (isAdmin) refresh();
  }, [isAdmin]);

  async function saveGeminiSlot(slotIdx: number) {
    const key = geminiDraft[slotIdx]?.trim();
    if (!key) return;
    const tag = `gemini-${slotIdx}`;
    setBusy(tag);
    try {
      await save({ data: { provider: "gemini", apiKey: key, slot: slotIdx + 1 } });
      toast.success(`Gemini key #${slotIdx + 1} saved`);
      setGeminiDraft((d) => d.map((v, i) => (i === slotIdx ? "" : v)));
      refresh();
    } catch (e: any) {
      toast.error(e?.message || "Save failed");
    } finally {
      setBusy(null);
    }
  }

  async function deleteGeminiSlot(slotIdx: number) {
    if (!confirm(`Remove Gemini key #${slotIdx + 1}?`)) return;
    const tag = `gemini-${slotIdx}`;
    setBusy(tag);
    try {
      await del({ data: { provider: "gemini", slot: slotIdx + 1 } });
      toast.success(`Gemini key #${slotIdx + 1} removed`);
      refresh();
    } catch (e: any) {
      toast.error(e?.message || "Delete failed");
    } finally {
      setBusy(null);
    }
  }

  async function changeModel(model: string) {
    if (model === preferredModel) return;
    const previous = preferredModel;
    setPreferredModel(model);
    try {
      await setModel({ data: { model } });
      toast.success("Preferred model updated");
    } catch (e: any) {
      setPreferredModel(previous);
      toast.error(e?.message || "Could not save model");
    }
  }

  async function saveSingle(p: "openai" | "anthropic") {
    if (!singleDraft[p].trim()) return;
    setBusy(p);
    try {
      await save({ data: { provider: p, apiKey: singleDraft[p].trim(), slot: 1 } });
      toast.success(`${p} key saved`);
      setSingleDraft((d) => ({ ...d, [p]: "" }));
      refresh();
    } catch (e: any) {
      toast.error(e?.message || "Save failed");
    } finally {
      setBusy(null);
    }
  }

  async function deleteSingle(p: "openai" | "anthropic") {
    if (!confirm(`Remove the ${p} key?`)) return;
    setBusy(p);
    try {
      await del({ data: { provider: p, slot: 1 } });
      toast.success(`${p} key removed`);
      refresh();
    } catch (e: any) {
      toast.error(e?.message || "Delete failed");
    } finally {
      setBusy(null);
    }
  }

  if (loading || !user || !isAdmin) return <div className="min-h-screen bg-black" />;

  const connectedCount = geminiSlots.filter(Boolean).length;

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-zinc-950 to-black text-white">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-6 pt-32 pb-20">
        <Link
          to="/admin/questions"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-white/50 hover:text-white mb-6"
        >
          <ArrowLeft className="w-3 h-3" /> Back to questions
        </Link>

        <div className="flex items-center gap-3 mb-2">
          <div className="grid place-items-center w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 shadow-lg shadow-violet-500/30">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-[10px] font-bold tracking-[0.32em] text-violet-300 uppercase">Jarvis</p>
            <h1 className="font-serif text-3xl md:text-4xl font-bold">AI keys</h1>
          </div>
        </div>
        <p className="text-sm text-white/55 max-w-2xl mb-10">
          Paste your own provider keys so Jarvis can extract questions from PDFs, photos, and videos.
          Add multiple Gemini keys to multiply your free daily quota — the app rotates between them
          automatically when one is rate-limited.
        </p>

        {/* ────── Gemini multi-key card ────── */}
        <div className="rounded-3xl border border-sky-500/30 bg-gradient-to-br from-sky-500/[0.05] to-indigo-500/[0.05] backdrop-blur p-6 md:p-7 mb-5">
          <div className="flex items-start justify-between gap-4 mb-5">
            <div className="flex items-center gap-3">
              <div className="grid place-items-center w-11 h-11 rounded-2xl bg-gradient-to-br from-sky-400 to-indigo-500">
                <Key className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-base">Google Gemini</h3>
                  <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300">
                    Free · Pool of 5
                  </span>
                </div>
                <p className="text-xs text-white/50 mt-0.5">
                  {connectedCount > 0
                    ? `${connectedCount} key${connectedCount === 1 ? "" : "s"} connected · daily quota multiplies per key`
                    : "Add at least one key to enable Gemini."}
                </p>
              </div>
            </div>
          </div>

          {/* Model is locked to Flash-Lite — no selector needed */}
          <div className="mb-5 rounded-2xl border border-emerald-400/20 bg-emerald-500/[0.04] p-3">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-emerald-300/90">
              <Zap className="w-3 h-3" /> Model locked
            </div>
            <p className="text-xs text-white/70 mt-1">
              The app uses <code className="text-emerald-200">gemini-2.5-flash-lite</code> for everything (Jarvis Night, bookend extraction, solving). No silent fallback to Flash — costs stay predictable.
            </p>
          </div>

          {/* 5 slots */}
          <div className="space-y-2 mb-4">
            {geminiSlots.map((updatedAt, i) => {
              const isSet = !!updatedAt;
              const tag = `gemini-${i}`;
              return (
                <div
                  key={i}
                  className="rounded-2xl border border-white/10 bg-black/30 p-3 flex flex-col sm:flex-row sm:items-center gap-2"
                >
                  <span className="text-[11px] font-bold uppercase tracking-widest text-white/40 w-12 shrink-0">
                    Key #{i + 1}
                  </span>
                  <input
                    type="password"
                    value={geminiDraft[i]}
                    onChange={(e) =>
                      setGeminiDraft((d) => d.map((v, idx) => (idx === i ? e.target.value : v)))
                    }
                    placeholder={isSet ? "•••••••• (paste to replace)" : "Paste an AIza… key"}
                    className="flex-1 rounded-xl border border-white/15 bg-black/40 px-3 py-2.5 text-sm placeholder:text-white/30 outline-none focus:border-sky-400"
                  />
                  <span
                    className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-1 rounded-full ${
                      isSet ? "bg-emerald-500/15 text-emerald-300" : "bg-white/5 text-white/40"
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${isSet ? "bg-emerald-400" : "bg-white/30"}`} />
                    {isSet ? "Connected" : "Empty"}
                  </span>
                  <button
                    onClick={() => saveGeminiSlot(i)}
                    disabled={busy === tag || !geminiDraft[i].trim()}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-white text-black px-4 py-2.5 text-xs font-bold hover:bg-white/90 disabled:bg-white/10 disabled:text-white/40"
                  >
                    {busy === tag ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    Save
                  </button>
                  {isSet && (
                    <button
                      onClick={() => deleteGeminiSlot(i)}
                      disabled={busy === tag}
                      className="inline-flex items-center justify-center rounded-xl border border-white/15 px-3 py-2.5 text-white/60 hover:bg-white/5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <details className="group">
            <summary className="cursor-pointer text-xs font-semibold text-sky-300 hover:text-sky-200 select-none">
              How do I get more keys?
            </summary>
            <ol className="mt-3 space-y-1.5 text-sm text-white/70 list-decimal pl-5">
              <li>Open <a className="text-sky-300 underline" href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer">Google AI Studio</a> and sign in with a Google account.</li>
              <li>Click <strong>Create API key → Create API key in new project</strong>.</li>
              <li>Copy the key (starts with <code>AIza…</code>) and paste it into one of the slots above.</li>
              <li>To multiply your daily quota, repeat with a <em>different Google account</em> for each slot.</li>
              <li>Each key adds its own free daily quota — the app rotates between keys automatically.</li>
            </ol>
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-sky-300 hover:underline"
            >
              Open AI Studio <ExternalLink className="w-3 h-3" />
            </a>
          </details>
        </div>

        {/* ────── Single-key providers (OpenAI, Anthropic) ────── */}
        <div className="space-y-5">
          {SINGLE_PROVIDERS.map((p) => {
            const isSet = !!singleStatus[p.id];
            return (
              <div
                key={p.id}
                className="rounded-3xl border border-white/10 bg-white/[0.02] backdrop-blur p-6 md:p-7 hover:border-white/20 transition-colors"
              >
                <div className="flex items-start justify-between gap-4 mb-5">
                  <div className="flex items-center gap-3">
                    <div className={`grid place-items-center w-11 h-11 rounded-2xl bg-gradient-to-br ${p.color}`}>
                      <Key className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-base">{p.name}</h3>
                        <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-white/10 text-white/70">
                          {p.tier}
                        </span>
                      </div>
                      <p className="text-xs text-white/40 mt-0.5">Model: {p.model}</p>
                    </div>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full ${
                      isSet ? "bg-emerald-500/15 text-emerald-300" : "bg-white/5 text-white/40"
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${isSet ? "bg-emerald-400" : "bg-white/30"}`} />
                    {isSet ? "Connected" : "Not set"}
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row gap-2 mb-4">
                  <input
                    type="password"
                    value={singleDraft[p.id]}
                    onChange={(e) => setSingleDraft((d) => ({ ...d, [p.id]: e.target.value }))}
                    placeholder={isSet ? "•••••••• (paste to replace)" : `Paste your ${p.name} API key`}
                    className="flex-1 rounded-xl border border-white/15 bg-black/40 px-4 py-3 text-sm placeholder:text-white/30 outline-none focus:border-violet-400"
                  />
                  <button
                    onClick={() => saveSingle(p.id)}
                    disabled={busy === p.id || !singleDraft[p.id].trim()}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-white text-black px-5 py-3 text-sm font-bold hover:bg-white/90 disabled:bg-white/10 disabled:text-white/40"
                  >
                    {busy === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    Save
                  </button>
                  {isSet && (
                    <button
                      onClick={() => deleteSingle(p.id)}
                      disabled={busy === p.id}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 px-4 py-3 text-sm font-bold text-white/70 hover:bg-white/5"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <details className="group">
                  <summary className="cursor-pointer text-xs font-semibold text-violet-300 hover:text-violet-200 select-none">
                    Where do I get this key?
                  </summary>
                  <ol className="mt-3 space-y-1.5 text-sm text-white/70 list-decimal pl-5">
                    {p.steps.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ol>
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-violet-300 hover:underline"
                  >
                    Open {new URL(p.url).hostname} <ExternalLink className="w-3 h-3" />
                  </a>
                </details>
              </div>
            );
          })}
        </div>

        <ModelLimitsEditor />
      </main>
    </div>
  );
}

type LimitRow = {
  model_id: string;
  label: string;
  rpm: number;
  rpd: number;
  supports_vision: boolean;
  enabled: boolean;
  smooth_pacing: boolean;
  cooldown_seconds: number;
  sort_order: number;
  max_concurrent: number;
  api_model_id: string | null;
  use_json_mime: boolean;
  last_error: string | null;
  last_error_at: string | null;
};

function ModelLimitsEditor() {
  const listFn = useServerFn(listGeminiModelLimits);
  const updateFn = useServerFn(updateGeminiModelLimit);
  const resetFn = useServerFn(resetGeminiModelStatus);
  const [rows, setRows] = useState<LimitRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Record<string, number>>({});
  const [loaded, setLoaded] = useState(false);

  async function refresh() {
    try {
      const r: any = await listFn();
      setRows((r.rows ?? []) as LimitRow[]);
    } catch (e: any) {
      toast.error(e?.message || "Failed to load model limits");
    } finally { setLoaded(true); }
  }
  useEffect(() => { refresh(); }, []);

  function patchRow(id: string, patch: Partial<LimitRow>) {
    setRows((rs) => rs.map((r) => (r.model_id === id ? { ...r, ...patch } : r)));
  }
  async function saveRow(r: LimitRow) {
    setBusy(r.model_id);
    try {
      await updateFn({ data: {
        model_id: r.model_id,
        rpm: r.rpm, rpd: r.rpd,
        enabled: r.enabled,
        smooth_pacing: r.smooth_pacing,
        cooldown_seconds: r.cooldown_seconds,
        max_concurrent: r.max_concurrent,
        api_model_id: r.api_model_id || r.model_id,
        use_json_mime: r.use_json_mime,
      } });
      setSavedAt((s) => ({ ...s, [r.model_id]: Date.now() }));
      toast.success(`${r.model_id} saved — applied immediately`);
      // Re-read from the backend so the inputs reflect the actually-persisted
      // values (not just the optimistic in-memory state). This is what makes
      // "edit RPD → it actually applies, not صوري" provable to the admin.
      await refresh();
    } catch (e: any) {
      toast.error(e?.message || "Save failed");
    } finally {
      setBusy(null);
    }
  }
  async function resetRow(r: LimitRow) {
    setBusy(r.model_id);
    try {
      await resetFn({ data: { model_id: r.model_id } });
      toast.success(`${r.model_id} status cleared — will be retried now`);
      refresh();
    } catch (e: any) {
      toast.error(e?.message || "Reset failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-8 rounded-3xl border border-amber-400/20 bg-amber-500/[0.03] backdrop-blur p-6 md:p-7">
      <div className="flex items-center gap-3 mb-4">
        <div className="grid place-items-center w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500">
          <Sliders className="w-5 h-5 text-black" />
        </div>
        <div>
          <h3 className="font-bold text-base">Per-model rate limits</h3>
          <p className="text-xs text-white/50">
            Edit these whenever Google changes their free-tier quota. The app stays just below your numbers, so no 429s.
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-white/40 text-left">
            <tr>
              <th className="py-2 pr-3">Model</th>
              <th className="py-2 pr-3">API id</th>
              <th className="py-2 pr-3">RPM</th>
              <th className="py-2 pr-3">RPD</th>
              <th className="py-2 pr-3">Parallel</th>
              <th className="py-2 pr-3">Smooth</th>
              <th className="py-2 pr-3">JSON</th>
              <th className="py-2 pr-3">Cooldown</th>
              <th className="py-2 pr-3">On</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {loaded && rows.length === 0 && (
              <tr><td colSpan={10} className="py-6 text-center text-white/60 text-xs">
                No model rows yet — try Save on the (auto-seeded) Flash-Lite row, or refresh the page.
              </td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.model_id} className="border-t border-white/5 align-top">
                <td className="py-2 pr-3">
                  <div className="font-mono text-white/90">{r.model_id}</div>
                  <div className="text-[10px] text-white/40">{r.label}{r.supports_vision ? "" : " · text-only"}</div>
                  {savedAt[r.model_id] && (
                    <div className="mt-1 text-[10px] text-emerald-300/90">
                      ✓ Saved {Math.max(1, Math.round((Date.now() - savedAt[r.model_id]) / 1000))}s ago — live
                    </div>
                  )}
                  {r.last_error && (
                    <div className="mt-1 text-[10px] text-rose-300/90 max-w-[260px] break-words">
                      ⚠ {r.last_error.slice(0, 160)}
                    </div>
                  )}
                </td>
                <td className="py-2 pr-3">
                  <input type="text" value={r.api_model_id ?? ""}
                    placeholder={r.model_id}
                    onChange={(e) => patchRow(r.model_id, { api_model_id: e.target.value })}
                    className="w-40 rounded border border-white/15 bg-black/40 px-2 py-1 font-mono" />
                </td>
                <td className="py-2 pr-3">
                  <input type="number" min={1} value={r.rpm}
                    onChange={(e) => patchRow(r.model_id, { rpm: Number(e.target.value) || 1 })}
                    className="w-16 rounded border border-white/15 bg-black/40 px-2 py-1" />
                </td>
                <td className="py-2 pr-3">
                  <input type="number" min={1} value={r.rpd}
                    onChange={(e) => patchRow(r.model_id, { rpd: Number(e.target.value) || 1 })}
                    className="w-20 rounded border border-white/15 bg-black/40 px-2 py-1" />
                </td>
                <td className="py-2 pr-3">
                  <input type="number" min={1} max={32} value={r.max_concurrent}
                    onChange={(e) => patchRow(r.model_id, { max_concurrent: Number(e.target.value) || 1 })}
                    className="w-14 rounded border border-white/15 bg-black/40 px-2 py-1" />
                </td>
                <td className="py-2 pr-3">
                  <input type="checkbox" checked={r.smooth_pacing}
                    onChange={(e) => patchRow(r.model_id, { smooth_pacing: e.target.checked })}
                    className="accent-amber-400" />
                </td>
                <td className="py-2 pr-3">
                  <input type="checkbox" checked={r.use_json_mime}
                    onChange={(e) => patchRow(r.model_id, { use_json_mime: e.target.checked })}
                    className="accent-amber-400" />
                </td>
                <td className="py-2 pr-3">
                  <input type="number" min={0} value={r.cooldown_seconds}
                    onChange={(e) => patchRow(r.model_id, { cooldown_seconds: Number(e.target.value) || 0 })}
                    className="w-14 rounded border border-white/15 bg-black/40 px-2 py-1" />
                </td>
                <td className="py-2 pr-3">
                  <input type="checkbox" checked={r.enabled}
                    onChange={(e) => patchRow(r.model_id, { enabled: e.target.checked })}
                    className="accent-amber-400" />
                </td>
                <td className="py-2 text-right space-x-1 whitespace-nowrap">
                  <button
                    onClick={() => saveRow(r)}
                    disabled={busy === r.model_id}
                    className="inline-flex items-center gap-1 rounded-lg bg-white text-black px-2.5 py-1 font-bold disabled:opacity-50"
                  >
                    {busy === r.model_id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                    Save
                  </button>
                  <button
                    onClick={() => resetRow(r)}
                    disabled={busy === r.model_id}
                    className="inline-flex items-center gap-1 rounded-lg border border-white/20 text-white/80 px-2.5 py-1 font-bold disabled:opacity-50"
                    title="Clear last error / unavailable flag so this model is tried again now"
                  >
                    Reset
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-5 rounded-2xl border border-white/10 bg-black/30 p-4">
        <p className="text-[11px] font-bold tracking-[0.28em] text-amber-200/80 uppercase mb-3">
          What each column means (plain English)
        </p>
        <ul className="space-y-2 text-[12px] text-white/75 leading-relaxed">
          <li><strong className="text-white">API id</strong> — the exact model name we send to Google. If a Gemini version stops working, the issue is usually here. Use <code className="text-amber-200">gemini-2.0-flash-001</code> and <code className="text-amber-200">gemini-2.0-flash-lite-001</code> for the 2.0 family.</li>
          <li><strong className="text-white">RPM</strong> — Requests Per Minute. Example: 15 means Jarvis will not send more than 15 requests in any 60-second window per key.</li>
          <li><strong className="text-white">RPD</strong> — Requests Per Day. Example: 200 means at most 200 requests per day for each key. More keys = more total per day.</li>
          <li><strong className="text-white">Parallel</strong> — How many pages this model can process at the same time per key. Higher = faster, but easier to hit RPM. Lite models can usually handle 3-4.</li>
          <li><strong className="text-white">Smooth</strong> — When ON, Jarvis spaces requests evenly (safer, slower). When OFF, requests fire as fast as the limits allow (faster, can spike). Turn OFF for fast lite models, leave ON for low-RPM models like 2.5 Flash or 3 Pro.</li>
          <li><strong className="text-white">JSON</strong> — Asks Gemini to return strict JSON. Usually ON. Turn OFF only if a model rejects it with “responseMimeType not supported” (most often <code className="text-amber-200">gemini-2.0-flash-lite</code>).</li>
          <li><strong className="text-white">Cooldown</strong> — Seconds to wait after a rate-limit (429) or error before trying that model again on that key.</li>
          <li><strong className="text-white">On</strong> — Whether Jarvis is allowed to use this model at all.</li>
          <li><strong className="text-white">Reset</strong> — Clears any temporary error / unavailable flag immediately so the model is retried on the next request instead of waiting 10 minutes.</li>
        </ul>
      </div>
    </div>
  );
}
