import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type GroupKind =
  | "manual"
  | "everyone"
  | "admins"
  | "committee"
  | "course_owners"
  | "package_owners"
  | "no_course";

export type UserGroup = {
  id: string;
  name: string;
  color: string;
  kind: GroupKind;
  course_id: string | null;
  package_id: string | null;
  created_at: string;
};

export type GroupMember = {
  user_id: string;
  username: string | null;
  full_name: string | null;
  email: string | null;
};

export const GROUP_KINDS: { id: GroupKind; name: string; note: string }[] = [
  { id: "manual", name: "Hand picked", note: "You choose the people yourself" },
  { id: "everyone", name: "Everyone", note: "Every signed-in user" },
  { id: "admins", name: "Admins", note: "Anyone with the admin role" },
  { id: "committee", name: "لجنة الطب والجراحة", note: "Anyone with the committee role" },
  { id: "course_owners", name: "Owners of a course", note: "Everyone who has that course" },
  { id: "package_owners", name: "Owners of a package", note: "Everyone who bought that package" },
  { id: "no_course", name: "No course yet", note: "Signed-up users who never got a course" },
];

export const GROUP_COLORS = ["#e11d48", "#58cc02", "#1cb0f6", "#f59e0b", "#8b5cf6", "#0f172a"];

const db = (table: string) => (supabase.from as any)(table);

export function useUserGroups() {
  return useQuery({
    queryKey: ["user-groups"],
    queryFn: async () => {
      const { data, error } = await db("user_groups")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as UserGroup[];
    },
  });
}

export function useGroupCounts() {
  return useQuery({
    queryKey: ["user-group-counts"],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("admin_group_counts");
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const r of (data ?? []) as { group_id: string; member_count: number }[]) {
        map[r.group_id] = Number(r.member_count);
      }
      return map;
    },
  });
}

export function useGroupMembers(groupId: string | null) {
  return useQuery({
    enabled: !!groupId,
    queryKey: ["user-group-members", groupId],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("admin_list_group_members", {
        _group_id: groupId,
      });
      if (error) throw error;
      return (data ?? []) as GroupMember[];
    },
  });
}

export async function searchUsers(query: string) {
  const { data, error } = await (supabase.rpc as any)("search_users_for_group", {
    _query: query,
    _exclude: null,
  });
  if (error) throw error;
  return (data ?? []) as { id: string; username: string; full_name: string; email: string }[];
}

export async function createGroup(name: string) {
  const { error } = await db("user_groups").insert({ name, kind: "manual" });
  if (error) throw error;
}

export async function updateGroup(id: string, values: Partial<UserGroup>) {
  const { error } = await db("user_groups").update(values).eq("id", id);
  if (error) throw error;
}

export async function deleteGroup(id: string) {
  const { error } = await db("user_groups").delete().eq("id", id);
  if (error) throw error;
}

export async function addMember(groupId: string, userId: string) {
  const { error } = await db("user_group_members").insert({ group_id: groupId, user_id: userId });
  if (error) throw error;
}

export async function removeMember(groupId: string, userId: string) {
  const { error } = await db("user_group_members")
    .delete()
    .eq("group_id", groupId)
    .eq("user_id", userId);
  if (error) throw error;
}

export function useAnnouncementAudiences() {
  return useQuery({
    queryKey: ["announcement-audiences"],
    queryFn: async () => {
      const { data, error } = await db("announcement_audiences").select("*");
      if (error) throw error;
      const map: Record<string, string[]> = {};
      for (const r of (data ?? []) as { announcement_id: string; group_id: string }[]) {
        (map[r.announcement_id] ||= []).push(r.group_id);
      }
      return map;
    },
  });
}

export async function setAudience(announcementId: string, groupId: string, on: boolean) {
  if (on) {
    const { error } = await db("announcement_audiences").insert({
      announcement_id: announcementId,
      group_id: groupId,
    });
    if (error) throw error;
  } else {
    const { error } = await db("announcement_audiences")
      .delete()
      .eq("announcement_id", announcementId)
      .eq("group_id", groupId);
    if (error) throw error;
  }
}
