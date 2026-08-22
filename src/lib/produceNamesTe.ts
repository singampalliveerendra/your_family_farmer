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
}

/** Look up the Telugu name for an English produce name (case-insensitive). */
export function produceNameToTe(name: string): string | null {
  return PRODUCE_NAME_TE[name.trim().toLowerCase()] ?? null
}
