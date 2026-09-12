// The set of widgets a user can show/hide on their Dashboard. Order here
// is the default display order.
export const DASHBOARD_WIDGETS = [
  { key: "todaySales", label: "Today's sales" },
  { key: "closingStock", label: "Closing stock (units)" },
  { key: "activeWarranties", label: "Active warranties" },
  { key: "totalDue", label: "Total due" },
  { key: "pendingCod", label: "Pending COD deliveries" },
  { key: "courierLoss", label: "Courier loss this month" },
  { key: "dailyPnl", label: "Today's profit & loss" },
  { key: "monthlyPnl", label: "This month's profit & loss" },
  { key: "lowStockList", label: "Low stock list" },
  { key: "warrantyExpiringList", label: "Warranty expiring in 30 days" },
] as const;

export type DashboardWidgetKey = (typeof DASHBOARD_WIDGETS)[number]["key"];

export const ALL_DASHBOARD_WIDGET_KEYS: string[] = DASHBOARD_WIDGETS.map((w) => w.key);

// null/unset preference means "show everything" (default for new users).
export function isWidgetEnabled(prefs: unknown, key: string): boolean {
  if (prefs === null || prefs === undefined) return true;
  if (!Array.isArray(prefs)) return true;
  return (prefs as string[]).includes(key);
}
