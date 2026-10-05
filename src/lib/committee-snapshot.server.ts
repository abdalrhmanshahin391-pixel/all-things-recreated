/**
 * Shared committee snapshot engine (server-only).
 *
 * The same v3 tree is used by the ZIP export/import AND by the Google Drive
 * relink flow, so both stay in sync automatically.
 */

export const COMMITTEE_FORMAT = "lovable-committee-backup";
export const COMMITTEE_VERSION = 3;

export type SnapResource = {
  key: string;
  parent_key: string | null;
  title: string;
  kind: string;
  file_path: string | null;
  url: string | null;
  description: string | null;
  sort_order: number;
  is_protected: boolean | null;
  storage_provider: string | null;
  drive_file_id: string | null;
  drive_web_link: string | null;
  drive_download_link: string | null;
  file_size: number | null;
};

export type SnapCategory = {
  key: string;
  name: string;
  section: string;
  sort_order: number;
  resources: SnapResource[];
};

export type SnapSubject = {
  key: string;
  name: string;
  icon_key: string;
  color_key: string;
  image_url: string | null;
  sort_order: number;
  tag_label: string | null;
  tag_color: string | null;
  is_closed: boolean;
  closed_note: string | null;
  closed_color: string | null;
  closed_style: string | null;
  semester_key: string | null;
  module_key: string | null;
  /** AQUA version: true when this subject is open for students (absent in older backups) */
  aqua_open?: boolean;
  best_sources_enabled?: boolean;
  best_sources?: Array<{
    title: string;
    kind: string;
    rating: number;
    note: string | null;
    url: string | null;
    is_top: boolean;
    sort_order: number;
  }>;
  course_links: Array<{
    course_id: string;
    course_title: string | null;
    offer_label: string | null;
    original_price: number | null;
    promo_price: number | null;
    note: string | null;
    sort_order: number;
  }>;
  categories: SnapCategory[];
};

export type SnapModule = {
  key: string;
  name: string;
  icon_key: string;
  sort_order: number;
  is_closed: boolean;
  closed_note: string | null;
  closed_color: string | null;
  closed_style: string | null;
  aqua_open?: boolean;
};

export type SnapSemester = {
  key: string;
  name: string;
  number: number;
  sort_order: number;
  is_closed: boolean;
  closed_note: string | null;
  closed_color: string | null;
  closed_style: string | null;
  aqua_open?: boolean;
  modules: SnapModule[];
};

export type SnapYear = {
  key: string;
  year_number: number;
  display_name: string;
  icon_key: string;
  color_key: string;
  shape_key: string;
  sort_order: number;
  is_closed: boolean;
  closed_note: string | null;
  closed_color: string | null;
  closed_style: string | null;
  aqua_open?: boolean;
  semesters: SnapSemester[];
  subjects: SnapSubject[];
};

export type CommitteeSnapshot = {
  format: typeof COMMITTEE_FORMAT;
  version: number;
  exported_at: string;
  university: { id: string; name: string; slug: string };
  years: SnapYear[];
  files: Array<{ bucket: string; path: string }>;
  settings?: {
    study_plan_path: string | null;
    study_plan_title: string | null;
    study_plan_subtitle: string | null;
  };
  study_plan?: Array<{
    slug: string;
    title_en: string;
    title_ar: string | null;
    subtitle_en: string | null;
    subtitle_ar: string | null;
    has_semesters: boolean;
    has_finals: boolean;
    sort_order: number;
    subjects: Array<{
      semester: number | null;
      is_final: boolean;
      name: string;
      assessment: string;
      note: string | null;
      sort_order: number;
    }>;
  }>;
};

/** Duplicate-safe single-row lookup: never throws the way maybeSingle() does. */
async function firstRow(query: any): Promise<any | null> {
  const { data, error } = await query.limit(1);
  if (error) throw new Error(error.message);
  return (data ?? [])[0] ?? null;
}

/* --------------------------------- EXPORT -------------------------------- */

