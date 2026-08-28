"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Link as LinkIcon, PencilLine, type LucideIcon } from "lucide-react";
import { Modal } from "@/components/ui";
import UrlImportDialog from "@/components/ai/UrlImportDialog";

interface CreateActionSheetProps {
  open: boolean;
  onClose: () => void;
}

interface CreateAction {
  key: string;
  icon: LucideIcon;
  label: string;
  hint: string;
  /** Ziel-Route; fehlt sie, öffnet der Eintrag den URL-Import-Dialog. */
  href?: string;
}

const createActions: CreateAction[] = [
  {
    key: "scannen",
    icon: Camera,
    label: "Rezept abfotografieren",
    hint: "Kochbuchseiten mit der Kamera erfassen — auch mehrseitig.",
    href: "/rezepte/scannen",
  },
  {
    key: "url",
    icon: LinkIcon,
    label: "Von URL importieren",
    hint: "Rezept von einer Webseite übernehmen.",
  },
  {
    key: "manuell",
    icon: PencilLine,
    label: "Manuell erfassen",
    hint: "Zutaten und Schritte selbst eintippen.",
    href: "/rezepte/neu",
  },
];

/**
 * Die drei Wege zu einem neuen Rezept, hinter dem [+] der Tab-Leiste.
 * Unter md fährt das Sheet von unten ein, ab md verhält es sich wie ein Dialog.
 */
export default function CreateActionSheet({ open, onClose }: CreateActionSheetProps) {
  const router = useRouter();
  const [showUrlImport, setShowUrlImport] = useState(false);

  function handleAction(action: CreateAction) {
    onClose();
    if (action.href) {
      router.push(action.href);
    } else {
      setShowUrlImport(true);
    }
  }

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        variant="sheet"
        size="md"
        title="Rezept hinzufügen"
        description="Wählen Sie den Weg, der gerade am schnellsten ist."
      >
        <ul role="list" className="space-y-1" data-testid="create-sheet">
          {createActions.map((action) => (
            <li key={action.key}>
              <button
                type="button"
                onClick={() => handleAction(action)}
                data-testid={`create-action-${action.key}`}
                className="min-tap w-full flex items-center gap-4 rounded-xl px-3 py-3 text-left transition-colors duration-150 hover:bg-[var(--bg-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terra-500"
              >
                <span
                  className="shrink-0 w-10 h-10 rounded-xl bg-terra-50 dark:bg-terra-950/40 flex items-center justify-center text-terra-600 dark:text-terra-400"
                  aria-hidden="true"
                >
                  <action.icon className="w-5 h-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-[var(--text-primary)]">
                    {action.label}
                  </span>
                  <span className="block text-xs text-[var(--text-muted)]">{action.hint}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Modal>

      <UrlImportDialog isOpen={showUrlImport} onClose={() => setShowUrlImport(false)} />
    </>
  );
}
