export type TextDirection = 'rtl' | 'ltr'

const DECIMAL_DIGIT = /\p{Decimal_Number}/u
const STRONG_RTL = /[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Syriac}\p{Script=Thaana}]/u
const STRONG_LTR =
  /[\p{Script=Latin}\p{Script=Cyrillic}\p{Script=Greek}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u

export function detectTextDirection(text: string, fallback: TextDirection = 'rtl'): TextDirection {
  let rtlWords = 0
  let ltrWords = 0

  for (const word of text.match(/\S+/gu) ?? []) {
    let rtlCharacters = 0
    let ltrCharacters = 0

    for (const character of word) {
      // Persian and Arabic-Indic digits have an RTL script, but are not strong RTL letters.
      if (DECIMAL_DIGIT.test(character)) continue
      if (STRONG_RTL.test(character)) rtlCharacters += 1
      else if (STRONG_LTR.test(character)) ltrCharacters += 1
    }

    if (rtlCharacters > ltrCharacters) rtlWords += 1
    else if (ltrCharacters > rtlCharacters) ltrWords += 1
  }

  if (rtlWords > ltrWords) return 'rtl'
  if (ltrWords > rtlWords) return 'ltr'
  return fallback
}
