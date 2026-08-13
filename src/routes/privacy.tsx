import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { LegalArticle } from "./terms";
import { PRIVACY_EN, PRIVACY_AR } from "@/lib/legal-content";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — AquaQBank" },
      { name: "description", content: "How AquaQBank collects, uses and protects your personal data." },
      { property: "og:title", content: "Privacy Policy — AquaQBank" },
      { property: "og:description", content: "How AquaQBank handles your personal data." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  const s = useSiteSettings();
  const { i18n } = useTranslation();
  const isAr = (i18n.language ?? "").startsWith("ar");
  const body = isAr ? s.privacy_ar?.trim() || PRIVACY_AR : s.privacy_en?.trim() || PRIVACY_EN;
  return <LegalArticle title={isAr ? "سياسة الخصوصية" : "Privacy Policy"} body={body} />;
}
