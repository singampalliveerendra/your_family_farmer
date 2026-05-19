# Razorpay Setup Guide

A simple step-by-step guide to set up your Razorpay account so we can start accepting online payments on your website.

---

## What is Razorpay?

Razorpay is a trusted Indian payment service that lets your customers pay you online using UPI, credit/debit cards, net banking, and wallets. The money goes directly to your bank account.

---

## What You Will Need Before Starting

Please keep these ready (photos or scanned copies are fine):

1. **PAN Card** (personal or business)
2. **Aadhaar Card** of the owner
3. **Bank Account details** (account number + IFSC code)
4. **Cancelled cheque** OR a recent bank statement
5. **GST Certificate** (only if you have one — not mandatory)
6. **Business address proof** (electricity bill, rent agreement, etc.)
7. **A working mobile number and email ID**

---

## Step 1: Create Your Razorpay Account

1. Open your web browser and go to: **https://razorpay.com**
2. Click on the **"Sign Up"** button at the top right corner.
3. Enter your **email address** and create a **password**.
4. You will receive a verification email. Open it and click the link to confirm your email.
5. Log in with your new account.

---

## Step 2: Tell Razorpay About Your Business

After logging in, Razorpay will ask a few questions about your business.

1. Choose your **business type** (for example: Proprietorship, Partnership, Private Limited, or Individual).
2. Enter your **business name** — this is the name customers will see when they pay.
3. Enter your **business category** — select "Agriculture" or "Food and Grocery".
4. Enter the **website address** of your store.
5. Add your **business address** and **contact details**.

Take your time. Make sure spellings are correct because changing these later is difficult.

---

## Step 3: Complete KYC (Know Your Customer)

This is a one-time verification process required by the Reserve Bank of India.

1. Go to the **"Account & Settings"** section from the dashboard.
2. Click on **"KYC"** or **"Activate Account"**.
3. Upload clear photos of:
   - PAN Card
   - Aadhaar Card
   - Bank proof (cancelled cheque or statement)
   - Business address proof
4. Fill in the **bank account details** where you want to receive your money.
5. Click **Submit**.

Razorpay usually verifies KYC within **2 to 3 working days**. You will get an email once it is approved.

---

## Step 4: Get the Keys (Important for the Developer)

Once your account is active, Razorpay gives you two special codes. These are needed to connect Razorpay with your website.

1. After logging in, click on **"Account & Settings"** from the left menu.
2. Click on **"API Keys"**.
3. Click the **"Generate Key"** button.
4. You will see two codes:
   - **Key ID** (looks like: `rzp_live_xxxxxxxxxxxx`)
   - **Key Secret** (a long random string)
5. **Download or copy both codes** and save them safely.
6. Send these two codes to your developer through a secure message.

> Important: Never share these keys publicly. Treat them like a password.

---

## Step 5: Set Up Settlement (How You Get Paid)

Settlement means when Razorpay transfers the money it collected to your bank account.

1. Go to **"Settings" → "Settlements"**.
2. Choose how often you want the money in your bank:
   - **Daily** (recommended)
   - Weekly
   - On-demand
3. Confirm your bank account details once more.

By default, Razorpay sends the money to your bank in **T+2 days** (2 working days after the customer pays).

---

## Step 6: Test Before Going Live

Razorpay gives you a **Test Mode** where you can try fake payments without using real money.

1. In the dashboard, switch the toggle to **"Test Mode"**.
2. Your developer will use this to make sure everything works correctly.
3. Once tests pass, switch to **"Live Mode"** to start accepting real payments.

---

## Step 7: Understand the Charges

Razorpay charges a small fee on every successful payment.

- **UPI / RuPay cards:** Around 0% (often free)
- **Indian Credit/Debit Cards:** Around 2% per transaction
- **Net Banking and Wallets:** Around 2% per transaction
- **International cards:** Around 3% per transaction

There are **no setup fees** and **no monthly fees**. You only pay when you receive a payment.

Check the latest charges here: **https://razorpay.com/pricing**

---

## Step 8: Add Bank Account for Refunds

If a customer wants a refund, the money goes back from your Razorpay balance.

1. Go to **Settings → Refunds**.
2. Choose your refund policy:
   - **Instant Refund** (faster but costs a small fee)
   - **Normal Refund** (free, takes 5 to 7 days)

---

## Useful Links

- **Razorpay Login:** https://dashboard.razorpay.com
- **Support / Help:** https://razorpay.com/support
- **Pricing Details:** https://razorpay.com/pricing
- **Phone Support:** Available inside the dashboard under "Help"

---

## What to Send Us After Setup

Once your account is approved, please share the following with your developer:

1. **Key ID**
2. **Key Secret**
3. Confirmation that your account is in **Live Mode**

We will then connect Razorpay to your website and you can start accepting payments.

---

## Quick Checklist

- [ ] Created Razorpay account
- [ ] Business details filled
- [ ] KYC documents uploaded
- [ ] KYC approved (email received)
- [ ] Bank account added
- [ ] API Keys generated and saved
- [ ] Settlement preference set
- [ ] Keys shared with developer

---

If you get stuck at any step, take a screenshot and send it across — we will guide you through it.
