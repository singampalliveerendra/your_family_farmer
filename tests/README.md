# Tests

Unit tests for the pure logic in `src/` — the code where a silent regression
costs real money or lets someone in.

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
