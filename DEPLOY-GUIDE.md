# 🚀 Deploy Guide — Payments, Orders & Refunds Upgrade

This guide walks you through turning on the new features:
**Order IDs (#4), Automatic Refunds (#1), Duplicate-payment protection (#3),
and the Payment Webhook + Reconciliation (#2).**

Follow the steps **in order**. Each step says **what it does**, **who does it**,
and **why it matters**.

> ⚠️ **Golden rule:** Run the database SQL (Step 1) **before** the code is
> pushed/deployed. The new code reads new database columns — if the columns
> aren't there yet, the orders pages will break.

---

## ✅ Step 1 — Run the database migrations (YOU)

**What it does:** adds the new columns the features need (order codes, refund
details, an idempotency key).

**Why:** without these columns the new code has nowhere to read/write data.

**How:**
1. Open **Supabase Dashboard → SQL Editor → New Query**.
2. Open each file below, copy all of it, paste, and click **Run**. Do them one
   at a time, in this order:
   - [ ] `scripts/order-code-migration.sql`
   - [ ] `scripts/refund-migration.sql`
   - [ ] `scripts/idempotency-migration.sql`
3. Each is safe to re-run if you're unsure — it won't duplicate anything.

✅ **Done when:** all three ran with no red errors.

---

## ✅ Step 2 — Add `CRON_SECRET` in Vercel (YOU)

**What it does:** protects the daily "double-check payments" job so only your
own system can trigger it, not a stranger on the internet.

**Why:** the reconcile job has access to payment data — it must not be public.

**How:**
1. Vercel → your project → **Settings → Environment Variables**.
2. Add:
   - **Name:** `CRON_SECRET`
   - **Value:** any long random string you invent (e.g. `yff_cron_7f3k9xQ2`)
   - **Environment:** Production
3. Save.

> 💡 This one has **nothing to do with Razorpay or your client.** It's just a
> private password for your own scheduled job.

✅ **Done when:** `CRON_SECRET` shows in the list.

---

## ✅ Step 3 — Deploy the code (CLAUDE pushes, YOU test)

**What it does:** ships the new features to your live site.

**How:**
1. Tell Claude "**Steps 1–2 done, push**".
2. Claude pushes → Vercel builds & deploys automatically.
3. **Test on the live site:**
   - [ ] Place an order → you should see a code like **`YFF-20260522-0001`**
         on the orders list, order detail, and farmer dashboard.
   - [ ] Pay with Razorpay, then have the farmer **Decline** the order →
         the buyer should get a **real refund** (check Razorpay → Transactions →
         Refunds).

✅ **Done when:** order codes show everywhere and a decline produces a real refund.

---

## 🧑‍💼 Step 4 — Set up the Webhook (CLIENT does the dashboard part)

> This is the only step that needs your **client's** Razorpay account.
> It can be done any time — the rest of the features already work without it.

### What is a webhook and why does it matter?

When a customer pays, their **phone** normally tells your server "payment done."
But if their phone dies, loses signal, or they close the app right after paying,
**that message never arrives** — money leaves their account but the order looks
unpaid. A **webhook** is Razorpay calling your server **directly**, independent
of the customer's phone. Razorpay never loses signal, so the order **always**
gets confirmed. It's the #1 feature that prevents "money deducted but no order"
complaints.

### What is `RAZORPAY_WEBHOOK_SECRET`?

A shared password between Razorpay and your server, so your server can prove an
incoming "payment done" message is **really** from Razorpay and not a hacker
faking it. **The same secret value goes in two places:** the client's Razorpay
dashboard, and your Vercel.

### Who does what

| Task | Who |
|------|-----|
| Agree on one secret value (any random string) | You + client |
| Create the webhook in the Razorpay dashboard | **🧑‍💼 Client** (their account) |
| Add `RAZORPAY_WEBHOOK_SECRET` (same value) in Vercel | **👨‍💻 You** |

### 4a. Client: create the webhook (send them this)

> Hi, please set up a webhook in your Razorpay dashboard so payments confirm
> reliably:
> 1. **Razorpay Dashboard → Settings → Webhooks → Add New Webhook**
> 2. **Webhook URL:** `https://YOUR-REAL-DOMAIN/api/orders/razorpay/webhook`
> 3. **Secret:** `__________`  *(the agreed value)*
> 4. **Active Events:** tick **`payment.captured`** and **`payment.failed`**
> 5. **Save**, then send a screenshot confirming it's Active.

### 4b. You: add the secret to Vercel

1. Vercel → **Settings → Environment Variables**.
2. Add:
   - **Name:** `RAZORPAY_WEBHOOK_SECRET`
   - **Value:** the exact same secret the client used in the dashboard
   - **Environment:** Production
3. Save → **Redeploy** (env vars only take effect on a new build).

✅ **Done when:** a test payment confirms the order even if you close the browser
tab immediately after paying.

---

## 📌 Quick reference — who owns what

| Thing | Owner | Purpose |
|-------|-------|---------|
| Supabase SQL migrations | You | Add the new database columns |
| `CRON_SECRET` | You | Protect the daily payment double-check job |
| Razorpay webhook (dashboard) | **Client** | Reliable payment confirmation |
| `RAZORPAY_WEBHOOK_SECRET` | You (value from client) | Prove webhook calls are genuine |

## ⏱️ Reconciliation cron — note

`vercel.json` runs the payment double-check **once a day** (Vercel Hobby plan
limit). The webhook handles payments in real time; this is just a daily safety
net. On Vercel **Pro**, change the schedule in `vercel.json` from
`"0 2 * * *"` to `"*/15 * * * *"` for every-15-minutes checking.

---

## ✅ Final checklist

- [ ] Step 1 — 3 SQL files run in Supabase
- [ ] Step 2 — `CRON_SECRET` added in Vercel
- [ ] Step 3 — code pushed, order IDs + refunds tested
- [ ] Step 4 — client created webhook + you added `RAZORPAY_WEBHOOK_SECRET`
