import { ar } from "date-fns/locale";

export const dateLocale = { locale: ar };

export function priorityLabel(p: string): string {
  const map: Record<string, string> = {
    critical: "حرج",
    high: "مرتفعة",
    medium: "متوسطة",
    low: "منخفضة",
  };
  return map[p] ?? p;
}

export function statusLabel(s: string): string {
  const map: Record<string, string> = {
    open: "مفتوحة",
    in_progress: "قيد التنفيذ",
    completed: "مكتملة",
    resolved: "تم الحل",
  };
  return map[s] ?? s.replace("_", " ");
}

export function severityLabel(s: string): string {
  const map: Record<string, string> = {
    urgent: "عاجل",
    high: "مرتفع",
    medium: "متوسط",
    low: "منخفض",
  };
  return map[s] ?? s;
}

export function roleLabel(r: string): string {
  const map: Record<string, string> = {
    field_worker: "عامل ميداني",
    grove_manager: "مدير بستان",
    farm_manager: "مدير مزرعة",
    admin: "مسؤول",
  };
  return map[r] ?? r.replace("_", " ");
}
