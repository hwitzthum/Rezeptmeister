"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChefHatIcon } from "@/components/layout/nav-items";

/**
 * Dezenter Einstieg zum Dashboard fuer die mobile Ansicht.
 *
 * Die Tab-Leiste ist mit fuenf Eintraegen voll, das Dashboard steckte bisher
 * nur im Mehr-Menue. Statt eines sechsten Tabs sitzt die Marke — wie in nativen
 * Apps ueblich — links im Seitenkopf und fuehrt auf die Startseite. Auf dem
 * Desktop uebernimmt das Logo der Sidebar diese Rolle, deshalb `md:hidden`.
 *
 * Auf dem Dashboard selbst rendert die Komponente nichts: ein Link auf die
 * Seite, auf der man schon steht, ist kein Ziel.
 */
export default function HomeLink() {
  const pathname = usePathname();
  if (pathname === "/") return null;

  return (
    <Link
      href="/"
      data-testid="home-link"
      aria-label="Zum Dashboard"
      className="md:hidden min-tap shrink-0 -ml-2 inline-flex items-center justify-center rounded-xl bg-terra-50 text-terra-600 transition-colors duration-150 hover:bg-terra-100 active:bg-terra-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terra-500 dark:bg-terra-950/40 dark:text-terra-300 dark:hover:bg-terra-900/50 dark:active:bg-terra-900/70"
    >
      <ChefHatIcon />
    </Link>
  );
}
