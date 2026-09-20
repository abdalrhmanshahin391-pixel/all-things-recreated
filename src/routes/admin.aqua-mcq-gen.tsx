import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Loader2, Plus, Trash2, PlayCircle, PauseCircle, KeyRound, FileUp, AlertTriangle, CheckCircle2 } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { useAuth } from "@/hooks/useAuth";
import { guardRedirect } from "@/lib/guard-redirect";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
// PDF helpers are loaded in the browser only (see onPdf) — a static import
// pulls the huge pdf.js bundle into the server build.
import {
  AMG_MODELS, amgListGroups, amgCreateGroup, amgUpdateGroup, amgDeleteGroup, amgGetGroup,
  amgRegisterPage, amgExtractPage, amgStartBatch, amgPollBatch,
  amgListKeys, amgSaveKey,
} from "@/lib/aqua-mcq-gen.functions";

const BUCKET = "amg-pages";

export const Route = createFileRoute("/admin/aqua-mcq-gen")({
  head: () => ({
    meta: [
      { title: "Aqua MCQ Gen Pro — AquaQBank Admin" },
      { name: "description", content: "Read past papers page by page, review every question, then solve and import them as organised groups." },
      { property: "og:title", content: "Aqua MCQ Gen Pro — AquaQBank Admin" },
      { property: "og:description", content: "Group-based exam question pipeline: extraction, final approval, solving and import." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AquaMcqGenPro,
});

type GroupRow = {
  id: string; name: string; provider: "google" | "openai"; model: string;
  mode: "standard" | "batch"; form_b_style: "in_question" | "multi_answer";
  instructions: string | null; status: string; source_name: string | null;
  page_count: number; error: string | null; batch_name: string | null;
  total?: number; pending?: number; approved?: number; flagged?: number;
};
type PageRow = { id: string; page_no: number; status: string; storage_path: string | null; error: string | null };

function base64ToBlob(b64: string, type = "image/jpeg"): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

/** Light clean-up for photographed pages: gentle contrast + brightness lift. */
function enhanceCanvas(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  try {
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = img.data;
    const contrast = 1.25, intercept = 128 * (1 - contrast) + 6;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = Math.max(0, Math.min(255, d[i] * contrast + intercept));
      d[i + 1] = Math.max(0, Math.min(255, d[i + 1] * contrast + intercept));
      d[i + 2] = Math.max(0, Math.min(255, d[i + 2] * contrast + intercept));
    }
    ctx.putImageData(img, 0, 0);
  } catch { /* tainted canvas — keep the original */ }
  return canvas;
}

function AquaMcqGenPro() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => { if (!loading && !user) guardRedirect(navigate); }, [loading, user, navigate]);

  const listGroups = useServerFn(amgListGroups);
  const createGroup = useServerFn(amgCreateGroup);
  const updateGroup = useServerFn(amgUpdateGroup);
  const deleteGroup = useServerFn(amgDeleteGroup);
  const getGroup = useServerFn(amgGetGroup);
  const registerPage = useServerFn(amgRegisterPage);
  const extractPage = useServerFn(amgExtractPage);
  const startBatch = useServerFn(amgStartBatch);
  const pollBatch = useServerFn(amgPollBatch);
  const listKeys = useServerFn(amgListKeys);
  const saveKey = useServerFn(amgSaveKey);

  const [denied, setDenied] = useState(false);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [active, setActive] = useState<GroupRow | null>(null);
  const [pages, setPages] = useState<PageRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [keys, setKeys] = useState<Record<string, string | null>>({});
  const [keyInput, setKeyInput] = useState({ google: "", openai: "" });
  const stopRef = useRef(false);

  // new-group form
  const [form, setForm] = useState({
    name: "", provider: "google" as "google" | "openai", model: "gemini-2.5-flash",
    mode: "standard" as "standard" | "batch", formBStyle: "in_question" as "in_question" | "multi_answer",
    instructions: "",
  });

  const refreshGroups = useCallback(async () => {
    try {
      const rows = await listGroups({});
      setGroups(rows as GroupRow[]);
      setDenied(false);
    } catch (e: any) {
      if (String(e?.message ?? e).includes("Forbidden")) setDenied(true);
    }
  }, [listGroups]);

  const refreshActive = useCallback(async (id: string) => {
    try {
      const res: any = await getGroup({ data: { groupId: id } });
      setActive(res.group as GroupRow);
      setPages(res.pages as PageRow[]);
    } catch (e: any) { toast.error(String(e?.message ?? e)); }
  }, [getGroup]);

  useEffect(() => { if (user) { void refreshGroups(); listKeys({}).then(setKeys).catch(() => {}); } }, [user, refreshGroups, listKeys]);
  useEffect(() => { if (activeId) void refreshActive(activeId); }, [activeId, refreshActive]);

  // keep polling while a batch run is in flight
  useEffect(() => {
    if (!active?.batch_name) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res: any = await pollBatch({ data: { groupId: active.id } });
        if (cancelled) return;
        if (res.state === "done") { toast.success("The batch run finished."); await refreshActive(active.id); await refreshGroups(); }
        else if (res.state === "failed") { toast.error("The batch run failed."); await refreshActive(active.id); }
      } catch { /* keep waiting */ }
    };
    const t = setInterval(tick, 20_000);
    void tick();
    return () => { cancelled = true; clearInterval(t); };
  }, [active?.batch_name, active?.id, pollBatch, refreshActive, refreshGroups]);

  async function onCreate() {
    if (!form.name.trim()) { toast.error("Give the group a name first."); return; }
    try {
      const row: any = await createGroup({ data: { ...form, name: form.name.trim() } });
      setForm((f) => ({ ...f, name: "", instructions: "" }));
      await refreshGroups();
      setActiveId(row.id);
      toast.success("Group created.");
    } catch (e: any) { toast.error(String(e?.message ?? e)); }
  }

  async function onSaveKey(provider: "google" | "openai") {
    const value = keyInput[provider].trim();
    if (value.length < 10) { toast.error("That key looks too short."); return; }
    try {
      await saveKey({ data: { provider, apiKey: value } });
      setKeyInput((k) => ({ ...k, [provider]: "" }));
      setKeys(await listKeys({}));
      toast.success("Key saved.");
    } catch (e: any) { toast.error(String(e?.message ?? e)); }
  }

  /** Render every page of the PDF, upload it privately, then read it page by page. */
  async function onPdf(file: File) {
    if (!active) return;
    setBusy(true); stopRef.current = false;
    try {
      setProgress("Opening the file…");
      const doc = await loadPdfForRenderPreferWorker(file);
      const total = doc.numPages as number;
      await updateGroup({ data: { groupId: active.id, patch: { source_name: file.name.slice(0, 200), page_count: total, status: "extracting", error: null } } });
      for (let p = 1; p <= total; p++) {
        if (stopRef.current) break;
        setProgress(`Preparing page ${p} of ${total}…`);
        const canvas = enhanceCanvas(await renderPageToCanvas(doc, p, 2048));
        const b64 = canvasToJpegBase64(canvas, 0.92);
        const path = `${active.id}/${String(p).padStart(4, "0")}.jpg`;
        const { error } = await supabase.storage.from(BUCKET).upload(path, base64ToBlob(b64), { upsert: true, contentType: "image/jpeg" });
        if (error) throw new Error(error.message);
        await registerPage({ data: { groupId: active.id, pageNo: p, storagePath: path } });
      }
      clearPdfRenderCache?.();
      await refreshActive(active.id);
      toast.success("All pages are ready. Start the reading step when you want.");
    } catch (e: any) {
      toast.error(String(e?.message ?? e));
    } finally { setBusy(false); setProgress(""); }
  }

  async function onExtract() {
    if (!active) return;
    setBusy(true); stopRef.current = false;
    try {
      if (active.mode === "batch") {
        setProgress("Sending every page to the discounted queue…");
        const res: any = await startBatch({ data: { groupId: active.id } });
        toast.success(`${res.pages} pages queued. This can take a while; you can leave the page.`);
        await refreshActive(active.id);
      } else {
        const todo = pages.filter((p) => p.status !== "done" && p.storage_path);
        let found = 0;
        for (let i = 0; i < todo.length; i++) {
          if (stopRef.current) break;
          setProgress(`Reading page ${todo[i].page_no} (${i + 1} of ${todo.length})…`);
          const res: any = await extractPage({ data: { groupId: active.id, pageNo: todo[i].page_no } });
          if (res.ok) found += res.count; else toast.error(`Page ${todo[i].page_no}: ${res.error}`);
          await refreshActive(active.id);
        }
        if (!stopRef.current) await updateGroup({ data: { groupId: active.id, patch: { status: "approval" } } });
        toast.success(`${found} questions found.`);
        await refreshActive(active.id);
      }
      await refreshGroups();
    } catch (e: any) { toast.error(String(e?.message ?? e)); }
    finally { setBusy(false); setProgress(""); }
  }

  async function onDelete(id: string) {
    if (!confirm("Delete this group and everything inside it?")) return;
    try {
      await deleteGroup({ data: { groupId: id } });
      if (activeId === id) { setActiveId(null); setActive(null); setPages([]); }
      await refreshGroups();
      toast.success("Group deleted.");
    } catch (e: any) { toast.error(String(e?.message ?? e)); }
  }

  const done = pages.filter((p) => p.status === "done").length;
  const models = AMG_MODELS[form.provider];

  if (loading) return null;
  if (denied) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <main className="container mx-auto max-w-2xl px-4 py-16 text-center">
          <h1 className="text-2xl font-bold">Aqua MCQ Gen Pro</h1>
          <p className="mt-3 text-muted-foreground">This tool is for admins and quality-assurance members only.</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="container mx-auto max-w-6xl px-4 py-8">
        <Link to="/admin" className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to admin
        </Link>
        <h1 className="text-3xl font-bold">Aqua MCQ Gen Pro</h1>
        <p className="mt-1 text-muted-foreground">Every paper becomes a named group: read it, review it, solve it, then import it.</p>

        <Card className="mt-6">
          <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><KeyRound className="h-4 w-4" /> Your AI keys</CardTitle></CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            {(["google", "openai"] as const).map((p) => (
              <div key={p} className="space-y-2">
                <Label>{p === "google" ? "Google AI Studio key" : "OpenAI key"}</Label>
                <div className="flex gap-2">
                  <Input type="password" placeholder={keys[p] ? "Saved — type a new key to replace it" : "Paste the key"}
                    value={keyInput[p]} onChange={(e) => setKeyInput((k) => ({ ...k, [p]: e.target.value }))} />
                  <Button variant="secondary" onClick={() => onSaveKey(p)}>Save</Button>
                </div>
                {keys[p] ? <p className="text-xs text-muted-foreground">Saved.</p> : null}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Plus className="h-4 w-4" /> New group</CardTitle></CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Group name</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="TB paper 2024" />
            </div>
            <div className="space-y-2">
              <Label>AI service</Label>
              <Select value={form.provider} onValueChange={(v: any) => setForm((f) => ({ ...f, provider: v, model: AMG_MODELS[v as "google" | "openai"][0].id }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="google">Google AI Studio</SelectItem>
                  <SelectItem value="openai">OpenAI</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Model</Label>
              <Select value={form.model} onValueChange={(v) => setForm((f) => ({ ...f, model: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{models.map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Speed</Label>
              <Select value={form.mode} onValueChange={(v: any) => setForm((f) => ({ ...f, mode: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">Standard — fastest</SelectItem>
                  <SelectItem value="batch">50% saver — slower queue</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Questions with numbered statements (1,2,3,4 then A–D)</Label>
              <Select value={form.formBStyle} onValueChange={(v: any) => setForm((f) => ({ ...f, formBStyle: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="in_question">Statements inside the question, one answer (A–D)</SelectItem>
                  <SelectItem value="multi_answer">Statements become the choices, more than one answer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Instructions for this paper (optional)</Label>
              <Textarea rows={3} value={form.instructions} onChange={(e) => setForm((f) => ({ ...f, instructions: e.target.value }))}
                placeholder="Anything special about this PDF — skip the first two pages, answers are printed at the end, etc." />
            </div>
            <div><Button onClick={onCreate}>Create group</Button></div>
          </CardContent>
        </Card>

        <div className="mt-8 grid gap-6 lg:grid-cols-[320px_1fr]">
          <div className="space-y-3">
            <h2 className="text-sm font-semibold uppercase text-muted-foreground">Groups</h2>
            {groups.length === 0 ? <p className="text-sm text-muted-foreground">No groups yet.</p> : null}
            {groups.map((g) => (
              <button key={g.id} onClick={() => setActiveId(g.id)}
                className={`w-full rounded-lg border p-3 text-left transition ${activeId === g.id ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{g.name}</span>
                  <Badge variant="secondary">{g.status}</Badge>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {g.total ?? 0} questions · {g.approved ?? 0} approved{(g.flagged ?? 0) > 0 ? ` · ${g.flagged} need a look` : ""}
                </div>
              </button>
            ))}
          </div>

          <div>
            {!active ? (
              <p className="text-sm text-muted-foreground">Pick a group to work on it.</p>
            ) : (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
                    <span>{active.name}</span>
                    <span className="flex gap-2">
                      <Button size="sm" variant="ghost" onClick={() => onDelete(active.id)}><Trash2 className="mr-1 h-4 w-4" /> Delete</Button>
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="text-sm text-muted-foreground">
                    {active.provider === "google" ? "Google" : "OpenAI"} · {active.model} · {active.mode === "batch" ? "50% saver" : "standard"} ·{" "}
                    {active.form_b_style === "multi_answer" ? "statements as choices" : "statements inside the question"}
                  </div>
                  {active.error ? (
                    <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
                      <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" /> {active.error}
                    </div>
                  ) : null}

                  <div className="space-y-2">
                    <Label className="flex items-center gap-2"><FileUp className="h-4 w-4" /> Paper (PDF)</Label>
                    <Input type="file" accept="application/pdf" disabled={busy}
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) void onPdf(f); e.currentTarget.value = ""; }} />
                    {active.source_name ? <p className="text-xs text-muted-foreground">Loaded: {active.source_name} ({active.page_count} pages)</p> : null}
                  </div>

                  {pages.length > 0 ? (
                    <div className="space-y-2">
                      <Progress value={pages.length ? (done / pages.length) * 100 : 0} />
                      <p className="text-xs text-muted-foreground">{done} of {pages.length} pages read</p>
                      <div className="flex flex-wrap gap-1">
                        {pages.map((p) => (
                          <span key={p.id} title={p.error ?? p.status}
                            className={`rounded px-1.5 py-0.5 text-[11px] ${p.status === "done" ? "bg-emerald-500/15 text-emerald-600" : p.status === "failed" ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground"}`}>
                            {p.page_no}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="flex flex-wrap items-center gap-2">
                    <Button onClick={onExtract} disabled={busy || pages.length === 0 || Boolean(active.batch_name)}>
                      {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlayCircle className="mr-2 h-4 w-4" />}
                      {active.mode === "batch" ? "Send to the 50% saver queue" : "Read the pages"}
                    </Button>
                    {busy ? <Button variant="outline" onClick={() => { stopRef.current = true; }}><PauseCircle className="mr-2 h-4 w-4" /> Stop</Button> : null}
                    {active.batch_name ? <Badge variant="secondary"><Loader2 className="mr-1 h-3 w-3 animate-spin" /> Queued with the AI</Badge> : null}
                    {(active.total ?? 0) > 0 ? <Badge variant="outline"><CheckCircle2 className="mr-1 h-3 w-3" /> {active.total} questions waiting for review</Badge> : null}
                  </div>
                  {progress ? <p className="text-sm text-muted-foreground">{progress}</p> : null}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
