/**
 * Chemical formulas inside question text: find them and describe how to draw them (real subscripts and superscripts, bold).
 *
 * "CaCl₂", "(NH4)3PO4", "[Fe(CN)6]4-" and "H2SO4" are all found; ordinary words ("In", "Nine", "HIV", "OK") are not.
 * The same rules are used by Aqua Forge (static/chem.js and app/chem.py), so a formula looks the same there and here.
 */
export type ChemSeg = { k: "t" | "sub" | "sup"; v: string };
export type ChemPart = { chem: false; text: string } | { chem: true; segs: ChemSeg[]; raw: string };

const ELEMENTS = new Set(
  ("H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh " +
    "Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr " +
    "Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr").split(" "),
);
// two-letter formulas that are real compounds; any other two-letter word made of symbols ("OK", "SO", "HI") is just a word
const SHORT_OK = new Set(["CO", "NO", "HF", "NH"]);
const NOT_FORMULAS = new Set(["HIV", "SOS", "OK", "SO", "HI"]);
const DIATOMIC = new Set(["H", "N", "O", "F", "Cl", "Br", "I", "P", "S"]);
const BLOOD_GROUPS = new Set(["B+", "O+", "B-", "O-", "B−", "O−"]);

const SUB_DIGITS = "₀₁₂₃₄₅₆₇₈₉";
const SUP_DIGITS = "⁰¹²³⁴⁵⁶⁷⁸⁹";
const isUpper = (c: string) => c >= "A" && c <= "Z";
const isLower = (c: string) => c >= "a" && c <= "z";
const isDigit = (c: string) => c >= "0" && c <= "9";
const isAlnum = (c: string) => isUpper(c) || isLower(c) || isDigit(c) || c === "_";
const subIndex = (c: string) => SUB_DIGITS.indexOf(c);
const supIndex = (c: string) => SUP_DIGITS.indexOf(c);

type Parsed = { end: number; segs: ChemSeg[]; groups: number; counted: boolean; single: string; lastAscii: boolean };

function pushText(segs: ChemSeg[], v: string) {
  const last = segs[segs.length - 1];
  if (last && last.k === "t") last.v += v;
  else segs.push({ k: "t", v });
}

/** Element symbols with their counts, brackets included: "Ca(OH)2", "[Cu(NH3)4]". */
function parseGroups(s: string, start: number, closer: string | null): Parsed | null {
  const segs: ChemSeg[] = [];
  let groups = 0;
  let counted = false;
  let single = "";
  let lastAscii = false;
  let i = start;
  const n = s.length;
  const readCount = () => {
    let digits = "";
    let ascii = false;
    while (i < n && (isDigit(s[i]) || subIndex(s[i]) >= 0)) {
      if (subIndex(s[i]) >= 0) digits += String(subIndex(s[i]));
      else {
        digits += s[i];
        ascii = true;
      }
      i++;
    }
    if (digits) {
      segs.push({ k: "sub", v: digits });
      counted = true;
      lastAscii = ascii;
    } else lastAscii = false;
  };
  while (i < n) {
    const c = s[i];
    if (c === "(" || c === "[") {
      const close = c === "(" ? ")" : "]";
      const inner = parseGroups(s, i + 1, close);
      if (!inner || s[inner.end] !== close) return null;
      pushText(segs, c);
      for (const g of inner.segs) (g.k === "t" ? pushText(segs, g.v) : segs.push({ ...g }));
      pushText(segs, close);
      groups += inner.groups;
      counted = counted || inner.counted;
      i = inner.end + 1;
      readCount();
    } else if (closer && c === closer) {
      return { end: i, segs, groups, counted, single, lastAscii };
    } else if (isUpper(c)) {
      const two = i + 1 < n && isLower(s[i + 1]) ? c + s[i + 1] : "";
      const sym = two && ELEMENTS.has(two) ? two : ELEMENTS.has(c) ? c : "";
      if (!sym) return null;
      // a lowercase letter right after a one-letter symbol means this is a word ("Hi", "Nine"), not a formula
      if (sym.length === 1 && i + 1 < n && isLower(s[i + 1])) return null;
      pushText(segs, sym);
      groups++;
      single = sym;
      i += sym.length;
      readCount();
    } else if ((c === "·" || c === "∙" || c === "*") && groups > 0) {
      // hydrates: CuSO4·5H2O
      let j = i + 1;
      let coef = "";
      while (j < n && isDigit(s[j])) coef += s[j++];
      if (j >= n || !isUpper(s[j])) break;
      pushText(segs, "·" + coef);
      i = j;
    } else break;
  }
  return closer ? null : { end: i, segs, groups, counted, single, lastAscii };
}

/** The charge written after a formula: Fe³⁺ (real superscripts), or plain "Fe3+", "Na+", "SO42-". */
function readCharge(s: string, i: number): { sup: string; len: number; plain: boolean } | null {
  let j = i;
  let sup = "";
  while (j < s.length && (supIndex(s[j]) >= 0 || s[j] === "⁺" || s[j] === "⁻")) {
    sup += supIndex(s[j]) >= 0 ? String(supIndex(s[j])) : s[j] === "⁺" ? "+" : "−";
    j++;
  }
  if (sup) return { sup, len: j - i, plain: false };
  const m = /^([+\-−–])(?![A-Za-z0-9_])/.exec(s.slice(i));
  if (!m) return null;
  return { sup: m[1] === "+" ? "+" : "−", len: 1, plain: true };
}

