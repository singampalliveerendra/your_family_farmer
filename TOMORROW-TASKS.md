# ✅ Tomorrow's Tasks — YourFamilyFarmer

A simple checklist for the next session. Tick things off as you go.

---

## 1. 🔍 Confirm the deploy worked (do this first)
- [ ] Vercel → Deployments → latest build (commit `1b7b457`) is **green ✓**
- [ ] If it's red, copy the error and send it to Claude to fix

## 2. ✅ Test the 10 features on the live site
- [ ] **Order IDs** — place an order, see `YFF-…` on orders list, detail, and farmer dashboard
- [ ] **Auto-refund** — pay with Razorpay → farmer declines → real refund in Razorpay → Transactions
- [ ] **Cancel window** — place an order → "Cancel order" button appears → cancel → refunded if paid
- [ ] **Refund timeline** — a refunded order shows Initiated → Processing → Credited
- [ ] **Receipt** — paid order → "View receipt" → prints/saves cleanly
- [ ] **Double-tap** — tap "Place order" twice fast → only ONE order is created
- [ ] **Order timeline** — pickup order shows Placed → Confirmed → Ready
- [ ] **Live dashboard** — new order appears on farmer dashboard without manual reload
- [ ] **Buyer protection** — link at bottom of orders page opens the new page
- [ ] Note anything wrong → send to Claude to fix

## 3. ⚙️ Small config (2 minutes)
- [ ] Give Claude your **support phone + email** → Claude adds them to the buyer
      protection page so the Call/WhatsApp buttons appear

## 4. ⏳ Follow up with client (webhook)
- [ ] Check if the client set up the **webhook** (see `CLIENT-WEBHOOK-SETUP.md`)
- [ ] Once done: agree on the secret value → add `RAZORPAY_WEBHOOK_SECRET` in
      Vercel → redeploy
- [ ] Test: pay, close the tab fast → order should still be marked paid

## 5. 🔐 Important — overdue security task (RLS)
- [ ] Database security lockdown (RLS) was due **May 20** — still pending.
      Without it, the rules that stop one customer seeing another's orders /
      phone numbers aren't fully enforced at the database level.
- [ ] Ask Claude to help deploy this — treat as a priority before full launch

---

### Bottom line
Confirm deploy green → test the 10 features → send Claude the support contact &
any bugs → chase the webhook with the client → decide on the security lockdown.
