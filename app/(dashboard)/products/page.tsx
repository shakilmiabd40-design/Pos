"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client-fetch";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/ConfirmDialog";
import { importFromExcel } from "@/lib/import-xlsx";
import BarcodeScannerButton from "@/components/BarcodeScanner";
import { EmptyState } from "@/components/EmptyState";

type Variant = { id: string; size: string; sku: string; barcode: string | null; stock: number; reorderAt: number; active: boolean };
type Product = {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  color: string | null;
  costPrice: number;
  sellPrice: number;
  imageUrl: string | null;
  active: boolean;
  variants: Variant[];
};

// Common BD shoe sizes — shown as quick checkboxes when adding a product.
// Not a hard limit: you can add any custom size too.
const COMMON_SIZES = ["38", "39", "40", "41", "42", "43", "44", "45"];

type SizeRow = { size: string; sku: string; stock: string; checked: boolean };

function makeSizeRows(code: string): SizeRow[] {
  return COMMON_SIZES.map((size) => ({ size, sku: code ? `${code}-${size}` : "", stock: "", checked: false }));
}

const emptyForm = {
  name: "",
  brand: "",
  category: "",
  color: "",
  costPrice: "",
  sellPrice: "",
  code: "",
  imageUrl: "",
};

export default function ProductsPage() {
  const showToast = useToast();
  const askConfirm = useConfirm();
  const [products, setProducts] = useState<Product[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [sizeRows, setSizeRows] = useState<SizeRow[]>(makeSizeRows(""));
  const [customSize, setCustomSize] = useState("");
  const [showSizes, setShowSizes] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [editProductForm, setEditProductForm] = useState(emptyForm);
  const [editError, setEditError] = useState("");
  const [category, setCategory] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ created: number; sizes: number; errors: string[] } | null>(null);

  async function load(query = q, cat = category) {
    const qs = new URLSearchParams();
    if (query) qs.set("q", query);
    if (cat) qs.set("category", cat);
    setProducts(await api<Product[]>(`/api/products?${qs.toString()}`));
  }

  async function refreshCategories() {
    api<string[]>("/api/products/categories").then(setCategories).catch(() => {});
  }

  useEffect(() => {
    load();
    refreshCategories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onCodeChange(code: string) {
    setForm({ ...form, code });
    setSizeRows((prev) => prev.map((r) => ({ ...r, sku: code ? `${code}-${r.size}` : "" })));
  }

  function toggleSize(idx: number) {
    setSizeRows((prev) => prev.map((r, i) => (i === idx ? { ...r, checked: !r.checked } : r)));
  }

  const allSizesChecked = sizeRows.length > 0 && sizeRows.every((r) => r.checked);

  function toggleAllSizes() {
    const next = !allSizesChecked;
    setSizeRows((prev) => prev.map((r) => ({ ...r, checked: next })));
  }

  const [bulkStock, setBulkStock] = useState("");
  function applyBulkStock() {
    if (bulkStock === "") return;
    setSizeRows((prev) => prev.map((r) => (r.checked ? { ...r, stock: bulkStock } : r)));
  }

  function updateSizeField(idx: number, patch: Partial<SizeRow>) {
    setSizeRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function addCustomSize() {
    if (!customSize) return;
    if (sizeRows.some((r) => r.size === customSize)) {
      setError(`Size ${customSize} is already in the list`);
      return;
    }
    setSizeRows((prev) => [
      ...prev,
      { size: customSize, sku: form.code ? `${form.code}-${customSize}` : "", stock: "", checked: true },
    ]);
    setCustomSize("");
  }

  // Groups flat rows (one per product+size) into one create-product
  // request per unique product name, each with all its size variants —
  // matching how /api/products already accepts a `variants` array.
  async function submitBulkRows(
    rows: { name: string; brand: string; category: string; color: string; costPrice: string; sellPrice: string; size: string; sku: string; stock: string }[]
  ) {
    const groups = new Map<string, typeof rows[number] & { variants: { size: string; sku: string; stock: string }[] }>();
    const rowErrors: string[] = [];

    for (const row of rows) {
      if (!row.name) continue;
      if (!row.size || !row.sku) {
        rowErrors.push(`${row.name || "(no name)"} — every row needs a Size and SKU`);
        continue;
      }
      const key = row.name.trim().toLowerCase();
      if (!groups.has(key)) {
        groups.set(key, { ...row, variants: [] });
      }
      groups.get(key)!.variants.push({ size: row.size, sku: row.sku, stock: row.stock });
    }

    setBulkBusy(true);
    let created = 0;
    let sizes = 0;
    const errors = [...rowErrors];

    for (const group of groups.values()) {
      try {
        await api("/api/products", {
          method: "POST",
          body: JSON.stringify({
            name: group.name,
            brand: group.brand,
            category: group.category,
            color: group.color,
            costPrice: group.costPrice,
            sellPrice: group.sellPrice,
            variants: group.variants,
          }),
        });
        created += 1;
        sizes += group.variants.length;
      } catch (e: any) {
        errors.push(`${group.name} — ${e.message}`);
      }
    }

    setBulkBusy(false);
    setBulkResult({ created, sizes, errors });
    if (created > 0) {
      await load(q);
      await refreshCategories();
    }
  }

  function addBulkFromText() {
    const rows = bulkText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const p = line.split(/\t|,/).map((x) => x.trim());
        return {
          name: p[0] || "",
          brand: p[1] || "",
          category: p[2] || "",
          color: p[3] || "",
          costPrice: p[4] || "0",
          sellPrice: p[5] || "0",
          size: p[6] || "",
          sku: p[7] || "",
          stock: p[8] || "0",
        };
      });
    submitBulkRows(rows);
  }

  async function onBulkFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const parsed = await importFromExcel(file);
      const get = (r: Record<string, any>, keys: string[]) => {
        for (const k of Object.keys(r)) {
          if (keys.includes(k.trim().toLowerCase())) return String(r[k] ?? "");
        }
        return "";
      };
      const rows = parsed.map((r) => ({
        name: get(r, ["name", "product", "product name"]),
        brand: get(r, ["brand"]),
        category: get(r, ["category"]),
        color: get(r, ["color"]),
        costPrice: get(r, ["costprice", "cost price", "cost"]),
        sellPrice: get(r, ["sellprice", "sell price", "price"]),
        size: get(r, ["size"]),
        sku: get(r, ["sku"]),
        stock: get(r, ["stock", "qty", "quantity"]),
      }));
      submitBulkRows(rows);
    } catch (err: any) {
      setBulkResult({ created: 0, sizes: 0, errors: [`Could not read that file: ${err.message || "unknown error"}`] });
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const variants = sizeRows.filter((r) => r.checked).map((r) => ({ size: r.size, sku: r.sku, stock: r.stock }));
    if (variants.length === 0) return setError("Select at least one size and give it a SKU");
    if (variants.some((v) => !v.sku)) return setError("Every selected size needs a SKU (fill the Code field, or edit SKUs directly)");

    setLoading(true);
    try {
      await api("/api/products", { method: "POST", body: JSON.stringify({ ...form, variants }) });
      setForm(emptyForm);
      setSizeRows(makeSizeRows(""));
      setBulkStock("");
      await load(q);
      await refreshCategories();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function onDeleteProduct(id: string) {
    if (!(await askConfirm("Delete this product (all its sizes)? If it has history it will be deactivated instead."))) return;
    try {
      await api(`/api/products/${id}`, { method: "DELETE" });
      await load(q);
    } catch (e: any) {
      showToast(e.message, "error");
    }
  }

  function startEditProduct(p: Product) {
    setEditingProductId(p.id);
    setEditError("");
    setEditProductForm({
      name: p.name,
      brand: p.brand || "",
      category: p.category || "",
      color: p.color || "",
      costPrice: String(p.costPrice),
      sellPrice: String(p.sellPrice),
      code: "",
      imageUrl: p.imageUrl || "",
    });
  }

  async function saveEditProduct(id: string) {
    setEditError("");
    try {
      await api(`/api/products/${id}`, { method: "PUT", body: JSON.stringify(editProductForm) });
      setEditingProductId(null);
      await load(q);
      await refreshCategories();
    } catch (e: any) {
      setEditError(e.message);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-serif text-ink mb-1">Products</h1>
      <p className="text-sm text-ink/60 mb-6">One product can have several sizes — each size keeps its own stock.</p>

      <datalist id="category-options">
        {categories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      <form onSubmit={onSubmit} className="card mb-6 space-y-4">
        {error && <div className="text-sm text-clay">{error}</div>}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="label">Name</label>
            <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="label">Brand</label>
            <input className="input" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
          </div>
          <div>
            <label className="label">Category</label>
            <input className="input" list="category-options" placeholder="Pick existing or type a new one" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
          </div>
          <div>
            <label className="label">Color</label>
            <input className="input" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
          </div>
          <div>
            <label className="label">Cost price</label>
            <input className="input" type="number" step="0.01" value={form.costPrice} onChange={(e) => setForm({ ...form, costPrice: e.target.value })} />
          </div>
          <div>
            <label className="label">Sell price</label>
            <input className="input" type="number" step="0.01" value={form.sellPrice} onChange={(e) => setForm({ ...form, sellPrice: e.target.value })} />
          </div>
          <div>
            <label className="label">Code (SKU prefix)</label>
            <input className="input" placeholder="e.g. NIKE-A001" value={form.code} onChange={(e) => onCodeChange(e.target.value)} />
          </div>
          <div className="col-span-2">
            <label className="label">Image URL (optional)</label>
            <input
              className="input"
              placeholder="https://…/photo.jpg"
              value={form.imageUrl}
              onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
            />
          </div>
        </div>
        {form.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={form.imageUrl} alt="" className="h-16 w-16 object-cover rounded-md border border-line" onError={(e) => (e.currentTarget.style.display = "none")} />
        )}

        <div>
          <div className="flex items-center justify-between">
            <label className="label">Sizes &amp; opening stock</label>
            <button type="button" className="text-sm text-ink/60 underline" onClick={() => setShowSizes((v) => !v)}>
              {showSizes ? "Hide sizes" : `Show sizes (${sizeRows.filter((r) => r.checked).length} selected)`}
            </button>
          </div>
          {showSizes && (
            <>
              <label className="flex items-center gap-1.5 text-sm text-ink/70 mb-2">
                <input type="checkbox" checked={allSizesChecked} onChange={toggleAllSizes} />
                Select all sizes
              </label>

              <div className="flex flex-wrap items-end gap-2 mb-3 border border-line rounded-md p-2 bg-paper">
                <div>
                  <label className="label">Bulk quantity</label>
                  <input
                    className="input w-28"
                    type="number"
                    min="0"
                    placeholder="e.g. 5"
                    value={bulkStock}
                    onChange={(e) => setBulkStock(e.target.value)}
                  />
                </div>
                <button type="button" className="btn-secondary" onClick={applyBulkStock}>
                  Apply to selected sizes
                </button>
                <span className="text-xs text-ink/50">
                  Sets this stock on every ticked size below ({sizeRows.filter((r) => r.checked).length} selected).
                </span>
              </div>

              <div className="space-y-2">
                {sizeRows.map((r, i) => (
                  <div key={`${r.size}-${i}`} className="grid grid-cols-[auto_1fr_80px] sm:grid-cols-12 gap-2 items-center">
                    <label className="sm:col-span-1 flex items-center gap-1 text-sm whitespace-nowrap">
                      <input type="checkbox" checked={r.checked} onChange={() => toggleSize(i)} />
                      {r.size}
                    </label>
                    <input
                      className="input sm:col-span-6"
                      placeholder="SKU"
                      value={r.sku}
                      onChange={(e) => updateSizeField(i, { sku: e.target.value })}
                      disabled={!r.checked}
                    />
                    <input
                      className="input sm:col-span-3"
                      type="number"
                      placeholder="Stock"
                      value={r.stock}
                      onChange={(e) => updateSizeField(i, { stock: e.target.value })}
                      disabled={!r.checked}
                    />
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-2">
                <input className="input max-w-[120px]" placeholder="Custom size" value={customSize} onChange={(e) => setCustomSize(e.target.value)} />
                <button type="button" className="btn-secondary" onClick={addCustomSize}>
                  + Add size
                </button>
              </div>
            </>
          )}
        </div>

        <button className="btn-primary" disabled={loading}>
          {loading ? "Saving..." : "Add product"}
        </button>
      </form>

      <div className="mb-6">
        <button type="button" className="btn-secondary" onClick={() => setBulkOpen((v) => !v)}>
          {bulkOpen ? "Hide bulk add products" : "Bulk add products"}
        </button>

        {bulkOpen && (
          <div className="border border-line rounded-md p-3 space-y-3 bg-paper mt-3">
            <div className="text-sm font-medium text-ink">Bulk add products</div>
            <p className="text-xs text-ink/60">
              One row per <strong>product + size</strong>. Rows with the same product name are grouped into one
              product with multiple sizes. Paste as{" "}
              <code>Name, Brand, Category, Color, CostPrice, SellPrice, Size, SKU, Stock</code> (comma or tab
              separated), or upload an Excel/CSV file with those column headers (case-insensitive).
            </p>
            <textarea
              className="input font-mono text-xs"
              rows={6}
              placeholder={
                "Nike Air Max, Nike, Sneakers, Black, 2000, 3500, 40, NIKE-AM-40, 10\n" +
                "Nike Air Max, Nike, Sneakers, Black, 2000, 3500, 41, NIKE-AM-41, 8\n" +
                "Adidas Superstar, Adidas, Sneakers, White, 1800, 3000, 41, ADI-SS-41, 12"
              }
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
            />
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="btn-primary" onClick={addBulkFromText} disabled={bulkBusy}>
                {bulkBusy ? "Adding..." : "Add from text"}
              </button>
              <label className="btn-secondary cursor-pointer">
                Upload Excel/CSV
                <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={onBulkFile} disabled={bulkBusy} />
              </label>
            </div>
            {bulkResult && (
              <div className="text-sm space-y-1">
                {bulkResult.created > 0 && (
                  <div className="text-moss">
                    Created {bulkResult.created} product(s) with {bulkResult.sizes} size(s) total.
                  </div>
                )}
                {bulkResult.errors.length > 0 && (
                  <div className="text-clay space-y-1">
                    <div>{bulkResult.created > 0 ? "Some rows had issues:" : "Nothing was created:"}</div>
                    {bulkResult.errors.map((e, i) => (
                      <div key={i}>• {e}</div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          className="input max-w-xs"
          placeholder="Search name, SKU or brand..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load(q)}
        />
        <select
          className="input max-w-[180px]"
          value={category}
          onChange={(e) => {
            const val = e.target.value;
            setCategory(val);
            load(q, val);
          }}
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <button className="btn-secondary" onClick={() => load(q)}>
          Search
        </button>
        <label className="flex items-center gap-1.5 text-sm text-ink/70 border border-line rounded-md px-2 py-1.5">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Show inactive/deleted products
        </label>
      </div>

      <div className="text-xs text-ink/50 mb-2">
        {products.filter((p) => showInactive || p.active).length} product(s)
      </div>

      <div className="space-y-3">
        {products
          .filter((p) => showInactive || p.active)
          .map((p, i) => {
          const totalStock = p.variants.reduce((s, v) => s + v.stock, 0);
          const isOpen = openId === p.id;
          return (
            <div key={p.id} className={`card ${!p.active ? "opacity-60" : ""}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="text-xs text-ink/40 font-medium w-6 shrink-0 text-right">{i + 1}.</div>
                  {p.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.imageUrl}
                      alt=""
                      className="h-10 w-10 object-cover rounded-md border border-line shrink-0"
                      onError={(e) => (e.currentTarget.style.display = "none")}
                    />
                  )}
                  <div>
                  <div className="text-sm font-medium text-ink flex items-center gap-2">
                    {p.name}
                    {!p.active && (
                      <span className="text-xs text-clay border border-clay/40 rounded px-1.5 py-0.5">
                        Inactive — has purchase/sale/damage history
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-ink/50">
                    {p.brand} {p.category ? `· ${p.category}` : ""} · ৳{p.sellPrice} · total stock {totalStock}
                  </div>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button className="text-moss text-xs hover:underline" onClick={() => setOpenId(isOpen ? null : p.id)}>
                    {isOpen ? "Hide sizes" : `Sizes (${p.variants.length})`}
                  </button>
                  <button className="text-moss text-xs hover:underline" onClick={() => startEditProduct(p)}>
                    Edit
                  </button>
                  <button className="text-clay text-xs hover:underline" onClick={() => onDeleteProduct(p.id)}>
                    Delete
                  </button>
                </div>
              </div>

              {editingProductId === p.id && (
                <div className="mt-3 pt-3 border-t border-line grid grid-cols-2 md:grid-cols-4 gap-3">
                  {editError && <div className="col-span-full text-sm text-clay">{editError}</div>}
                  <div>
                    <label className="label">Name</label>
                    <input className="input" required value={editProductForm.name} onChange={(e) => setEditProductForm({ ...editProductForm, name: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">Brand</label>
                    <input className="input" value={editProductForm.brand} onChange={(e) => setEditProductForm({ ...editProductForm, brand: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">Category</label>
                    <input className="input" list="category-options" value={editProductForm.category} onChange={(e) => setEditProductForm({ ...editProductForm, category: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">Color</label>
                    <input className="input" value={editProductForm.color} onChange={(e) => setEditProductForm({ ...editProductForm, color: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">Cost price</label>
                    <input className="input" type="number" step="0.01" value={editProductForm.costPrice} onChange={(e) => setEditProductForm({ ...editProductForm, costPrice: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">Sell price</label>
                    <input className="input" type="number" step="0.01" value={editProductForm.sellPrice} onChange={(e) => setEditProductForm({ ...editProductForm, sellPrice: e.target.value })} />
                  </div>
                  <div className="col-span-2">
                    <label className="label">Image URL</label>
                    <input className="input" placeholder="https://…/photo.jpg" value={editProductForm.imageUrl} onChange={(e) => setEditProductForm({ ...editProductForm, imageUrl: e.target.value })} />
                  </div>
                  <div className="col-span-full flex gap-2">
                    <button className="btn-primary" onClick={() => saveEditProduct(p.id)}>
                      Save changes
                    </button>
                    <button className="btn-secondary" onClick={() => setEditingProductId(null)}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {isOpen && <VariantManager product={p} onChanged={() => load(q)} />}
            </div>
          );
        })}
        {products.filter((p) => showInactive || p.active).length === 0 && (
          <div className="card">
            <EmptyState
              icon="👟"
              title={products.length > 0 ? "No active products in this view" : "No products yet"}
              hint={
                products.length > 0
                  ? 'Tick "Show inactive/deleted products" above to see them.'
                  : "Add your first product using the form above."
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}

function VariantManager({ product, onChanged }: { product: Product; onChanged: () => void }) {
  const showToast = useToast();
  const askConfirm = useConfirm();
  const [newSize, setNewSize] = useState("");
  const [newSku, setNewSku] = useState("");
  const [newBarcode, setNewBarcode] = useState("");
  const [newStock, setNewStock] = useState("");
  const [error, setError] = useState("");
  const [edits, setEdits] = useState<Record<string, { sku: string; barcode: string; stock: string; reorderAt: string }>>({});

  function editValue(v: Variant, field: "sku" | "barcode" | "stock" | "reorderAt") {
    if (field === "barcode") return edits[v.id]?.barcode ?? v.barcode ?? "";
    return edits[v.id]?.[field] ?? String(v[field]);
  }

  function setEdit(v: Variant, field: "sku" | "barcode" | "stock" | "reorderAt", value: string) {
    setEdits((prev) => ({
      ...prev,
      [v.id]: {
        sku: prev[v.id]?.sku ?? v.sku,
        barcode: prev[v.id]?.barcode ?? v.barcode ?? "",
        stock: prev[v.id]?.stock ?? String(v.stock),
        reorderAt: prev[v.id]?.reorderAt ?? String(v.reorderAt),
        [field]: value,
      },
    }));
  }

  async function saveVariant(v: Variant) {
    const e = edits[v.id];
    if (!e) return;
    try {
      await api(`/api/products/${product.id}/variants/${v.id}`, { method: "PUT", body: JSON.stringify(e) });
      setEdits((prev) => {
        const copy = { ...prev };
        delete copy[v.id];
        return copy;
      });
      onChanged();
    } catch (err: any) {
      showToast(err.message, "error");
    }
  }

  async function deleteVariant(v: Variant) {
    if (!(await askConfirm(`Remove size ${v.size}?`))) return;
    try {
      await api(`/api/products/${product.id}/variants/${v.id}`, { method: "DELETE" });
      onChanged();
    } catch (err: any) {
      showToast(err.message, "error");
    }
  }

  async function addSize(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!newSize || !newSku) return setError("Size and SKU are required");
    try {
      await api(`/api/products/${product.id}/variants`, {
        method: "POST",
        body: JSON.stringify({ size: newSize, sku: newSku, barcode: newBarcode, stock: newStock }),
      });
      setNewSize("");
      setNewSku("");
      setNewBarcode("");
      setNewStock("");
      onChanged();
    } catch (e: any) {
      setError(e.message);
    }
  }

  return (
    <div className="mt-4 border-t border-line pt-4">
      <div className="overflow-x-auto">
      <table className="data-table mb-3">
        <thead>
          <tr>
            <th>Size</th>
            <th>SKU</th>
            <th>Barcode</th>
            <th>Stock</th>
            <th>Reorder at</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {product.variants.map((v) => (
            <tr key={v.id}>
              <td>{v.size}</td>
              <td>
                <input className="input" value={editValue(v, "sku")} onChange={(e) => setEdit(v, "sku", e.target.value)} />
              </td>
              <td>
                <div className="flex gap-1">
                  <input className="input" placeholder="—" value={editValue(v, "barcode")} onChange={(e) => setEdit(v, "barcode", e.target.value)} />
                  <BarcodeScannerButton onScan={(text) => setEdit(v, "barcode", text)} />
                </div>
              </td>
              <td>
                <input
                  className="input w-24"
                  type="number"
                  value={editValue(v, "stock")}
                  onChange={(e) => setEdit(v, "stock", e.target.value)}
                />
              </td>
              <td>
                <input
                  className="input w-20"
                  type="number"
                  value={editValue(v, "reorderAt")}
                  onChange={(e) => setEdit(v, "reorderAt", e.target.value)}
                />
              </td>
              <td className="whitespace-nowrap">
                {edits[v.id] && (
                  <button className="text-moss text-xs mr-3 hover:underline" onClick={() => saveVariant(v)}>
                    Save
                  </button>
                )}
                <button className="text-clay text-xs hover:underline" onClick={() => deleteVariant(v)}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      <form onSubmit={addSize} className="flex flex-wrap items-end gap-2">
        {error && <div className="text-sm text-clay w-full">{error}</div>}
        <div>
          <label className="label">New size</label>
          <input className="input w-24" value={newSize} onChange={(e) => setNewSize(e.target.value)} />
        </div>
        <div>
          <label className="label">SKU</label>
          <input className="input" value={newSku} onChange={(e) => setNewSku(e.target.value)} />
        </div>
        <div>
          <label className="label">Barcode (optional)</label>
          <div className="flex gap-1">
            <input className="input" value={newBarcode} onChange={(e) => setNewBarcode(e.target.value)} />
            <BarcodeScannerButton onScan={setNewBarcode} />
          </div>
        </div>
        <div>
          <label className="label">Stock</label>
          <input className="input w-24" type="number" value={newStock} onChange={(e) => setNewStock(e.target.value)} />
        </div>
        <button className="btn-secondary">+ Add this size</button>
      </form>
    </div>
  );
}
