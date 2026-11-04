import type { IconName } from '@/components/home/Icon'

/* The words on the role explainer pages — /home/consumer, /home/farmer,
 * /home/aggregator (model agreed 2026-11-04).
 *
 * Every line must be TRUE of the app today, or say plainly that it is coming:
 * a page that promises a button that does not exist costs more trust than it
 * wins. Steps that are not built yet carry `soon: true`. When the bulk market
 * Nothing for aggregators is "soon" any more since Phase 6 (in-app bulk
 * ordering); keep the flag for whatever comes next.
 * tests/lib/roleContent.test.ts checks every line has Telugu, every icon
 * exists and every link goes to a real page. */

export type Pair = [string, string]
export type Role = 'consumer' | 'farmer' | 'aggregator'
export type Item = { icon: IconName; title: Pair; body: Pair }
export type Step = { title: Pair; body: Pair; soon?: boolean }
export type Cta = { href: string; label: Pair; primary?: boolean }
export type Glance = { value: Pair; label: Pair }

export type RoleContent = {
  role: Role
  badge: Pair
  title: Pair
  intro: Pair
  /** Three facts in big type under the hero. */
  glance: Glance[]
  benefits: Item[]
  steps: Step[]
  features?: Pair[]
  terms: Pair[]
  faqs: { q: Pair; a: Pair }[]
  ctas: Cta[]
  /** Small print under the steps (e.g. what is still opening soon). */
  stepsNote?: Pair
}

/** Each role's colour, used for its accents only — offers keep turmeric. */
export const ROLE_ACCENT: Record<Role, { ink: string; tint: string; label: Pair }> = {
  consumer: { ink: '#2f6f4f', tint: '#e7f0e9', label: ['Consumer', 'వినియోగదారు'] },
  farmer: { ink: '#7a4f17', tint: '#f3eadb', label: ['Farmer', 'రైతు'] },
  aggregator: { ink: '#27486a', tint: '#e5ecf3', label: ['Aggregator', 'అగ్రిగేటర్'] },
}

