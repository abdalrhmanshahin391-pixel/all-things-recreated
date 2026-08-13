import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { LegalArticle } from "./terms";
import { REFUND_EN, REFUND_AR } from "@/lib/legal-content";

export const Route = createFileRoute("/refund-policy")({
  head: () => ({
    meta: [
      { title: "Refund Policy — AquaQBank" },
      {
        name: "description",
        content:
          "How refunds work for AquaQBank digital access: immediate delivery, when refunds are given, and how to request one.",
      },
      { property: "og:title", content: "Refund Policy — AquaQBank" },
      { property: "og:description", content: "Refund terms for AquaQBank digital study access." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RefundPage,
});

function RefundPage() {
  const s = useSiteSettings();
  const { i18n } = useTranslation();
  const isAr = (i18n.language ?? "").startsWith("ar");
  const body = isAr ? s.refund_ar?.trim() || REFUND_AR : s.refund_en?.trim() || REFUND_EN;
  return <LegalArticle title={isAr ? "سياسة الاسترداد" : "Refund Policy"} body={body} />;
}
