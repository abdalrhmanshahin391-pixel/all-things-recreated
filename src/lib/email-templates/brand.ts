// Shared inline styles for AquaQBank auth emails.
// Email clients need inline styles — no Tailwind, no external CSS.

export const TEAL = "#0f9aa9";
export const TEAL_DEEP = "#0b7683";
export const INK = "#0f2530";
export const MUTED = "#5b7180";

export const main = {
  backgroundColor: "#ffffff",
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  margin: "0",
  padding: "0",
};

export const container = {
  maxWidth: "520px",
  margin: "0 auto",
  padding: "32px 28px 40px",
};

export const brandBar = {
  borderBottom: `3px solid ${TEAL}`,
  paddingBottom: "14px",
  marginBottom: "28px",
};

export const brandName = {
  fontSize: "20px",
  fontWeight: 800 as const,
  letterSpacing: "0.5px",
  color: TEAL_DEEP,
  margin: "0",
};

export const h1 = {
  fontSize: "22px",
  fontWeight: 800 as const,
  color: INK,
  margin: "0 0 16px",
};

export const text = {
  fontSize: "15px",
  color: MUTED,
  lineHeight: "1.6",
  margin: "0 0 18px",
};

export const link = { color: TEAL_DEEP, textDecoration: "underline" };

export const button = {
  display: "inline-block",
  backgroundColor: TEAL,
  color: "#ffffff",
  fontSize: "15px",
  fontWeight: 700 as const,
  borderRadius: "10px",
  padding: "13px 26px",
  textDecoration: "none",
};

export const codeBox = {
  display: "inline-block",
  backgroundColor: "#f1f8f9",
  border: `2px solid ${TEAL}`,
  borderRadius: "10px",
  padding: "14px 24px",
  fontSize: "28px",
  fontWeight: 800 as const,
  letterSpacing: "6px",
  color: INK,
  margin: "0 0 20px",
};

export const hr = {
  border: "none",
  borderTop: "1px solid #e3ecef",
  margin: "32px 0 16px",
};

export const footer = {
  fontSize: "12px",
  color: "#93a5ae",
  lineHeight: "1.6",
  margin: "0",
};
