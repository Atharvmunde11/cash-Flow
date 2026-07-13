export function formatMoney(
  value: number,
  currency: string = "INR",
  locale: string = "en-IN"
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

/** Absolute money with no sign (for Dr/Cr columns). */
export function formatMoneyAbs(
  value: number,
  currency: string = "INR",
  locale: string = "en-IN",
): string {
  return formatMoney(Math.abs(Number(value) || 0), currency, locale);
}

