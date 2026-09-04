# Tests

Unit tests for the pure logic in `src/` — the code where a silent regression
costs real money or lets someone in.

Each `it(...)` carries a short **USE:** note above it saying what that case is
for and what breaks in production without it. Read those before changing a
figure: most of them record a bug that actually happened.

```bash
npm test           # run everything once (~2s)
npm run test:watch # re-run on save
npx vitest run tests/lib/pricing.test.ts   # just one file
```

The layout mirrors `src/`: `tests/lib/pricing.test.ts` covers
`src/lib/pricing.ts`. Config is `vitest.config.mts` at the repo root.

## No setup required

The suite is hermetic. It never touches Supabase, Razorpay or the network, and
needs no `.env`. `tests/setup.ts` supplies fixed dummy secrets so the HMAC
helpers are deterministic. That is why CI can run it with no secrets at all.

## What is covered

| File | Covers |
| --- | --- |
| `lib/pricing.test.ts` | tier price ladder — the client cart and the server must agree |
| `lib/platform-fee.test.ts` | moderator commission, and never returning `NaN` into a total |
| `lib/cod.test.ts` | part-paid COD split; deposit + balance always sums to the total |
| `lib/delivery-fee.test.ts` | base/extra split, the client-flag rule, refund planning |
| `lib/razorpay.test.ts` | payment + webhook signature verification |
| `lib/session.test.ts` | consumer session cookie: forgery, tampering, expiry |
| `lib/guest-order-token.test.ts` | guest checkout token is bound to its order ids |
| `lib/otp.test.ts` | OTP generation, hashing, constant-time compare |
| `lib/password.test.ts` | scrypt hashing, per-user salt |
| `lib/saleStep.test.ts` | quantities on a step grid, without float drift |
| `lib/phone.test.ts` | one number, one account, however it is typed |
| `lib/rate-limit.test.ts` | the brute-force brake |
| `lib/payment.test.ts` | the paid/claimed/deposit vocabulary — one answer to "is the money in?" |
| `lib/orderReport.test.ts` | every money figure on the farmer's downloadable report |
| `lib/payout.test.ts` | bank + UPI validation, and never showing an account number back |
| `lib/columns.test.ts` | the public column allow-lists — no secret, no handover code |
| `lib/produceStatus.test.ts` | who decides sold out: the harvests, not the template |
| `lib/harvest.test.ts` | the freshness clock — the product's core claim |
| `lib/rider-jobs.test.ts` | one bag = one job, so two riders can't claim the same delivery |
| `lib/pickup-slots.test.ts` | pickup schedules, including two legacy storage shapes |
| `lib/location.test.ts` | distance, and placing a farmer who never granted GPS |
| `lib/source-farmers.test.ts` | the grower record behind an aggregator's produce |
| `lib/entryRole.test.ts` | where the installed app opens — the login-every-launch fix |
| `lib/links.test.ts` | farmer-pasted links: no `javascript:` href on a public page |
| `lib/date.test.ts` | "today" in India, not UTC |
| `lib/complaints.test.ts` | one complaint vocabulary across all three surfaces |
| `lib/buyerView.test.ts` | the seller⇄buyer switch marker, and which pages carry the way back |
| `lib/sellerBuyerLink.test.ts` | linking a seller to a buyer account by phone — and refusing a self-order |

## What is NOT covered

Pages and components. That needs jsdom + React Testing Library, which this repo
does not currently pull in. Browser behaviour is still verified by hand against
staging.

Database rules (RLS policies and column grants) are proved with a rolled-back
SQL probe run as the `anon` role — see `scripts/farmers-column-lockdown.sql` —
not from here.

## Adding a feature

Every feature ships with its tests, in the same commit. If the logic is buried
in an API route, extract the decision into a pure function in `src/lib/` and
test that — as `resolveBatchDeliveryFee()` was pulled out of
`src/app/api/orders/place/route.ts`.
