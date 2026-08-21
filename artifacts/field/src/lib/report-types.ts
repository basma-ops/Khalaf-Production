import type { FinalizeUploadRequestReportType } from "@workspace/api-client-react";

/**
 * The eight report kinds a field worker can tag a photo upload with.
 *
 * Order is intentional: it's roughly the frequency / day-to-day relevance
 * a worker will reach for, with `general` as the no-context fallback.
 * Keep the values in sync with `FinalizeUploadRequestReportType`
 * (OpenAPI enum) — anything else is rejected by the server.
 */
export const REPORT_TYPE_OPTIONS: {
  value: FinalizeUploadRequestReportType;
  label: string;
  hint: string;
}[] = [
  { value: "general", label: "عام", hint: "صورة سريعة بدون فئة محددة" },
  { value: "phenology", label: "مراحل النمو", hint: "ملاحظة مرحلة النمو حسب BBCH" },
  { value: "scout", label: "استطلاع", hint: "رصد آفة أو مرض أو حالة غير طبيعية" },
  { value: "irrigation", label: "ري", hint: "خطوط المياه، النقّاطات، رطوبة التربة" },
  { value: "treatment", label: "معالجة", hint: "رش، تسميد أو أي تدخّل آخر" },
  { value: "weather", label: "طقس", hint: "أحوال الطقس الميدانية" },
  { value: "harvest", label: "حصاد", hint: "جاهزية الحصاد أو القطف الفعلي" },
  { value: "damage", label: "أضرار", hint: "أضرار عواصف أو حيوانات أو ميكانيكية" },
];

export function reportTypeLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return REPORT_TYPE_OPTIONS.find((o) => o.value === value)?.label ?? value;
}