export function splitChem(text: string): ChemPart[] {
  const out: ChemPart[] = [];
  let plainFrom = 0;
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    const prev = i > 0 ? text[i - 1] : "";
    if (!(isUpper(c) || c === "(" || c === "[")) {
      i++;
      continue;
    }
    // a coefficient in front ("2H2O", "3NO2F"): printed at normal size, bold with the formula
    let coefStart = i;
    if (prev && isDigit(prev)) {
      let k = i - 1;
      while (k > 0 && isDigit(text[k - 1])) k--;
      const before = k > 0 ? text[k - 1] : "";
      if (before && (isAlnum(before) || before === "," || before === ".")) {
        i++;
        continue;
      }
      coefStart = k;
    } else if (prev && isAlnum(prev)) {
      i++;
      continue;
    }
    const p = parseGroups(text, i, null);
    if (!p || p.groups === 0) {
      i++;
      continue;
    }
    let end = p.end;
    let segs = p.segs;
    let charge = readCharge(text, end);
    if (charge && charge.plain) {
      const last = segs[segs.length - 1];
      if (last && last.k === "sub" && p.lastAscii) {
        if (last.v.length >= 2) {
          // "SO42-": the last digit is the charge
          segs = [...segs.slice(0, -1), { k: "sub", v: last.v.slice(0, -1) }];
          charge = { ...charge, sup: last.v[last.v.length - 1] + charge.sup };
        } else if (p.groups === 1) {
          // "Fe3+": one element, one digit, then a sign: the digit is the charge
          segs = segs.slice(0, -1);
          charge = { ...charge, sup: last.v + charge.sup };
        }
      }
    }
    if (charge) {
      end += charge.len;
      segs = [...segs, { k: "sup", v: charge.sup }];
    }
    if (coefStart < i) {
      const coef = text.slice(coefStart, i);
      segs = segs[0] && segs[0].k === "t" ? [{ k: "t", v: coef + segs[0].v }, ...segs.slice(1)] : [{ k: "t", v: coef }, ...segs];
    }
    const raw = text.slice(i, end);
    const next = end < n ? text[end] : "";
    let ok = !(next && isAlnum(next)) && !NOT_FORMULAS.has(raw.toUpperCase()) && !BLOOD_GROUPS.has(raw);
    if (ok) {
      if (p.groups >= 2) ok = p.counted || !!charge || raw.length >= 3 || SHORT_OK.has(raw);
      else if (charge) ok = true;
      else ok = p.counted && DIATOMIC.has(p.single);
    }
    if (!ok) {
      i++;
      continue;
    }
    if (plainFrom < coefStart) out.push({ chem: false, text: text.slice(plainFrom, coefStart) });
    out.push({ chem: true, segs, raw: text.slice(coefStart, end) });
    i = end;
    plainFrom = end;
  }
  if (plainFrom < n) out.push({ chem: false, text: text.slice(plainFrom) });
  return out;
}

/** The formula as plain text ("H2SO4", "Fe3+"): used by tests and for copying. */
export function chemPlain(segs: ChemSeg[]): string {
  return segs.map((s) => s.v).join("");
}

const SUBS_RUN = /[₀-₎]+/g;
const SUPS_RUN = /(?:[⁰¹²³⁴-ⁿ])+/g;
const SUB_MAP: Record<string, string> = { "₊": "+", "₋": "−", "₌": "=", "₍": "(", "₎": ")" };
const SUP_MAP: Record<string, string> = { "⁺": "+", "⁻": "−", "⁼": "=", "⁽": "(", "⁾": ")", "ⁿ": "n" };

/** Unicode subscripts and superscripts outside formulas (10⁻⁵, mol·L⁻¹) as real sub/sup text. */
export function splitScripts(text: string): { k: "t" | "sub" | "sup"; v: string }[] {
  const out: { k: "t" | "sub" | "sup"; v: string }[] = [];
  const re = /([₀-₎]+)|((?:[⁰¹²³⁴-ⁿ])+)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ k: "t", v: text.slice(last, m.index) });
    if (m[1]) {
      out.push({ k: "sub", v: [...m[1]].map((ch) => (subIndex(ch) >= 0 ? String(subIndex(ch)) : SUB_MAP[ch] ?? ch)).join("") });
    } else {
      out.push({ k: "sup", v: [...m[2]].map((ch) => (supIndex(ch) >= 0 ? String(supIndex(ch)) : SUP_MAP[ch] ?? ch)).join("") });
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ k: "t", v: text.slice(last) });
  return out;
}

// kept so the regular expressions above are not flagged as unused by linters
export const _SCRIPT_RUNS = [SUBS_RUN, SUPS_RUN];

export type MathPart = { math: boolean; text: string };

/** $...$ is a formula written in LaTeX (fractions, large and small numbers, arrows); "$5 and $10" is money, not a formula. */
export function splitMath(text: string): MathPart[] {
  const out: MathPart[] = [];
  const re = /\$([^$\n]+?)\$/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (!/[\\^_{}=<>]/.test(m[1])) continue;
    if (m.index > last) out.push({ math: false, text: text.slice(last, m.index) });
    out.push({ math: true, text: m[1] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ math: false, text: text.slice(last) });
  return out;
}

export const ARROWS = /([\u2192\u21cc\u21c4\u21d2\u21d0\u21d4\u2194\u2191\u2193\u2190])/;
