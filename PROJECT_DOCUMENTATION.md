# YourFamilyFarmer — Project Documentation

> A complete report of what has been built, how it works, and where the project stands.
> Prepared for client presentation, project submission, and demo/investor review.

---

## 1. Project Title

**YourFamilyFarmer (YFF)** — *Natural food, direct from farmers near you.*

A mobile-first web platform that connects natural-method farmers in Andhra Pradesh directly with local buyers, with optional home delivery by local delivery riders.

---

## 2. Executive Summary

YourFamilyFarmer is a phone-friendly online marketplace where families can discover and buy fresh, naturally grown produce straight from nearby farmers — with no middlemen taking a cut and inflating prices.

The platform works entirely in a web browser. There is **nothing to download** — a buyer simply opens a link, browses produce from farmers around them, adds items to a cart, and places an order. Farmers get their own profile pages and a simple dashboard to list produce, manage prices, accept or decline orders, and confirm payments. Local delivery riders can sign up, get approved by the owner, and deliver orders to the buyer's door.

The product is deliberately built for **slow mobile internet** and **low-end Android phones**, since that is what the target audience uses. The interface is **bilingual (English + Telugu)** so local buyers and farmers can use it comfortably.

The system currently supports the full cycle: a farmer lists produce → a buyer orders and pays via UPI (or Cash on Delivery where the farmer allows it) → the farmer confirms → the order is either picked up or delivered to the buyer's home by a rider.

---

## 3. Problem Statement

Small natural farmers in rural Andhra Pradesh grow high-quality, chemical-free food but struggle to reach the customers who want it. They sell through middlemen who pay them very little and resell at a high markup. Buyers, on the other hand, cannot easily tell who grows their food, how it was grown, or whether it is genuinely natural.

There is no simple, trusted, local channel where a family can find a real farmer near them, see proof of their farming methods, and buy directly.

---

## 4. Existing System Problems

| Problem in the current way of buying/selling | Impact |
|---|---|
| Middlemen between farmer and buyer | Farmer earns little; buyer pays more |
| No proof of how food was grown | Buyers cannot trust "natural" or "organic" claims |
| No local discovery | Buyers don't know which farmers are near them |
| Cash-only, in-person deals | Hard to scale beyond a farmer's immediate village |
| No delivery option | Buyers must travel to the farm to collect produce |
| App-store apps are heavy | Won't install or run well on low-end phones / slow 4G |
| Language barrier | English-only tools exclude many local users |

---

## 5. Proposed Solution

A lightweight, mobile-first website (a "PWA") that:

- Lets buyers **browse produce from farmers near them**, filtered by distance, category, and farming method.
- Gives every farmer a **public profile** showing their story, photos, produce, quality details, and customer reviews — building trust.
- Allows buyers to **order online and pay via UPI**, with the farmer confirming payment manually, or pay **Cash on Delivery** where the farmer allows it.
- Offers **home delivery** through local riders who are vetted and approved by the platform owner.
- Works in **English and Telugu**, loads fast on slow connections, and needs **no app download**.

---

## 6. Project Objectives

1. Remove middlemen so farmers earn more and buyers pay fair prices.
2. Make it easy to discover genuine natural farmers near the buyer.
3. Build trust through farmer stories, photos, quality info, and reviews.
4. Enable simple online ordering and payment that works for non-technical users.
5. Provide an optional, reliable home-delivery service via local riders.
6. Keep the experience fast and usable on cheap Android phones over 4G.
7. Support local language (Telugu) alongside English.
8. Keep buyer and farmer data secure.

---

## 7. Target Users and User Roles

The platform serves **four kinds of users**, each with their own login and area of the app:

| Role | Who they are | What they do |
|---|---|---|
| **Buyer (Consumer)** | Families/individuals wanting natural food | Browse, order, pay, track orders, leave reviews |
| **Farmer** | Natural-method farmers | Maintain profile, list produce, manage prices, accept/decline orders, confirm payments |
| **Delivery Rider** | Local delivery agents | Sign up, accept delivery jobs, pick up and deliver orders |
| **Owner / Admin** | The platform operator | Approve riders, oversee deliveries, reassign orders |

