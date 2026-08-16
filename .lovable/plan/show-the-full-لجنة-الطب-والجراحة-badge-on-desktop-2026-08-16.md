# Show the full لجنة الطب والجراحة badge on desktop

On PC the account button in the top bar is capped at a fixed width and hides anything past it, so the red committee badge gets cut off mid-word.

## Change

- In `src/components/SiteHeader.tsx`, the desktop (non-compact) account button drops the `max-w-[9.5rem] overflow-hidden` cap so the avatar + badge + chevron take the width they need.
- Nothing else changes: the phone/iPad sub-row, the mobile menu, the badges themselves and all other layout rules stay exactly as they are.

## Technical note

Single edit to the `AccountBlock` button className in `SiteHeader.tsx` — the `compact ? "" : "max-w-[9.5rem] overflow-hidden"` branch becomes empty in both cases. The right cluster already has `min-w-0 shrink-0`, so the wider button sits inside the bar without pushing the layout.
