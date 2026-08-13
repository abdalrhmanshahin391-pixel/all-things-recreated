# New About page + My Mentor in the header

## 1. Rebuild "About us" from zero

Replace the current database-driven About page with a fully designed, bilingual (EN/AR) page at `/about`. New structure, top to bottom:

**Opening — who built this**
A quiet, confident hero naming the two founders: **Abdalrhman Shaheen** and **Laith Shaheen**, with one line on what the academy is.

**Why it exists — the philosophy**
A written, reflective section (not bullet soup) arguing that medicine is learned by *thinking*, not by absorbing slides: knowledge that is only recognized on a slide collapses at the bedside; a question forces a decision, and a decision is what a doctor actually does. Slides describe disease in the abstract — cases teach you to meet a person. Written in a wiser, more philosophical register than a feature list, with two or three short pull-quote lines used as visual punctuation.

**The Golden Age physicians**
A section honoring the classical Islamic-era physicians, each presented separately with space to breathe — alternating text/portrait rows rather than a cramped grid. The two paintings you uploaded are placed far apart (one anchoring the section opening, one anchoring the closing reflection), full-width, framed, with captions.

Physicians covered, each with a short portrait of their contribution and a quote (attributed, with wording noted as rendered from the classical sources):
- Al-Razi (Rhazes) — clinical observation, honest case records, treating the poor
- Ibn Sina (Avicenna) — systematizing medicine, medicine as reasoning
- Al-Zahrawi — craft, care and precision as moral duties
- Ibn al-Nafis — courage to correct received authority
- Al-Tabari / Ibn Ridwan-style physician's-ethics writing — the duty of character

**The ethics — the real inheritance**
The argument you asked for, expanded: we are not returning to old remedies, we are returning to the *mindset*. Hard work as a form of respect for the patient; treating the poor as the test of whether medicine is a service or a transaction; the seriousness of a job where the object of study is a person, not a case. Framed in humane and ethical language — no religious content on this page, so it speaks to everyone.

Closes on: **"They taught us that science without compassion is incomplete. They didn't just study diseases; they studied humans."**

**Closing CTA** into courses/question banks.

The old admin-editable About blocks stay in the database untouched but are no longer rendered; `/admin/about` keeps working for legacy content.

## 2. My Mentor (مرشدي) — strip stoicism, surface in the header

- Remove every Stoic element: the "تعاليم الرواقية" category panel, the "الالتزامات الرواقية" checklist, the stoic tone/kind branches and stoic stats. Keep all religious content — الأدعية, الواجبات الدينية, the pinned treasure, and the journal — exactly as it is.
- Rename the page to the English title **My Mentor** (Arabic مرشدي kept as a subtitle inside the page), paired with a crescent icon.
- Add it as a link in the top header bar (the same bar as About us / sign in), labeled **My Mentor** with the crescent icon, so users who want it can reach it and everyone else can ignore it.

## Technical notes
- `/about` becomes a hand-authored route: hero, philosophy, alternating physician rows, ethics section, CTA — all styled with existing semantic tokens, no hardcoded colors, responsive, RTL-safe.
- The two uploaded paintings are registered as CDN assets (`lovable-assets` pointers in `src/assets`) and imported, with descriptive alt text.
- Head metadata for `/about` is rewritten: new title, description, og/twitter tags, and the existing AboutPage JSON-LD updated with the two founders.
- Mentor route moves from `/admin/mentor` to `/mentor` and its gate changes from admin-only to signed-in; the nav item in the admin hub is updated to match. Editing controls remain admin-only.
- No database or schema changes.
