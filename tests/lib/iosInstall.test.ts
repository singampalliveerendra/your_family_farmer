import { describe, it, expect } from 'vitest'
import { isIOSDevice, iosBrowser, inAppName, safariUrl, handoffPath, readHandoff } from '@/lib/iosInstall'

// An iPhone can never install an APK and has no install dialog — the only way
// onto its home screen is Safari → Share → Add to Home Screen. Getting the
// detection wrong either hands an iPhone user a useless .apk or tells them to
// tap a Share menu that, inside Instagram's browser, has no such item.

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const IPAD_DESKTOP_MODE =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15'
const IPHONE_INSTAGRAM =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 334.0.4.32.98 (iPhone14,5; iOS 17_5; en_IN; en; scale=3.00; 1170x2532; 606381245)'
const IPHONE_FACEBOOK =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/470.0.0.40.97;FBBV/621064345;FBDV/iPhone14,5;FBMD/iPhone;FBSN/iOS;FBSV/17.5]'
const IPHONE_WHATSAPP =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 WhatsApp/24.12.78'
const IPHONE_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1'
const IPHONE_BARE_WEBVIEW =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; SM-A146B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'

describe('isIOSDevice', () => {
  // USE: the plain case — an iPhone must never be offered the APK.
  it('recognises an iPhone', () => {
    expect(isIOSDevice(IPHONE_SAFARI)).toBe(true)
  })

  // USE: iPadOS Safari reports itself as a Mac. Without the touch check an iPad
  // got neither the APK guard nor the Add to Home Screen steps.
  it('recognises an iPad that claims to be a Mac by its touch screen', () => {
    expect(isIOSDevice(IPAD_DESKTOP_MODE, 5)).toBe(true)
  })

  // USE: a real Mac has no touch points and must not be told to use the Share menu.
  it('does not mistake a real Mac for an iPad', () => {
    expect(isIOSDevice(IPAD_DESKTOP_MODE, 0)).toBe(false)
  })

  // USE: Android keeps the APK / Chrome install flow.
  it('leaves Android alone', () => {
    expect(isIOSDevice(ANDROID_CHROME, 5)).toBe(false)
  })
})

describe('iosBrowser', () => {
  // USE: Safari is the one browser that can go straight to the Share steps.
  it('treats Safari as Safari', () => {
    expect(iosBrowser(IPHONE_SAFARI)).toBe('safari')
  })

  // USE: links shared on WhatsApp/Instagram/Facebook open in the app's own
  // browser, which has no Add to Home Screen — those must be sent to Safari first.
  it.each([
    ['Instagram', IPHONE_INSTAGRAM],
    ['Facebook', IPHONE_FACEBOOK],
    ['WhatsApp', IPHONE_WHATSAPP],
  ])('flags %s’s built-in browser as in-app', (name, ua) => {
    expect(iosBrowser(ua)).toBe('in-app')
    expect(inAppName(ua)).toBe(name)
  })

  // USE: an app we never listed still lacks "Safari/" in its UA, so it is
  // caught as in-app rather than shown steps that will not work.
  it('treats an unknown WebView without a Safari token as in-app', () => {
    expect(iosBrowser(IPHONE_BARE_WEBVIEW)).toBe('in-app')
    expect(inAppName(IPHONE_BARE_WEBVIEW)).toBeNull()
  })

  // USE: Chrome on iOS carries "Safari/" too — it must not be taken for Safari.
  it('does not take Chrome for iOS for Safari', () => {
    expect(iosBrowser(IPHONE_CHROME)).toBe('other')
  })
})

describe('Safari handoff', () => {
  // USE: the in-app browser's cookies do not reach Safari, so the role has to
  // ride in the URL — and come back out the other side intact.
  it.each(['consumer', 'seller'] as const)('round-trips the %s choice through the URL', (role) => {
    const search = handoffPath(role).split('?')[1]
    expect(readHandoff(`?${search}`)).toBe(role)
  })

  // USE: the x-safari- prefix is what makes iOS leave the in-app browser.
  it('builds an x-safari link to /home', () => {
    expect(safariUrl('https://www.gogrameen.in', 'seller'))
      .toBe('x-safari-https://www.gogrameen.in/home?install=ios&role=seller')
  })

  // USE: an ordinary /home visit, or a tampered role, must not pop the sheet.
  it('ignores ordinary visits and unknown roles', () => {
    expect(readHandoff('')).toBeNull()
    expect(readHandoff('?role=seller')).toBeNull()
    expect(readHandoff('?install=ios&role=admin')).toBeNull()
  })
})
