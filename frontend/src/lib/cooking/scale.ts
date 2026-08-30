import { formatAmount } from "@/lib/units";

/**
 * Zutatenmenge auf eine andere Portionenzahl umrechnen und anzeigefertig
 * formatieren. `amount` kommt aus der DB als String (decimal) oder ist null.
 * Nicht-numerische Angaben («etwas») bleiben unverändert.
 */
export function scaleAmount(
  amount: string | number | null | undefined,
  fromServings: number,
  toServings: number,
): string {
  if (amount == null || amount === "") return "";
  const n = typeof amount === "number" ? amount : parseFloat(amount);
  if (Number.isNaN(n)) return String(amount);
  if (fromServings <= 0) return formatAmount(n);
  return formatAmount((n * toServings) / fromServings);
}
