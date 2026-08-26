// Prompt 537 — single shared display formatter so phone numbers can't drift
// between pages. Only formats real 10-digit US numbers (or 11 digits with a
// leading 1, same convention as useInvites.js's normalizePhoneE164) into
// `(123) 456-7890`; anything else (this project's test leads include bare
// 7-digit numbers like `555-0104`) falls back to the raw value as-is rather
// than rendering something broken.
export function formatPhone(raw) {
  if (!raw) return raw
  const digits = String(raw).replace(/\D/g, '')
  const tenDigit = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
  if (tenDigit.length !== 10) return raw
  return `(${tenDigit.slice(0, 3)}) ${tenDigit.slice(3, 6)}-${tenDigit.slice(6)}`
}
