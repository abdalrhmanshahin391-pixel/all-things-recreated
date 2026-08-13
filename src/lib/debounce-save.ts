/* Tiny per-key debouncer used by the admin editors so typing doesn't fire a
   database write on every keystroke (which used to race and lose edits). */

export function createDebouncedSaver(delay = 500) {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  function run(key: string, fn: () => void | Promise<void>) {
    const existing = timers.get(key);
    if (existing) clearTimeout(existing);
    timers.set(
      key,
      setTimeout(() => {
        timers.delete(key);
        void fn();
      }, delay),
    );
  }

  function flush() {
    timers.forEach((t) => clearTimeout(t));
    timers.clear();
  }

  return { run, flush };
}
