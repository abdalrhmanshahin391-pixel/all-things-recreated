import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Key, Check, Loader2, Trash2, ArrowLeft, Zap, ExternalLink, AlertTriangle, PlugZap } from "lucide-react";
import { toast } from "sonner";
import { SiteHeader } from "@/components/SiteHeader";
import { useAuth } from "@/hooks/useAuth";
import { saveAiKey, deleteAiKey, listAiKeyStatus, testGeminiKey } from "@/lib/jarvis.functions";

export const Route = createFileRoute("/admin/gemini-keys")({
  head: () => ({
    meta: [
      { title: "Gemini Batch Keys — AquaQBank Admin" },
      {
        name: "description",
        content:
          "Manage the Gemini 2.5 Flash-Lite API keys that power the Jarvis iPad v2 batch (50% off) pipeline.",
      },
      { property: "og:title", content: "Gemini Batch Keys — AquaQBank Admin" },
      {
        property: "og:description",
        content: "Add, test and rotate the Gemini keys used by the iPad batch tools.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: GeminiKeysPage,
});

type SlotState = { updatedAt: string | null };
type TestState = { ok: boolean; msg: string } | null;

function GeminiKeysPage() {
  const { user, isAdmin, loading } = useAuth();
  const navigate = useNavigate();

  const list = useServerFn(listAiKeyStatus);
  const save = useServerFn(saveAiKey);
  const del = useServerFn(deleteAiKey);
  const test = useServerFn(testGeminiKey);

  const [slots, setSlots] = useState<SlotState[]>(Array.from({ length: 5 }, () => ({ updatedAt: null })));
  const [drafts, setDrafts] = useState<string[]>(["", "", "", "", ""]);
  const [busy, setBusy] = useState<string | null>(null);
  const [tests, setTests] = useState<TestState[]>([null, null, null, null, null]);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
    else if (!loading && user && !isAdmin) navigate({ to: "/" });
  }, [loading, user, isAdmin, navigate]);

  async function refresh() {
    try {
      const r: any = await list();
      const next: SlotState[] = Array.from({ length: 5 }, () => ({ updatedAt: null }));
      for (const k of r.keys ?? []) {
        if (k.provider !== "gemini") continue;
        const idx = Math.min(Math.max((k.slot ?? 1) - 1, 0), 4);
        next[idx] = { updatedAt: k.updated_at };
      }
      setSlots(next);
    } catch {
      // ignore — the redirect effect handles non-admins
    }
  }

  useEffect(() => {
    if (isAdmin) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  async function saveSlot(i: number) {
    const key = drafts[i]?.trim();
    if (!key) return;
    setBusy(`save-${i}`);
    try {
      await save({ data: { provider: "gemini", apiKey: key, slot: i + 1 } });
      setDrafts((d) => d.map((v, idx) => (idx === i ? "" : v)));
      toast.success(`Key saved in slot ${i + 1}`);
      await refresh();
      await runTest(i);
    } catch (e: any) {
      toast.error(e?.message || "Save failed");
    } finally {
      setBusy(null);
    }
  }

  async function removeSlot(i: number) {
    if (!confirm(`Remove the Gemini key in slot ${i + 1}?`)) return;
    setBusy(`del-${i}`);
    try {
      await del({ data: { provider: "gemini", slot: i + 1 } });
      setTests((t) => t.map((v, idx) => (idx === i ? null : v)));
      toast.success(`Slot ${i + 1} cleared`);
      refresh();
    } catch (e: any) {
      toast.error(e?.message || "Delete failed");
    } finally {
      setBusy(null);
    }
  }

  async function runTest(i: number) {
    setBusy(`test-${i}`);
    setTests((t) => t.map((v, idx) => (idx === i ? null : v)));
    try {
      const r: any = await test({ data: { slot: i + 1 } });
      setTests((t) =>
        t.map((v, idx) =>
          idx === i
            ? { ok: !!r.ok, msg: r.ok ? `Working — ${r.model} replied “${r.reply}”` : r.error }
            : v,
        ),
      );
      if (r.ok) toast.success(`Slot ${i + 1} is working`);
      else toast.error(`Slot ${i + 1}: ${r.error}`);
    } catch (e: any) {
      setTests((t) => t.map((v, idx) => (idx === i ? { ok: false, msg: e?.message || "Test failed" } : v)));
    } finally {
      setBusy(null);
    }
  }

  if (loading || !user || !isAdmin) return <div className="min-h-screen bg-black" />;

  const connected = slots.filter((s) => s.updatedAt).length;
  const firstConnected = slots.findIndex((s) => s.updatedAt);

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-zinc-950 to-black text-white">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-6 pt-32 pb-20">
        <Link
          to="/admin/jarvis-batch-v2-ipad"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-white/50 hover:text-white mb-6"
        >
          <ArrowLeft className="w-3 h-3" /> Back to iPad v2 batch
        </Link>

        <div className="flex items-center gap-3 mb-2">
          <div className="grid place-items-center w-10 h-10 rounded-2xl bg-gradient-to-br from-sky-400 to-indigo-500 shadow-lg shadow-sky-500/30">
            <Key className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-[10px] font-bold tracking-[0.32em] text-sky-300 uppercase">Batch pipeline</p>
            <h1 className="font-serif text-3xl md:text-4xl font-bold">Gemini batch keys</h1>
          </div>
        </div>
        <p className="text-sm text-white/55 max-w-2xl mb-6">
          These keys power the iPad Jarvis batch tools (50% batch pricing). Add up to five — the pipeline
          rotates through them when one hits its daily quota.
        </p>

        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/[0.05] p-4 mb-6">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-emerald-300/90">
            <Zap className="w-3 h-3" /> Model locked
          </div>
          <p className="text-xs text-white/70 mt-1">
            The batch always runs on <code className="text-emerald-200">gemini-flash-lite-latest</code>. Nothing on
            this page changes the model.
          </p>
        </div>

        <div className="flex items-center justify-between gap-3 mb-4">
          <div
            className={`inline-flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-full ${
              connected > 0
                ? "bg-emerald-500/15 text-emerald-300"
                : "bg-rose-500/15 text-rose-300"
            }`}
          >
            <PlugZap className="w-3.5 h-3.5" />
            {connected > 0 ? `Connected · slot ${firstConnected + 1}` : "No key configured"}
          </div>
          <a
            href="https://aistudio.google.com/app/apikey"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs font-semibold text-sky-300 hover:text-sky-200"
          >
            Get a key in Google AI Studio <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        <div className="space-y-3">
          {slots.map((s, i) => {
            const isSet = !!s.updatedAt;
            const t = tests[i];
            return (
              <div key={i} className="rounded-2xl border border-white/10 bg-black/30 p-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-widest text-white/40 w-14 shrink-0">
                    Slot {i + 1}
                  </span>
                  <input
                    type="password"
                    value={drafts[i]}
                    onChange={(e) => setDrafts((d) => d.map((v, idx) => (idx === i ? e.target.value : v)))}
                    placeholder={isSet ? "•••••••••••• (paste to replace)" : "Paste an AIza… or AQ.… key"}
                    className="flex-1 rounded-xl border border-white/15 bg-black/40 px-3 py-2.5 text-sm placeholder:text-white/30 outline-none focus:border-sky-400"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => saveSlot(i)}
                      disabled={!drafts[i].trim() || busy === `save-${i}`}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-sky-500 px-3 py-2 text-xs font-bold text-white disabled:opacity-40"
                    >
                      {busy === `save-${i}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      Save
                    </button>
                    <button
                      onClick={() => runTest(i)}
                      disabled={!isSet || busy === `test-${i}`}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 px-3 py-2 text-xs font-bold text-white/80 hover:bg-white/5 disabled:opacity-40"
                    >
                      {busy === `test-${i}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlugZap className="w-3.5 h-3.5" />}
                      Test
                    </button>
                    <button
                      onClick={() => removeSlot(i)}
                      disabled={!isSet || busy === `del-${i}`}
                      className="rounded-xl border border-white/10 p-2 text-white/50 hover:text-rose-300 disabled:opacity-30"
                      aria-label={`Remove key in slot ${i + 1}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px]">
                  <span className={isSet ? "text-emerald-300 font-bold" : "text-white/35"}>
                    {isSet ? `Saved · ${new Date(s.updatedAt!).toLocaleString()}` : "Empty"}
                  </span>
                  {t && (
                    <span
                      className={`inline-flex items-center gap-1 font-semibold ${
                        t.ok ? "text-emerald-300" : "text-rose-300"
                      }`}
                    >
                      {t.ok ? <Check className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                      {t.msg}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <p className="mt-8 text-xs text-white/40">
          Keys are stored in the admin-only keys table and are never sent to the browser — only the saved
          date is shown here. Rotate a key any time by pasting a new one over the same slot.
        </p>
      </main>
    </div>
  );
}
