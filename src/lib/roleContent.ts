
/* The words on /home/farmer and /home/aggregator (model agreed 2026-11-04).
 *
 * Every line must be TRUE of the app today, or say plainly that it is coming:
 * a page that promises a button that does not exist costs more trust than it
 * wins. Steps that are not built yet carry `soon: true`. When the bulk market
 * and online subscription go live (Phases 4–6), drop those flags and the note.
 * tests/lib/roleContent.test.ts checks every line has Telugu and every link
 * goes to a real page. */

export type Pair = [string, string]
export type Item = { icon: string; title: Pair; body: Pair }
export type Step = { title: Pair; body: Pair; soon?: boolean }
export type Cta = { href: string; label: Pair; primary?: boolean }

export type RoleContent = {
  badge: Pair
  title: Pair
  intro: Pair
  benefits: Item[]
  steps: Step[]
  features?: Pair[]
  terms: Pair[]
  faqs: { q: Pair; a: Pair }[]
  ctas: Cta[]
  /** Small print under the steps (e.g. what is still opening soon). */
  stepsNote?: Pair
}

export const FARMER_CONTENT: RoleContent = {
  badge: ['Free for farmers, always', 'రైతులకు ఎప్పటికీ ఉచితం'],
  title: ['Sell your harvest, your way', 'మీ పంట, మీ పద్ధతిలో అమ్మండి'],
  intro: [
    'Sell retail to families near you, and in bulk to aggregators. No subscription, no listing fee — Go Grameen is here to help farmers earn more.',
    'దగ్గరి కుటుంబాలకు చిల్లరగా, అగ్రిగేటర్లకు బల్క్‌గా అమ్మండి. సబ్‌స్క్రిప్షన్ లేదు, లిస్టింగ్ ఫీజు లేదు — రైతులు ఎక్కువ సంపాదించడానికే గో గ్రామీణ్.',
  ],
  benefits: [
    { icon: '💸', title: ['No subscription, ever', 'ఎప్పటికీ సబ్‌స్క్రిప్షన్ లేదు'], body: ['Your account and your listings are free.', 'మీ ఖాతా, మీ లిస్టింగ్‌లు ఉచితం.'] },
    { icon: '🏷️', title: ['You set the price', 'ధర మీరే నిర్ణయిస్తారు'], body: ['Retail price, bulk price and minimum quantity are your decision.', 'చిల్లర ధర, బల్క్ ధర, కనీస పరిమాణం మీ నిర్ణయమే.'] },
    { icon: '🛒', title: ['Two ways to sell', 'అమ్మడానికి రెండు దారులు'], body: ['Retail to families, and bulk only to aggregators — or both.', 'కుటుంబాలకు చిల్లర, అగ్రిగేటర్లకు మాత్రమే బల్క్ — లేదా రెండూ.'] },
    { icon: '📲', title: ['Orders on your phone', 'ఆర్డర్లు మీ ఫోన్‌లోనే'], body: ['A WhatsApp message for every new order. Approve, pack, hand over.', 'ప్రతి కొత్త ఆర్డర్‌కు వాట్సాప్ సందేశం. ఆమోదించండి, ప్యాక్ చేయండి, అందించండి.'] },
    { icon: '🔒', title: ['Safe payments', 'సురక్షిత చెల్లింపులు'], body: ['Buyers pay online through Cashfree, or in cash at pickup.', 'కొనుగోలుదారులు క్యాష్‌ఫ్రీ ద్వారా ఆన్‌లైన్‌లో లేదా పికప్ వద్ద నగదుగా చెల్లిస్తారు.'] },
    { icon: '🧾', title: ['A receipt for every order', 'ప్రతి ఆర్డర్‌కు రసీదు'], body: ['Download a PDF receipt for any order, any time.', 'ఏ ఆర్డర్‌కైనా ఎప్పుడైనా PDF రసీదు డౌన్‌లోడ్ చేసుకోండి.'] },
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
  badge: ['Plans for aggregators', 'అగ్రిగేటర్ల కోసం ప్లాన్లు'],
  title: ['Buy in bulk. Sell on Go Grameen.', 'బల్క్‌గా కొనండి. గో గ్రామీణ్‌లో అమ్మండి.'],
  intro: [
    'Buy bulk produce straight from farmers, and resell it on Go Grameen as retail, wholesale or both — with every grower named.',
    'రైతుల నుండి నేరుగా బల్క్‌గా కొని, గో గ్రామీణ్‌లో చిల్లర, హోల్‌సేల్ లేదా రెండుగా అమ్మండి — ప్రతి రైతు పేరుతో.',
  ],
  benefits: [
    { icon: '📦', title: ['Buying plan', 'కొనుగోలు ప్లాన్'], body: ['See all bulk listings from farmers and other aggregators, and buy direct.', 'రైతులు, ఇతర అగ్రిగేటర్ల బల్క్ లిస్టింగ్‌లు అన్నీ చూసి నేరుగా కొనండి.'] },
    { icon: '🏪', title: ['Selling plan', 'అమ్మకం ప్లాన్'], body: ['List your produce on Go Grameen — retail, wholesale or both.', 'మీ ఉత్పత్తులను గో గ్రామీణ్‌లో అమ్మండి — చిల్లర, హోల్‌సేల్ లేదా రెండూ.'] },
    { icon: '🤝', title: ['Combined plan', 'కలిపిన ప్లాన్'], body: ['Buying and selling together, in one plan.', 'కొనుగోలు, అమ్మకం రెండూ ఒకే ప్లాన్‌లో.'] },
    { icon: '🧑‍🌾', title: ['Growers named', 'పండించినవారి పేరు'], body: ['Buyers see “Grown by” the real farmer on every item you sell.', 'మీరు అమ్మే ప్రతి వస్తువుపై అసలు రైతు పేరు కనిపిస్తుంది.'] },
    { icon: '0️⃣', title: ['0% platform fee on bulk', 'బల్క్‌పై 0% ప్లాట్‌ఫామ్ ఫీజు'], body: ['No commission on bulk orders for now.', 'ప్రస్తుతానికి బల్క్ ఆర్డర్లపై కమీషన్ లేదు.'] },
    { icon: '🛒', title: ['Shop as a consumer too', 'వినియోగదారుగా కూడా కొనండి'], body: ['Buy everyday retail produce like any family.', 'ఏ కుటుంబంలాగానైనా రోజువారీ చిల్లర ఉత్పత్తులు కొనండి.'] },
  ],
  steps: [
    { title: ['Create your aggregator account', 'అగ్రిగేటర్ ఖాతా తెరవండి'], body: ['Your phone number and a password.', 'మీ ఫోన్ నంబర్, ఒక పాస్‌వర్డ్.'] },
    { title: ['Look around before you pay', 'చెల్లించే ముందు చూడండి'], body: ['See bulk produce with the farmer’s name, village and district.', 'రైతు పేరు, గ్రామం, జిల్లాతో బల్క్ ఉత్పత్తులు చూడండి.'], soon: true },
    { title: ['Pick a plan', 'ప్లాన్ ఎంచుకోండి'], body: ['Buying, Selling or Combined. Paying unlocks it straight away — a ₹0 plan needs no payment.', 'కొనుగోలు, అమ్మకం లేదా కలిపినది. చెల్లించగానే మొదలవుతుంది — ₹0 ప్లాన్‌కు చెల్లింపు అవసరం లేదు.'], soon: true },
    { title: ['Buy direct from farmers', 'రైతుల నుండి నేరుగా కొనండి'], body: ['Farmer phone numbers unlock. Pay online; the transport charge shows at checkout.', 'రైతుల ఫోన్ నంబర్లు కనిపిస్తాయి. ఆన్‌లైన్‌లో చెల్లించండి; రవాణా ఛార్జ్ చెక్‌అవుట్‌లో కనిపిస్తుంది.'], soon: true },
    { title: ['Resell on Go Grameen', 'గో గ్రామీణ్‌లో మళ్లీ అమ్మండి'], body: ['List as retail, wholesale or both, naming the farmer who grew it.', 'పండించిన రైతు పేరుతో చిల్లర, హోల్‌సేల్ లేదా రెండుగా అమ్మండి.'] },
  ],
  stepsNote: [
    'The bulk market and online subscription are opening soon. Until then, a Go Grameen moderator can activate your plan for you.',
    'బల్క్ మార్కెట్, ఆన్‌లైన్ సబ్‌స్క్రిప్షన్ త్వరలో మొదలవుతాయి. అప్పటివరకు గో గ్రామీణ్ మోడరేటర్ మీ ప్లాన్‌ను ప్రారంభించగలరు.',
  ],
  terms: [
    ['Buying and Selling are separate plans; the Combined plan covers both.', 'కొనుగోలు, అమ్మకం వేర్వేరు ప్లాన్లు; కలిపిన ప్లాన్ రెండింటికీ వర్తిస్తుంది.'],
    ['Your plan starts as soon as it is paid. There are no refunds or part payments.', 'చెల్లించిన వెంటనే ప్లాన్ మొదలవుతుంది. రీఫండ్‌లు, పాక్షిక చెల్లింపులు లేవు.'],
    ['Changing plan: the new one starts when the current one ends — or pay the full price to start it now.', 'ప్లాన్ మార్చాలంటే: ప్రస్తుత ప్లాన్ ముగిసాక కొత్తది మొదలవుతుంది — లేదా పూర్తి ధర చెల్లించి ఇప్పుడే మొదలుపెట్టండి.'],
    ['When a plan ends, your listings stay visible for 10 days while we contact you, then they may be hidden.', 'ప్లాన్ ముగిసాక, మేము మిమ్మల్ని సంప్రదించే వరకు 10 రోజులు మీ లిస్టింగ్‌లు కనిపిస్తాయి, తర్వాత దాచవచ్చు.'],
    ['Farmer phone numbers and exact addresses are shown only to subscribed aggregators.', 'రైతుల ఫోన్ నంబర్లు, పూర్తి చిరునామాలు సబ్‌స్క్రైబ్ చేసిన అగ్రిగేటర్లకు మాత్రమే.'],
    ['Bulk orders are paid online through Cashfree — no cash on delivery.', 'బల్క్ ఆర్డర్లు క్యాష్‌ఫ్రీ ద్వారా ఆన్‌లైన్‌లో మాత్రమే — క్యాష్ ఆన్ డెలివరీ లేదు.'],
    ['Household buyers never see bulk listings.', 'సాధారణ కొనుగోలుదారులకు బల్క్ లిస్టింగ్‌లు ఎప్పుడూ కనిపించవు.'],
  ],
  faqs: [
    { q: ['Can I see the bulk produce before I pay?', 'చెల్లించే ముందు బల్క్ ఉత్పత్తులు చూడవచ్చా?'], a: ['Yes. You see every bulk listing with the farmer’s name, village and district. Ordering and the farmer’s phone number unlock after you subscribe.', 'అవును. రైతు పేరు, గ్రామం, జిల్లాతో ప్రతి బల్క్ లిస్టింగ్ చూడవచ్చు. సబ్‌స్క్రైబ్ చేసాక ఆర్డర్ చేయడం, రైతు ఫోన్ నంబర్ వస్తాయి.'] },
    { q: ['Is there a free plan?', 'ఉచిత ప్లాన్ ఉందా?'], a: ['When one is offered it shows above at ₹0, and you can start it without paying.', 'ఉంటే అది పైన ₹0గా కనిపిస్తుంది, చెల్లించకుండానే మొదలుపెట్టవచ్చు.'] },
    { q: ['Can I buy from other aggregators?', 'ఇతర అగ్రిగేటర్ల నుండి కొనవచ్చా?'], a: ['Yes. With a Buying plan you can buy bulk from farmers and from other aggregators.', 'అవును. కొనుగోలు ప్లాన్‌తో రైతులు, ఇతర అగ్రిగేటర్ల నుండి బల్క్‌గా కొనవచ్చు.'] },
    { q: ['Can I also shop as a normal buyer?', 'సాధారణ కొనుగోలుదారుగా కూడా కొనవచ్చా?'], a: ['Yes. Open the shop and log in with your phone number as a consumer.', 'అవును. షాప్ తెరిచి మీ ఫోన్ నంబర్‌తో వినియోగదారుగా లాగిన్ అవ్వండి.'] },
  ],
  ctas: [
    { href: '/aggregator/signup', label: ['Create aggregator account', 'అగ్రిగేటర్ ఖాతా తెరవండి'], primary: true },
    { href: '/aggregator/login', label: ['I already have an account', 'నాకు ఇప్పటికే ఖాతా ఉంది'] },
  ],
}
