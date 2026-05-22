import Link from 'next/link'

export const metadata = {
  title: 'Buyer Protection & Refund Policy · YourFamilyFarmer',
  description: 'How your order and payment are protected, and how refunds work.',
}

// ⚙️ EDIT ME: set your real support contact here. Phone is used for both the
// "Call" and "WhatsApp" buttons. Leave email blank to hide the email row.
const SUPPORT_PHONE = '' // e.g. '919876543210' (country code, no +, no spaces)
const SUPPORT_EMAIL = '' // e.g. 'help@yourfamilyfarmer.in'

const cards: Array<{ icon: string; title: string; body: string }> = [
  {
    icon: '🔒',
    title: 'Your payment is secure',
    body: 'Payments are processed by Razorpay, a trusted, RBI-regulated payment gateway. We never see or store your card or UPI PIN.',
  },
  {
    icon: '✅',
    title: 'Pay only for confirmed orders',
    body: 'If a farmer cannot fulfil your order and declines it, you are not charged — and if you already paid, you get a full refund automatically.',
  },
  {
    icon: '💸',
    title: 'Automatic refunds',
    body: 'When a paid order is declined or cancelled, the refund is started immediately to your original payment method. It reflects in your account within 3–5 business days. You can track its status on your order page.',
  },
  {
    icon: '🧾',
    title: 'Receipt for every payment',
    body: 'Every paid order has a receipt with a unique Order ID (e.g. YFF-20260523-0001). Open your order and tap "View receipt" to print or save it.',
  },
  {
    icon: '🛵',
    title: 'Know where your order is',
    body: 'For home delivery you can follow your order live — placed, confirmed, picked up, out for delivery, and delivered — right from the order page.',
  },
]

export default function BuyerProtectionPage() {
  const waLink = SUPPORT_PHONE
    ? `https://wa.me/${SUPPORT_PHONE}?text=${encodeURIComponent('Hi, I need help with my order on YourFamilyFarmer.')}`
    : ''

  return (
    <main className="min-h-screen bg-gray-50 pb-12">
      <div className="bg-green-700 px-4 pt-6 pb-8">
        <Link href="/consumer/orders" className="text-white/90 text-sm font-semibold">← Back / వెనక్కు</Link>
        <h1 className="text-white text-xl font-extrabold leading-tight mt-3">
          Buyer Protection & Refunds
        </h1>
        <p className="text-green-100 text-xs mt-1">
          కొనుగోలుదారు రక్షణ & రీఫండ్‌లు
        </p>
      </div>

      <div className="px-4 -mt-5 space-y-3 max-w-lg mx-auto">
        {cards.map((c) => (
          <div key={c.title} className="bg-white rounded-2xl border border-gray-100 p-4 flex gap-3">
            <span className="text-2xl flex-shrink-0">{c.icon}</span>
            <div>
              <p className="font-extrabold text-gray-900 text-sm leading-tight">{c.title}</p>
              <p className="text-xs text-gray-600 mt-1 leading-snug">{c.body}</p>
            </div>
          </div>
        ))}

        {/* Refund policy summary */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <p className="font-extrabold text-gray-900 text-sm">Refund policy in short</p>
          <ul className="mt-2 space-y-1.5 text-xs text-gray-600 list-disc pl-4">
            <li>Order declined by farmer → full refund, started automatically.</li>
            <li>Order cancelled before the farmer confirms → full refund.</li>
            <li>Refunds go back to the method you paid with (UPI/card).</li>
            <li>Refunds reflect within 3–5 business days after they are issued.</li>
            <li>Delivery fee (if any) is collected as cash by the rider and is not part of the online refund.</li>
          </ul>
        </div>

        {/* Support */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <p className="font-extrabold text-gray-900 text-sm">Need help with an order?</p>
          <p className="text-xs text-gray-600 mt-1">
            Keep your Order ID ready (e.g. YFF-…) and reach us:
          </p>
          <div className="mt-3 space-y-2">
            {SUPPORT_PHONE ? (
              <>
                <a href={`tel:+${SUPPORT_PHONE}`} className="block w-full text-center bg-green-700 text-white font-bold py-3 rounded-xl text-sm active:bg-green-800">
                  📞 Call support
                </a>
                {waLink && (
                  <a href={waLink} target="_blank" rel="noopener noreferrer" className="block w-full text-center bg-green-600 text-white font-bold py-3 rounded-xl text-sm active:bg-green-700">
                    💬 WhatsApp support
                  </a>
                )}
              </>
            ) : (
              <p className="text-xs text-gray-500">
                Contact your farmer directly from the order page, or reach the
                YourFamilyFarmer team.
              </p>
            )}
            {SUPPORT_EMAIL && (
              <a href={`mailto:${SUPPORT_EMAIL}`} className="block text-center text-sm font-bold text-green-700 underline">
                ✉️ {SUPPORT_EMAIL}
              </a>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
