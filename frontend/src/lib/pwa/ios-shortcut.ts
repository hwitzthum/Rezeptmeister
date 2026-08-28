/**
 * Text für die iOS-Kurzbefehl-Anleitung.
 *
 * iOS kennt kein `share_target` im Web-App-Manifest — geteilte Links landen dort
 * also nie von selbst in der PWA. Der nächstbeste Weg ist ein selbst erstellter
 * Kurzbefehl, der die Teilen-Sheet-Eingabe an `/rezepte/importieren?url=…` hängt.
 *
 * Wird auf `/mehr` (Stream A1) gerendert und im README (Stream C2) dokumentiert.
 */

export const IOS_SHORTCUT_TITLE = "iOS-Kurzbefehl einrichten";

export const IOS_SHORTCUT_INTRO =
  "Auf iPhone und iPad können Web-Apps nicht im Teilen-Menü erscheinen — das lässt Apple nicht zu. " +
  "Mit einem einmalig erstellten Kurzbefehl landet eine Rezeptseite aus Safari trotzdem mit zwei Tipps direkt im URL-Import von Rezeptmeister.";

export const IOS_SHORTCUT_STEPS: string[] = [
  "Öffnen Sie die vorinstallierte App «Kurzbefehle». Falls sie nicht mehr auf dem Gerät ist, laden Sie sie kostenlos im App Store.",
  "Tippen Sie unten auf den Reiter «Kurzbefehle» und oben rechts auf das Pluszeichen, um einen neuen Kurzbefehl anzulegen.",
  "Tippen Sie oben auf den vorgeschlagenen Namen «Neuer Kurzbefehl», wählen Sie «Umbenennen» und geben Sie «Rezept importieren» ein. Genau dieser Name erscheint später im Teilen-Menü.",
  "Tippen Sie noch einmal oben auf den Namen, wählen Sie «Details» und schalten Sie «Im Teilen-Sheet zeigen» ein.",
  "Tippen Sie gleich darunter auf «Teilen-Sheet-Typen» und lassen Sie nur «URLs» und «Text» aktiviert. Alles Übrige schalten Sie aus, damit der Kurzbefehl nur bei Webseiten auftaucht.",
  "Gehen Sie zurück zum Kurzbefehl, tippen Sie auf «Aktion hinzufügen», suchen Sie nach «URL öffnen» und tippen Sie das gefundene Ergebnis an.",
  "Tippen Sie in das Adressfeld dieser Aktion und geben Sie ein: https://IHRE-ADRESSE/rezepte/importieren?url= — «IHRE-ADRESSE» ersetzen Sie durch die Adresse Ihrer Rezeptmeister-Installation, zum Beispiel rezeptmeister.example.ch.",
  "Setzen Sie den Cursor ans Ende dieser Adresse und tippen Sie in der Leiste über der Tastatur auf die Variable «Kurzbefehleingabe». Im Feld steht danach: https://IHRE-ADRESSE/rezepte/importieren?url=[Kurzbefehleingabe]",
  "Tippen Sie oben rechts auf «Fertig». Der Kurzbefehl ist gespeichert und einsatzbereit.",
  "So benutzen Sie ihn: Rezeptseite in Safari öffnen, unten auf das Teilen-Symbol tippen, in der Liste nach unten scrollen und «Rezept importieren» wählen.",
  "Rezeptmeister öffnet sich mit der bereits eingetragenen Adresse und startet den Import von selbst. Melden Sie sich beim ersten Mal an — danach merkt sich das Gerät die Anmeldung.",
];
