package com.gogrameen.app

/* The app's language switch.
 *
 * The web app carries a LanguageContext with an L(en, te) helper and every
 * string on /home is written as a pair. This is the same idea with no context
 * plumbing: the screen holds a Lang and calls l(en, te) on it, so copy can be
 * ported from the .tsx files verbatim, in the same order, and stays easy to
 * diff against the page it came from.
 *
 * Telugu is the app-wide default on the web. /home is the one place that is
 * deliberately English-first, because it is the surface a new visitor lands on
 * before they have chosen anything. */

enum class Lang { EN, TE }

fun Lang.l(en: String, te: String): String = if (this == Lang.EN) en else te