---

## 8. System Architecture Overview

The system is a single web application with a built-in backend, backed by a cloud database and file storage.

```
                   ┌─────────────────────────────┐
                   │   Buyer / Farmer / Rider /   │
                   │   Owner  (mobile browser)    │
                   └──────────────┬──────────────┘
                                  │  (web pages + secure API calls)
                                  ▼
                  ┌──────────────────────────────────┐
                  │     YourFamilyFarmer Web App       │
                  │     (Next.js — pages + backend)    │
                  │                                    │
                  │  • Public pages (browse, profiles) │
                  │  • Secure server routes (orders,   │
                  │    payments, logins, deliveries)   │
                  │  • Login sessions per role         │
                  └───────────────┬───────────────────┘
                                  │
                 ┌────────────────┴─────────────────┐
                 ▼                                   ▼
        ┌──────────────────┐              ┌────────────────────┐
        │ Supabase database │              │ Supabase file       │
        │ (farmers, orders, │              │ storage (photos,    │
        │  produce, riders…)│              │  payment proofs,    │
        │                   │              │  rider ID proofs)   │
        └──────────────────┘              └────────────────────┘
```

**Key design ideas:**

- **One app, four "doorways."** Buyers, farmers, riders, and the owner each get their own login and their own screens, but it is all one website.
- **Sensitive actions happen on the server.** Placing an order, confirming a payment, or marking a delivery done are all handled by secure server code — never trusted to the buyer's browser. This prevents tampering (e.g., someone can't mark their own order as "paid").
- **Each role has a separate, signed login token** stored in a secure browser cookie, so one type of user cannot act as another.

---

## 9. Technology Stack

| Layer | Technology | Why it's used |
|---|---|---|
| **Frontend (what users see)** | Next.js (App Router) + React + TypeScript | Fast, modern, mobile-friendly web pages |
| **Styling** | Tailwind CSS | Clean, consistent, responsive mobile design |
| **Backend (server logic)** | Next.js server routes (Node.js) | Handles orders, logins, payments securely |
| **Database** | Supabase (PostgreSQL) | Stores farmers, produce, orders, riders, etc. |
| **File storage** | Supabase Storage | Farm photos, payment screenshots, rider ID proofs |
| **Hosting** | Vercel | Deploys and serves the website |
| **Payments** | UPI (direct to farmer) + Cash on Delivery | Buyer pays the farmer via UPI or cash |
| **Payment gateway (planned)** | Razorpay | Onboarding guide prepared; not yet wired into the app |
| **Messaging (planned)** | Twilio WhatsApp | For future automated notifications |

**Languages supported in the interface:** English and Telugu.

---

## 10. Database Design and Main Tables

The database is the heart of the system. The main tables and what they hold:

| Table | Purpose / What it stores |
|---|---|
| **farmers** | Farmer profiles — name, village, district, photo, cover photo, farming method, location (GPS + name), UPI ID & QR code, COD on/off toggle, pickup address & schedule, ratings |
| **produce_listings** | Each item a farmer sells — name, photo, method, stock quantity, unit, harvest date, and tiered pricing |
| **orders** | Every order line — produce, quantity, price, buyer name/phone, payment method & status, delivery type & status, delivery address, handover code, rider assignment, timestamps |
| **consumers_auth** | Buyer accounts — name, phone, securely hashed password |
| **delivery_boys** | Rider accounts — name, phone, vehicle details, ID proof, service areas/pincodes, approval status, activation code |
| **reviews** | Buyer reviews — rating, text, reviewer name & phone (used to stop duplicate/fake reviews) |
| **media** | Farm gallery photos linked to each farmer |
| **regions** | Service regions (e.g., Tadepalligudem) for regional discovery |
| **demand_intents** | Buyer interest signals for crops (demand sensing) |
| **wa_clicks** | Records of WhatsApp contact clicks (simple analytics) |

**File storage buckets:**

