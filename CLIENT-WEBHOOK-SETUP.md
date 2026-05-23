# 🧑‍💼 Razorpay Webhook Setup — For the Client

> One small setup task in **your Razorpay dashboard**. Takes ~5 minutes.

## Why we need this (the use)

When a customer pays, their **phone** normally tells our server "payment done."
But if their phone dies, loses internet, or they close the app right after
paying, **that message never arrives** — the money leaves their account, but the
order shows as unpaid. Angry customer, and a refund headache.

A **webhook** fixes this: Razorpay calls our server **directly** to confirm the
payment, completely independent of the customer's phone. Razorpay never loses
signal, so **every paid order gets confirmed automatically.**

👉 In short: **this makes payments reliable and prevents "money deducted but
order not placed" complaints.**

---

## What to do (step by step)

1. Log in to your **Razorpay Dashboard**.
2. Go to **Settings → Webhooks → Add New Webhook**.
3. Fill in:
   - **Webhook URL:**
     ```
     https://YOUR-REAL-DOMAIN/api/orders/razorpay/webhook
     ```
     *(your developer will give you the exact live URL)*
   - **Secret:**
     ```
     __________
     ```
     *(a password — agree on one value with your developer; the same value
     must be used on both sides)*
   - **Active Events:** tick these two only:
     - ✅ `payment.captured`
     - ✅ `payment.failed`
4. Click **Save / Create Webhook**.
5. Check that it shows as **Active**, and send your developer a **screenshot**
   confirming it.

---

## ✅ That's it

Once this is active and your developer plugs the same secret into the website,
payments will confirm automatically and reliably — even if a customer's phone
disconnects the moment after paying.
