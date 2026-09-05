package com.gogrameen.app.catalogue

import com.gogrameen.app.Lang

/* Produce names and units in the active language.
 *
 * A port of src/lib/localizeName.ts, rule for rule. It is ported rather than
 * simplified because the names in the database are not tidy: a farmer types
 * "Aavu Neyyi - Cow ghee" or "Pasupu - Turmeric" — the same product written
 * twice, once in each language — and a Telugu reader shown that raw string
 * reads the English half for no reason.
 *
 * The dictionary itself lives in the generated ProduceNamesTe.kt. */

/** Look up a crop name, case-insensitively. Null when the dictionary has none. */
private fun produceNameToTe(name: String): String? = PRODUCE_NAME_TE[name.trim().lowercase()]

/**
 * The produce name to show.
 *
 * Three cases, in the order the web tries them:
 *
 *  1. "English / తెలుగు" — the intended storage form. Take the matching side.
 *  2. A name the dictionary knows outright ("Turmeric" -> "పసుపు").
 *  3. "Aavu Neyyi - Cow ghee" — segments, each looked up separately.
 *
 * A name where nothing resolves comes back exactly as the farmer wrote it.
 * Half-guessing a product name is worse than leaving it alone, so an unknown
 * qualifier survives: "Tomato - Country" becomes "టమాటా - Country", never the
 * bare "టమాటా".
 */
fun localizeName(value: String?, lang: Lang): String {
    if (value.isNullOrBlank()) return ""

    val sepIdx = value.indexOf('/')
    if (sepIdx != -1) {
        val en = value.substring(0, sepIdx).trim()
        val te = value.substring(sepIdx + 1).trim()
        return if (lang == Lang.TE) te.ifEmpty { en } else en.ifEmpty { te }
    }

    val trimmed = value.trim()
    if (lang != Lang.TE) return trimmed
    return produceNameToTe(trimmed) ?: localizeSegments(trimmed)
}

/* The " - " form. Every segment is looked up; if not one of them resolved the
 * original is returned untouched, so a name that merely contains a dash is not
 * quietly rewritten. Neighbours that came out identical are collapsed — both
 * halves of "Aavu Neyyi - Cow ghee" map to ఆవు నెయ్యి, and printing it twice
 * would read as a bug. */
private fun localizeSegments(name: String): String {
    if (!name.contains(" - ")) return name
    val parts = name.split(" - ").map { it.trim() }.filter { it.isNotEmpty() }
    if (parts.size < 2) return name

    val mapped = parts.map { produceNameToTe(it) ?: it }
    if (mapped == parts) return name

    return mapped.filterIndexed { i, m -> i == 0 || m != mapped[i - 1] }.joinToString(" - ")
}

/* Units of sale. A short list, unlike the crop names, so it sits here rather
 * than in a generated file — kept in step with UNIT_TE in localizeName.ts. */
private val UNIT_TE = mapOf(
    "kg" to "కేజీ",
    "gram" to "గ్రా",
    "g" to "గ్రా",
    "litre" to "లీటర్",
    "liter" to "లీటర్",
    "l" to "లీ",
    "piece" to "నగ",
    "bunch" to "కట్ట",
    "dozen" to "డజను",
    "quintal" to "క్వింటాల్",
)

/** Telugu for a unit of sale, falling back to the stored text unchanged. */
fun localizeUnit(unit: String?, lang: Lang): String {
    if (unit.isNullOrBlank()) return ""
    val trimmed = unit.trim()
    if (lang != Lang.TE) return trimmed
    return UNIT_TE[trimmed.lowercase()] ?: trimmed
}