| Bucket | Visibility | Holds |
|---|---|---|
| `farm-images` | Public | Farm and produce photos |
| `payment-proofs` | Private | Buyer payment screenshots (only shown via secure links) |
| `rider-id-proofs` | Private | Rider ID documents (only the owner can view) |

**Important safety logic built into the database:**
- **Stock is decremented safely** so two buyers can't both buy the last item (no overselling).
- **Tiered pricing** — farmers can set "buy more, pay less per kg" pricing, and the price is always recalculated on the server so the buyer's device can't fake a cheaper price.

---

## 11. Complete Feature List

**Buyer side**
- Browse all available produce from nearby farmers
- Search produce by name
- Filter by category (vegetables, fruits, grains, leafy greens) and farming method
- Set location and filter farmers by distance
- View detailed farmer profiles
- Add items to cart and checkout
- Choose self-pickup or home delivery
- Pay by UPI (with QR / UPI ID) or Cash on Delivery
- Upload a payment screenshot as proof
- Track order status and view order history
- Leave a rating and review for a farmer

**Farmer side**
- Sign up and log in with phone + password
- Edit profile (story, photos, cover, method, location, pickup info)
- Add UPI ID and payment QR code
- Turn Cash on Delivery on or off
- Add, edit, and delete produce listings with photos
- Set tiered prices and stock
- See incoming orders in real time
- Accept or decline orders (with a reason)
- Confirm or reject payments
- View order history

**Rider side**
- Sign up with vehicle and ID details
- Wait for owner approval, then activate the account
- See available delivery jobs (matched to their service area)
- Accept a delivery, mark pickup, mark out-for-delivery
- Complete delivery by entering the customer's handover code
- View delivery history and earnings

**Owner / Admin side**
- Secure owner login
- Approve, suspend, or reinstate riders
- View rider ID proofs
- See all delivery orders with full details
- Assign or reassign deliveries to riders

**Platform-wide**
- Bilingual interface (English / Telugu)
- Regional discovery pages
- Mobile-first, fast-loading design

---

## 12. Detailed Explanation of Every Implemented Feature

**Produce browsing (buyer home page)** — *Business:* the buyer's storefront, showing what's available now and what's "coming soon." *Technical:* loads listings from the server, groups by farmer, and only shows produce from active farmers.

**Search & filters** — *Business:* helps buyers quickly find what they want. *Technical:* live text search plus category and farming-method filters applied instantly.

**Location & distance filter** — *Business:* shows farmers near the buyer first. *Technical:* the buyer sets a location; the app calculates the straight-line distance to each farmer and filters by it. If a farmer didn't share GPS, the app falls back to matching their town name to a known list of Andhra Pradesh towns so they still appear in nearby searches.

**Farmer profile page** — *Business:* builds trust by telling the farmer's story and showing proof. *Technical:* a public page with tabs for Story, Produce, Quality, Reviews, and Farm photos, plus a trust strip (years farming, rating, buyer count).

**Cart & checkout** — *Business:* lets buyers order multiple items together. *Technical:* a cart that holds one farmer's items; checkout collects pickup or delivery details and sends them securely to the server.

**Tiered pricing** — *Business:* farmers reward bulk buyers with lower per-kg prices. *Technical:* the correct price tier for the chosen quantity is always computed on the server, so prices can't be tampered with.

**Order placement** — *Business:* turns a cart into a real order. *Technical:* a secure server step that verifies the buyer is logged in, re-checks live prices and stock, claims stock safely to prevent overselling, and creates the order(s).

**UPI payment + proof upload** — *Business:* buyer pays the farmer directly via UPI and proves it. *Technical:* buyer pays using the farmer's UPI ID/QR, then uploads a screenshot (stored privately). The buyer marks "I've paid," and the farmer verifies before fulfilling.

**Cash on Delivery (COD)** — *Business:* an option for buyers who prefer paying cash. *Technical:* available only when the farmer has switched COD on for their account.

**Farmer order management** — *Business:* farmers control which orders they take. *Technical:* a dashboard listing orders; the farmer can accept, decline (with a mandatory reason shown to the buyer), and confirm/reject payments — all behind the farmer's secure login.

