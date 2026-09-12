// The set of back-office modules that a STAFF user's access can be
// customized for. ADMIN always has every module regardless of this list.
export const MODULES = [
  { key: "products", label: "Products", uiPaths: ["/products"], apiPath: "/api/products" },
  { key: "purchases", label: "Purchases", uiPaths: ["/purchases"], apiPath: "/api/purchases" },
  { key: "suppliers", label: "Suppliers", uiPaths: ["/suppliers"], apiPath: "/api/suppliers" },
  { key: "sales", label: "POS / Sales / Dues", uiPaths: ["/pos", "/sales"], apiPath: "/api/sales" },
  { key: "returns", label: "Returns", uiPaths: ["/returns"], apiPath: "/api/returns" },
  { key: "damages", label: "Damage", uiPaths: ["/damages"], apiPath: "/api/damages" },
  { key: "warranties", label: "Warranty", uiPaths: ["/warranties"], apiPath: "/api/warranties" },
  { key: "reports", label: "Reports", uiPaths: ["/reports"], apiPath: "/api/reports" },
  { key: "customers", label: "Customers", uiPaths: ["/customers"], apiPath: "/api/customers" },
  { key: "expenses", label: "Expenses", uiPaths: ["/expenses"], apiPath: "/api/expenses" },
  { key: "closing", label: "Cash closing", uiPaths: ["/closing"], apiPath: "/api/closing" },
] as const;

export type ModuleKey = (typeof MODULES)[number]["key"];

export const ALL_MODULE_KEYS: string[] = MODULES.map((m) => m.key);

function matches(pathname: string, base: string) {
  return pathname === base || pathname.startsWith(base + "/");
}

// Maps a request pathname (page path or /api/... route) to the module key
// that guards it. Returns null for paths that aren't module-gated (e.g.
// "/", "/login", "/users", "/settings", "/activity" which are admin-only
// and checked separately in middleware).
export function moduleForPath(pathname: string): ModuleKey | null {
  for (const m of MODULES) {
    if (m.uiPaths.some((p) => matches(pathname, p)) || matches(pathname, m.apiPath)) return m.key;
  }
  return null;
}

export function hasModuleAccess(role: string, permissions: unknown, moduleKey: string | null) {
  if (!moduleKey) return true; // not a module-gated path
  if (role === "ADMIN") return true;
  const list = Array.isArray(permissions) ? (permissions as string[]) : [];
  return list.includes(moduleKey);
}
