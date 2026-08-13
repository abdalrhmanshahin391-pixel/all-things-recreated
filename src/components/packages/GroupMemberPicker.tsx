import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Search, X, UserPlus, Loader2 } from "lucide-react";
import { searchUsersForGroup } from "@/lib/packages.functions";

export type GroupMember = { id: string; username: string; full_name: string; email: string };

export function GroupMemberPicker({
  needed,
  value,
  onChange,
}: {
  needed: number;
  value: GroupMember[];
  onChange: (next: GroupMember[]) => void;
}) {
  const search = useServerFn(searchUsersForGroup);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GroupMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    if (!query || query.trim().length < 2) {
      setResults([]);
      return;
    }
    debounceRef.current = window.setTimeout(async () => {
      setLoading(true);
      try {
        const rows = await search({ data: { query: query.trim() } });
        const picked = new Set(value.map((v) => v.id));
        setResults(rows.filter((r) => !picked.has(r.id)));
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 220);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [query, value, search]);

  function add(m: GroupMember) {
    if (value.length >= needed) return;
    onChange([...value, m]);
    setQuery("");
    setResults([]);
    setOpen(false);
  }

  function remove(id: string) {
    onChange(value.filter((m) => m.id !== id));
  }

  return (
    <div>
      <div className="text-xs uppercase tracking-widest text-white/50 mb-2">
        Group members · {value.length} / {needed} picked
      </div>

      {/* Picked chips */}
      <div className="flex flex-wrap gap-2 mb-3">
        {value.map((m) => (
          <span
            key={m.id}
            className="inline-flex items-center gap-2 rounded-full bg-amber-400/10 ring-1 ring-amber-400/40 text-amber-200 pl-2.5 pr-1.5 py-1 text-xs"
          >
            <span className="font-semibold">{m.username}</span>
            <span className="text-amber-300/70 truncate max-w-[180px]">{m.full_name}</span>
            <button
              type="button"
              onClick={() => remove(m.id)}
              className="w-5 h-5 rounded-full hover:bg-rose-500/30 flex items-center justify-center"
              aria-label="Remove"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        {value.length === 0 && (
          <span className="text-xs text-white/40">No members picked yet.</span>
        )}
      </div>

      {/* Search */}
      <div className="relative">
        <div className="flex items-center rounded-lg border border-white/15 bg-black/40 px-3 py-2 gap-2 focus-within:border-amber-400/60">
          <Search className="w-4 h-4 text-white/40" />
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder={
              value.length >= needed
                ? "All members picked"
                : "Search by username, email, or full name"
            }
            disabled={value.length >= needed}
            className="flex-1 bg-transparent text-sm text-white placeholder-white/30 outline-none disabled:cursor-not-allowed"
          />
          {loading && <Loader2 className="w-4 h-4 animate-spin text-white/40" />}
        </div>
        {open && results.length > 0 && (
          <div className="absolute z-10 mt-1 left-0 right-0 rounded-lg border border-white/15 bg-zinc-900 shadow-2xl overflow-hidden max-h-72 overflow-y-auto">
            {results.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => add(m)}
                className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left hover:bg-white/5"
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white truncate">
                    {m.username}{" "}
                    <span className="font-normal text-white/50">— {m.full_name}</span>
                  </div>
                  <div className="text-[11px] text-white/40 truncate">{m.email}</div>
                </div>
                <UserPlus className="w-4 h-4 text-amber-400 shrink-0" />
              </button>
            ))}
          </div>
        )}
        {open && query.trim().length >= 2 && !loading && results.length === 0 && (
          <div className="absolute z-10 mt-1 left-0 right-0 rounded-lg border border-white/15 bg-zinc-900 px-3 py-3 text-xs text-white/50">
            No users matched.
          </div>
        )}
      </div>
    </div>
  );
}