**Home delivery with riders** — *Business:* brings produce to the buyer's door. *Technical:* for delivery orders, the system generates a 4-digit handover code and tracks the delivery through stages (assigned → picked up → out for delivery → delivered).

**Handover code (delivery OTP)** — *Business:* proves the right customer received the order. *Technical:* a 4-digit code shown only to the buyer; the rider must enter it at the door to complete delivery. Wrong-guess attempts are limited.

**Rider onboarding & lifecycle** — *Business:* only vetted riders deliver. *Technical:* rider signs up → owner approves → rider activates → rider is active. The owner can suspend or reinstate riders.

**Owner delivery panel** — *Business:* the operator's control room. *Technical:* shows all deliveries and riders, lets the owner assign/reassign orders, and approve/suspend riders. Auto-refreshes every 20 seconds.

**Reviews & ratings** — *Business:* social proof for farmers. *Technical:* buyers rate 1–5 stars with text; phone number is required to block duplicate/fake reviews; the farmer's average rating updates automatically.

**Bilingual interface** — *Business:* usable by local Telugu speakers and English speakers alike. *Technical:* a language toggle switches text between English and Telugu across the app.

**Regional discovery** — *Business:* a landing page for a whole region/town. *Technical:* shows farmers and produce for a region, with a browse-and-discover layout.

---

## 13. User Workflows and Application Flow

**Buyer journey**
1. Opens the site → lands on the produce marketplace.
2. (Optional) Sets location → sees nearby farmers first.
3. Browses/searches → opens a farmer's profile → adds items to cart.
4. Logs in or registers (phone + password).
5. Chooses **self-pickup** or **home delivery** and a payment method.
6. Pays via UPI (uploads screenshot) or selects Cash on Delivery.
7. Tracks the order; for delivery, reads the handover code to the rider at the door.
8. Later, leaves a review.

**Farmer journey**
1. Signs up / logs in.
2. Completes profile, adds UPI ID and QR, sets pickup details.
3. Adds produce with photos, prices, and stock.
4. Receives orders → accepts or declines.
5. Verifies UPI payment (or arranges COD) → fulfils the order.

**Rider journey**
1. Signs up with vehicle + ID details → waits for approval.
2. Owner approves → rider activates account → logs in.
3. Sees available deliveries in their area → accepts one.
4. Marks pickup → out for delivery → enters the customer's handover code to complete.

**Owner journey**
1. Logs into the owner panel.
2. Reviews rider applications and ID proofs → approves/suspends.
3. Monitors all deliveries → assigns/reassigns riders as needed.

---

## 14. Admin Features

The Owner/Admin panel (`/admin`) is protected by a single secure owner password.

- **Rider management:** approve new riders, view their ID proof, suspend a rider (blocks login), or reinstate a suspended rider. Approving issues an activation code.
- **Delivery oversight:** see every delivery order with farmer details, customer details, drop address, current status, assigned rider, and the handover code.
- **Assignment control:** assign an order to a rider, reassign it to a different rider, or un-assign it.
- **Live view:** the panel refreshes automatically so the owner always sees current status.

> Note: there is no general "manage everything" admin panel by design — the owner panel is focused on riders and deliveries.

---

## 15. Farmer Features

- **Account:** phone + password sign-up and login (with reset password support).
- **Profile editing:** name, story, cover photo, profile photo, farming method, location (GPS or town), pickup address and schedule, and a pesticide-test certificate photo.
- **Payments setup:** add UPI ID and upload a payment QR code; toggle Cash on Delivery on/off.
- **Produce management:** add/edit/delete listings with photos, emoji, variety, harvest date, unit, stock, and quality fields; mark items "available" or "coming soon."
- **Tiered pricing:** set up to three price tiers (e.g., cheaper per kg for larger quantities).
- **Order handling:** view incoming orders (updated in real time), accept or decline (decline requires a reason shown to the buyer), and confirm or reject payments.
- **History:** review past orders.

---

## 16. Buyer / Customer Features

