// Fixed, obviously-fake secrets so the HMAC helpers are deterministic and the
// suite never depends on a real environment. 32+ chars: getSessionSecret()
// rejects anything shorter.
process.env.SESSION_SECRET = 'test-session-secret-0123456789abcdef'
process.env.RAZORPAY_KEY_SECRET = 'test-razorpay-key-secret'
process.env.RAZORPAY_WEBHOOK_SECRET = 'test-razorpay-webhook-secret'
