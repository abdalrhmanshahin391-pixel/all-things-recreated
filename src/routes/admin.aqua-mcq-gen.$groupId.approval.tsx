import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft, Loader2, Check, Flag, Trash2, Plus, Sparkles, Copy, ZoomIn, ZoomOut,
  RotateCcw, AlertTriangle, History, Highlighter, Undo2, Eraser, ChevronDown,
} from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { useAuth } from "@/hooks/useAuth";
import { guardRedirect } from "@/lib/guard-redirect";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  amgGetGroup, amgPageUrls, amgListItems, amgUpdateItem, amgAddItem, amgDeleteItems,
  amgSetStatus, amgDuplicates, amgCompleteItems, amgListEvents,
} from "@/lib/aqua-mcq-gen.functions";

export const Route = createFileRoute("/admin/aqua-mcq-gen/$groupId/approval")({
  head: () => ({
    meta: [
      { title: "Final question approval — Aqua MCQ Gen Pro" },
      { name: "description", content: "Review every extracted question beside the original page before it moves on to solving." },
      { property: "og:title", content: "Final question approval — Aqua MCQ Gen Pro" },
      { property: "og:description", content: "Side-by-side review of extracted exam questions against the original paper." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ApprovalScreen,
});

type Item = {
  id: string; page_no: number; order_index: number; form: "A" | "B"; number_label: string;
  stem: string; statements: { n: string; text: string }[]; options: { label: string; text: string }[];
  flagged: boolean; flag_reason: string; status: string; answer_mode: string;
};

/** Normalised text used to point out how two copies differ. */
function norm(t: any) { return String(t ?? "").replace(/\s+/g, " ").trim().toLowerCase(); }
function optionsText(c: any) {
  return Array.isArray(c?.options) ? c.options.map((o: any) => norm(o?.text ?? o)).join(" | ") : "";
}

function ApprovalScreen() {
  const { groupId } = Route.useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => { if (!loading && !user) guardRedirect(navigate); }, [loading, user, navigate]);

  const getGroup = useServerFn(amgGetGroup);
  const pageUrls = useServerFn(amgPageUrls);
  const listItems = useServerFn(amgListItems);
  const updateItem = useServerFn(amgUpdateItem);
  const addItem = useServerFn(amgAddItem);
  const deleteItems = useServerFn(amgDeleteItems);
  const setStatus = useServerFn(amgSetStatus);
  const duplicates = useServerFn(amgDuplicates);
  const completeItems = useServerFn(amgCompleteItems);
  const listEvents = useServerFn(amgListEvents);

  const [group, setGroup] = useState<any>(null);
  const [urls, setUrls] = useState<{ page_no: number; url: string | null }[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [filter, setFilter] = useState<"pending" | "flagged" | "approved" | "all">("pending");
  const [pageFilter, setPageFilter] = useState(0);
  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState<Item | null>(null);
  const [busy, setBusy] = useState(false);
  const [dups, setDups] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);

  // viewer state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const layerRef = useRef<HTMLDivElement | null>(null);

  // Highlighter: boxes are kept as fractions of the page picture, so they
  // stay on the same words while zooming or moving. They are a reading aid
  // and are never saved.
  type Mark = { x: number; y: number; w: number; h: number };
  const [marking, setMarking] = useState(false);
  const [marks, setMarks] = useState<Record<number, Mark[]>>({});
  const markStart = useRef<{ x: number; y: number } | null>(null);
  const [markDraft, setMarkDraft] = useState<Mark | null>(null);
  const [openDup, setOpenDup] = useState<number | null>(null);
  const [tab, setTab] = useState("review");
  const [focusId, setFocusId] = useState<string | null>(null);

  function layerPoint(e: React.PointerEvent) {
    const box = layerRef.current?.getBoundingClientRect();
    if (!box || !box.width || !box.height) return null;
    return {
      x: Math.min(1, Math.max(0, (e.clientX - box.left) / box.width)),
      y: Math.min(1, Math.max(0, (e.clientY - box.top) / box.height)),
    };
  }

  // Touch handling for tablets: one finger drags, two fingers pinch, double
  // tap zooms. Updates are painted once per frame so it stays smooth.
  const paneRef = useRef<HTMLDivElement | null>(null);
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{ dist: number; zoom: number } | null>(null);
  const lastTap = useRef(0);
  const rafRef = useRef<number | null>(null);
  const pendingRef = useRef<(() => void) | null>(null);

  const schedule = useCallback((fn: () => void) => {
    pendingRef.current = fn;
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const run = pendingRef.current;
      pendingRef.current = null;
      run?.();
    });
  }, []);

  useEffect(() => () => { if (rafRef.current != null) cancelAnimationFrame(rafRef.current); }, []);

  function endPointer(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchRef.current = null;
    if (marking) {
      const page = draft?.page_no ?? 0;
      if (markStart.current && markDraft && markDraft.w > 0.005 && markDraft.h > 0.004) {
        const box = markDraft;
        setMarks((m) => ({ ...m, [page]: [...(m[page] ?? []), box] }));
      }
      markStart.current = null; setMarkDraft(null);
    }
    dragRef.current = null;
  }

  const reloadItems = useCallback(async () => {
    const rows: any = await listItems({ data: { groupId, filter, pageNo: pageFilter } });
    setItems(rows as Item[]);
    setIndex((i) => Math.min(i, Math.max(0, rows.length - 1)));
  }, [listItems, groupId, filter, pageFilter]);

  useEffect(() => {
    if (!focusId) return;
    const at = items.findIndex((it) => it.id === focusId);
    if (at >= 0) { setIndex(at); setFocusId(null); }
  }, [items, focusId]);

  /** Jump to a repeated question inside the review tab. */
  function openInReview(id: string) {
    setTab("review");
    setFilter("all");
    setPageFilter(0);
    setFocusId(id);
  }

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const g: any = await getGroup({ data: { groupId } });
        setGroup(g.group);
        setUrls(await pageUrls({ data: { groupId } }) as any);
      } catch (e: any) { toast.error(String(e?.message ?? e)); }
    })();
  }, [user, groupId, getGroup, pageUrls]);

  useEffect(() => { if (user) void reloadItems(); }, [user, reloadItems]);

  const current = items[index] ?? null;
  useEffect(() => { setDraft(current ? { ...current } : null); setZoom(1); setPan({ x: 0, y: 0 }); }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const pageUrl = useMemo(
    () => urls.find((u) => u.page_no === (draft?.page_no ?? 0))?.url ?? null,
    [urls, draft?.page_no],
  );

  async function save(patch: Partial<Item>, message?: string) {
    if (!draft) return;
    setBusy(true);
    try {
      await updateItem({ data: { itemId: draft.id, patch: patch as any } });
      setItems((list) => list.map((it) => (it.id === draft.id ? { ...it, ...patch } as Item : it)));
      if (message) toast.success(message);
    } catch (e: any) { toast.error(String(e?.message ?? e)); }
    finally { setBusy(false); }
  }

  async function approve() {
    if (!draft) return;
    setBusy(true);
    try {
      await updateItem({ data: { itemId: draft.id, patch: {
        stem: draft.stem, number_label: draft.number_label, form: draft.form,
        statements: draft.statements, options: draft.options, flagged: false, flag_reason: "",
      } } });
      await setStatus({ data: { itemIds: [draft.id], status: "approved" } });
      toast.success("Approved.");
      await reloadItems();
    } catch (e: any) { toast.error(String(e?.message ?? e)); }
    finally { setBusy(false); }
  }

  async function approveAllVisible() {
    if (!items.length) return;
    if (!confirm(`Approve all ${items.length} questions shown?`)) return;
    setBusy(true);
    try {
      await setStatus({ data: { itemIds: items.map((i) => i.id), status: "approved" } });
      toast.success("All shown questions approved.");
      await reloadItems();
    } catch (e: any) { toast.error(String(e?.message ?? e)); }
    finally { setBusy(false); }
  }

  async function aiComplete(all: boolean) {
    const targets = all ? items.filter((i) => i.flagged).map((i) => i.id) : draft ? [draft.id] : [];
    if (!targets.length) { toast.error("Nothing to complete."); return; }
    setBusy(true);
    try {
      const res: any = await completeItems({ data: { groupId, itemIds: targets.slice(0, 40) } });
      toast.success(`${res.fixed} question(s) completed.`);
      if (res.failures?.length) toast.error(res.failures[0]);
      await reloadItems();
    } catch (e: any) { toast.error(String(e?.message ?? e)); }
    finally { setBusy(false); }
  }

  async function removeCurrent() {
    if (!draft || !confirm("Remove this question from the page?")) return;
    setBusy(true);
    try {
      await deleteItems({ data: { itemIds: [draft.id] } });
      await reloadItems();
    } catch (e: any) { toast.error(String(e?.message ?? e)); }
    finally { setBusy(false); }
  }

  async function addToPage() {
    const pageNo = draft?.page_no ?? (pageFilter || 1);
    setBusy(true);
    try {
      await addItem({ data: { groupId, pageNo } });
      await reloadItems();
      toast.success(`A blank question was added to page ${pageNo}.`);
    } catch (e: any) { toast.error(String(e?.message ?? e)); }
    finally { setBusy(false); }
  }

  async function loadDups() { try { setDups(await duplicates({ data: { groupId } }) as any); } catch (e: any) { toast.error(String(e?.message ?? e)); } }
  async function loadEvents() { try { setEvents(await listEvents({ data: { groupId } }) as any); } catch (e: any) { toast.error(String(e?.message ?? e)); } }

  async function removeDuplicates(ids: string[]) {
    if (!ids.length || !confirm(`Delete ${ids.length} repeated question(s)?`)) return;
    setBusy(true);
    try {
      await deleteItems({ data: { itemIds: ids } });
      await loadDups(); await reloadItems();
      toast.success("Repeats removed.");
    } catch (e: any) { toast.error(String(e?.message ?? e)); }
    finally { setBusy(false); }
  }

  function setOption(i: number, field: "label" | "text", value: string) {
    if (!draft) return;
    const options = draft.options.map((o, k) => (k === i ? { ...o, [field]: value } : o));
    setDraft({ ...draft, options });
  }
  function setStatement(i: number, field: "n" | "text", value: string) {
    if (!draft) return;
    const statements = draft.statements.map((s, k) => (k === i ? { ...s, [field]: value } : s));
    setDraft({ ...draft, statements });
  }

  if (loading) return null;

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="container mx-auto max-w-[1500px] px-3 py-6">
        <Link to="/admin/aqua-mcq-gen" className="mb-3 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to groups
        </Link>
        <h1 className="text-2xl font-bold">Final question approval{group ? ` — ${group.name}` : ""}</h1>

        <Tabs value={tab} onValueChange={setTab} className="mt-4">
          <TabsList>
            <TabsTrigger value="review">Review</TabsTrigger>
            <TabsTrigger value="dups" onClick={loadDups}>Repeated questions</TabsTrigger>
            <TabsTrigger value="log" onClick={loadEvents}>History</TabsTrigger>
          </TabsList>

          <TabsContent value="review" className="mt-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Select value={filter} onValueChange={(v: any) => { setFilter(v); setIndex(0); }}>
                <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Waiting for review</SelectItem>
                  <SelectItem value="flagged">Needs a look (yellow)</SelectItem>
                  <SelectItem value="approved">Already approved</SelectItem>
                  <SelectItem value="all">Everything</SelectItem>
                </SelectContent>
              </Select>
              <Select value={String(pageFilter)} onValueChange={(v) => { setPageFilter(Number(v)); setIndex(0); }}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">All pages</SelectItem>
                  {urls.map((u) => <SelectItem key={u.page_no} value={String(u.page_no)}>Page {u.page_no}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button size="sm" variant="outline" onClick={addToPage} disabled={busy}><Plus className="mr-1 h-4 w-4" /> Add question</Button>
              <Button size="sm" variant="outline" onClick={() => aiComplete(true)} disabled={busy}><Sparkles className="mr-1 h-4 w-4" /> Let the AI complete all flagged</Button>
              <Button size="sm" variant="secondary" onClick={approveAllVisible} disabled={busy || !items.length}><Check className="mr-1 h-4 w-4" /> Approve all shown</Button>
              <span className="text-sm text-muted-foreground">{items.length ? `${index + 1} of ${items.length}` : "Nothing here"}</span>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              {/* original page */}
              <Card className="overflow-hidden">
                <div className="flex items-center gap-2 border-b p-2">
                  <Button size="icon" variant="ghost" onClick={() => setZoom((z) => Math.min(6, z * 1.25))}><ZoomIn className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => setZoom((z) => Math.max(0.5, z / 1.25))}><ZoomOut className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}><RotateCcw className="h-4 w-4" /></Button>
                  <Button size="icon" variant={marking ? "secondary" : "ghost"} title="Highlight" onClick={() => setMarking((v) => !v)}>
                    <Highlighter className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" title="Undo last highlight"
                    onClick={() => setMarks((m) => { const p = draft?.page_no ?? 0; return { ...m, [p]: (m[p] ?? []).slice(0, -1) }; })}>
                    <Undo2 className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" title="Clear highlights"
                    onClick={() => setMarks((m) => ({ ...m, [draft?.page_no ?? 0]: [] }))}>
                    <Eraser className="h-4 w-4" />
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Page {draft?.page_no ?? "—"} · {marking ? "drag to highlight" : "pinch or scroll to zoom, drag to move, double tap to zoom"}
                  </span>
                </div>
                <div
                  ref={paneRef}
                  className={`relative h-[70vh] touch-none overflow-hidden overscroll-contain bg-muted/40 ${marking ? "cursor-crosshair" : ""}`}
                  style={{ touchAction: "none" }}
                  onWheel={(e) => { e.preventDefault(); setZoom((z) => Math.min(6, Math.max(0.5, z * (e.deltaY < 0 ? 1.1 : 0.9)))); }}
                  onPointerDown={(e) => {
                    paneRef.current?.setPointerCapture?.(e.pointerId);
                    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

                    // two fingers: start a pinch and stop any drag/highlight
                    if (pointers.current.size === 2) {
                      const [a, b] = [...pointers.current.values()];
                      pinchRef.current = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom };
                      dragRef.current = null; markStart.current = null; setMarkDraft(null);
                      return;
                    }

                    // double tap: zoom in, then back to fit
                    const now = Date.now();
                    if (!marking && now - lastTap.current < 300) {
                      setZoom((z) => (z > 1.2 ? 1 : 2.2));
                      if (zoom > 1.2) setPan({ x: 0, y: 0 });
                      lastTap.current = 0;
                      return;
                    }
                    lastTap.current = now;

                    if (marking) { markStart.current = layerPoint(e); return; }
                    dragRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
                  }}
                  onPointerMove={(e) => {
                    if (pointers.current.has(e.pointerId)) {
                      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
                    }

                    if (pointers.current.size >= 2 && pinchRef.current) {
                      const [a, b] = [...pointers.current.values()];
                      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
                      const next = Math.min(6, Math.max(0.5, pinchRef.current.zoom * (dist / pinchRef.current.dist)));
                      schedule(() => setZoom(next));
                      return;
                    }

                    if (marking) {
                      const a = markStart.current; if (!a) return;
                      const b = layerPoint(e); if (!b) return;
                      schedule(() => setMarkDraft({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) }));
                      return;
                    }

                    const d = dragRef.current;
                    if (d) { const nx = e.clientX - d.x, ny = e.clientY - d.y; schedule(() => setPan({ x: nx, y: ny })); }
                  }}
                  onPointerUp={(e) => endPointer(e)}
                  onPointerCancel={(e) => endPointer(e)}
                  onPointerLeave={(e) => endPointer(e)}
                >
                  {pageUrl ? (
                    <div
                      ref={layerRef}
                      className="absolute left-0 top-0 w-full will-change-transform"
                      style={{ transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`, transformOrigin: "top left" }}
                    >
                      <img src={pageUrl} alt={`Page ${draft?.page_no}`} draggable={false}
                        className="pointer-events-none block w-full max-w-none select-none" />
                      {[...(marks[draft?.page_no ?? 0] ?? []), ...(markDraft ? [markDraft] : [])].map((m, i) => (
                        <div key={i} className="pointer-events-none absolute rounded-[2px] bg-yellow-300/40 ring-1 ring-yellow-500/60"
                          style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%`, width: `${m.w * 100}%`, height: `${m.h * 100}%` }} />
                      ))}
                    </div>
                  ) : (
                    <p className="p-6 text-sm text-muted-foreground">No picture for this page.</p>
                  )}
                </div>
              </Card>

              {/* the question */}
              <Card>
                <CardContent className="space-y-4 p-4">
                  {!draft ? (
                    <p className="text-sm text-muted-foreground">Nothing to review with these filters.</p>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">Page {draft.page_no}</Badge>
                        <Badge variant="secondary">{draft.form === "B" ? "Numbered statements" : "Normal"}</Badge>
                        {draft.flagged ? (
                          <Badge className="bg-yellow-400/20 text-yellow-700 hover:bg-yellow-400/20">
                            <AlertTriangle className="mr-1 h-3 w-3" /> {draft.flag_reason || "Needs a look"}
                          </Badge>
                        ) : null}
                        <Badge variant="outline">{draft.status}</Badge>
                      </div>

                      <div className="grid grid-cols-[100px_1fr] gap-2">
                        <div className="space-y-1">
                          <Label>Number</Label>
                          <Input value={draft.number_label} onChange={(e) => setDraft({ ...draft, number_label: e.target.value })} />
                        </div>
                        <div className="space-y-1">
                          <Label>Shape</Label>
                          <Select value={draft.form} onValueChange={(v: any) => setDraft({ ...draft, form: v })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="A">Normal question</SelectItem>
                              <SelectItem value="B">Numbered statements (1,2,3,4)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <Label>Question</Label>
                        <Textarea rows={5} value={draft.stem} onChange={(e) => setDraft({ ...draft, stem: e.target.value })} />
                      </div>

                      {draft.statements.length > 0 ? (
                        <div className="space-y-2">
                          <Label>{draft.form === "B" ? "Numbered statements / printed combinations" : "Extra lines"}</Label>
                          {draft.statements.map((s, i) => (
                            <div key={i} className="flex gap-2">
                              <Input className="w-16" value={s.n} onChange={(e) => setStatement(i, "n", e.target.value)} />
                              <Input value={s.text} onChange={(e) => setStatement(i, "text", e.target.value)} />
                              <Button size="icon" variant="ghost" onClick={() => setDraft({ ...draft, statements: draft.statements.filter((_, k) => k !== i) })}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      <Button size="sm" variant="ghost" onClick={() => setDraft({ ...draft, statements: [...draft.statements, { n: String(draft.statements.length + 1), text: "" }] })}>
                        <Plus className="mr-1 h-4 w-4" /> Add a statement line
                      </Button>

                      <div className="space-y-2">
                        <Label>Choices</Label>
                        {draft.options.map((o, i) => (
                          <div key={i} className="flex gap-2">
                            <Input className="w-16" value={o.label} onChange={(e) => setOption(i, "label", e.target.value)} />
                            <Input value={o.text} onChange={(e) => setOption(i, "text", e.target.value)} />
                            <Button size="icon" variant="ghost" onClick={() => setDraft({ ...draft, options: draft.options.filter((_, k) => k !== i) })}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                        <Button size="sm" variant="ghost"
                          onClick={() => setDraft({ ...draft, options: [...draft.options, { label: String.fromCharCode(65 + draft.options.length), text: "" }] })}>
                          <Plus className="mr-1 h-4 w-4" /> Add a choice
                        </Button>
                      </div>

                      <div className="flex flex-wrap gap-2 border-t pt-3">
                        <Button onClick={approve} disabled={busy}>
                          {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />} Approve
                        </Button>
                        <Button variant="outline" disabled={busy}
                          onClick={() => save({
                            stem: draft.stem, number_label: draft.number_label, form: draft.form,
                            statements: draft.statements, options: draft.options,
                          }, "Saved.")}>Save changes</Button>
                        <Button variant="outline" disabled={busy} onClick={() => toggleFlag()}>
                          <Flag className="mr-1 h-4 w-4" /> {draft.flagged ? "Unflag" : "Flag"}
                        </Button>
                        {draft.flagged ? (
                          <Button variant="secondary" disabled={busy} onClick={() => aiComplete(false)}>
                            <Sparkles className="mr-1 h-4 w-4" /> Let the AI complete it
                          </Button>
                        ) : null}
                        {draft.status === "approved" ? (
                          <Button variant="outline" disabled={busy}
                            onClick={async () => { await setStatus({ data: { itemIds: [draft.id], status: "pending" } }); await reloadItems(); }}>
                            Send back to review
                          </Button>
                        ) : null}
                        <Button variant="ghost" className="text-destructive" disabled={busy} onClick={removeCurrent}>
                          <Trash2 className="mr-1 h-4 w-4" /> Remove
                        </Button>
                      </div>

                      <div className="flex justify-between pt-1">
                        <Button size="sm" variant="ghost" disabled={index === 0} onClick={() => setIndex((i) => i - 1)}>Previous</Button>
                        <Button size="sm" variant="ghost" disabled={index >= items.length - 1} onClick={() => setIndex((i) => i + 1)}>Next</Button>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="dups" className="mt-4 space-y-3">
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={loadDups}><Copy className="mr-1 h-4 w-4" /> Check again</Button>
              <Button size="sm" variant="secondary" disabled={!dups.length}
                onClick={() => removeDuplicates(dups.flatMap((d) => d.extras.map((e: any) => e.id)))}>
                Delete every repeat
              </Button>
            </div>
            {!dups.length ? <p className="text-sm text-muted-foreground">No repeated questions found.</p> : null}
            {dups.map((d, i) => {
              const copies: any[] = d.items ?? [d.keep, ...d.extras];
              const open = openDup === i;
              const sameStem = copies.every((c) => norm(c.stem) === norm(copies[0].stem));
              const sameOptions = copies.every((c) => optionsText(c) === optionsText(copies[0]));
              return (
                <Card key={i}><CardContent className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium">
                      {copies.length} copies · pages {copies.map((c) => c.page_no).join(", ")} — {String(d.keep.stem).slice(0, 110)}…
                    </p>
                    <Button size="sm" variant="ghost" onClick={() => setOpenDup(open ? null : i)}>
                      <ChevronDown className={`mr-1 h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
                      {open ? "Hide details" : "See details"}
                    </Button>
                  </div>

                  {open ? (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">
                        Wording {sameStem ? "is identical" : "differs slightly"} · choices {sameOptions ? "are identical" : "differ"}.
                      </p>
                      {copies.map((c, ci) => (
                        <div key={c.id} className="rounded border p-3 text-sm">
                          <div className="mb-1 flex flex-wrap items-center gap-2">
                            <span className="font-semibold">{ci === 0 ? "Kept copy" : `Repeat ${ci}`}</span>
                            <span className="text-muted-foreground">
                              page {c.page_no}{c.number_label ? ` · question ${c.number_label}` : ""}
                              {c.flagged ? " · needs a look" : ""}
                            </span>
                            <span className="ms-auto flex gap-1">
                              <Button size="sm" variant="ghost" onClick={() => openInReview(c.id)}>Open in review</Button>
                              {ci > 0 ? (
                                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => removeDuplicates([c.id])}>Delete</Button>
                              ) : null}
                            </span>
                          </div>
                          <p className="whitespace-pre-wrap">{c.stem}</p>
                          {Array.isArray(c.statements) && c.statements.length ? (
                            <ul className="mt-1 list-decimal ps-5 text-muted-foreground">
                              {c.statements.map((st: any, k: number) => <li key={k}>{typeof st === "string" ? st : st?.text}</li>)}
                            </ul>
                          ) : null}
                          {Array.isArray(c.options) && c.options.length ? (
                            <ul className="mt-1 space-y-0.5 text-muted-foreground">
                              {c.options.map((o: any, k: number) => (
                                <li key={k}>{(o?.label ?? String.fromCharCode(65 + k))}. {o?.text ?? String(o)}</li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    d.extras.map((e: any) => (
                      <div key={e.id} className="flex items-center justify-between gap-2 rounded border p-2 text-sm">
                        <span>Repeat on page {e.page_no}</span>
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => removeDuplicates([e.id])}>Delete</Button>
                      </div>
                    ))
                  )}
                </CardContent></Card>
              );
            })}
          </TabsContent>

          <TabsContent value="log" className="mt-4 space-y-2">
            <Button size="sm" variant="outline" onClick={loadEvents}><History className="mr-1 h-4 w-4" /> Refresh</Button>
            {!events.length ? <p className="text-sm text-muted-foreground">Nothing recorded yet.</p> : null}
            {events.map((e) => (
              <div key={e.id} className="rounded border p-2 text-sm">
                <span className="font-medium">{e.action.replace(/_/g, " ")}</span>{" "}
                <span className="text-muted-foreground">{new Date(e.created_at).toLocaleString()}</span>
                {e.detail?.count ? <span className="text-muted-foreground"> · {e.detail.count} question(s)</span> : null}
              </div>
            ))}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