- **Account:** simple phone + password registration and login; session lasts up to 30 days.
- **Discovery:** browse, search, filter by category/method, and filter farmers by distance from a chosen location.
- **Farmer profiles:** read the farmer's story, see photos, quality details, and reviews.
- **Cart & checkout:** add items, choose pickup or home delivery, enter delivery address details.
- **Payments:** pay via UPI (with the farmer's QR/UPI ID) and upload a payment screenshot, or choose Cash on Delivery when offered.
- **Order tracking:** see order status and history; for delivery, see the handover code to give the rider.
- **Reviews:** rate and review a farmer (one review per phone per farmer).

---

## 17. AI Features and Integrations

There are **no AI features** in the current codebase. The platform is a straightforward marketplace and delivery system. (No machine-learning models, chatbots, or AI services are integrated.)

---

## 18. Location and Mapping Features

- **Buyer location:** buyers can set their location and filter produce by distance (e.g., within 5 km).
- **Distance calculation:** the app measures the straight-line distance between the buyer and each farmer.
- **Smart fallback:** if a farmer hasn't shared GPS coordinates, the app matches their town/village name against a built-in list of ~25 Andhra Pradesh towns (with coordinates) so they still appear in nearby searches. This was added because many farmers only type a village name instead of using GPS.
- **Region pages:** each service region (e.g., Tadepalligudem) has its own discovery page, including a regional map view of farmers.
- **Pincode-based delivery routing:** riders declare the pincodes they serve, and delivery jobs are matched to riders by area.

---

## 19. Payment and Order Management Features

**Payment methods**
- **UPI (direct to farmer):** the buyer pays the farmer's UPI ID/QR and uploads a screenshot as proof. The buyer marks "paid," and the farmer confirms before fulfilling.
- **Cash on Delivery:** available only when the farmer has enabled it.
- **Razorpay:** an onboarding guide has been prepared for the farmer/owner, but the gateway is **not yet connected** in the app.

**Payment statuses**
- `pending` → buyer hasn't paid yet
- `pending_confirmation` → buyer claims they've paid (awaiting farmer check)
- `completed` → farmer confirmed payment
- `failed` → farmer rejected the payment

**Order statuses**
- `pending` → new order awaiting farmer decision
- `approved` → farmer accepted
- `declined` → farmer declined (with reason)

**Delivery statuses (for home-delivery orders)**
- `unassigned` → `assigned` → `picked_up` → `out_for_delivery` → `delivered`

**Order safety**
- Prices and stock are always re-checked on the server.
- Stock is claimed safely so the same item isn't sold twice.
- Only the buyer who placed an order can view or act on it; only the farmer who owns an order can confirm its payment.
- Buyers can retry a failed payment or switch a UPI order to COD (where allowed).
- A delivery fee mechanism exists (currently set to ₹0 / free) and is designed so riders can be paid per delivery later.

---

## 20. Notifications and Communication Features

- **Real-time farmer alerts:** the farmer's dashboard updates with new orders without needing a manual refresh.
- **Auto-refresh owner panel:** the delivery panel refreshes every 20 seconds.
- **WhatsApp contact:** buyers can reach farmers via WhatsApp; these clicks are recorded for simple analytics.
- **Handover code communication:** the delivery code is shown to the buyer and read aloud to the rider in person.
- **Planned:** automated WhatsApp notifications via Twilio (not yet built).

---

## 21. Validation and Security Features

Security has been a deliberate focus of recent work.

- **Separate logins per role:** buyers, farmers, riders, and the owner each have their own secure, signed login cookie. One role's login cannot be reused as another.
- **Passwords are securely hashed** (scrypt with a unique salt per user) — never stored as plain text.
- **Sensitive actions are server-only:** placing orders, confirming payments, and completing deliveries all run on the server, so a user's browser can't be tricked into faking them.
- **Ownership checks everywhere:** buyers can only see/act on their own orders; farmers only on their own orders; riders only on their own deliveries.
- **Database lockdown (RLS):** the orders table is locked so the public browser key cannot read or change it directly — this stops anyone from reading buyer phone numbers/addresses or marking orders "paid." (This was a launch-blocking fix for payments.)
- **Handover code protection:** the delivery code is 4 digits, so wrong-guess attempts are rate-limited (6 tries per 10 minutes per rider/order).
- **Rate limiting:** login attempts, sign-ups, and reviews are throttled to slow down abuse and brute-force attempts.
- **Input validation:** all incoming data (IDs, phone numbers, quantities, file types/sizes, pincodes) is validated and cleaned on the server.
- **Private files:** payment screenshots and rider ID proofs are stored privately and only accessible through secure links.
- **Duplicate-review prevention:** one review per phone per farmer.

---

## 22. Recent Features Added

Based on the latest development work (most recent first):

1. **Farm photo uploads** — farmers can now add photos to their farm gallery.
2. **Security lockdown (RLS) + secure order APIs** — orders are now fully protected; order reading/writing moved to secure server routes. Razorpay onboarding guide and region seed data added.
3. **Pre-launch hardening** — delivery improvements and removal of the old OTP login (replaced by password login).
4. **Home delivery with rider accounts + owner panel** — full rider onboarding, delivery tracking, and the owner's delivery control panel.
5. **Consumer accounts + server-side ordering + mandatory payment proof** — buyers now have real accounts; orders are placed securely; UPI orders require a payment screenshot.
6. **Real-time farmer alerts, retry payment, mandatory decline reason, location stability** improvements.
7. **UPI payment flow** — direct farmer payment via QR/UPI ID, order status tracking, and auto-approve on payment confirmation.
8. **Orders tracking, reviews system, and regional discovery** improvements.

---

## 23. Major Bug Fixes and Improvements Implemented

| Fix / Improvement | What it solved |
|---|---|
| Moved order placement & payment to the server | Stopped buyers from tampering with prices or marking orders "paid" |
| Locked down the orders table (RLS) | Prevented public access to buyer phone numbers and addresses |
| Safe stock decrement | Prevented overselling the last item to two buyers |
| Location fallback by town name | Fixed nearby searches returning zero results for farmers without GPS |
| Replaced OTP login with password login | Removed a fragile/expensive OTP step before launch |
| Mandatory decline reason | Buyers now learn why an order was declined |
| Mandatory payment screenshot for UPI | Gave farmers proof before fulfilling |
| Allow picking payment screenshot from gallery | Made uploading proof easier on phones |
| Clearer error messages on login/session issues | Easier troubleshooting instead of silent failures |
| Separate signed cookies per role | Prevented one user type acting as another |
| Linked the Delivery tab to the rider area | Fixed navigation |

---

## 24. API Endpoints Summary

All sensitive operations go through secure server routes. Grouped by area:

**Buyer (Consumer)**
| Endpoint | Method | Purpose |
|---|---|---|
| `/api/consumer/register` | POST | Create buyer account |
| `/api/consumer/login` | POST | Buyer login |
| `/api/consumer/logout` | POST | Buyer logout |
| `/api/consumer/me` | GET | Current buyer info |
| `/api/consumer/orders` | GET | List buyer's orders |
| `/api/consumer/orders/[id]` | GET | One order's details |
| `/api/consumer/orders/count` | GET | Count of buyer's orders |
| `/api/consumer/orders/payment-claim` | POST | Buyer marks "I've paid" |
| `/api/consumer/orders/switch-cod` | POST | Switch a UPI order to COD |

**Orders & payments**
| Endpoint | Method | Purpose |
|---|---|---|
| `/api/orders/place` | POST | Place an order securely |
| `/api/orders/upload-proof` | POST | Upload payment screenshot |
| `/api/orders/[id]/proof` | GET | Securely view a payment proof |
| `/api/orders/[id]/retry` | POST | Retry a failed payment |

**Farmer**
| Endpoint | Method | Purpose |
|---|---|---|
| `/api/auth/register` | POST | Farmer sign-up |
| `/api/auth/login` | POST | Farmer login |
| `/api/auth/me` | GET | Current farmer info |
| `/api/auth/reset-password` | POST | Reset farmer password |
| `/api/farmer/orders` | GET | Farmer's incoming orders |
| `/api/farmer/orders/history` | GET | Past orders |
| `/api/farmer/orders/[id]/approve` | POST | Accept an order |
| `/api/farmer/orders/[id]/decline` | POST | Decline an order (with reason) |
| `/api/farmer/orders/[id]/payment` | POST | Confirm/reject payment |
| `/api/farmer/update-listing` | POST | Update a produce listing |

**Rider**
| Endpoint | Method | Purpose |
|---|---|---|
| `/api/rider/register` | POST | Rider sign-up |
| `/api/rider/login` | POST | Rider login |
| `/api/rider/logout` | POST | Rider logout |
| `/api/rider/me` | GET | Current rider info |
| `/api/rider/orders` | GET | Available + assigned deliveries |
| `/api/rider/orders/[id]/accept` | POST | Accept a delivery |
| `/api/rider/orders/[id]/pickup` | POST | Mark picked up |
| `/api/rider/orders/[id]/out-for-delivery` | POST | Mark out for delivery |
| `/api/rider/orders/[id]/deliver` | POST | Complete with handover code |

**Owner / Admin**
| Endpoint | Method | Purpose |
|---|---|---|
| `/api/admin/login` | POST | Owner login |
| `/api/admin/logout` | POST | Owner logout |
| `/api/admin/me` | GET | Owner session check |
| `/api/admin/riders` | GET | List all riders |
| `/api/admin/riders/[id]/approve` | POST | Approve a rider |
| `/api/admin/riders/[id]/suspend` | POST | Suspend a rider |
| `/api/admin/riders/[id]/reinstate` | POST | Reinstate a rider |
| `/api/admin/deliveries` | GET | List all deliveries |
| `/api/admin/orders/[id]/reassign` | POST | Assign/reassign a delivery |

**Public**
| Endpoint | Method | Purpose |
|---|---|---|
| `/api/produce` | GET | List available/coming-soon produce |
| `/api/produce/search` | GET | Search produce |
| `/api/reviews` | POST | Submit a review |

---

## 25. Folder Structure Explanation

```
yourfamilyfarmer/
├── src/
│   ├── app/                  → All pages and server routes
│   │   ├── page.tsx          → Entry point (redirects to the buyer marketplace)
│   │   ├── consumer/         → Buyer marketplace + order pages
│   │   ├── farmer/           → Farmer profile, login, signup, dashboard
│   │   ├── rider/            → Rider signup, login, dashboard
│   │   ├── admin/            → Owner panel + owner login
│   │   ├── region/           → Regional discovery pages
│   │   └── api/              → Secure server routes (orders, auth, payments, deliveries…)
│   │
│   ├── components/           → Reusable interface pieces
│   │   ├── consumer/         → Cart, navigation, login modal, order chips
│   │   ├── farmer/           → Profile cover, tabs (Story/Produce/Quality/Reviews/Farm)
│   │   └── region/           → Region hero, map, farmer lists
│   │
│   └── lib/                  → Shared logic
│       ├── supabase.ts       → Database connection
│       ├── session / *-session.ts → Login tokens for each role
│       ├── password.ts       → Secure password hashing
│       ├── pricing.ts        → Tiered price calculation
│       ├── location.ts       → Distance + nearest-town logic
│       ├── delivery-fee.ts   → Delivery fee setting
│       ├── rate-limit.ts     → Abuse/brute-force protection
│       └── translations.ts   → English/Telugu text
│
├── scripts/                  → Database setup files (run in Supabase)
├── public/                   → Static assets
├── CLAUDE.md / README.md     → Project notes
└── RAZORPAY_SETUP_GUIDE.md   → Guide for setting up online payments (future)
```

---

## 26. Screens and Pages Overview

| Page | Who uses it | What it does |
|---|---|---|
| `/` | Everyone | Redirects to the buyer marketplace |
| `/consumer` | Buyer | Main marketplace — browse, search, filter, cart |
| `/consumer/orders` | Buyer | Order history |
| `/consumer/orders/[id]` | Buyer | Single order details, payment, handover code |
| `/farmer/[slug]` | Public | A farmer's public profile (story, produce, reviews, photos) |
| `/farmer/signup`, `/farmer/login` | Farmer | Create account / log in |
| `/farmer/dashboard` | Farmer | Manage profile, produce, payments, settings |
| `/farmer/dashboard/orders` | Farmer | View and act on orders |
| `/rider/signup`, `/rider/login` | Rider | Create account / log in |
| `/rider`, `/rider/dashboard` | Rider | Available jobs, active deliveries, history |
| `/admin/login` | Owner | Owner login |
| `/admin` | Owner | Rider approvals + delivery control |
| `/region/[slug]` | Public | Regional discovery page |
| Error / Not-found pages | Everyone | Friendly fallback screens |

---

## 27. Current Project Status

**Status: Pre-launch / launch-ready MVP.**

- The full buyer → farmer → payment → delivery cycle is **built and working**.
- Buyer, farmer, rider, and owner accounts are all functional with secure logins.
- Payments work via **UPI (with proof)** and **Cash on Delivery**.
- Home delivery with rider onboarding and an owner control panel is complete.
- Security hardening (server-side orders, database lockdown on orders, rate limiting) is done.
- The app is **bilingual (English/Telugu)** and built mobile-first.

**Pending / in progress:**
- Final database security lockdown (Phase 2) for farmers/produce/reviews tables is **planned but not yet applied** — these are still partly accessed from the browser.
- **Razorpay** online payments are documented but **not yet integrated**.
- **WhatsApp** automated notifications are planned.
- Delivery fee is currently **₹0 (free)**.

---

## 28. Future Enhancements / Roadmap

| Priority | Enhancement |
|---|---|
| High | Complete database security Phase 2 (lock down farmers, produce, reviews, etc.) |
| High | Integrate Razorpay for card/UPI/netbanking payments with automatic confirmation |
| Medium | Automated WhatsApp notifications (order updates, payment reminders) via Twilio |
| Medium | Turn on a real per-delivery fee and rider payouts |
| Medium | Expand to more regions beyond Tadepalligudem |
| Low | WhatsApp onboarding bot for farmers |
| Low | Richer demand-sensing (using buyer interest signals already captured) |
| Low | Move all farmer dashboard actions fully behind secure server routes |

---

## 29. Challenges Solved During Development

1. **Stopping price/payment tampering** — moved all critical actions to the server so the buyer's browser can't be trusted with prices or payment status.
2. **Preventing overselling** — built safe stock handling so two buyers can't both buy the last unit.
3. **Nearby search returning nothing** — added a town-name fallback so farmers without GPS still show up in distance searches.
4. **Protecting buyer privacy** — locked the orders table so phone numbers and addresses can't be read by anyone with the public app key.
5. **Keeping four user types apart** — gave each role its own secure login so they can't impersonate one another.
6. **Trustworthy deliveries** — added a handover code so only the right customer can confirm receipt, with limits on wrong guesses.
7. **Honest reviews** — required a phone number to block duplicate and fake reviews.
8. **Working on weak phones/networks** — kept the app lightweight and fast, with no app download required.
9. **Local usability** — added a full English/Telugu bilingual interface.
10. **Simplifying login** — replaced a fragile OTP system with straightforward password login before launch.

---

## 30. Conclusion

YourFamilyFarmer delivers on its core promise: a simple, trustworthy, mobile-first way for families in Andhra Pradesh to buy genuinely natural food directly from local farmers — with no middlemen and an optional home-delivery service.

The platform is a working, launch-ready MVP. It handles the complete journey from a farmer listing produce to a buyer receiving it at their door, with secure accounts for buyers, farmers, riders, and the owner, and meaningful safeguards around payments, privacy, and stock. Recent work has focused heavily on **security and reliability**, making the system safe to handle real money and real customer data.

The foundation is solid and extensible. The clear next steps — completing the database lockdown, integrating Razorpay for seamless online payments, and adding automated WhatsApp notifications — will turn this strong MVP into a fully scalable product ready to expand across more regions of Andhra Pradesh.

---

*Document generated from a full review of the YourFamilyFarmer codebase. It reflects features that are actually implemented; planned-but-not-yet-built items (Razorpay, WhatsApp automation, database Phase 2) are clearly marked as future work.*
