# Shoe Shop POS + ERP

Ekta chhoto POS/ERP: Products, Purchases + Suppliers, Sales (POS), Returns, Damage,
Warranty (auto 1 year on every sale), Reports (sales/damage/return/closing stock),
Users (role-based), ebong website er jonno ekta public API.

Built with Next.js (App Router) + Prisma + PostgreSQL. Free-to-run stack:
**GitHub + Vercel + Neon**.

## 1. Local setup

```bash
npm install
cp .env.example .env      # fill in DATABASE_URL, AUTH_SECRET, etc.
npx prisma db push        # creates tables in your database
npm run dev
```

Open http://localhost:3000 — you'll be sent to **/setup** automatically the
first time (no users exist yet). Create your own admin account there with
your own name, email and password. The setup page only works once; after
that it just links to the login page.

## 2. Deploy for free — GitHub + Vercel + Neon

1. **Neon** (https://neon.tech) — create a free Postgres project. Copy the
   pooled connection string into `DATABASE_URL`.
2. **GitHub** — push this project to a new repo.
3. **Vercel** (https://vercel.com) — "Import Project" from that GitHub repo.
   In Vercel's Environment Variables, add:
   - `DATABASE_URL` (from Neon)
   - `AUTH_SECRET` (any long random string — `openssl rand -base64 32`)
   - `WEBSITE_API_KEY` (any secret string, for the public website API)
   - `CRON_SECRET` (any long random string — protects the two scheduled
     cron routes below; same value doesn't need to go anywhere else)
   - Optional — `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
     (only needed if you want the low-stock alert / weekly backup emails —
     see `.env.example` for a free Gmail setup). Leave them out and
     everything else still works fine.
4. Deploy. Vercel runs `npm install` → `postinstall` (`prisma generate`) →
   `next build` automatically.
5. Run the table setup once against the Neon database (from your machine,
   with `DATABASE_URL` pointing at Neon):
   ```bash
   npx prisma db push
   ```
   **Already deployed before and pulling this update?** Run `npx prisma db
   push` again against Neon after every update that changes
   `prisma/schema.prisma` — it only adds/changes columns and tables to match
   the schema, it never deletes your existing data.
6. Visit your Vercel URL — it'll send you to `/setup` to create your admin
   account, then to the login page.

No server rental, no domain purchase needed to get running. Buy a custom
domain later only if/when you want a branded URL — point it at the Vercel
project's domain settings.

## 3. Products with multiple sizes

One shoe design (name, brand, price) is a **Product**. Each size of it is a
**variant** with its own SKU and stock — e.g. "Nike Air Max" size 40, 41, 42
are three separate variants under one product. On the Products page, tick
the sizes you stock (common sizes 38–45 are pre-listed, plus a custom-size
field), give each a SKU, and they're all created together. Add or remove
sizes for a product any time from its "Sizes" panel.

Purchases, POS sales, returns, damage, and warranty are all recorded **per
size (variant)** — so stock and warranty stay accurate down to the exact
size sold.

## 4. How stock moves

- **Purchase** → stock increases for the chosen product + size.
- **Sale (POS or website)** → stock decreases for that size, and a
  **Warranty** row is created automatically, valid for 1 year from the sale
  date.
- **Return** → optionally puts stock back for that size (uncheck "add back
  to stock" if the returned pair is damaged).
- **Damage** → stock decreases for that size (write-off), separate from
  returns.
- Deleting a Purchase, Sale, Return, or Damage record reverses its stock
  effect automatically, so **closing stock always stays correct**.

## 5. Website integration (public API)

Generate a key first: log in as admin, go to **API keys**, click **Generate
new key**, and copy the **X-API-Key** and **X-API-Secret** shown — the
secret is only ever shown once. Your storefront sends both as headers on
every request:
```
X-API-Key: key_xxxxxxxxxxxxxxxx
X-API-Secret: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```
You can generate as many keys as you like (e.g. one per integration) and
disable or delete any of them independently from the **API keys** page.

*(Legacy option: if you haven't generated any keys yet, a single
`WEBSITE_API_KEY` env var still works as a fallback — set it and send just
`X-API-Key: <that value>`, no secret. Generating your first real key
switches enforcement over to the key+secret system.)*

**List products with all sizes / stock**
```
GET /api/public/products
```
Each product includes a `variants` array — one entry per size, with its own
`sku`, `stock`, and `inStock` flag.

**Create an order (becomes a Sale, decreases stock, creates warranty)**
```
POST /api/public/orders
{
  "customerName": "Rafi",
  "customerPhone": "01700000000",
  "paymentMethod": "online",
  "deliveryCharge": 60,
  "items": [{ "sku": "SHOE-001-41", "qty": 1 }]
}
```
`sku` identifies the exact product **and size** (from the variants list above).
For **cash-on-delivery orders**, set `"paymentMethod": "cod"` — the sale is
recorded with nothing collected yet and a pending delivery status; see
section 11 below for what happens next. `deliveryCharge` is optional — set
it to whatever the courier charges for this order, so a return/refusal can
be tracked as a loss automatically.

**Warranty lookup for a customer-facing "check warranty" page**
```
GET /api/public/warranty?invoice=INV-xxxxx
GET /api/public/warranty?phone=01700000000
```

## 6. Roles & customizable access

- **ADMIN**: everything, always — Users page, all modules.
- **STAFF**: only the sections an admin has ticked for them (Products,
  Purchases, Suppliers, POS/Sales, Returns, Damage, Warranty, Reports — any
  combination). Set this per staff member on the **Users** page. A staff
  member with no sections ticked can log in but sees only the dashboard
  until access is granted.

Permission changes apply the next time that person logs in (their current
session already has the old access list). If you just changed someone's
access and want it to apply immediately, ask them to log out and back in.

## 7. Everything is editable/deletable

Products, sizes, suppliers, purchases, sales, returns, damage, users — all
support edit and delete from their pages. Deleting something that other
records depend on (e.g. a size already used in past sales) soft-disables it
instead of a hard delete, so your history stays intact.

## 8. Shop settings & printed receipts

Go to **Shop settings** (admin only) to set your shop's name, address, and
contact info. This shows up automatically on the printed receipt for any
sale — go to **Sales**, click **Print** on a sale, and your browser's print
dialog opens with a clean receipt layout (shop info, items, sizes, total,
and each item's warranty expiry date). Nothing else on the page prints —
only the receipt.

## 9. Sales page vs POS

- **POS / New sale** — for ringing up a new sale.
- **Sales** — the full sales history: search by invoice/customer/phone,
  **edit** customer name, phone, payment method, or discount on a past
  sale, **delete** it (restores stock, blocked if it has returns), or
  **print** its receipt. Line items themselves aren't editable after the
  fact — delete and re-enter the sale if the items were wrong.

## 10. Mobile friendly

The whole back office is responsive — on a phone the sidebar becomes a
"Menu" button that opens a slide-out drawer, forms stack into a single
column, and tables scroll horizontally instead of squeezing. Works fine as
a phone/tablet POS, not just desktop.

## 11. Dues / বাকি system

Every sale can be fully paid or partial — on the POS screen, "Amount
received now" defaults to the full total but can be lowered to record a
due. The **Sales** page shows a "Show only sales with due" filter and lets
you record later payments against any sale until it's fully settled.
Customers are auto-created from the phone number entered at checkout.

## 12. Customers

Auto-built from sales by phone number. The **Customers** page shows each
customer's visit count, total spent, and current due, with a "History"
view of all their past purchases. You can also add/edit profiles by hand.

## 13. Expenses & real Profit/Loss

Log shop running costs (rent, electricity, salary, transport, etc.) on the
**Expenses** page. The **Reports → Profit & Loss** tab then shows real
numbers for any date range: Revenue → Net Sales (after returns) → Gross
Profit (after cost of goods sold) → Net Profit (after damage loss and
expenses).

## 14. Cash / day closing

At day's end, go to **Cash closing**, pick the date, and the system shows
expected cash in the drawer (opening balance + cash payments received −
refunds − cash expenses for that day). Enter what you actually counted and
it shows the difference, then saves it to history.

## 15. Excel export

Reports (sales/damage/returns/stock/P&L), Sales, and Customers each have an
**Export Excel** button that downloads a `.xlsx` file of exactly what's on
screen (respecting your search/date filters).

## 16. Activity log (audit trail)

Every create/update/delete across products, purchases, sales, payments,
returns, damage, customers, expenses, cash closings, and users is recorded
with who did it and when. Visible only to admins on the **Activity log**
page.

## 17. Cash-on-delivery (COD) tracking

You can create a COD order two ways:

1. **Manually, from POS** — tick **"Cash on delivery (order pending, collect
   on delivery)"** while ringing up a sale, enter the delivery charge, and
   submit. Useful for testing the whole workflow, or for phone orders,
   before wiring up the website API.
2. **From your website**, via the public API (below) — same result.

Either way, the order gets a delivery status: **Pending → Shipped →
Delivered / Returned / Refused.**

- **Pending** — order placed, not yet handed to the courier.
- **Shipped** — handed to the courier, in transit. Just a status marker.
- **Delivered** — courier handed it over and collected the cash (product +
  delivery charge). The sale is automatically marked fully paid.
- **Returned** — it *was* delivered and paid for, then the customer sent it
  back. Stock is put back and the sale still counts as fully paid — no
  loss, since the money (including the delivery charge) was already
  collected.
- **Refused** — customer never accepted it at the doorstep, so nothing was
  collected at all. Stock is put back, and the delivery charge — which the
  courier still charges for the attempted trip — is booked as a
  **"Courier loss" expense** so it isn't silently absorbed.

Manage this from the **Sales** page — a pending order shows **Mark
shipped**; pending or shipped orders show **Mark delivered / Returned /
Refused**. Once an order is Delivered, Returned, or Refused, that's final
(delete and re-enter the sale to correct a mistake).

Returned/refused orders are excluded from Revenue and COGS in Reports
(they were never real sales), but their courier cost still shows up under
Expenses and as a "courier loss" breakout line in **Reports → Profit &
Loss**.

**Repeat offenders:** the **Customers** page shows a "COD returns" count
per customer and flags anyone with 3+ returned/refused orders as
**⚠ Risk** — a signal to ask for advance payment on their next order
instead of blind COD.

## 18. Sidebar navigation

The sidebar is grouped into **Sales**, **Inventory**, and **Finance**
sections (plus an **Admin** section for admins only), so it doesn't feel
like one long list. A staff member only sees the groups/items their
permissions cover — an empty group is hidden entirely rather than showing
a header with nothing under it.

## 19. Filters everywhere

Products, Purchases, Sales, Returns, Damage, and every Reports tab now
have a **date range** (From/To) and **Category** filter, so you can narrow
down to "last month's leather category sales" or "this week's damage in
sneakers" anywhere in the app. Category options are pulled from whatever
categories you've actually used on your products.

**Closing stock report** additionally color-codes each row by how low
that size is running:
- **Red background** — 0–2 left
- **Yellow background** — 3–5 left
- No color — 6 or more

## 20. Bulk stock add

On the **Purchases** page, click **Bulk add** under the line items to add
many products/sizes at once instead of one row at a time:

- **Paste text** — one line per item, `SKU, Qty, UnitCost` (unit cost
  optional, comma or tab separated), e.g.:
  ```
  SHOE-001-41, 10, 800
  SHOE-001-42, 5, 800
  SHOE-002-40, 20
  ```
- **Upload Excel/CSV** — a file with `SKU`, `Qty`, and optionally
  `UnitCost` columns (header names are case-insensitive).

Each SKU is matched against your existing products/sizes; unmatched SKUs
are listed as errors instead of silently skipped. Matched rows are added
to the line-item table for review — nothing is saved until you pick a
supplier and click **Record purchase**, same as any other purchase.

## 21. Bulk add products

On the **Products** page, click **Bulk add products** to create many
products (each with multiple sizes) at once instead of one at a time:

- **Paste text** — one line per **product + size**, as
  `Name, Brand, Category, Color, CostPrice, SellPrice, Size, SKU, Stock`
  (comma or tab separated). Rows sharing the same product name are
  grouped into one product with all those sizes as variants, e.g.:
  ```
  Nike Air Max, Nike, Sneakers, Black, 2000, 3500, 40, NIKE-AM-40, 10
  Nike Air Max, Nike, Sneakers, Black, 2000, 3500, 41, NIKE-AM-41, 8
  Adidas Superstar, Adidas, Sneakers, White, 1800, 3000, 41, ADI-SS-41, 12
  ```
  (two Nike rows → one product with 2 sizes; one Adidas row → a second
  product with 1 size)
- **Upload Excel/CSV** — same columns as headers (case-insensitive).

Each product name is created independently — if one has a problem (e.g. a
duplicate SKU), the rest still go through, and the results panel lists
exactly which rows succeeded and which need fixing.

## 22. Daily/monthly profit & loss on the Dashboard, and customizing it

The Dashboard now shows **"Today's profit & loss"** and **"This month's
profit & loss"** cards (same Revenue − COGS − Expenses calculation as
Reports → Profit & Loss, just always showing the current day/month).

Click **Customize dashboard** (top of the page) to choose exactly which
cards and lists you want to see — tick "Show everything" for the default,
or uncheck it to hand-pick from: Today's sales, Closing stock, Active
warranties, Total due, Pending COD deliveries, Courier loss this month,
Today's P&L, This month's P&L, Low stock list, and Warranty expiring list.
This is per-user — each staff member/admin can set up their own view, and
it's remembered across logins.

## 23. What's new in this update

- **Product photos** — optional Image URL field on each product (paste a
  hosted image link); shown as a thumbnail on the Products list and in the
  add/edit forms.
- **Barcode scanning** — each size can have its own barcode (separate from
  its SKU), editable from Products → a size's row. A camera-based "Scan"
  button (uses the device camera, works on phones) fills it in, and the
  same scanner is available on the POS page to add an item to the cart by
  scanning it directly.
- **Split payment at checkout** — on the POS page, tick "Split payment
  across multiple methods" to record part cash + part bKash (etc.) against
  one sale, instead of a single payment method.
- **Per-item discount** — each cart line on POS has its own optional
  discount amount, in addition to the overall sale discount.
- **Supplier due tracking** — record a partial payment when entering a
  purchase (the rest becomes due to that supplier); pay off the remaining
  due later from the Purchases page. The Suppliers page shows each
  supplier's total outstanding due.
- **Global search** — a search box in the top bar looks across products,
  customers, and invoice numbers at once.
- **Dark mode** — a toggle in the top bar; remembers your choice.
- **Toast notifications** — small pop-up confirmations (e.g. "Sale
  completed — invoice …") in addition to the existing inline messages.
- **Rate limiting on the public API** — `/api/public/*` now rejects a
  client sending more than ~60 requests/minute per API key, using a small
  table in your existing Neon database (no extra service to set up).
- **Low-stock email alert** — a daily scheduled job (Vercel Cron) emails
  your admin accounts a list of sizes at/below their reorder point.
  Requires the optional `SMTP_*` env vars — silently does nothing without
  them.
- **Automated weekly backup** — a weekly scheduled job emails a full JSON
  export of your shop's data (products, sales, purchases, customers,
  suppliers, etc.) as an attachment — an off-platform safety net on top of
  Neon's own backups. Also requires `SMTP_*`.
- **Basic automated tests** — `npm test` runs a small Vitest suite covering
  the trickiest pure logic (Bangladesh-timezone day boundaries, invoice
  numbering, and the per-item-discount/split-payment math). Not run during
  `npm run build`/deploy — it's a developer-facing check.

**Not included in this round — multi-branch/multi-shop support.** That
touches nearly every table in the schema (adding a branch/shop id to each)
plus permissions and UI throughout the app. Doing it safely alongside
everything above in one pass was too high-risk for a live deployment, so
it's intentionally left for a separate, focused piece of work later if you
end up opening a second location.

**After pulling this update, remember to run `npx prisma db push` against
your Neon database** (see section 2) — it adds the new columns/tables this
update needs; it does not touch your existing data.

