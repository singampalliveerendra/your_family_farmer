/**
 * Fallback English → తెలుగు dictionary for produce / crop names.
 *
 * Names are ideally stored bilingually as "English / తెలుగు" (see localizeName),
 * but a lot of existing rows were entered in English only. This map lets the
 * consumer UI still show Telugu for common crops when the Telugu toggle is on.
 * Keys are lower-cased and trimmed; matching is case-insensitive.
 *
 * Not exhaustive — unknown names fall back to the English text unchanged.
 */
export const PRODUCE_NAME_TE: Record<string, string> = {
  // Spices / powders
  'turmeric': 'పసుపు',
  'turmeric powder': 'పసుపు పొడి',
  'chilli': 'మిరప',
  'chilli powder': 'మిరప పొడి',
  'red chilli': 'ఎండు మిరప',
  'green chilli': 'పచ్చిమిర్చి',
  'ginger': 'అల్లం',
  'garlic': 'వెల్లుల్లి',
  'coriander': 'కొత్తిమీర',
  'mint': 'పుదీన',
  'curry leaf': 'కరివేపాకు',
  'curry leaves': 'కరివేపాకు',

  // Fruits
  'papaya': 'బొప్పాయి',
  'banana': 'అరటిపండు',
  'mango': 'మామిడి',
  'strawberry': 'స్ట్రాబెర్రీ',
  'guava': 'జామ',
  'lemon': 'నిమ్మ',
  'orange': 'నారింజ',
  'watermelon': 'పుచ్చకాయ',
  'sapota': 'సపోటా',
  'pomegranate': 'దానిమ్మ',
  'grapes': 'ద్రాక్ష',
  'coconut': 'కొబ్బరి',

  // Vegetables
  'tomato': 'టమాటా',
  'onion': 'ఉల్లిపాయ',
  'potato': 'బంగాళాదుంప',
  'brinjal': 'వంకాయ',
  'okra': 'బెండకాయ',
  'lady finger': 'బెండకాయ',
  'carrot': 'క్యారెట్',
  'beetroot': 'బీట్‌రూట్',
  'cabbage': 'క్యాబేజీ',
  'cauliflower': 'కాలీఫ్లవర్',
  'cucumber': 'దోసకాయ',
  'pumpkin': 'గుమ్మడికాయ',
  'bottle gourd': 'సొరకాయ',
  'bitter gourd': 'కాకరకాయ',
  'ridge gourd': 'బీరకాయ',
  'snake gourd': 'పొట్లకాయ',
  'drumstick': 'మునగకాయ',
  'beans': 'చిక్కుడు',
  'cluster beans': 'గోరు చిక్కుడు',
  'peas': 'బఠానీలు',

  // Greens
  'green leaf': 'ఆకుకూర',
  'greens': 'ఆకుకూరలు',
  'spinach': 'పాలకూర',
  'amaranth': 'తోటకూర',

  // Grains / pulses / staples
  'rice': 'బియ్యం',
  'wheat': 'గోధుమ',
  'green gram': 'పెసలు',
  'black gram': 'మినుములు',
  'red gram': 'కందిపప్పు',
  'groundnut': 'వేరుశనగ',
  'peanut': 'వేరుశనగ',
  'millet': 'చిరుధాన్యం',
  'millets': 'చిరుధాన్యాలు',

  // Other farm produce
  'jaggery': 'బెల్లం',
  'honey': 'తేనె',
  'milk': 'పాలు',
  'egg': 'గుడ్డు',
  'eggs': 'గుడ్లు',
  'ghee': 'నెయ్యి',

  // Spices / seeds
  'pepper': 'మిరియాలు',
  'black pepper': 'మిరియాలు',
  'coriander seed': 'ధనియాలు',
  'cumin': 'జీలకర్ర',
  'mustard': 'ఆవాలు',
  'fenugreek': 'మెంతులు',
  'fenugreek seed': 'మెంతులు',
  'sesame': 'నువ్వులు',
  'cardamom': 'యాలకులు',
  'clove': 'లవంగాలు',
  'cinnamon': 'దాల్చిన చెక్క',
  'fennel': 'సోంపు',
  'asafoetida': 'ఇంగువ',
  'nutmeg': 'జాజికాయ',
  'tamarind': 'చింతపండు',

  // More fruits
  'sweet lime': 'బత్తాయి',
  'mosambi': 'బత్తాయి',
  'lime': 'నిమ్మ',
  'muskmelon': 'ఖర్బూజా',
  'pineapple': 'అనాసపండు',
  'jackfruit': 'పనసకాయ',
  'custard apple': 'సీతాఫలం',
  'apple': 'ఆపిల్',
  'fig': 'అంజీర',
  'cashew': 'జీడిపప్పు',
  'sugarcane': 'చెరకు',
  'tender coconut': 'కొబ్బరి బొండాం',
  'raw banana': 'అరటికాయ',

  // More vegetables
  'capsicum': 'క్యాప్సికం',
  'bell pepper': 'క్యాప్సికం',
  'eggplant': 'వంకాయ',
  'radish': 'ముల్లంగి',
  'ivy gourd': 'దొండకాయ',
  'tindora': 'దొండకాయ',
  'ash gourd': 'బూడిద గుమ్మడికాయ',
  'sweet potato': 'చిలగడదుంప',
  'colocasia': 'చామదుంప',
  'taro': 'చామదుంప',
  'yam': 'కంద',
  'tapioca': 'కర్రపెండలం',
  'spring onion': 'ఉల్లికాడ',
  'cowpea': 'బొబ్బర్లు',

  // More greens
  'sorrel': 'గోంగూర',
  'gongura': 'గోంగూర',
  'methi': 'మెంతికూర',
  'fenugreek leaves': 'మెంతికూర',
  'palak': 'పాలకూర',
  'moringa': 'మునగాకు',
  'drumstick leaves': 'మునగాకు',
  'dill': 'సోంపు ఆకు',
  'betel leaf': 'తమలపాకు',
  'lemongrass': 'నిమ్మగడ్డి',

  // More grains / pulses
  'maize': 'మొక్కజొన్న',
  'corn': 'మొక్కజొన్న',
  'jowar': 'జొన్న',
  'bajra': 'సజ్జలు',
  'ragi': 'రాగులు',
  'toor': 'కందిపప్పు',
  'toor dal': 'కందిపప్పు',
  'moong': 'పెసలు',
  'urad': 'మినుములు',
  'chana': 'శనగలు',
  'chickpea': 'శనగలు',
  'horse gram': 'ఉలవలు',
  'black eyed pea': 'అలసందలు',
  'dal': 'పప్పు',
  'lentil': 'పప్పు',
  'pulses': 'పప్పుధాన్యాలు',

  // More dairy
  'curd': 'పెరుగు',
  'butter': 'వెన్న',
  'buttermilk': 'మజ్జిగ',
  'paneer': 'పన్నీర్',

  // ── Telugu names written in Latin script ─────────────────────────────
  // What farmers actually type into the produce form. "Pasupu", "Pesalu" and
  // "Boppayi" are Telugu words spelled in English letters, so neither the
  // English keys above nor a Telugu-script lookup matches them — the card just
  // showed them untranslated. Spelling is not standardised, so common variants
  // are listed rather than guessed at.

  // Vegetables
  'tamata': 'టమాటా',
  'tamota': 'టమాటా',
  'vankaya': 'వంకాయ',
  'bendakaya': 'బెండకాయ',
  'sorakaya': 'సొరకాయ',
  'beerakaya': 'బీరకాయ',
  'kakarakaya': 'కాకరకాయ',
  'potlakaya': 'పొట్లకాయ',
  'dondakaya': 'దొండకాయ',
  'munagakaya': 'మునగకాయ',
  'gummadikaya': 'గుమ్మడికాయ',
  'dosakaya': 'దోసకాయ',
  'ullipaya': 'ఉల్లిపాయ',
  'ulligadda': 'ఉల్లిగడ్డ',
  'bangaladumpa': 'బంగాళాదుంప',
  'chikkudu': 'చిక్కుడు',
  'goru chikkudu': 'గోరు చిక్కుడు',
  'mullangi': 'ముల్లంగి',
  'chilagadadumpa': 'చిలగడదుంప',
  'chamadumpa': 'చామదుంప',
  'kanda': 'కంద',
  'mirapakaya': 'మిరపకాయ',
  'pachimirchi': 'పచ్చిమిర్చి',
  'pachi mirapakaya': 'పచ్చిమిరపకాయ',

  // Greens
  'palakura': 'పాలకూర',
  'thotakura': 'తోటకూర',
  'menthikura': 'మెంతికూర',
  'chukkakura': 'చుక్కకూర',
  'bachalikura': 'బచ్చలికూర',
  'karivepaku': 'కరివేపాకు',
  'kothimeera': 'కొత్తిమీర',
  'pudina': 'పుదీన',

  // Fruits
  'boppayi': 'బొప్పాయి',
  'aratipandu': 'అరటిపండు',
  'aratikaya': 'అరటికాయ',
  'mamidi': 'మామిడి',
  'jama': 'జామ',
  'nimma': 'నిమ్మ',
  'danimma': 'దానిమ్మ',
  'kobbari': 'కొబ్బరి',
  'puchakaya': 'పుచ్చకాయ',
  'battayi': 'బత్తాయి',
  'batayi': 'బత్తాయి',
  'sitaphalam': 'సీతాఫలం',
  'panasa': 'పనస',
  'draksha': 'ద్రాక్ష',

  // Grains / pulses
  'biyyam': 'బియ్యం',
  'pesalu': 'పెసలు',
  'minumulu': 'మినుములు',
  'kandulu': 'కందులు',
  'kandi pappu': 'కందిపప్పు',
  'senagalu': 'శనగలు',
  'verusenaga': 'వేరుశనగ',
  'palli': 'పల్లీలు',
  'nuvvulu': 'నువ్వులు',
  'godhuma': 'గోధుమ',
  'jonna': 'జొన్న',
  'jonnalu': 'జొన్నలు',
  'sajjalu': 'సజ్జలు',
  'ragulu': 'రాగులు',
  'mokkajonna': 'మొక్కజొన్న',
  'ulavalu': 'ఉలవలు',
  'bobbarlu': 'బొబ్బర్లు',
  'alasandalu': 'అలసందలు',

  // Spices
  'pasupu': 'పసుపు',
  'miriyalu': 'మిరియాలు',
  'jeelakarra': 'జీలకర్ర',
  'dhaniyalu': 'ధనియాలు',
  'aavalu': 'ఆవాలు',
  'menthulu': 'మెంతులు',
  'yaalakulu': 'యాలకులు',
  'chintapandu': 'చింతపండు',
  'vamu': 'వాము',
  'allam': 'అల్లం',
  'vellulli': 'వెల్లుల్లి',

  // Dairy / other
  'neyyi': 'నెయ్యి',
  'aavu neyyi': 'ఆవు నెయ్యి',
  'cow ghee': 'ఆవు నెయ్యి',
  'paalu': 'పాలు',
  'perugu': 'పెరుగు',
  'majjiga': 'మజ్జిగ',
  'venna': 'వెన్న',
  'bellam': 'బెల్లం',
  'tene': 'తేనె',
  'gudlu': 'గుడ్లు',
}

/** Look up the Telugu name for an English produce name (case-insensitive). */
export function produceNameToTe(name: string): string | null {
  return PRODUCE_NAME_TE[name.trim().toLowerCase()] ?? null
}
