import Link from 'next/link'

export const metadata = {
  title: 'Buyer Protection & Refund Policy · YourFamilyFarmer',
  description: 'How your order and payment are protected, and how refunds work.',
}

// ⚙️ EDIT ME: set your real support contact here. Phone is used for both the
// "Call" and "WhatsApp" buttons. Leave email blank to hide the email row.
const SUPPORT_PHONE = '' // e.g. '919876543210' (country code, no +, no spaces)
const SUPPORT_EMAIL = '' // e.g. 'help@yourfamilyfarmer.in'

const cards: Array<{ icon: string; title: string; titleTe: string; body: string; bodyTe: string }> = [
  {
    icon: '🔒',
    title: 'Your payment is secure',
    titleTe: 'మీ చెల్లింపు సురక్షితం',
    body: 'Payments are processed by Razorpay, a trusted, RBI-regulated payment gateway. We never see or store your card or UPI PIN.',
    bodyTe: 'చెల్లింపులు RBI నియంత్రించే నమ్మకమైన Razorpay ద్వారా జరుగుతాయి. మీ కార్డ్ లేదా UPI పిన్‌ను మేము ఎప్పుడూ చూడం, నిల్వ చేయం.',
  },
  {
    icon: '✅',
    title: 'Pay only for confirmed orders',
    titleTe: 'ధృవీకరించిన ఆర్డర్‌లకే చెల్లింపు',
    body: 'If a farmer cannot fulfil your order and declines it, you are not charged — and if you already paid, you get a full refund automatically.',
    bodyTe: 'రైతు మీ ఆర్డర్‌ను తిరస్కరిస్తే మీకు ఛార్జ్ ఉండదు — ఇప్పటికే చెల్లించి ఉంటే పూర్తి రీఫండ్ ఆటోమేటిక్‌గా వస్తుంది.',
  },
  {
    icon: '💸',
    title: 'Automatic refunds',
    titleTe: 'ఆటోమేటిక్ రీఫండ్‌లు',
    body: 'When a paid order is declined or cancelled, the refund is started immediately to your original payment method. It reflects in your account within 3–5 business days. You can track its status on your order page.',
    bodyTe: 'చెల్లించిన ఆర్డర్ తిరస్కరించబడినా లేదా రద్దు చేయబడినా, రీఫండ్ వెంటనే మీ అసలు చెల్లింపు పద్ధతికి మొదలవుతుంది. 3–5 పని రోజుల్లో మీ ఖాతాలో కనిపిస్తుంది. మీ ఆర్డర్ పేజీలో స్థితిని చూడవచ్చు.',
  },
  {
    icon: '🧾',
    title: 'Receipt for every payment',
    titleTe: 'ప్రతి చెల్లింపుకు రసీదు',
    body: 'Every paid order has a receipt with a unique Order ID (e.g. YFF-20260523-0001). Open your order and tap "View receipt" to print or save it.',
    bodyTe: 'ప్రతి చెల్లించిన ఆర్డర్‌కు ప్రత్యేక ఆర్డర్ ID (ఉదా. YFF-20260523-0001)తో రసీదు ఉంటుంది. మీ ఆర్డర్ తెరిచి "View receipt" నొక్కి ప్రింట్ లేదా సేవ్ చేయండి.',
  },
  {
    icon: '🛵',
    title: 'Know where your order is',
    titleTe: 'మీ ఆర్డర్ ఎక్కడుందో తెలుసుకోండి',
    body: 'For home delivery you can follow your order live — placed, confirmed, picked up, out for delivery, and delivered — right from the order page.',
    bodyTe: 'ఇంటి డెలివరీకి మీ ఆర్డర్‌ను లైవ్‌గా చూడవచ్చు — ఆర్డర్ పెట్టారు, ధృవీకరించారు, తీసుకున్నారు, డెలివరీకి బయలుదేరారు, డెలివరీ అయింది — ఆర్డర్ పేజీ నుండే.',
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
              <p className="font-bold text-green-700 text-xs leading-tight">{c.titleTe}</p>
              <p className="text-xs text-gray-600 mt-1 leading-snug">{c.body}</p>
              <p className="text-xs text-gray-500 mt-1 leading-snug">{c.bodyTe}</p>
            </div>
          </div>
        ))}

        {/* Refund policy summary */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <p className="font-extrabold text-gray-900 text-sm">Refund policy in short</p>
          <p className="font-bold text-green-700 text-xs">రీఫండ్ విధానం — సంక్షిప్తంగా</p>
          <ul className="mt-2 space-y-1.5 text-xs text-gray-600 list-disc pl-4">
            <li>Order declined by farmer → full refund, started automatically. / రైతు తిరస్కరిస్తే → పూర్తి రీఫండ్ ఆటోమేటిక్‌గా.</li>
            <li>Order cancelled before the farmer confirms → full refund. / రైతు ధృవీకరించక ముందు రద్దు చేస్తే → పూర్తి రీఫండ్.</li>
            <li>Refunds go back to the method you paid with (UPI/card). / మీరు చెల్లించిన పద్ధతికే (UPI/కార్డ్) రీఫండ్.</li>
            <li>Refunds reflect within 3–5 business days. / 3–5 పని రోజుల్లో కనిపిస్తుంది.</li>
            <li>Delivery fee (if any) is cash to the rider, not part of the online refund. / డెలివరీ ఫీజు (ఉంటే) రైడర్‌కు నగదు, ఆన్‌లైన్ రీఫండ్‌లో భాగం కాదు.</li>
          </ul>
        </div>

        {/* Support */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <p className="font-extrabold text-gray-900 text-sm">Need help with an order?</p>
          <p className="font-bold text-green-700 text-xs">ఆర్డర్‌తో సహాయం కావాలా?</p>
          <p className="text-xs text-gray-600 mt-1">
            Keep your Order ID ready (e.g. YFF-…) and reach us:
            <br />మీ ఆర్డర్ ID (ఉదా. YFF-…) సిద్ధంగా ఉంచుకుని మమ్మల్ని సంప్రదించండి:
          </p>
          <div className="mt-3 space-y-2">
            {SUPPORT_PHONE ? (
              <>
                <a href={`tel:+${SUPPORT_PHONE}`} className="block w-full text-center bg-green-700 text-white font-bold py-3 rounded-xl text-sm active:bg-green-800">
                  📞 Call support / కాల్ చేయండి
                </a>
                {waLink && (
                  <a href={waLink} target="_blank" rel="noopener noreferrer" className="block w-full text-center bg-green-600 text-white font-bold py-3 rounded-xl text-sm active:bg-green-700">
                    💬 WhatsApp support / వాట్సాప్
                  </a>
                )}
              </>
            ) : (
              <p className="text-xs text-gray-500">
                Contact your farmer directly from the order page, or reach the
                YourFamilyFarmer team.
                <br />ఆర్డర్ పేజీ నుండి నేరుగా రైతును సంప్రదించండి, లేదా YourFamilyFarmer బృందాన్ని సంప్రదించండి.
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