export async function buildCommitteeSnapshot(
  db: any,
  universitySlug?: string,
): Promise<CommitteeSnapshot> {
  let uq = db.from("universities").select("id,name,slug").eq("is_active", true);
  uq = universitySlug ? uq.eq("slug", universitySlug) : uq.order("sort_order");
  const uniRow = await firstRow(uq);
  if (!uniRow) throw new Error("University not found");

  const { data: years = [] } = await db
    .from("committee_years")
    .select("id,year_number,display_name,icon_key,color_key,shape_key,sort_order,is_closed,closed_note,closed_color,closed_style")
    .eq("university_id", uniRow.id)
    .order("sort_order");
  const yearIds = (years ?? []).map((y: any) => y.id);

  const { data: semesters = [] } = yearIds.length
    ? await db
        .from("committee_semesters")
        .select("id,year_id,name,number,sort_order,is_closed,closed_note,closed_color,closed_style")
        .in("year_id", yearIds)
        .order("sort_order")
    : { data: [] as any[] };
  const semesterIds = (semesters ?? []).map((s: any) => s.id);

  const { data: modules = [] } = semesterIds.length
    ? await db
        .from("committee_modules")
        .select("id,semester_id,name,icon_key,sort_order,is_closed,closed_note,closed_color,closed_style")
        .in("semester_id", semesterIds)
        .order("sort_order")
    : { data: [] as any[] };

  const { data: subjects = [] } = yearIds.length
    ? await db
        .from("committee_subjects")
        .select("id,year_id,semester_id,module_id,name,icon_key,color_key,image_url,sort_order,tag_label,tag_color,is_closed,closed_note,closed_color,closed_style,best_sources_enabled")
        .in("year_id", yearIds)
        .order("sort_order")
    : { data: [] as any[] };
  const subjectIds = (subjects ?? []).map((s: any) => s.id);

  const { data: subjectCourses = [] } = subjectIds.length
    ? await db
        .from("committee_subject_courses")
        .select("subject_id,course_id,offer_label,original_price,promo_price,note,sort_order,course:courses(title)")
        .in("subject_id", subjectIds)
        .order("sort_order")
    : { data: [] as any[] };

  const { data: categories = [] } = subjectIds.length
    ? await db
        .from("committee_categories")
        .select("id,subject_id,name,section,sort_order")
        .in("subject_id", subjectIds)
        .order("sort_order")
    : { data: [] as any[] };

  const { data: bestSources = [] } = subjectIds.length
    ? await db
        .from("committee_best_sources")
        .select("subject_id,title,kind,rating,note,url,is_top,sort_order")
        .in("subject_id", subjectIds)
        .order("sort_order")
    : { data: [] as any[] };
  const bestBySubject = new Map<string, any[]>();
  for (const b of (bestSources ?? []) as any[]) {
    const arr = bestBySubject.get(b.subject_id) ?? [];
    arr.push({
      title: b.title,
      kind: b.kind,
      rating: b.rating ?? 5,
      note: b.note ?? null,
      url: b.url ?? null,
      is_top: !!b.is_top,
      sort_order: b.sort_order ?? 0,
    });
    bestBySubject.set(b.subject_id, arr);
  }
  const categoryIds = (categories ?? []).map((c: any) => c.id);

  // Resources can exceed the default 1000-row page — read them in pages.
  const resources: any[] = [];
  for (let i = 0; i < categoryIds.length; i += 100) {
    const slice = categoryIds.slice(i, i + 100);
    let from = 0;
    for (;;) {
      const { data: page = [], error } = await db
        .from("committee_resources")
        .select("id,category_id,parent_resource_id,title,kind,file_path,url,description,sort_order,is_protected,storage_provider,drive_file_id,drive_web_link,drive_download_link,file_size")
        .in("category_id", slice)
        .order("sort_order")
        .range(from, from + 999);
      if (error) throw new Error(error.message);
      resources.push(...(page ?? []));
      if ((page ?? []).length < 1000) break;
      from += 1000;
    }
  }

  const linksBySubject = new Map<string, any[]>();
  for (const l of (subjectCourses ?? []) as any[]) {
    const arr = linksBySubject.get(l.subject_id) ?? [];
    arr.push({
      course_id: l.course_id,
      course_title: l.course?.title ?? null,
      offer_label: l.offer_label ?? null,
      original_price: l.original_price ?? null,
      promo_price: l.promo_price ?? null,
      note: l.note ?? null,
      sort_order: l.sort_order ?? 0,
    });
    linksBySubject.set(l.subject_id, arr);
  }

  const resByCat = new Map<string, SnapResource[]>();
  for (const r of resources) {
    const arr = resByCat.get(r.category_id) ?? [];
    arr.push({
      key: r.id,
      parent_key: r.parent_resource_id ?? null,
      title: r.title,
      kind: r.kind,
      file_path: r.file_path ?? null,
      url: r.url ?? null,
      description: r.description ?? null,
      sort_order: r.sort_order ?? 0,
      is_protected: r.is_protected ?? null,
      storage_provider: r.storage_provider ?? null,
      drive_file_id: r.drive_file_id ?? null,
      drive_web_link: r.drive_web_link ?? null,
      drive_download_link: r.drive_download_link ?? null,
      file_size: r.file_size ?? null,
    });
    resByCat.set(r.category_id, arr);
  }

  const catBySubject = new Map<string, SnapCategory[]>();
  for (const c of (categories ?? []) as any[]) {
    const arr = catBySubject.get(c.subject_id) ?? [];
    arr.push({
      key: c.id,
      name: c.name,
      section: c.section,
      sort_order: c.sort_order ?? 0,
      resources: resByCat.get(c.id) ?? [],
    });
    catBySubject.set(c.subject_id, arr);
  }

  // AQUA version: which tiles are open. Missing table (migration not applied yet) just means nothing to save.
  let aquaOpen: Set<string> | null = null;
  try {
    const { data: stateRows, error: stateErr } = await db.from("committee_aqua_state").select("node_type,node_id,is_open");
    if (!stateErr) {
      aquaOpen = new Set(((stateRows ?? []) as any[]).filter((r) => r.is_open).map((r) => `${r.node_type}:${r.node_id}`));
    }
  } catch {
    aquaOpen = null;
  }
  const aquaFlag = (type: string, id: string): boolean | undefined => (aquaOpen ? aquaOpen.has(`${type}:${id}`) : undefined);

  const modsBySemester = new Map<string, SnapModule[]>();
  for (const m of (modules ?? []) as any[]) {
    const arr = modsBySemester.get(m.semester_id) ?? [];
    arr.push({
      key: m.id,
      name: m.name,
      icon_key: m.icon_key ?? "layers",
      sort_order: m.sort_order ?? 0,
      is_closed: !!m.is_closed,
      closed_note: m.closed_note ?? null,
      closed_color: m.closed_color ?? null,
      closed_style: m.closed_style ?? null,
      aqua_open: aquaFlag("module", m.id),
    });
    modsBySemester.set(m.semester_id, arr);
  }

  const semsByYear = new Map<string, SnapSemester[]>();
  for (const s of (semesters ?? []) as any[]) {
    const arr = semsByYear.get(s.year_id) ?? [];
    arr.push({
      key: s.id,
      name: s.name,
      number: s.number ?? 1,
      sort_order: s.sort_order ?? 0,
      is_closed: !!s.is_closed,
      closed_note: s.closed_note ?? null,
      closed_color: s.closed_color ?? null,
      closed_style: s.closed_style ?? null,
      aqua_open: aquaFlag("semester", s.id),
      modules: modsBySemester.get(s.id) ?? [],
    });
    semsByYear.set(s.year_id, arr);
  }

  const subsByYear = new Map<string, SnapSubject[]>();
  for (const s of (subjects ?? []) as any[]) {
    const arr = subsByYear.get(s.year_id) ?? [];
    arr.push({
      key: s.id,
      name: s.name,
      icon_key: s.icon_key,
      color_key: s.color_key,
      image_url: s.image_url ?? null,
      sort_order: s.sort_order ?? 0,
      tag_label: s.tag_label ?? null,
      tag_color: s.tag_color ?? null,
      is_closed: !!s.is_closed,
      closed_note: s.closed_note ?? null,
      closed_color: s.closed_color ?? null,
      closed_style: s.closed_style ?? null,
      semester_key: s.semester_id ?? null,
      module_key: s.module_id ?? null,
      aqua_open: aquaFlag("subject", s.id),
      best_sources_enabled: !!s.best_sources_enabled,
      best_sources: bestBySubject.get(s.id) ?? [],
      course_links: linksBySubject.get(s.id) ?? [],
      categories: catBySubject.get(s.id) ?? [],
    });
    subsByYear.set(s.year_id, arr);
  }

  const fileSet = new Set<string>();
  const files: Array<{ bucket: string; path: string }> = [];
  const addFile = (bucket: string, path: string | null) => {
    if (!path) return;
    const k = `${bucket}::${path}`;
    if (fileSet.has(k)) return;
    fileSet.add(k);
    files.push({ bucket, path });
  };
  for (const s of (subjects ?? []) as any[]) addFile("committee-images", s.image_url);
  for (const r of resources) {
    if (r.storage_provider === "drive" || r.drive_file_id) continue;
    addFile("committee-files", r.file_path);
  }

  const settingsRow = await firstRow(
    db.from("site_settings").select("study_plan_path,study_plan_title,study_plan_subtitle").eq("id", true),
  );
  addFile("committee-files", settingsRow?.study_plan_path ?? null);

  const { data: planStages = [] } = await db
    .from("study_plan_stages")
    .select("id,slug,title_en,title_ar,subtitle_en,subtitle_ar,has_semesters,has_finals,sort_order")
    .order("sort_order");
  const planStageIds = (planStages ?? []).map((s: any) => s.id);
  const { data: planSubjects = [] } = planStageIds.length
    ? await db
        .from("study_plan_subjects")
        .select("stage_id,semester,is_final,name,assessment,note,sort_order")
        .in("stage_id", planStageIds)
        .order("sort_order")
    : { data: [] as any[] };
  const planByStage = new Map<string, any[]>();
  for (const s of (planSubjects ?? []) as any[]) {
    const arr = planByStage.get(s.stage_id) ?? [];
    arr.push({
      semester: s.semester ?? null,
      is_final: !!s.is_final,
      name: s.name,
      assessment: s.assessment,
      note: s.note ?? null,
      sort_order: s.sort_order ?? 0,
    });
    planByStage.set(s.stage_id, arr);
  }

  return {
    format: COMMITTEE_FORMAT,
    version: COMMITTEE_VERSION,
    exported_at: new Date().toISOString(),
    university: { id: uniRow.id, name: uniRow.name, slug: uniRow.slug },
    years: (years ?? []).map((y: any) => ({
      key: y.id,
      year_number: y.year_number,
      display_name: y.display_name,
      icon_key: y.icon_key,
      color_key: y.color_key,
      shape_key: y.shape_key,
      sort_order: y.sort_order ?? 0,
      is_closed: !!y.is_closed,
      closed_note: y.closed_note ?? null,
      closed_color: y.closed_color ?? null,
      closed_style: y.closed_style ?? null,
      aqua_open: aquaFlag("year", y.id),
      semesters: semsByYear.get(y.id) ?? [],
      subjects: subsByYear.get(y.id) ?? [],
    })),
    files,
    settings: {
      study_plan_path: settingsRow?.study_plan_path ?? null,
      study_plan_title: settingsRow?.study_plan_title ?? null,
      study_plan_subtitle: settingsRow?.study_plan_subtitle ?? null,
    },
    study_plan: (planStages ?? []).map((s: any) => ({
      slug: s.slug,
      title_en: s.title_en,
      title_ar: s.title_ar ?? null,
      subtitle_en: s.subtitle_en ?? null,
      subtitle_ar: s.subtitle_ar ?? null,
      has_semesters: !!s.has_semesters,
      has_finals: !!s.has_finals,
      sort_order: s.sort_order ?? 0,
      subjects: planByStage.get(s.id) ?? [],
    })),
  };
}

