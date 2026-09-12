import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Plus } from "lucide-react";
import { toast } from "sonner";
import { SiteHeader } from "@/components/SiteHeader";
import { supabase } from "@/integrations/supabase/client";
import { useCommitteeRole } from "@/hooks/useCommitteeRole";
import { useLang } from "@/components/LanguageProvider";
import { MemberCard } from "@/components/members/MemberCard";
import { MemberForm } from "@/components/members/MemberForm";
import { JoinTeamNote } from "@/components/committee/JoinTeamNote";
import {
  CommitteeRecruitmentCard,
  CommitteeVisibilityAdminToolbar,
} from "@/components/committee/CommitteeRecruitmentBanner";
import {
  getCommitteeRecruitmentSettings,
  DEFAULT_RECRUITMENT_SETTINGS,
  type CommitteeRecruitmentSettings,
} from "@/lib/committee-recruitment.functions";
import { membersQuery, type Member } from "@/lib/members";

export const Route = createFileRoute("/committee/team")({
  head: () => ({
    meta: [
      { title: "Staff Team — لجنة الطب والجراحة | AquaQBank" },
      {
        name: "description",
        content:
          "Meet the students behind لجنة الطب والجراحة: the staff team that curates the free study library, year by year.",
      },
      { property: "og:title", content: "Staff Team — لجنة الطب والجراحة" },
      { property: "og:description", content: "The students who build and curate the free medical study library." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TeamPage,
});

function TeamPage() {
  const { canManageMembers: canManage } = useCommitteeRole();
  const { lang } = useLang();
  const ar = lang === "ar";
  const qc = useQueryClient();
  const { data: members, isLoading } = useQuery(membersQuery(false));
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);

  const { data: recruitmentData } = useQuery({
    queryKey: ["committee-recruitment-settings"],
    queryFn: () => getCommitteeRecruitmentSettings(),
    staleTime: 10 * 1000,
  });

  const [localSettings, setLocalSettings] = useState<CommitteeRecruitmentSettings | null>(null);
  const settings: CommitteeRecruitmentSettings = localSettings || recruitmentData || DEFAULT_RECRUITMENT_SETTINGS;

  const list = members ?? [];

  function refresh() {
    qc.invalidateQueries({ queryKey: ["committee-members"] });
    qc.invalidateQueries({ queryKey: ["committee-recruitment-settings"] });
  }

  async function del(m: Member) {
    if (!confirm(`Remove ${m.name_en || m.name_ar}?`)) return;
    const { error } = await (supabase.from as any)("committee_members").delete().eq("id", m.id);
    if (error) return toast.error(error.message);
    refresh();
  }

  async function move(m: Member, dir: -1 | 1) {
    const ids = list.map((x) => x.id);
    const from = ids.indexOf(m.id);
    const to = from + dir;
    if (to < 0 || to >= ids.length) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]!);
    await Promise.all(
      ids.map((id, i) => (supabase.from as any)("committee_members").update({ sort_order: i }).eq("id", id)),
    );
    refresh();
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-5 md:px-8 pt-28 pb-24">
        {canManage && (
          <CommitteeVisibilityAdminToolbar
            settings={settings}
            onUpdated={(newS) => {
              setLocalSettings(newS);
              qc.invalidateQueries({ queryKey: ["committee-recruitment-settings"] });
            }}
          />
        )}

        <Link
          to="/committee"
          className="inline-flex items-center gap-1.5 text-sm font-bold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={14} /> {ar ? "لجنة الطب والجراحة" : "لجنة الطب والجراحة"}
        </Link>

        <header className="mt-6 text-center">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-primary">Staff Team</p>
          <h1
            dir="rtl"
            lang="ar"
            className="mt-3 font-display text-3xl md:text-5xl font-black tracking-tight"
          >
            لجنة الطب والجراحة
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
            {ar
              ? "الطلاب الذين يجمعون المصادر ويرتّبونها سنةً بعد سنة."
              : "The students who gather, check and organise the library, year after year."}
          </p>
          {canManage && settings.teamVisible && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-black text-primary-foreground hover:opacity-90"
            >
              <Plus size={16} /> Add member
            </button>
          )}
        </header>

        {!settings.teamVisible ? (
          <div>
            <CommitteeRecruitmentCard settings={settings} />

            {canManage && (
              <div className="mt-16 pt-10 border-t border-dashed border-border/80">
                <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-foreground flex items-center gap-2">
                      <ShieldCheck size={16} className="text-primary" />
                      {ar ? "معاينة قائمة الأعضاء (خاصة بالمشرف — مخفية عن الطلاب)" : "Members List Preview (Admin view only — hidden from public)"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {ar ? "يمكنك الاستمرار في إضافة وتعديل وترتيب الأعضاء أثناء فترة الاختيار." : "You can continue managing, adding and sorting members during selection mode."}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAdding(true)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-black text-primary-foreground hover:opacity-90"
                  >
                    <Plus size={14} /> {ar ? "إضافة عضو" : "Add member"}
                  </button>
                </div>

                {isLoading ? (
                  <div className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="aspect-square animate-pulse rounded-[1.4rem] bg-card" />
                    ))}
                  </div>
                ) : list.length === 0 ? (
                  <p className="py-10 text-center text-muted-foreground text-sm">
                    {ar ? "لا يوجد أعضاء بعد." : "No members yet."}
                  </p>
                ) : (
                  <div className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
                    {list.map((m) => (
                      <MemberCard
                        key={m.id}
                        member={m}
                        ar={ar}
                        canManage={canManage}
                        onEdit={() => setEditing(m)}
                        onDelete={() => del(m)}
                        onMove={(d) => move(m, d)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <>
            <JoinTeamNote />

            {isLoading ? (
              <div className="mt-12 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="aspect-square animate-pulse rounded-[1.4rem] bg-card" />
                ))}
              </div>
            ) : list.length === 0 ? (
              <p className="mt-14 text-center text-muted-foreground">
                {ar ? "لا يوجد أعضاء بعد." : "No members yet."}
              </p>
            ) : (
              <div className="mt-12 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((m) => (
                  <MemberCard
                    key={m.id}
                    member={m}
                    ar={ar}
                    canManage={canManage}
                    onEdit={() => setEditing(m)}
                    onDelete={() => del(m)}
                    onMove={(d) => move(m, d)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {(adding || editing) && (
        <MemberForm
          member={editing}
          founder={false}
          nextSort={editing ? editing.sort_order : list.length}
          onClose={() => {
            setAdding(false);
            setEditing(null);
          }}
          onSaved={() => {
            setAdding(false);
            setEditing(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}