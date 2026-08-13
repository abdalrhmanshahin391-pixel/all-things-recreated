import { FloatingMedicalBackdrop } from "@/components/home/FloatingMedicalBackdrop";

/**
 * MedicalPageBackdrop — wraps an inner page in a subtle floating-medical-icon
 * backdrop so list pages don't feel like empty white sheets.
 */
export function MedicalPageBackdrop({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <FloatingMedicalBackdrop density="page" />
      </div>
      <div className="relative">{children}</div>
    </div>
  );
}
