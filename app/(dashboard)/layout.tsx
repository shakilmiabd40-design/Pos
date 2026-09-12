import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import AppShell from "@/components/AppShell";

const NAV_GROUPS = [
  {
    label: null as string | null,
    collapsible: false,
    items: [{ href: "/", label: "Dashboard", key: null as string | null }],
  },
  {
    label: "Sales",
    collapsible: false,
    items: [
      { href: "/pos", label: "POS / New sale", key: "sales" },
      { href: "/sales", label: "Sales", key: "sales" },
      { href: "/customers", label: "Customers", key: "customers" },
      { href: "/returns", label: "Returns", key: "returns" },
    ],
  },
  {
    label: "Inventory",
    collapsible: true,
    items: [
      { href: "/products", label: "Products", key: "products" },
      { href: "/purchases", label: "Purchases", key: "purchases" },
      { href: "/suppliers", label: "Suppliers", key: "suppliers" },
      { href: "/damages", label: "Damage", key: "damages" },
      { href: "/warranties", label: "Warranty", key: "warranties" },
    ],
  },
  {
    label: "Finance",
    collapsible: true,
    items: [
      { href: "/expenses", label: "Expenses", key: "expenses" },
      { href: "/closing", label: "Cash closing", key: "closing" },
      { href: "/reports", label: "Reports", key: "reports" },
    ],
  },
];

const ADMIN_GROUP = {
  label: "Admin",
  collapsible: true,
  items: [
    { href: "/settings", label: "Shop settings", key: null as string | null },
    { href: "/api-keys", label: "API keys", key: null as string | null },
    { href: "/activity", label: "Activity log", key: null as string | null },
    { href: "/users", label: "Users", key: null as string | null },
  ],
};

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const isAdmin = session.role === "ADMIN";
  const permissions = Array.isArray(session.permissions) ? session.permissions : [];

  const groups = NAV_GROUPS.map((g) => ({
    label: g.label,
    collapsible: g.collapsible,
    items: g.items.filter((item) => isAdmin || !item.key || permissions.includes(item.key)),
  })).filter((g) => g.items.length > 0);

  if (isAdmin) groups.push(ADMIN_GROUP);

  return (
    <AppShell groups={groups} userName={session.name} userRole={session.role}>
      {children}
    </AppShell>
  );
}