/* ------------------------- v2 → v3 COMPATIBILITY ------------------------- */

/** Older backups carried semesters/modules inline on each subject. */
export function normalizeSnapshot(payload: any): CommitteeSnapshot {
  if (!payload || payload.format !== COMMITTEE_FORMAT) {
    throw new Error("This file is not a committee backup");
  }
  if ((payload.version ?? 1) >= 3) return payload as CommitteeSnapshot;

  const years: SnapYear[] = (payload.years ?? []).map((y: any) => {
    const semMap = new Map<string, SnapSemester>();
    const subjects: SnapSubject[] = (y.subjects ?? []).map((s: any) => {
      let semesterKey: string | null = null;
      let moduleKey: string | null = null;
      if (s.semester_name) {
        semesterKey = `sem::${s.semester_name}`;
        if (!semMap.has(semesterKey)) {
          semMap.set(semesterKey, {
            key: semesterKey,
            name: s.semester_name,
            number: s.semester_number ?? 1,
            sort_order: s.semester_number ?? 1,
            is_closed: !!s.semester_closed?.is_closed,
            closed_note: s.semester_closed?.note ?? null,
            closed_color: s.semester_closed?.color ?? null,
            closed_style: s.semester_closed?.style ?? null,
            modules: [],
          });
        }
        if (s.module_name) {
          moduleKey = `${semesterKey}::mod::${s.module_name}`;
          const sem = semMap.get(semesterKey)!;
          if (!sem.modules.some((m) => m.key === moduleKey)) {
            sem.modules.push({
              key: moduleKey,
              name: s.module_name,
              icon_key: s.module_icon_key ?? "layers",
              sort_order: s.module_sort_order ?? sem.modules.length + 1,
              is_closed: !!s.module_closed?.is_closed,
              closed_note: s.module_closed?.note ?? null,
              closed_color: s.module_closed?.color ?? null,
              closed_style: s.module_closed?.style ?? null,
            });
          }
        }
      }
      return {
        key: s.id ?? `sub::${s.name}`,
        name: s.name,
        icon_key: s.icon_key,
        color_key: s.color_key,
        image_url: s.image_url ?? null,
        sort_order: s.sort_order ?? 0,
        tag_label: s.tag_label ?? null,
        tag_color: s.tag_color ?? null,
        is_closed: !!s.is_closed,
        closed_note: s.closed_note ?? null,
        closed_color: s.closed_color ?? null,
        closed_style: s.closed_style ?? null,
        semester_key: semesterKey,
        module_key: moduleKey,
        course_links: s.course_links ?? [],
        categories: (s.categories ?? []).map((c: any) => ({
          key: c.id ?? `cat::${c.name}::${c.section}`,
          name: c.name,
          section: c.section,
          sort_order: c.sort_order ?? 0,
          resources: (c.resources ?? []).map((r: any) => ({
            key: r.id ?? `res::${r.title}`,
            parent_key: r.parent_resource_id ?? null,
            title: r.title,
            kind: r.kind,
            file_path: r.file_path ?? null,
            url: r.url ?? null,
            description: r.description ?? null,
            sort_order: r.sort_order ?? 0,
            is_protected: r.is_protected ?? null,
            storage_provider: r.storage_provider ?? null,
            drive_file_id: r.drive_file_id ?? null,
            drive_web_link: r.drive_web_link ?? null,
            drive_download_link: r.drive_download_link ?? null,
            file_size: r.file_size ?? null,
          })),
        })),
      };
    });
    return {
      key: y.id ?? `year::${y.year_number}`,
      year_number: y.year_number,
      display_name: y.display_name,
      icon_key: y.icon_key,
      color_key: y.color_key,
      shape_key: y.shape_key,
      sort_order: y.sort_order ?? 0,
      is_closed: !!y.is_closed,
      closed_note: y.closed_note ?? null,
      closed_color: y.closed_color ?? null,
      closed_style: y.closed_style ?? null,
      semesters: Array.from(semMap.values()),
      subjects,
    };
  });

  return {
    format: COMMITTEE_FORMAT,
    version: COMMITTEE_VERSION,
    exported_at: payload.exported_at ?? new Date().toISOString(),
    university: payload.university,
    years,
    files: payload.files ?? [],
    settings: payload.settings,
    study_plan: (payload.study_plan ?? []).map((s: any) => ({ ...s, subtitle_ar: s.subtitle_ar ?? null })),
  };
}

