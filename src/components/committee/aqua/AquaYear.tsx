import { Link } from "@tanstack/react-router";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, ChevronLeft, FileText, Layers, Shield } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { iconOf } from "@/lib/committee-meta";
import { committeeSubjectQuery, committeeYearQuery } from "@/lib/committee-queries";
import { useCommitteeRole } from "@/hooks/useCommitteeRole";
import { AQUA_MIGRATION, aquaCountsQuery } from "@/lib/committee-aqua";
import { SubjectTag } from "@/components/committee/SubjectTag";
import { AquaBackdrop, AquaBadge, AquaNodeCard, AquaSetupNotice, OpenToggle, StateChip } from "@/components/committee/aqua/AquaParts";
import { VersionSwitch } from "@/components/committee/aqua/VersionSwitch";
import { useAquaOpen } from "@/components/committee/aqua/useAquaOpen";

type YearRow = { id: string; display_name: string; year_number: number; icon_key: string };
type Semester = { id: string; year_id: string; name: string; number: number; sort_order: number };
type Module = { id: string; semester_id: string; name: string; icon_key: string; sort_order: number };
type Subject = {
  id: string;
  year_id: string;
  semester_id: string | null;
  module_id: string | null;
  name: string;
  icon_key: string;
  sort_order: number;
  tag_label?: string | null;
  tag_color?: string | null;
};