export const CONSUMER_CONTENT: RoleContent = {
  role: 'consumer',
  badge: ['For families', 'కుటుంబాల కోసం'],
  title: ['Fresh from the farm, straight to your kitchen', 'పొలం నుండి నేరుగా మీ వంటింటికి'],
  intro: [
    'Buy everyday produce directly from the farmers who grow it. You see who grew it and when it was picked — and the farmer gets a fair price.',
    'పండించిన రైతుల నుండే రోజువారీ ఉత్పత్తులు కొనండి. ఎవరు పండించారో, ఎప్పుడు కోశారో మీరు చూస్తారు — రైతుకు న్యాయమైన ధర దక్కుతుంది.',
  ],
  glance: [
    { value: ['Today', 'నేడే'], label: ['harvest time on every item', 'ప్రతి వస్తువుపై కోసిన సమయం'] },
    { value: ['Named', 'పేరుతో'], label: ['the farmer who grew it', 'పండించిన రైతు'] },
    { value: ['2 ways', '2 దారులు'], label: ['pickup or home delivery', 'పికప్ లేదా ఇంటికి డెలివరీ'] },
  ],
  benefits: [
    { icon: 'sprout', title: ['Straight from the grower', 'నేరుగా పండించినవారి నుండి'], body: ['No middleman taking a cut — the farmer sets the price.', 'మధ్యలో కమీషన్ లేదు — ధర రైతే నిర్ణయిస్తారు.'] },
    { icon: 'clock', title: ['Freshness you can check', 'మీరే చూడగల తాజాదనం'], body: ['Every listing shows when it was actually picked.', 'ప్రతి లిస్టింగ్‌పై నిజంగా కోసిన సమయం కనిపిస్తుంది.'] },
    { icon: 'truck', title: ['Pickup or delivery', 'పికప్ లేదా డెలివరీ'], body: ['Collect from the farm, or have it brought to your door.', 'పొలం వద్ద తీసుకోండి, లేదా మీ ఇంటికి తెప్పించుకోండి.'] },
    { icon: 'shield', title: ['Safe payments', 'సురక్షిత చెల్లింపులు'], body: ['UPI and cards through Cashfree. If a farmer declines, your money comes back automatically.', 'క్యాష్‌ఫ్రీ ద్వారా UPI, కార్డులు. రైతు తిరస్కరిస్తే మీ డబ్బు ఆటోమేటిక్‌గా తిరిగి వస్తుంది.'] },
    { icon: 'bell', title: ['Updates on WhatsApp', 'వాట్సాప్‌లో అప్‌డేట్‌లు'], body: ['Know when your order is confirmed, on its way and delivered.', 'మీ ఆర్డర్ ఖరారైనప్పుడు, బయలుదేరినప్పుడు, అందినప్పుడు తెలుసుకోండి.'] },
    { icon: 'language', title: ['Telugu or English', 'తెలుగు లేదా ఇంగ్లీష్'], body: ['The whole shop switches language in one tap.', 'ఒక్క ట్యాప్‌తో షాప్ మొత్తం భాష మారుతుంది.'] },
  ],
  steps: [
    { title: ['Open the shop', 'షాప్ తెరవండి'], body: ['No download needed — it works in your phone’s browser.', 'డౌన్‌లోడ్ అవసరం లేదు — మీ ఫోన్ బ్రౌజర్‌లోనే పనిచేస్తుంది.'] },
    { title: ['Pick today’s harvest', 'నేటి కోత ఎంచుకోండి'], body: ['Real farms near you, with the picking time on every card.', 'మీ దగ్గరి నిజమైన పొలాలు, ప్రతి కార్డుపై కోసిన సమయం.'] },
    { title: ['Choose pickup or delivery, then pay', 'పికప్ లేదా డెలివరీ ఎంచుకుని చెల్లించండి'], body: ['Pay online, or in cash where the farmer accepts it.', 'ఆన్‌లైన్‌లో లేదా రైతు అంగీకరిస్తే నగదుగా చెల్లించండి.'] },
    { title: ['Collect it, enjoy it, rate it', 'తీసుకోండి, ఆస్వాదించండి, రేటింగ్ ఇవ్వండి'], body: ['Your rating helps good farmers get found.', 'మీ రేటింగ్ మంచి రైతులు అందరికీ తెలిసేలా చేస్తుంది.'] },
  ],
  features: [
    ['Wait for the next harvest when today’s is finished (pre-order)', 'నేటి కోత అయిపోతే తదుపరి కోత కోసం ముందే ఆర్డర్'],
    ['Follow your favourite farmers', 'మీకు నచ్చిన రైతులను ఫాలో చేయండి'],
    ['Save your address once', 'మీ చిరునామా ఒక్కసారి సేవ్ చేయండి'],
    ['Search in Telugu or English', 'తెలుగు లేదా ఇంగ్లీష్‌లో వెతకండి'],
    ['Order from several farmers in one checkout', 'ఒకే చెక్‌అవుట్‌లో పలువురు రైతుల నుండి ఆర్డర్'],
    ['A pickup code, so only you can collect your order', 'పికప్ కోడ్ — మీ ఆర్డర్ మీరు మాత్రమే తీసుకోగలరు'],
  ],
  terms: [
    ['Prices are set by each farmer.', 'ధరలు ప్రతి రైతు నిర్ణయిస్తారు.'],
    ['A small platform fee and any delivery charge are shown before you pay.', 'చిన్న ప్లాట్‌ఫామ్ ఫీజు, డెలివరీ ఛార్జ్ ఉంటే చెల్లించే ముందే చూపిస్తాం.'],
    ['If a farmer declines your order, an online payment is refunded automatically.', 'రైతు మీ ఆర్డర్ తిరస్కరిస్తే, ఆన్‌లైన్ చెల్లింపు ఆటోమేటిక్‌గా తిరిగి వస్తుంది.'],
    ['Cash payment is available only where the farmer accepts it.', 'రైతు అంగీకరించిన చోట మాత్రమే నగదు చెల్లింపు.'],
    ['The shop shows retail produce. Bulk (wholesale) lots are for aggregators.', 'షాప్‌లో చిల్లర ఉత్పత్తులు మాత్రమే. బల్క్ (హోల్‌సేల్) అగ్రిగేటర్ల కోసం.'],
  ],
  faqs: [
    { q: ['Do I need to download an app?', 'యాప్ డౌన్‌లోడ్ చేయాలా?'], a: ['No. It works in your browser. You can add it to your home screen in one tap if you like.', 'అవసరం లేదు. బ్రౌజర్‌లోనే పనిచేస్తుంది. కావాలంటే ఒక్క ట్యాప్‌తో హోమ్ స్క్రీన్‌కు చేర్చుకోవచ్చు.'] },
    { q: ['Is it really from the farmer?', 'నిజంగా రైతు నుండేనా?'], a: ['Yes. Every item names its farmer. When an aggregator sells it, the grower is named too.', 'అవును. ప్రతి వస్తువుపై రైతు పేరు ఉంటుంది. అగ్రిగేటర్ అమ్మినా, పండించినవారి పేరు కూడా ఉంటుంది.'] },
    { q: ['What if the farmer cannot fulfil my order?', 'రైతు నా ఆర్డర్ ఇవ్వలేకపోతే?'], a: ['They decline it, you are told on WhatsApp, and an online payment is refunded automatically.', 'వారు తిరస్కరిస్తారు, మీకు వాట్సాప్‌లో తెలుస్తుంది, ఆన్‌లైన్ చెల్లింపు ఆటోమేటిక్‌గా తిరిగి వస్తుంది.'] },
  ],
  ctas: [
    { href: '/consumer', label: ['Start shopping', 'కొనడం మొదలుపెట్టండి'], primary: true },
    { href: '/consumer/farmers', label: ['Meet the farmers', 'రైతులను కలవండి'] },
  ],
}