/* -------------------------------- RESTORE -------------------------------- */

export type RestoreResult = {
  university: string;
  yearsAdded: number;
  subjectsAdded: number;
  categoriesAdded: number;
  resourcesAdded: number;
  skipped: string[];
};

export async function restoreCommitteeSnapshot(
  db: any,
  raw: any,
  opts: { targetUniversitySlug?: string; replace?: boolean } = {},
): Promise<RestoreResult> {
  const p = normalizeSnapshot(raw);
  const skipped: string[] = [];

  const slug = opts.targetUniversitySlug ?? p.university?.slug;
  let uni: any = slug
    ? await firstRow(db.from("universities").select("id,slug,name").eq("slug", slug))
    : null;
  if (!uni && p.university?.name) {
    uni = await firstRow(db.from("universities").select("id,slug,name").ilike("name", p.university.name));
  }
  if (!uni) {
    uni = await firstRow(
      db.from("universities").select("id,slug,name").eq("is_active", true).order("sort_order"),
    );
  }
  if (!uni) throw new Error("No universities exist to import into");

  if (opts.replace) await wipeCommittee(db, uni.id);

  let yearsAdded = 0, subjectsAdded = 0, categoriesAdded = 0, resourcesAdded = 0;
  // AQUA version open/closed flags, applied once every node has its (possibly new) id
  const aquaRows: Array<{ node_type: string; node_id: string; is_open: boolean }> = [];
  const noteAqua = (type: string, id: string, flag: unknown) => {
    if (typeof flag === "boolean") aquaRows.push({ node_type: type, node_id: id, is_open: flag });
  };

  for (const y of p.years ?? []) {
    const yearPayload = {
      display_name: y.display_name,
      icon_key: y.icon_key,
      color_key: y.color_key,
      shape_key: y.shape_key,
      sort_order: y.sort_order ?? 0,
      is_closed: !!y.is_closed,
      closed_note: y.closed_note ?? null,
      closed_color: y.closed_color ?? "amber",
      closed_style: y.closed_style ?? "ribbon",
    };
    const existingYear = await firstRow(
      db.from("committee_years").select("id").eq("university_id", uni.id).eq("year_number", y.year_number),
    );
    let yearId: string;
    if (existingYear) {
      yearId = existingYear.id;
      await db.from("committee_years").update(yearPayload).eq("id", yearId);
    } else {
      const { data: ins, error } = await db
        .from("committee_years")
        .insert({ university_id: uni.id, year_number: y.year_number, ...yearPayload })
        .select("id")
        .single();
      if (error || !ins) throw new Error("year insert: " + (error?.message ?? ""));
      yearId = ins.id;
      yearsAdded++;
    }

    noteAqua("year", yearId, y.aqua_open);

    // Semesters and modules exist independently of subjects.
    const semIdByKey = new Map<string, string>();
    const modIdByKey = new Map<string, string>();
    for (const sem of y.semesters ?? []) {
      const semPayload = {
        name: sem.name,
        number: sem.number ?? 1,
        sort_order: sem.sort_order ?? sem.number ?? 1,
        is_closed: !!sem.is_closed,
        closed_note: sem.closed_note ?? null,
        closed_color: sem.closed_color ?? "amber",
        closed_style: sem.closed_style ?? "ribbon",
      };
      const existing = await firstRow(
        db.from("committee_semesters").select("id").eq("year_id", yearId).eq("name", sem.name),
      );
      let semId: string;
      if (existing) {
        semId = existing.id;
        await db.from("committee_semesters").update(semPayload).eq("id", semId);
      } else {
        const { data: ins, error } = await db
          .from("committee_semesters")
          .insert({ year_id: yearId, ...semPayload })
          .select("id")
          .single();
        if (error || !ins) throw new Error("semester insert: " + (error?.message ?? ""));
        semId = ins.id;
      }
      semIdByKey.set(sem.key, semId);
      noteAqua("semester", semId, sem.aqua_open);

      for (const mod of sem.modules ?? []) {
        const modPayload = {
          name: mod.name,
          icon_key: mod.icon_key ?? "layers",
          sort_order: mod.sort_order ?? 1,
          is_closed: !!mod.is_closed,
          closed_note: mod.closed_note ?? null,
          closed_color: mod.closed_color ?? "amber",
          closed_style: mod.closed_style ?? "ribbon",
        };
        const existingMod = await firstRow(
          db.from("committee_modules").select("id").eq("semester_id", semId).eq("name", mod.name),
        );
        let modId: string;
        if (existingMod) {
          modId = existingMod.id;
          await db.from("committee_modules").update(modPayload).eq("id", modId);
        } else {
          const { data: ins, error } = await db
            .from("committee_modules")
            .insert({ semester_id: semId, ...modPayload })
            .select("id")
            .single();
          if (error || !ins) throw new Error("module insert: " + (error?.message ?? ""));
          modId = ins.id;
        }
        modIdByKey.set(mod.key, modId);
        noteAqua("module", modId, mod.aqua_open);
      }
    }

    for (const s of y.subjects ?? []) {
      const semesterId = s.semester_key ? semIdByKey.get(s.semester_key) ?? null : null;
      const moduleId = s.module_key ? modIdByKey.get(s.module_key) ?? null : null;
      const subjectPayload = {
        icon_key: s.icon_key,
        color_key: s.color_key,
        image_url: s.image_url ?? null,
        sort_order: s.sort_order ?? 0,
        semester_id: semesterId,
        module_id: moduleId,
        tag_label: s.tag_label ?? null,
        tag_color: s.tag_color ?? "amber",
        is_closed: !!s.is_closed,
        closed_note: s.closed_note ?? null,
        closed_color: s.closed_color ?? "amber",
        closed_style: s.closed_style ?? "ribbon",
        best_sources_enabled: !!s.best_sources_enabled,
      };
      const { data: sameName = [] } = await db
        .from("committee_subjects")
        .select("id,semester_id,module_id")
        .eq("year_id", yearId)
        .eq("name", s.name);
      const existingSub =
        (sameName ?? []).find(
          (row: any) => (row.semester_id ?? null) === semesterId && (row.module_id ?? null) === moduleId,
        ) ?? null;
      let subjectId: string;
      if (existingSub) {
        subjectId = existingSub.id;
        await db.from("committee_subjects").update(subjectPayload).eq("id", subjectId);
      } else {
        const { data: ins, error } = await db
          .from("committee_subjects")
          .insert({ year_id: yearId, name: s.name, ...subjectPayload })
          .select("id")
          .single();
        if (error || !ins) throw new Error("subject insert: " + (error?.message ?? ""));
        subjectId = ins.id;
        subjectsAdded++;
      }
      noteAqua("subject", subjectId, s.aqua_open);

      if (Array.isArray(s.best_sources)) {
        await db.from("committee_best_sources").delete().eq("subject_id", subjectId);
        if (s.best_sources.length) {
          await db.from("committee_best_sources").insert(
            s.best_sources.map((b: any, i: number) => ({
              subject_id: subjectId,
              title: b.title,
              kind: b.kind ?? "other",
              rating: b.rating ?? 5,
              note: b.note ?? null,
              url: b.url ?? null,
              is_top: !!b.is_top,
              sort_order: b.sort_order ?? i,
            })),
          );
        }
      }

      for (const cl of s.course_links ?? []) {
        let courseId: string | null = null;
        const byId = await firstRow(db.from("courses").select("id").eq("id", cl.course_id));
        if (byId) courseId = byId.id;
        else if (cl.course_title) {
          const byTitle = await firstRow(db.from("courses").select("id").ilike("title", cl.course_title));
          courseId = byTitle?.id ?? null;
        }
        if (!courseId) {
          skipped.push(`Course promo "${cl.course_title ?? cl.course_id}" on ${s.name} — course not found`);
          continue;
        }
        const linkPayload = {
          offer_label: cl.offer_label ?? null,
          original_price: cl.original_price ?? null,
          promo_price: cl.promo_price ?? null,
          note: cl.note ?? null,
          sort_order: cl.sort_order ?? 0,
        };
        const existingLink = await firstRow(
          db.from("committee_subject_courses").select("id").eq("subject_id", subjectId).eq("course_id", courseId),
        );
        if (existingLink) {
          await db.from("committee_subject_courses").update(linkPayload).eq("id", existingLink.id);
        } else {
          await db.from("committee_subject_courses").insert({ subject_id: subjectId, course_id: courseId, ...linkPayload });
        }
      }

      for (const c of s.categories ?? []) {
        const existingCat = await firstRow(
          db.from("committee_categories").select("id").eq("subject_id", subjectId).eq("name", c.name).eq("section", c.section),
        );
        let categoryId: string;
        if (existingCat) {
          categoryId = existingCat.id;
          await db.from("committee_categories").update({ sort_order: c.sort_order ?? 0 }).eq("id", categoryId);
        } else {
          const { data: ins, error } = await db
            .from("committee_categories")
            .insert({ subject_id: subjectId, name: c.name, section: c.section, sort_order: c.sort_order ?? 0 })
            .select("id")
            .single();
          if (error || !ins) throw new Error("category insert: " + (error?.message ?? ""));
          categoryId = ins.id;
          categoriesAdded++;
        }

        // Existing rows in this category, so same-title files never merge.
        const { data: existingRows = [] } = await db
          .from("committee_resources")
          .select("id,title,kind,sort_order")
          .eq("category_id", categoryId);
        const claimed = new Set<string>();
        const takeExisting = (title: string, kind: string, sortOrder: number) => {
          const match = (existingRows ?? []).find(
            (row: any) =>
              !claimed.has(row.id) &&
              row.title === title &&
              row.kind === kind &&
              (row.sort_order ?? 0) === (sortOrder ?? 0),
          ) ??
          (existingRows ?? []).find(
            (row: any) => !claimed.has(row.id) && row.title === title && row.kind === kind,
          );
          if (match) claimed.add(match.id);
          return match ?? null;
        };

        // Parents before children so nesting survives.
        const oldToNew = new Map<string, string>();
        const ordered: SnapResource[] = [];
        {
          const placed = new Set<string>();
          let pending = (c.resources ?? []).slice();
          while (pending.length) {
            const ready = pending.filter((r) => !r.parent_key || placed.has(r.parent_key));
            if (!ready.length) { ordered.push(...pending); break; }
            ready.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
            ordered.push(...ready);
            for (const r of ready) placed.add(r.key);
            const readyKeys = new Set(ready.map((r) => r.key));
            pending = pending.filter((r) => !readyKeys.has(r.key));
          }
        }
        for (const r of ordered) {
          const kind = ["pdf", "link", "folder", "video"].includes(r.kind)
            ? r.kind
            : r.file_path || r.drive_file_id
              ? "pdf"
              : "link";
          const payload = {
            category_id: categoryId,
            parent_resource_id: r.parent_key ? oldToNew.get(r.parent_key) ?? null : null,
            title: r.title,
            kind,
            file_path: r.file_path ?? null,
            url: r.url ?? null,
            description: r.description ?? null,
            sort_order: r.sort_order ?? 0,
            is_protected: r.is_protected ?? true,
            storage_provider: r.storage_provider ?? (r.drive_file_id ? "drive" : "supabase"),
            drive_file_id: r.drive_file_id ?? null,
            drive_web_link: r.drive_web_link ?? null,
            drive_download_link: r.drive_download_link ?? null,
            file_size: r.file_size ?? null,
          };
          const existingRes = takeExisting(r.title, kind, r.sort_order ?? 0);
          if (existingRes) {
            await db.from("committee_resources").update(payload).eq("id", existingRes.id);
            oldToNew.set(r.key, existingRes.id);
          } else {
            const { data: ins, error } = await db
              .from("committee_resources").insert(payload).select("id").single();
            if (error || !ins) throw new Error("resource insert: " + (error?.message ?? ""));
            oldToNew.set(r.key, ins.id);
            resourcesAdded++;
          }
        }
      }
    }
  }

  if (aquaRows.length) {
    const { error: aquaErr } = await db.from("committee_aqua_state").upsert(aquaRows, { onConflict: "node_type,node_id" });
    if (aquaErr) skipped.push(`AQUA version open/closed state was not restored: ${aquaErr.message}`);
  }

  if (p.settings && (p.settings.study_plan_path || p.settings.study_plan_title)) {
    await db
      .from("site_settings")
      .update({
        study_plan_path: p.settings.study_plan_path ?? null,
        study_plan_title: p.settings.study_plan_title ?? null,
        study_plan_subtitle: p.settings.study_plan_subtitle ?? null,
      })
      .eq("id", true);
  }

  if (Array.isArray(p.study_plan) && p.study_plan.length) {
    for (const stage of p.study_plan) {
      const stagePayload = {
        slug: stage.slug,
        title_en: stage.title_en,
        title_ar: stage.title_ar ?? null,
        subtitle_en: stage.subtitle_en ?? null,
        subtitle_ar: stage.subtitle_ar ?? null,
        has_semesters: !!stage.has_semesters,
        has_finals: !!stage.has_finals,
        sort_order: stage.sort_order ?? 0,
      };
      const existingStage = await firstRow(db.from("study_plan_stages").select("id").eq("slug", stage.slug));
      let stageId = existingStage?.id as string | undefined;
      if (stageId) {
        await db.from("study_plan_stages").update(stagePayload).eq("id", stageId);
      } else {
        const { data: ins, error } = await db.from("study_plan_stages").insert(stagePayload).select("id").single();
        if (error || !ins) throw new Error("study plan stage insert: " + (error?.message ?? ""));
        stageId = ins.id;
      }
      await db.from("study_plan_subjects").delete().eq("stage_id", stageId!);
      const rows = (stage.subjects ?? []).map((s) => ({
        stage_id: stageId!,
        semester: s.semester ?? null,
        is_final: !!s.is_final,
        name: s.name,
        assessment: s.assessment ?? "exam",
        note: s.note ?? null,
        sort_order: s.sort_order ?? 0,
      }));
      if (rows.length) {
        const { error } = await db.from("study_plan_subjects").insert(rows);
        if (error) throw new Error("study plan subjects insert: " + error.message);
      }
    }
  }

  return { university: uni.name, yearsAdded, subjectsAdded, categoriesAdded, resourcesAdded, skipped };
}