/** A year (with its semesters, modules and subjects) in the AQUA version. */
export function AquaYearPage({
  year,
  sem,
  mod,
  onSemester,
  onModule,
}: {
  year: string;
  sem?: string;
  mod?: string;
  onSemester: (id: string | undefined) => void;
  onModule: (id: string | undefined) => void;
}) {
  const { canManage, canManageMembers, isAdmin } = useCommitteeRole();
  const qc = useQueryClient();
  const aqua = useAquaOpen();
  const { data, isLoading } = useQuery({ ...committeeYearQuery(year), placeholderData: keepPreviousData });
  const { data: counts } = useQuery(aquaCountsQuery);

  const yearRow = data?.year as YearRow | null | undefined;
  const YearIcon = iconOf(yearRow?.icon_key ?? "graduation-cap");
  const yearNumber = yearRow?.year_number ?? Number(year);
  const usesSemesters = yearNumber >= 1 && yearNumber <= 6;
  const semesters = (data?.semesters ?? []) as Semester[];
  const modules = (data?.modules ?? []) as Module[];
  const subjects = (data?.subjects ?? []) as Subject[];

  const activeSemester = usesSemesters ? semesters.find((s) => s.id === sem) ?? null : null;
  const showSemesterGrid = usesSemesters && !activeSemester;
  const semesterModules = modules.filter((m) => m.semester_id === activeSemester?.id);
  const activeModule = activeSemester ? semesterModules.find((m) => m.id === mod) ?? null : null;
  const semesterSubjects = subjects.filter((s) => (usesSemesters ? s.semester_id === activeSemester?.id : true));
  const visibleSubjects = activeModule
    ? semesterSubjects.filter((s) => s.module_id === activeModule.id)
    : usesSemesters && activeSemester
      ? semesterSubjects.filter((s) => !s.module_id)
      : semesterSubjects;

  const yearOpen = yearRow ? aqua.isOpen("year", yearRow.id) : false;
  const semOpen = activeSemester ? aqua.isOpen("semester", activeSemester.id) : true;
  const modOpen = activeModule ? aqua.isOpen("module", activeModule.id) : true;
  // students cannot enter a closed year / semester / module, even by typing the address
  const blocked = !canManage && !(yearOpen && semOpen && modOpen);

  const ancestorsOfSemester = yearRow ? [{ type: "year" as const, id: yearRow.id }] : [];
  const ancestorsOfModule = [
    ...(activeSemester ? [{ type: "semester" as const, id: activeSemester.id }] : []),
    ...ancestorsOfSemester,
  ];

  const here = activeModule
    ? { type: "module" as const, id: activeModule.id, open: modOpen, ancestors: ancestorsOfModule }
    : activeSemester
      ? { type: "semester" as const, id: activeSemester.id, open: semOpen, ancestors: ancestorsOfSemester }
      : yearRow
        ? { type: "year" as const, id: yearRow.id, open: yearOpen, ancestors: [] }
        : null;
  const canToggleHere = here ? (here.type === "year" ? canManageMembers : canManage) : false;

  const title = activeModule
    ? `${activeSemester?.name ?? ""} · ${activeModule.name}`
    : activeSemester
      ? `${yearRow?.display_name ?? ""} · ${activeSemester.name}`
      : (yearRow?.display_name ?? "");

  return (
    <div className="aqua-theme relative min-h-screen bg-background text-foreground">
      <SiteHeader />
      <AquaBackdrop />

      <main className="relative z-10 mx-auto max-w-6xl px-6 pb-24 pt-16 md:px-10">
        <div className="flex flex-wrap items-center justify-between gap-3 pt-10">
          {activeModule ? (
            <button type="button" onClick={() => onModule(undefined)} className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
              <ChevronLeft size={16} /> Back to {activeSemester?.name ?? "semester"}
            </button>
          ) : activeSemester ? (
            <button type="button" onClick={() => onSemester(undefined)} className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
              <ChevronLeft size={16} /> Back to semesters
            </button>
          ) : (
            <Link to="/committee" className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
              <ChevronLeft size={16} /> Back to years
            </Link>
          )}
          <VersionSwitch />
        </div>

        {yearRow && (
          <header className="aqua-rise relative mt-6 overflow-hidden rounded-3xl border border-primary/25 bg-card p-6 md:p-8">
            <div aria-hidden className="pointer-events-none absolute -right-10 -top-16 h-52 w-52 rounded-full bg-primary/15 blur-3xl" />
            <div className="relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
              <div className="flex min-w-0 items-center gap-4">
                <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
                  <YearIcon size={26} strokeWidth={1.8} />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <AquaBadge>AQUA</AquaBadge>
                    <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      {yearRow.year_number === 0 ? "Preparation Year" : `Year ${yearRow.year_number}`}
                    </span>
                  </div>
                  <h1 className="mt-1 truncate text-2xl font-bold tracking-tight md:text-3xl">{title}</h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {showSemesterGrid
                      ? `${semesters.length} semester${semesters.length === 1 ? "" : "s"}`
                      : `${visibleSubjects.length} subject${visibleSubjects.length === 1 ? "" : "s"}`}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                {canManage && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-primary-foreground">
                    <Shield size={11} /> {isAdmin ? "Admin" : "عضو في اللجنة"}
                  </span>
                )}
                {here && (canToggleHere ? (
                  <OpenToggle
                    open={here.open}
                    busy={aqua.busy(here.type, here.id)}
                    onToggle={() => aqua.toggle({ type: here.type, id: here.id }, here.ancestors, !here.open)}
                  />
                ) : (
                  <StateChip open={here.open} />
                ))}
              </div>
            </div>
          </header>
        )}

        {aqua.state?.missingTable && canManage && (
          <div className="mt-6">
            <AquaSetupNotice migration={AQUA_MIGRATION} />
          </div>
        )}

        {canManage && here && !here.open && (
          <div className="mt-6 rounded-xl border border-dashed border-border bg-card/70 px-4 py-3 text-sm text-muted-foreground">
            This section is <b className="text-foreground">coming soon</b> for students. Only the committee can see it until you open it.
          </div>
        )}

        <div className="mt-8">
          {blocked ? (
            <div className="rounded-3xl border border-dashed border-border bg-card py-20 text-center">
              <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-muted text-muted-foreground">
                <FileText size={24} />
              </div>
              <p className="text-lg font-bold">Coming soon · قريباً</p>
              <p className="mt-2 text-sm text-muted-foreground">The AQUA summaries for this section are on the way.</p>
              <Link to="/committee" className="mt-6 inline-flex items-center gap-1 text-sm font-medium text-primary">
                <ChevronLeft size={16} /> Back to years
              </Link>
            </div>
          ) : isLoading ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-36 animate-pulse rounded-2xl bg-card" />
              ))}
            </div>
          ) : showSemesterGrid ? (
            semesters.length === 0 ? (
              <EmptyNote text="No semesters in this year yet." />
            ) : (
              <div className="aqua-stagger grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {semesters.map((s) => {
                  const own = subjects.filter((x) => x.semester_id === s.id);
                  const open = aqua.isOpen("semester", s.id);
                  const openSubjects = own.filter((x) => aqua.isOpen("subject", x.id)).length;
                  return (
                    <AquaNodeCard
                      key={s.id}
                      icon={<CalendarDays size={22} strokeWidth={1.8} />}
                      eyebrow="Semester"
                      title={s.name}
                      mark={String(s.number)}
                      meta={`${own.length} subject${own.length === 1 ? "" : "s"}${open ? ` · ${openSubjects} open` : ""}`}
                      open={open}
                      canManage={canManage}
                      onToggle={() => aqua.toggle({ type: "semester", id: s.id }, ancestorsOfSemester, !open)}
                      toggling={aqua.busy("semester", s.id)}
                      link={(card, cls) => (
                        <button type="button" onClick={() => onSemester(s.id)} className={cls}>
                          {card}
                        </button>
                      )}
                    />
                  );
                })}
              </div>
            )
          ) : (
            <>
              {activeSemester && !activeModule && semesterModules.length > 0 && (
                <section className="mb-10">
                  <SectionTitle label="Modules" />
                  <div className="aqua-stagger grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                    {semesterModules.map((m) => {
                      const MIcon = iconOf(m.icon_key) ?? Layers;
                      const own = semesterSubjects.filter((x) => x.module_id === m.id);
                      const open = aqua.isOpen("module", m.id);
                      return (
                        <AquaNodeCard
                          key={m.id}
                          icon={<MIcon size={22} strokeWidth={1.8} />}
                          eyebrow="Module"
                          title={m.name}
                          meta={`${own.length} subject${own.length === 1 ? "" : "s"}`}
                          open={open}
                          canManage={canManage}
                          onToggle={() => aqua.toggle({ type: "module", id: m.id }, [{ type: "semester", id: activeSemester.id }, ...ancestorsOfSemester], !open)}
                          toggling={aqua.busy("module", m.id)}
                          link={(card, cls) => (
                            <button type="button" onClick={() => onModule(m.id)} className={cls}>
                              {card}
                            </button>
                          )}
                        />
                      );
                    })}
                  </div>
                </section>
              )}

              {visibleSubjects.length === 0 ? (
                <EmptyNote text="No subjects here yet." />
              ) : (
                <section>
                  <SectionTitle label="Subjects" />
                  <div className="aqua-stagger grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                    {visibleSubjects.map((s) => {
                      const Icon = iconOf(s.icon_key);
                      const open = aqua.isOpen("subject", s.id);
                      const n = counts?.[s.id] ?? 0;
                      const ancestors = [
                        s.module_id ? { type: "module" as const, id: s.module_id } : null,
                        s.semester_id ? { type: "semester" as const, id: s.semester_id } : null,
                        ...ancestorsOfSemester,
                      ];
                      return (
                        <AquaNodeCard
                          key={s.id}
                          compact
                          icon={<Icon size={22} strokeWidth={1.8} />}
                          title={s.name}
                          open={open}
                          canManage={canManage}
                          onToggle={() => aqua.toggle({ type: "subject", id: s.id }, ancestors, !open)}
                          toggling={aqua.busy("subject", s.id)}
                          footer={
                            <>
                              <SubjectTag label={s.tag_label} color={s.tag_color} />
                              {open && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-[10px] font-bold text-muted-foreground">
                                  <FileText size={10} /> {n}
                                </span>
                              )}
                            </>
                          }
                          link={(card, cls) => (
                            <Link
                              to="/committee/$year/$subject"
                              params={{ year, subject: s.id }}
                              onMouseEnter={() => qc.prefetchQuery(committeeSubjectQuery(s.id))}
                              preload="intent"
                              className={cls}
                            >
                              {card}
                            </Link>
                          )}
                        />
                      );
                    })}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function SectionTitle({ label }: { label: string }) {
  return <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">{label}</div>;
}

function EmptyNote({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card py-16 text-center">
      <p className="text-muted-foreground">{text}</p>
    </div>
  );
}