export const FARMER_CONTENT: RoleContent = {
  role: 'farmer',
  badge: ['Free for farmers, always', 'రైతులకు ఎప్పటికీ ఉచితం'],
  title: ['Sell your harvest, your way', 'మీ పంట, మీ పద్ధతిలో అమ్మండి'],
  intro: [
    'Sell retail to families near you, and in bulk to aggregators. No subscription, no listing fee — Go Grameen is here to help farmers earn more.',
    'దగ్గరి కుటుంబాలకు చిల్లరగా, అగ్రిగేటర్లకు బల్క్‌గా అమ్మండి. సబ్‌స్క్రిప్షన్ లేదు, లిస్టింగ్ ఫీజు లేదు — రైతులు ఎక్కువ సంపాదించడానికే గో గ్రామీణ్.',
  ],
  glance: [
    { value: ['₹0', '₹0'], label: ['subscription, ever', 'సబ్‌స్క్రిప్షన్, ఎప్పటికీ'] },
    { value: ['You', 'మీరే'], label: ['set the price', 'ధర నిర్ణయిస్తారు'] },
    { value: ['2 ways', '2 దారులు'], label: ['retail and bulk', 'చిల్లర, బల్క్'] },
  ],
  benefits: [
    { icon: 'rupee', title: ['No subscription, ever', 'ఎప్పటికీ సబ్‌స్క్రిప్షన్ లేదు'], body: ['Your account and your listings are free.', 'మీ ఖాతా, మీ లిస్టింగ్‌లు ఉచితం.'] },
    { icon: 'tag', title: ['You set the price', 'ధర మీరే నిర్ణయిస్తారు'], body: ['Retail price, bulk price and minimum quantity are your decision.', 'చిల్లర ధర, బల్క్ ధర, కనీస పరిమాణం మీ నిర్ణయమే.'] },
    { icon: 'scale', title: ['Two ways to sell', 'అమ్మడానికి రెండు దారులు'], body: ['Retail to families, and bulk only to aggregators — or both.', 'కుటుంబాలకు చిల్లర, అగ్రిగేటర్లకు మాత్రమే బల్క్ — లేదా రెండూ.'] },
    { icon: 'bell', title: ['Orders on your phone', 'ఆర్డర్లు మీ ఫోన్‌లోనే'], body: ['A WhatsApp message for every new order. Approve, pack, hand over.', 'ప్రతి కొత్త ఆర్డర్‌కు వాట్సాప్ సందేశం. ఆమోదించండి, ప్యాక్ చేయండి, అందించండి.'] },
    { icon: 'shield', title: ['Safe payments', 'సురక్షిత చెల్లింపులు'], body: ['Buyers pay online through Cashfree, or in cash at pickup.', 'కొనుగోలుదారులు క్యాష్‌ఫ్రీ ద్వారా ఆన్‌లైన్‌లో లేదా పికప్ వద్ద నగదుగా చెల్లిస్తారు.'] },
    { icon: 'receipt', title: ['A receipt for every order', 'ప్రతి ఆర్డర్‌కు రసీదు'], body: ['Download a PDF receipt for any order, any time.', 'ఏ ఆర్డర్‌కైనా ఎప్పుడైనా PDF రసీదు డౌన్‌లోడ్ చేసుకోండి.'] },
  ],
  steps: [
    { title: ['Create your free account', 'ఉచిత ఖాతా తెరవండి'], body: ['Your phone number and a password. That is all.', 'మీ ఫోన్ నంబర్, ఒక పాస్‌వర్డ్. అంతే.'] },
    { title: ['Add your produce', 'మీ ఉత్పత్తులు చేర్చండి'], body: ['Photos and price, then choose Retail, Wholesale (bulk) or Both.', 'ఫోటోలు, ధర, తర్వాత చిల్లర, హోల్‌సేల్ (బల్క్) లేదా రెండూ ఎంచుకోండి.'] },
    { title: ['Log each harvest', 'ప్రతి కోత నమోదు చేయండి'], body: ['Add the stock when you pick. Buyers see how fresh it is.', 'కోసినప్పుడు స్టాక్ చేర్చండి. ఎంత తాజాదో కొనుగోలుదారులు చూస్తారు.'] },
    { title: ['Get orders and get paid', 'ఆర్డర్లు పొందండి, డబ్బు పొందండి'], body: ['Approve the order, then hand it over at pickup or deliver it.', 'ఆర్డర్ ఆమోదించి, పికప్ వద్ద అందించండి లేదా డెలివరీ చేయండి.'] },
  ],
  features: [
    ['“Harvested 2 hours ago” clock on every listing', 'ప్రతి లిస్టింగ్‌పై “2 గంటల క్రితం కోసింది” గడియారం'],
    ['Share your whole catalogue as images on WhatsApp', 'మీ పూర్తి కేటలాగ్‌ను చిత్రాలుగా వాట్సాప్‌లో పంపండి'],
    ['Bulk listing hides itself when stock drops below your minimum — and you are told', 'స్టాక్ మీ కనీసం కంటే తగ్గితే బల్క్ లిస్టింగ్ దానంతటదే దాగుతుంది — మీకు తెలియజేస్తాం'],
    ['Search your orders and download an order report', 'మీ ఆర్డర్లు వెతకండి, ఆర్డర్ రిపోర్ట్ డౌన్‌లోడ్ చేయండి'],
    ['Pickup, your own delivery, or a Go Grameen rider', 'పికప్, మీ సొంత డెలివరీ, లేదా గో గ్రామీణ్ రైడర్'],
    ['The whole app in Telugu or English', 'యాప్ మొత్తం తెలుగు లేదా ఇంగ్లీష్‌లో'],
  ],
  terms: [
    ['No subscription and no listing fee for farmers.', 'రైతులకు సబ్‌స్క్రిప్షన్, లిస్టింగ్ ఫీజు లేవు.'],
    ['A small platform fee may be added to the buyer’s bill. It is not cut from your price.', 'కొనుగోలుదారు బిల్లుపై చిన్న ప్లాట్‌ఫామ్ ఫీజు ఉండవచ్చు. అది మీ ధర నుండి తీసివేయరు.'],
    ['Bulk (wholesale) listings are shown only to aggregators — never to household buyers.', 'బల్క్ (హోల్‌సేల్) లిస్టింగ్‌లు అగ్రిగేటర్లకు మాత్రమే కనిపిస్తాయి — సాధారణ కొనుగోలుదారులకు ఎప్పుడూ కాదు.'],
    ['If you decline an order, a platform-fee penalty may be deducted from your payout.', 'మీరు ఆర్డర్ తిరస్కరిస్తే, మీ చెల్లింపు నుండి ప్లాట్‌ఫామ్ ఫీజు జరిమానా తీసివేయవచ్చు.'],
    ['Keep your stock and prices up to date, so buyers can trust what they order.', 'కొనుగోలుదారులు నమ్మేలా మీ స్టాక్, ధరలు ఎప్పటికప్పుడు సరిచేయండి.'],
  ],
  faqs: [
    { q: ['Do I have to pay anything?', 'నేను ఏమైనా చెల్లించాలా?'], a: ['No. Farmers never pay a subscription or a listing fee.', 'లేదు. రైతులు సబ్‌స్క్రిప్షన్ లేదా లిస్టింగ్ ఫీజు ఎప్పుడూ చెల్లించరు.'] },
    { q: ['Who sees my bulk listings?', 'నా బల్క్ లిస్టింగ్‌లు ఎవరు చూస్తారు?'], a: ['Only aggregators. Families shopping on Go Grameen see only your retail produce.', 'అగ్రిగేటర్లు మాత్రమే. గో గ్రామీణ్‌లో కొనే కుటుంబాలు మీ చిల్లర ఉత్పత్తులు మాత్రమే చూస్తారు.'] },
    { q: ['Can I sell the same produce retail and bulk?', 'ఒకే ఉత్పత్తిని చిల్లరగా, బల్క్‌గా అమ్మవచ్చా?'], a: ['Yes — choose Both. Retail and bulk share the same stock, so you never sell more than you have.', 'అవును — రెండూ ఎంచుకోండి. చిల్లర, బల్క్ ఒకే స్టాక్ నుండి, కాబట్టి ఉన్నదానికంటే ఎక్కువ అమ్మరు.'] },
    { q: ['I am not good with phones. Can someone help?', 'నాకు ఫోన్ బాగా రాదు. ఎవరైనా సహాయం చేస్తారా?'], a: ['Yes. A Go Grameen moderator in your area can set up your account and add your produce for you.', 'అవును. మీ ప్రాంతంలోని గో గ్రామీణ్ మోడరేటర్ మీ ఖాతా తెరిచి, మీ ఉత్పత్తులు చేర్చగలరు.'] },
  ],
  ctas: [
    { href: '/farmer/signup', label: ['Create free farmer account', 'ఉచిత రైతు ఖాతా తెరవండి'], primary: true },
    { href: '/farmer/login', label: ['I already have an account', 'నాకు ఇప్పటికే ఖాతా ఉంది'] },
  ],
}