/** Deletes the whole committee tree of one university (used by Replace mode). */
export async function wipeCommittee(db: any, universityId: string) {
  const { data: years = [] } = await db.from("committee_years").select("id").eq("university_id", universityId);
  const yearIds = (years ?? []).map((y: any) => y.id);
  if (!yearIds.length) return;
  const { data: subjects = [] } = await db.from("committee_subjects").select("id").in("year_id", yearIds);
  const subjectIds = (subjects ?? []).map((s: any) => s.id);
  // AQUA open/closed rows of the nodes about to disappear (ignored when the table does not exist yet)
  try {
    const { data: semRows = [] } = await db.from("committee_semesters").select("id").in("year_id", yearIds);
    const semIdList = (semRows ?? []).map((s: any) => s.id);
    const { data: modRows = [] } = semIdList.length ? await db.from("committee_modules").select("id").in("semester_id", semIdList) : { data: [] as any[] };
    const byType: Array<[string, string[]]> = [
      ["year", yearIds],
      ["semester", semIdList],
      ["module", (modRows ?? []).map((m: any) => m.id)],
      ["subject", subjectIds],
    ];
    for (const [type, ids] of byType) {
      for (let i = 0; i < ids.length; i += 100) {
        await db.from("committee_aqua_state").delete().eq("node_type", type).in("node_id", ids.slice(i, i + 100));
      }
    }
  } catch {
    /* nothing to clean */
  }
  if (subjectIds.length) {
    const { data: cats = [] } = await db.from("committee_categories").select("id").in("subject_id", subjectIds);
    const catIds = (cats ?? []).map((c: any) => c.id);
    for (let i = 0; i < catIds.length; i += 100) {
      await db.from("committee_resources").delete().in("category_id", catIds.slice(i, i + 100));
    }
    await db.from("committee_categories").delete().in("subject_id", subjectIds);
    await db.from("committee_subject_courses").delete().in("subject_id", subjectIds);
  }
  await db.from("committee_subjects").delete().in("year_id", yearIds);
  const { data: sems = [] } = await db.from("committee_semesters").select("id").in("year_id", yearIds);
  const semIds = (sems ?? []).map((s: any) => s.id);
  if (semIds.length) await db.from("committee_modules").delete().in("semester_id", semIds);
  await db.from("committee_semesters").delete().in("year_id", yearIds);
  await db.from("committee_years").delete().in("id", yearIds);
}

/** Backup / relink are admin-only — committee members must not run them. */
export async function assertSiteAdmin(ctx: { supabase: any; userId: string }) {
  const { data: isAdmin } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!isAdmin) throw new Error("Forbidden: admins only");
}

/** Committee backups are also open to the committee head, not just site admins. */
export async function assertCommitteeAdmin(ctx: { supabase: any; userId: string }) {
  const [{ data: isAdmin }, { data: isHead }] = await Promise.all([
    ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" }),
    ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "committee_head" }),
  ]);
  if (!isAdmin && !isHead) throw new Error("Forbidden: committee head or admin only");
}