export const AGGREGATOR_CONTENT: RoleContent = {
  role: 'aggregator',
  badge: ['Plans for aggregators', 'అగ్రిగేటర్ల కోసం ప్లాన్లు'],
  title: ['Buy in bulk. Sell on Go Grameen.', 'బల్క్‌గా కొనండి. గో గ్రామీణ్‌లో అమ్మండి.'],
  intro: [
    'Buy bulk produce straight from farmers, and resell it on Go Grameen as retail, wholesale or both — with every grower named.',
    'రైతుల నుండి నేరుగా బల్క్‌గా కొని, గో గ్రామీణ్‌లో చిల్లర, హోల్‌సేల్ లేదా రెండుగా అమ్మండి — ప్రతి రైతు పేరుతో.',
  ],
  glance: [
    { value: ['3 plans', '3 ప్లాన్లు'], label: ['Buying, Selling, Combined', 'కొనుగోలు, అమ్మకం, కలిపినది'] },
    { value: ['0%', '0%'], label: ['platform fee on bulk orders', 'బల్క్ ఆర్డర్లపై ప్లాట్‌ఫామ్ ఫీజు'] },
    { value: ['Direct', 'నేరుగా'], label: ['from farmers and other aggregators', 'రైతులు, ఇతర అగ్రిగేటర్ల నుండి'] },
  ],
  benefits: [
    { icon: 'box', title: ['Buying plan', 'కొనుగోలు ప్లాన్'], body: ['See all bulk listings from farmers and other aggregators, and buy direct.', 'రైతులు, ఇతర అగ్రిగేటర్ల బల్క్ లిస్టింగ్‌లు అన్నీ చూసి నేరుగా కొనండి.'] },
    { icon: 'store', title: ['Selling plan', 'అమ్మకం ప్లాన్'], body: ['List your produce on Go Grameen — retail, wholesale or both.', 'మీ ఉత్పత్తులను గో గ్రామీణ్‌లో అమ్మండి — చిల్లర, హోల్‌సేల్ లేదా రెండూ.'] },
    { icon: 'handshake', title: ['Combined plan', 'కలిపిన ప్లాన్'], body: ['Buying and selling together, in one plan.', 'కొనుగోలు, అమ్మకం రెండూ ఒకే ప్లాన్‌లో.'] },
    { icon: 'sprout', title: ['Growers named', 'పండించినవారి పేరు'], body: ['Buyers see “Grown by” the real farmer on every item you sell.', 'మీరు అమ్మే ప్రతి వస్తువుపై అసలు రైతు పేరు కనిపిస్తుంది.'] },
    { icon: 'rupee', title: ['0% platform fee on bulk', 'బల్క్‌పై 0% ప్లాట్‌ఫామ్ ఫీజు'], body: ['No commission on bulk orders for now.', 'ప్రస్తుతానికి బల్క్ ఆర్డర్లపై కమీషన్ లేదు.'] },
    { icon: 'cart', title: ['Shop as a consumer too', 'వినియోగదారుగా కూడా కొనండి'], body: ['Buy everyday retail produce like any family.', 'ఏ కుటుంబంలాగానైనా రోజువారీ చిల్లర ఉత్పత్తులు కొనండి.'] },
  ],
  steps: [
    { title: ['Create your aggregator account', 'అగ్రిగేటర్ ఖాతా తెరవండి'], body: ['Your phone number and a password.', 'మీ ఫోన్ నంబర్, ఒక పాస్‌వర్డ్.'] },
    { title: ['Pick a plan and pay online', 'ప్లాన్ ఎంచుకుని ఆన్‌లైన్‌లో చెల్లించండి'], body: ['Buying, Selling or Combined. It starts as soon as it is paid — a ₹0 plan needs no payment. You get a receipt.', 'కొనుగోలు, అమ్మకం లేదా కలిపినది. చెల్లించగానే మొదలవుతుంది — ₹0 ప్లాన్‌కు చెల్లింపు అవసరం లేదు. మీకు రసీదు వస్తుంది.'] },
    { title: ['Browse the bulk market', 'బల్క్ మార్కెట్ చూడండి'], body: ['See every bulk lot with the seller’s name, village and district — even before you subscribe.', 'అమ్మకందారు పేరు, గ్రామం, జిల్లాతో ప్రతి బల్క్ లాట్ చూడండి — సబ్‌స్క్రైబ్ చేయకముందే.'] },
    { title: ['Contact sellers directly', 'అమ్మకందారులను నేరుగా సంప్రదించండి'], body: ['With a Buying plan, phone numbers, WhatsApp and addresses unlock.', 'బయింగ్ ప్లాన్‌తో ఫోన్ నంబర్లు, వాట్సాప్, చిరునామాలు కనిపిస్తాయి.'] },
    { title: ['Order and pay in the app', 'యాప్‌లోనే ఆర్డర్ చేసి చెల్లించండి'], body: ['Choose pickup or the seller’s delivery — the transport charge shows before you pay. Pay online through Cashfree; if the seller declines, your money comes back automatically.', 'పికప్ లేదా అమ్మకందారు డెలివరీ ఎంచుకోండి — చెల్లించే ముందే రవాణా ఛార్జ్ కనిపిస్తుంది. క్యాష్‌ఫ్రీ ద్వారా ఆన్‌లైన్‌లో చెల్లించండి; అమ్మకందారు తిరస్కరిస్తే మీ డబ్బు ఆటోమేటిక్‌గా తిరిగి వస్తుంది.'] },
    { title: ['Resell on Go Grameen', 'గో గ్రామీణ్‌లో మళ్లీ అమ్మండి'], body: ['List as retail, wholesale or both, naming the farmer who grew it.', 'పండించిన రైతు పేరుతో చిల్లర, హోల్‌సేల్ లేదా రెండుగా అమ్మండి.'] },
  ],
  terms: [
    ['Buying and Selling are separate plans; the Combined plan covers both.', 'కొనుగోలు, అమ్మకం వేర్వేరు ప్లాన్లు; కలిపిన ప్లాన్ రెండింటికీ వర్తిస్తుంది.'],
    ['Your plan starts as soon as it is paid. There are no refunds or part payments.', 'చెల్లించిన వెంటనే ప్లాన్ మొదలవుతుంది. రీఫండ్‌లు, పాక్షిక చెల్లింపులు లేవు.'],
    ['Changing plan: the new one starts when the current one ends — or pay the full price to start it now.', 'ప్లాన్ మార్చాలంటే: ప్రస్తుత ప్లాన్ ముగిసాక కొత్తది మొదలవుతుంది — లేదా పూర్తి ధర చెల్లించి ఇప్పుడే మొదలుపెట్టండి.'],
    ['We remind you on WhatsApp 3 days before a plan ends. Nothing is charged automatically.', 'ప్లాన్ ముగియడానికి 3 రోజుల ముందు వాట్సాప్‌లో గుర్తుచేస్తాం. ఆటోమేటిక్‌గా ఏమీ వసూలు చేయం.'],
    ['When a plan ends, your listings stay visible for 10 days while we contact you, then they may be hidden.', 'ప్లాన్ ముగిసాక, మేము మిమ్మల్ని సంప్రదించే వరకు 10 రోజులు మీ లిస్టింగ్‌లు కనిపిస్తాయి, తర్వాత దాచవచ్చు.'],
    ['Farmer phone numbers and exact addresses are shown only to subscribed aggregators.', 'రైతుల ఫోన్ నంబర్లు, పూర్తి చిరునామాలు సబ్‌స్క్రైబ్ చేసిన అగ్రిగేటర్లకు మాత్రమే.'],
    ['Bulk orders are paid online through Cashfree — no cash on delivery.', 'బల్క్ ఆర్డర్లు క్యాష్‌ఫ్రీ ద్వారా ఆన్‌లైన్‌లో మాత్రమే — క్యాష్ ఆన్ డెలివరీ లేదు.'],
    ['Household buyers never see bulk listings.', 'సాధారణ కొనుగోలుదారులకు బల్క్ లిస్టింగ్‌లు ఎప్పుడూ కనిపించవు.'],
  ],
  faqs: [
    { q: ['Can I see the bulk produce before I pay?', 'చెల్లించే ముందు బల్క్ ఉత్పత్తులు చూడవచ్చా?'], a: ['Yes. You see every bulk listing with the farmer’s name, village and district. Ordering and the farmer’s phone number unlock after you subscribe.', 'అవును. రైతు పేరు, గ్రామం, జిల్లాతో ప్రతి బల్క్ లిస్టింగ్ చూడవచ్చు. సబ్‌స్క్రైబ్ చేసాక ఆర్డర్ చేయడం, రైతు ఫోన్ నంబర్ వస్తాయి.'] },
    { q: ['Can I buy from other aggregators?', 'ఇతర అగ్రిగేటర్ల నుండి కొనవచ్చా?'], a: ['Yes. With a Buying plan you can buy bulk from farmers and from other aggregators.', 'అవును. కొనుగోలు ప్లాన్‌తో రైతులు, ఇతర అగ్రిగేటర్ల నుండి బల్క్‌గా కొనవచ్చు.'] },
    { q: ['Can I also shop as a normal buyer?', 'సాధారణ కొనుగోలుదారుగా కూడా కొనవచ్చా?'], a: ['Yes. Open the shop and log in with your phone number as a consumer.', 'అవును. షాప్ తెరిచి మీ ఫోన్ నంబర్‌తో వినియోగదారుగా లాగిన్ అవ్వండి.'] },
  ],
  ctas: [
    { href: '/aggregator/signup', label: ['Create aggregator account', 'అగ్రిగేటర్ ఖాతా తెరవండి'], primary: true },
    { href: '/aggregator/login', label: ['I already have an account', 'నాకు ఇప్పటికే ఖాతా ఉంది'] },
  ],
}

/** What each plan unlocks — the comparison table on /home/aggregator. */
export const PLAN_COMPARE: Array<{ label: Pair; buying: boolean; selling: boolean; combined: boolean }> = [
  { label: ['Buy bulk from farmers and aggregators', 'రైతులు, అగ్రిగేటర్ల నుండి బల్క్ కొనుగోలు'], buying: true, selling: false, combined: true },
  { label: ['Farmer phone numbers and addresses', 'రైతుల ఫోన్ నంబర్లు, చిరునామాలు'], buying: true, selling: false, combined: true },
  { label: ['Sell retail, wholesale or both', 'చిల్లర, హోల్‌సేల్ లేదా రెండూ అమ్మకం'], buying: false, selling: true, combined: true },
  { label: ['Your growers named on every listing', 'ప్రతి లిస్టింగ్‌పై మీ రైతుల పేర్లు'], buying: false, selling: true, combined: true },
  { label: ['Receipt for every payment', 'ప్రతి చెల్లింపుకు రసీదు'], buying: true, selling: true, combined: true },
]
