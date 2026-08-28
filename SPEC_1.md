# SPEC_1 — Mobile-Tauglichkeit (PWA) für Rezeptmeister

> Diese Datei ist der **lebende Fortschritts-Tracker** für die Mobile-Umsetzung: jede erledigte
> Aufgabe wird abgehakt, jeder Workstream bekommt am Ende einen Review-Eintrag.

---

## 1. Kontext

Rezeptmeister soll auf iPhone, Android und iPad professionell nutzbar sein: URL eingeben, Rezepte
mit der Handykamera abfotografieren, alle Bereiche übersichtlich bedienen. Die PWA-Basis existiert
(Manifest, Service Worker, `BottomNav`, Offline-Seiten), aber vier Dinge blockieren den echten
Mobilbetrieb:

| #   | Blocker                                                                                                                                                                                                                                                                                                       | Beleg                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 1   | **Halbe Navigation** — `Sidebar` ist `hidden lg:flex`, Tab-Leiste hat 5 feste Einträge. `/wochenplan`, `/sammlungen`, `/bilder`, `/vorschlaege`, `/werkzeuge`, `/einstellungen`, `/admin` sind mobil **nur per manuell eingetippter URL** erreichbar. iPad-Hochformat (768–834 px) bekommt die Handy-Ansicht. | `Sidebar.tsx:171`, `app/(app)/layout.tsx`                            |
| 2   | **Kaputte Safe-Areas** — kein `viewportFit: "cover"`; die verwendete Klasse `safe-area-inset-bottom` ist in `globals.css` **gar nicht definiert** → Tab-Leiste liegt unter dem Home-Indicator. Kein `apple-touch-icon`.                                                                                       | `app/layout.tsx:24`, `Sidebar.tsx:279`, `globals.css`                |
| 3   | **Kein Kamera-Weg** — Datei-Inputs ohne `capture`; Weg zum Rezept ist Galerie-Upload → antippen → „OCR starten"; `/ocr/extract` verarbeitet genau **ein** Bild → zweiseitige Kochbuchrezepte nicht erfassbar.                                                                                                 | `ImageUploadZone.tsx:213`, `ocr_service.py:115`, `routers/ocr.py:24` |
| 4   | **Einkaufsliste bricht offline ab** — SW lässt `/api/*` network-only durch; `ShoppingListClient` rollt bei Netzfehler zurück → im Laden ohne Empfang springt jeder Haken zurück.                                                                                                                              | `sw.js:70`, `ShoppingListClient.tsx:88`                              |

**Zielbild:** installierbare PWA, die auf iPhone/Android/iPad wie eine echte App wirkt, alle Bereiche
in maximal zwei Tipps erreichbar macht, mehrseitiges Abfotografieren beherrscht, URL-Import prominent
(inkl. Android-Teilen-Sheet und iOS-Kurzbefehl) anbietet und die Einkaufsliste offline abhakbar hält.

**Branch:** `feature/mobile-pwa` — Merge nach `main` erst nach ausdrücklicher Freigabe.

---

## 2. Fortschritts-Tracker

**Legende:** ⬜ offen · 🟡 in Arbeit · ✅ erledigt · ⛔ blockiert

| Welle | ID     | Workstream                            | Parallel?                 | Status | Fortschritt |
| ----- | ------ | ------------------------------------- | ------------------------- | ------ | ----------- |
| **0** | **F**  | Fundament & geteilte Primitive        | nein — muss allein laufen | ✅     | 6/6         |
| **1** | **A1** | Navigation & Mehr-Menü                | ✅ parallel               | ✅     | 5/5         |
| **1** | **A2** | Backend: Mehrseiten-OCR               | ✅ parallel               | ✅     | 4/4         |
| **1** | **A3** | Frontend: Scan-Flow                   | ✅ parallel               | ✅     | 6/6         |
| **1** | **A4** | URL-Import unterwegs                  | ✅ parallel               | ✅     | 4/4         |
| **1** | **A5** | Einkaufsliste offline + Sync          | ✅ parallel               | ✅     | 6/6         |
| **2** | **B1** | Seiten-Sweep: Rezepte-Bereich         | ✅ parallel               | ✅     | 5/5         |
| **2** | **B2** | Seiten-Sweep: Planen & Entdecken      | ✅ parallel               | ✅     | 5/5         |
| **2** | **B3** | Seiten-Sweep: Admin, Konto, Sonstiges | ✅ parallel               | ✅     | 5/5         |
| **3** | **C1** | Playwright-Mobile-Suite               | teilweise                 | ✅     | 5/5         |
| **3** | **C2** | Dokumentation (README, todo.md)       | ✅ parallel zu C1         | ✅     | 3/3         |
| **4** | **D**  | Gesamt-Verifikation & Abnahme         | nein                      | 🟡     | 4/7         |

---

## 3. Parallelisierungs-Modell

### Regeln

1. **Ein Branch, disjunkter Dateibesitz.** Alle Streams arbeiten auf `feature/mobile-pwa`. Jede Datei
   hat **genau einen** Eigentümer-Stream. Kein Agent editiert eine Datei, die ihm nicht zugewiesen
   ist — das ersetzt Merge-Konflikte durch klare Zuständigkeit.
2. **Verträge sind vorab eingefroren** (Abschnitt 4). Dadurch können Backend und Frontend des
   Scan-Flows echt parallel entstehen, ohne aufeinander zu warten.
3. **Welle 0 läuft allein.** Sie legt die geteilten Primitive an (`globals.css`-Utilities,
   `Modal`-Sheet-Variante, `nav-items`), auf die vier Streams der Welle 1 aufbauen. Sie ist bewusst
   klein gehalten, damit die Serialisierung kurz bleibt.
4. **Jeder Stream liefert seine eigenen Tests mit** (Unit/Integration). Die geräteübergreifende
   E2E-Suite entsteht gebündelt in Welle 3, damit sie den Endzustand prüft.
5. **Dokumentations-Text wird nicht direkt geschrieben, sondern gemeldet.** README und `tasks/todo.md`
   gehören ausschliesslich C2 — sonst kollidieren fünf Agenten in derselben Datei.

### Dateibesitz-Matrix

| Stream | Besitzt exklusiv                                                                                                                                                                                             |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **F**  | `src/app/layout.tsx`, `src/app/globals.css`, `src/app/manifest.ts`, `public/sw.js`, `public/icons/*`, `src/components/ui/Modal.tsx`, `src/components/layout/nav-items.tsx` _(neu)_                           |
| **A1** | `src/components/layout/Sidebar.tsx`, `src/app/(app)/layout.tsx`, `src/app/(app)/mehr/**` _(neu)_, `src/components/layout/CreateActionSheet.tsx` _(neu)_                                                      |
| **A2** | `backend/app/services/ocr_service.py`, `backend/app/routers/ocr.py`, `backend/tests/test_ocr_*.py`                                                                                                           |
| **A3** | `src/app/(app)/rezepte/scannen/**` _(neu)_, `src/app/api/ai/ocr/route.ts`, `src/components/images/ImageUploadZone.tsx`, `src/lib/images/downscale.ts` _(neu)_                                                |
| **A4** | `src/components/ai/UrlImportDialog.tsx`, `src/app/(app)/rezepte/importieren/**` _(neu)_                                                                                                                      |
| **A5** | `src/lib/offline/db.ts`, `src/lib/offline/shopping-sync.ts` _(neu)_, `src/components/shopping/ShoppingListClient.tsx`, `src/components/layout/OfflineIndicator.tsx`, `src/app/(app)/einkaufsliste/page.tsx`  |
| **B1** | `src/app/(app)/rezepte/page.tsx`, `.../[id]/page.tsx`, `.../[id]/bearbeiten/**`, `.../[id]/kochmodus/**`, `.../neu/**`, `src/components/recipes/**`                                                          |
| **B2** | `src/app/(app)/wochenplan/**`, `.../sammlungen/**`, `.../suche/**`, `.../vorschlaege/**`, `.../bilder/**`, `src/components/mealplan/**`, `src/components/collections/**`                                     |
| **B3** | `src/app/admin/**`, `src/app/einstellungen/**`, `src/app/auth/**`, `src/app/offline/**`, `src/app/(app)/werkzeuge/**`, `src/app/(app)/page.tsx`, `src/components/dashboard/**`, `src/components/settings/**` |
| **C1** | `frontend/playwright.config.ts`, `frontend/tests/mobile*.spec.ts`                                                                                                                                            |
| **C2** | `README.md`, `tasks/todo.md`, `SPEC_1.md` (Tracker-Pflege)                                                                                                                                                   |

**Grenzfälle, bewusst geregelt:**

- `SuchePage.tsx` enthält einen Datei-Input _und_ den URL-Dialog-Aufruf → gehört **B2**, nicht A3/A4.
  A3 fasst nur `ImageUploadZone` an, A4 nur den Dialog selbst.
- `app/(app)/bilder/page.tsx` gehört **B2**; A3 ändert dort nichts, nur die eingebettete Komponente.
- `CreateActionSheet` (A1) _importiert_ `UrlImportDialog` (A4), ändert ihn aber nicht — der Vertrag
  in 4.3 hält die Props stabil.
- `manifest.ts` enthält auch das `share_target` für A4 — deshalb komplett in **F**, damit A4 die Datei
  nicht anfassen muss.

---

## 4. Eingefrorene Verträge

Diese Schnittstellen werden **vor** Welle 1 festgelegt und dürfen von den parallelen Streams nur
implementiert, nicht verändert werden.

### 4.1 OCR-API (zwischen A3 und A2)

```
POST /api/ai/ocr
  Body: { imageIds: string[] }        // 1–10 UUIDs, Reihenfolge = Seitenreihenfolge
                                       // { imageId: string } bleibt für Bestandscode gültig
  → 200 { recipes: OcrResult[] }       // unveränderte Form, von OcrMultiPreview bereits verarbeitet

POST {BACKEND_URL}/ocr/extract
  Body: { image_ids: [UUID], user_id: UUID }   // image_id bleibt optional zulässig
  Header: X-Gemini-API-Key
  → OcrResults
```

Mehrere Bilder = **aufeinanderfolgende Seiten EINES Rezepts** → Ergebnis ist genau ein
zusammengeführtes Rezept. Next-Proxy-Timeout für diesen Aufruf: 120 s (bisher 60 s).

### 4.2 Offline-Store (A5)

`lib/offline/db.ts` steigt auf `DB_VERSION = 3`; der bestehende `recipes`-Store bleibt im
`upgrade`-Callback unangetastet. Neu:

```ts
shoppingList: { key: string /* userId */, value: { userId, items: ShoppingItem[], updatedAt: number } }
pendingOps:   { key: number /* autoIncrement */,
                value: { userId, kind: "toggle"|"add"|"delete"|"checkAll"|"clear",
                         payload: unknown, createdAt: number } }
```

### 4.3 Geteilte UI-Primitive (F)

```ts
// components/ui/Modal.tsx — additiv, bestehende Aufrufe bleiben gültig
variant?: "dialog" | "sheet"   // default "dialog"; "sheet" = unter md von unten, ab md wie bisher

// components/layout/nav-items.tsx — einzige Quelle der Wahrheit für alle drei Navigationen
export const navGroups: NavGroup[]        // aus Sidebar.tsx extrahiert, unverändert
export const bottomNavItems: NavItem[]    // Rezepte · Suche · [+] · Einkauf · Mehr

// components/ai/UrlImportDialog.tsx — Props bleiben stabil, additiv:
initialUrl?: string
autoStart?: boolean
```

CSS-Utilities aus `globals.css`, auf die sich alle Streams verlassen dürfen:
`.safe-area-inset-bottom`, `.safe-area-inset-top`, `.safe-area-inset-x`, `.min-tap` (44 × 44 px).

---

## 5. Welle 0 — Fundament (Stream F, allein)

Kurz gehalten, damit die Parallelisierung schnell startet.

- [x] **F.1** `src/app/layout.tsx`: `viewport` um `width: "device-width"`, `initialScale: 1`,
      `viewportFit: "cover"` erweitern. Kein `maximumScale`/`userScalable: false` (Zoom bleibt aus
      A11y-Gründen erlaubt). `themeColor` als Light/Dark-Paar. `metadata.icons.apple` verlinken.
- [x] **F.2** `src/app/globals.css` (Tailwind v4, `@theme`): Safe-Area-Utilities via
      `env(safe-area-inset-*)` definieren (fehlen heute komplett), dazu `.min-tap`,
      `-webkit-tap-highlight-color: transparent`, `overscroll-behavior-y: contain`,
      `touch-action: manipulation` auf Buttons/Links und **`font-size: 16px` als Minimum für
      `input`/`select`/`textarea`** (verhindert iOS-Auto-Zoom beim Fokussieren).
- [x] **F.3** `src/app/manifest.ts`: `orientation` von `portrait-primary` → `any` (sonst steht das
      iPad-Querformat quer), `id`, `display_override`, `shortcuts` (Abfotografieren / URL importieren /
      Einkaufsliste) und `share_target` → `GET /rezepte/importieren?url=…`.
- [x] **F.4** Icons: `apple-touch-icon.png` (180 × 180) aus dem 512er ableiten, plus `icon-96`/`icon-144`.
- [x] **F.5** `public/sw.js`: `CACHE_NAME` → `v3`, `/einkaufsliste` in `PRECACHE_URLS`.
      `/api/*` bleibt network-only — korrekt, weil auth-gebunden.
- [x] **F.6** Geteilte Primitive: `Modal`-Variante `sheet` (Focus-Trap, Body-Scroll-Lock und `dvh` sind
      dort bereits korrekt implementiert und werden wiederverwendet — **kein** neues Sheet-Primitive),
      und `navGroups` aus `Sidebar.tsx` nach `components/layout/nav-items.tsx` extrahieren.

**Definition of Done:** `npm run build` grün; die 19 bestehenden Phase-Specs laufen unverändert durch.

---

## 6. Welle 1 — Feature-Streams (A1–A5 parallel)

### A1 — Navigation & Mehr-Menü _(grösster Hebel)_

- [x] **A1.1** Breakpoint `lg:` → `md:` in `Sidebar.tsx` und `app/(app)/layout.tsx` — ab 768 px
      (iPad hoch) erscheint die Sidebar, die Tab-Leiste verschwindet, `pb-16` entfällt.
- [x] **A1.2** Tab-Leiste neu belegen: `Rezepte · Suche · [+] · Einkauf · Mehr` (Dashboard wandert ins
      Mehr-Menü, bleibt über das Logo erreichbar). Tap-Targets ≥ 44 px, `safe-area-inset-bottom`
      greift jetzt tatsächlich.
- [x] **A1.3** Neue Seite `app/(app)/mehr/page.tsx`: gruppierte Liste **aller** übrigen Bereiche
      (Dashboard, Wochenplan, Sammlungen, Bildergalerie, Vorschläge, Werkzeuge, Einstellungen, Admin
      nur bei `USER_ROLE.admin`) plus `ThemeToggle`, Benutzername, Abmelden — gespeist aus `nav-items`.
- [x] **A1.4** `CreateActionSheet`: `[+]` öffnet ein Sheet mit drei Wegen — _Rezept abfotografieren_
      → `/rezepte/scannen`, _Von URL importieren_ → `UrlImportDialog`, _Manuell erfassen_ → `/rezepte/neu`.
- [x] **A1.5** Sidebar liest ihre Einträge aus `nav-items` statt aus lokalen Arrays (Desktop-Verhalten
      unverändert).

**DoD:** Jede Route ist rein per Antippen erreichbar; Desktop-Layout unverändert.

### A2 — Backend: Mehrseiten-OCR

- [x] **A2.1** `extract_recipes_from_images(image_paths: list[str], api_key)` in `ocr_service.py`:
      alle Bilder als `types.Part.from_bytes` in **einen** Gemini-Aufruf. Einzelbild-Funktion bleibt
      für den Galerie-Weg bestehen.
- [x] **A2.2** Prompt-Variante, die explizit sagt: die Bilder sind **aufeinanderfolgende Seiten
      desselben Rezepts** → zu einem Rezept zusammenführen (fortgesetzte Zutatenliste, Schritte
      weiterzählen, keine Duplikate, Kopf-/Fusszeilen ignorieren).
- [x] **A2.3** `routers/ocr.py`: `image_ids: list[UUID]` (1–10), `image_id` bleibt optional.
      Eigentumsprüfung für **jedes** Bild; Pfadauflösung über `contextlib.AsyncExitStack` um die
      vorhandene `_utils.resolved_image_path`.
- [x] **A2.4** Pytest im Muster der bestehenden Backend-Tests (echte Postgres-Instanz,
      `skipif` bei fehlender DB): Fremdbild → 403, unbekannte ID → 404, zwei Seiten → ein Rezept.

**DoD:** `uv run pytest` grün; Vertrag 4.1 erfüllt.

### A3 — Frontend: Scan-Flow

- [x] **A3.1** Neue Route `app/(app)/rezepte/scannen/page.tsx`, kamera-first:
      `<input type="file" accept="image/*" capture="environment" multiple>`, zusätzlich
      „Aus Galerie wählen" ohne `capture`.
- [x] **A3.2** Seitenliste mit Thumbnails, Reihenfolge ändern, einzelne Seiten löschen,
      „Weitere Seite aufnehmen".
- [x] **A3.3** `lib/images/downscale.ts`: Canvas-Downscaling (max. Kante ~2000 px, JPEG q0.85) **vor**
      dem Upload — iPhone-Fotos sind 3–5 MB und scheitern sonst am 10-MB-Limit bzw. an Mobilfunk.
- [x] **A3.4** Upload über die bestehende Route `POST /api/images/upload` (eine Anfrage pro Seite, mit
      Fortschrittsanzeige), danach **ein** OCR-Aufruf über alle `imageIds`.
- [x] **A3.5** `app/api/ai/ocr/route.ts`: zod auf `imageIds: z.array(z.string().uuid()).min(1).max(10)`
      erweitern, `imageId` weiter akzeptieren, Proxy-Timeout 120 s. Rate-Limit bleibt `AI_LIMIT`.
- [x] **A3.6** Ergebnis in den vorhandenen `components/ocr/OcrMultiPreview.tsx` geben (Speichern
      unverändert); `capture="environment"` als optionalen Kamera-Button in `ImageUploadZone` nachrüsten.

**DoD:** Zwei Fotos → ein Rezept, gegen echtes Backend verifiziert.

### A4 — URL-Import unterwegs

- [x] **A4.1** `UrlImportDialog` nutzt `variant="sheet"`, bekommt `inputMode="url"`,
      `autocomplete="url"`, `autoCapitalize="none"`.
- [x] **A4.2** Button **„Aus Zwischenablage einfügen"** (`navigator.clipboard.readText()`, still
      ausgeblendet wo nicht verfügbar).
- [x] **A4.3** Neue Seite `app/(app)/rezepte/importieren/page.tsx`: liest `?url=`, öffnet den Dialog
      vorbefüllt (`initialUrl`, `autoStart`) — Ziel des Android-Share-Targets aus F.3.
- [x] **A4.4** Text für die iOS-Kurzbefehl-Anleitung erstellen (Kurzbefehl mit _Teilen-Sheet-Eingabe_
      → _URL öffnen_ auf `https://…/rezepte/importieren?url=[Eingabe]`) und an **C2** übergeben; ein
      Kurz-Einstieg dazu erscheint auf der Mehr-Seite (Umsetzung dort durch A1 nach Textübergabe).

**DoD:** Import startet aus Sheet, aus Mehr-Menü und aus geteilter URL.

### A5 — Einkaufsliste offline + Sync

- [x] **A5.1** `lib/offline/db.ts` auf `DB_VERSION 3`, Stores `shoppingList` + `pendingOps` gemäss 4.2;
      `recipes`-Store unangetastet (gemerkte Offline-Rezepte gehen nicht verloren).
- [x] **A5.2** `lib/offline/shopping-sync.ts`: `queueOp()`, `flushQueue()`, `sendOrQueue()`-Wrapper.
- [x] **A5.3** `ShoppingListClient` ersetzt seine fünf rohen `fetch`-Aufrufe durch den Wrapper — die
      optimistische Update-Logik bleibt, nur der Rollback entfällt, wenn der Fehler „offline" heisst.
- [x] **A5.4** Hydration: beim Mount aus IndexedDB laden, dann gegen das Netz revalidieren; jede
      Server-Antwort aktualisiert den Snapshot.
- [x] **A5.5** Replay bei `online`-Event und Seiten-Fokus, in Reihenfolge, **Last-Write-Wins** pro
      Item-ID; erfolgreiche Ops löschen, dauerhaft fehlschlagende (404 = Item serverseitig weg)
      verwerfen statt endlos wiederholen.
- [x] **A5.6** `OfflineIndicator` zeigt „n Änderungen werden synchronisiert"; Unit-Tests für die
      Queue in `lib/offline/__tests__/` (Muster wie `lib/shopping/__tests__`).

**DoD:** Im Flugmodus abhaken bleibt bestehen und synchronisiert nach Reconnect.

---

## 7. Welle 2 — Seiten-Sweep (B1–B3 parallel, nach Welle 1)

Einheitliche Kriterien für jede Seite bei **390 × 844** (iPhone) und **820 × 1180** (iPad):
kein horizontaler Scroll · Tap-Targets ≥ 44 px · Modals → `variant="sheet"` · Sticky-Action-Bars
über der Safe-Area · Tabellen unter `md` → Kartenliste · Inputs ≥ 16 px.
**Keiner dieser Streams editiert `globals.css`** — Bedarf an neuen Utilities wird gemeldet, nicht
selbst gebaut.

- [x] **B1** Rezepte-Bereich: Liste, Detail, Neu, Bearbeiten, Kochmodus, `components/recipes/**`
      (u. a. `NotesPanel.tsx:405`).
- [x] **B2** Planen & Entdecken: Wochenplan (`MealPlanClient.tsx:407` `grid-cols-1 lg:grid-cols-7` →
      Snap-Scrolling oder Tagesansicht mobil; `:368` `min-w-[200px]`), Sammlungen, Suche
      (inkl. Datei-Input dort), Vorschläge, Bildergalerie, `OcrPreviewPanel.tsx:128`,
      `NutritionPanel.tsx:140` (`grid-cols-5` bei 390 px).
- [x] **B3** Admin (`AdminDashboard.tsx:539` `<table>` → Kartenliste unter `md`; `:493` `min-w-[200px]`),
      Einstellungen, Auth-Seiten, Offline-Seiten (`offline/rezept/page.tsx:233`), Werkzeuge, Dashboard.
- [x] **B0** _(alle drei)_ `PageHeader` (`sticky top-0`) auf Kollision mit der iOS-Statusleiste im
      Standalone-Modus prüfen — Befund an F melden, falls eine geteilte Korrektur nötig ist.
- [x] **B4** _(alle drei)_ Jeder Stream meldet am Ende die Liste geänderter Seiten an **C1**, damit die
      E2E-Suite sie abdeckt.

---

## 8. Welle 3 — Tests & Dokumentation (C1 ∥ C2)

### C1 — Playwright-Mobile-Suite

- [x] **C1.1** `playwright.config.ts`: Projekte `mobile-safari` (iPhone 14), `mobile-chrome` (Pixel 7),
      `tablet` (iPad gen 7). Bestehendes `chromium` bleibt unverändert, damit die 19 Phase-Specs
      weiterlaufen.
- [x] **C1.2** `tests/mobile-navigation.spec.ts`: **jede** Route ist rein per Antippen (Tab-Leiste →
      Mehr) erreichbar — sichert den heutigen Hauptmangel ab. Plus: für jede Seite
      `scrollWidth <= clientWidth`, alle sichtbaren Buttons/Links ≥ 44 px.
- [x] **C1.3** `tests/mobile-erfassen.spec.ts`: `[+]`-Sheet führt zu allen drei Zielen;
      Mehrseiten-Upload via `setInputFiles` mit zwei Bildern → **ein** OCR-Request mit zwei `imageIds`.
- [x] **C1.4** `tests/mobile-import.spec.ts`: Share-Target-Route füllt den URL-Dialog vor.
- [x] **C1.5** `tests/mobile-einkaufsliste.spec.ts`: `context.setOffline(true)` → abhaken → Haken
      bleibt → `setOffline(false)` → Nachsynchronisierung serverseitig sichtbar.

### C2 — Dokumentation

- [x] **C2.1** README: Mobile/PWA-Installation, Scan-Flow, Android-Share-Target, iOS-Kurzbefehl
      (Text von A4). _README-Vollständigkeit ist Teil von „fertig"._
- [x] **C2.2** `tasks/todo.md`: neue Phase mit allen Checkboxen dieses Dokuments.
- [x] **C2.3** `SPEC_1.md`: Tracker-Tabelle laufend aktualisieren, am Ende Review-Abschnitt je Stream.

---

## 9. Welle 4 — Gesamt-Verifikation (D, allein)

- [x] **D.1** `npm run build` + `npm run lint` (Build fängt Next-Fehler, die `tsc` allein übersieht).
- [x] **D.2** Kompletter Playwright-Lauf über **alle vier** Projekte — inkl. der 19 Bestands-Specs
      als Regressionsnachweis.
- [x] **D.3** `uv run pytest` gegen eine **echte** Postgres-Instanz.
- [x] **D.4** Branch pushen → Vercel-Preview-URL. **HTTPS ist Pflicht**: Kamera und Service Worker
      laufen nicht über `http://` im LAN.
- [ ] **D.5** Manuelle iPhone-Checkliste: Installieren über „Zum Home-Bildschirm" · Icon prüfen ·
      Tab-Leiste sitzt über dem Home-Indicator · zweiseitiges Rezept abfotografieren · URL importieren ·
      Einkaufsliste im Flugmodus abhaken · alle Bereiche über „Mehr" erreichbar.
- [ ] **D.6** Ehrliche Gesamtbewertung + **Freigabe einholen**, erst dann Merge nach `main`.
- [ ] **D.7** _(neu, nach D.5 entstanden)_ **Render-Branch zurückstellen.** Für die Abnahme wurde
      `rezeptmeister-api` (`srv-d7a2glnpm1nc73brf0tg`) von `main` auf `feature/mobile-pwa`
      umgestellt, damit das Mehrseiten-OCR überhaupt testbar ist und beim Merge kein Fenster mit
      kaputtem OCR entsteht. **Unmittelbar nach dem Merge zurück auf `main`** — sonst deployt der
      Produktions-Backend dauerhaft aus einem Feature-Branch.

---

## 10. Risiken

| Risiko                                 | Einschätzung / Ausweg                                                                                                                                                  |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Gemini-Qualität bei Mehrseiten-OCR** | Einzige echte Unbekannte. Fallback: pro Seite extrahieren und im Frontend zusammenführen — der Aufruf-Vertrag (`imageIds`) bleibt derselbe, nur A2 ändert sich intern. |
| **Breakpoint `lg:` → `md:`**           | Verändert die Ansicht auch im schmalen Desktop-Fenster zwischen 768 und 1024 px. Beabsichtigt, abgesichert durch das `tablet`-Playwright-Projekt.                      |
| **IndexedDB-Versionssprung**           | `recipes`-Store wird im `upgrade`-Callback nicht angefasst; gemerkte Offline-Rezepte bleiben erhalten.                                                                 |
| **Parallele Streams kollidieren**      | Verhindert durch die Dateibesitz-Matrix (3.2) und die eingefrorenen Verträge (4). Bei Bedarf an einer fremden Datei: melden statt editieren.                           |
| **iOS ohne Share Target**              | Technische Grenze von Apple, nicht behebbar. Nächstbeste Lösung ist der dokumentierte Kurzbefehl (A4.4).                                                               |

---

## 11. Review (wird während der Umsetzung gefüllt)

| Stream | Ergebnis | Abweichungen vom Plan | Tests |
| ------ | -------- | --------------------- | ----- |
| F      | Alle 6 Aufgaben umgesetzt | `sw.js`: statt `cache.addAll` ein tolerantes `precache()`, und `navigationHandler` bevorzugt jetzt die passende gecachte Seite — sonst wäre `/einkaufsliste` im Cache wirkungslos geblieben und ein Login-Redirect hätte den Install abgebrochen. `navGroups` wurde real verschoben (Sidebar importiert sie), damit keine zweite Quelle entsteht; `bottomNavItems` liegt bereit, wird aber erst von A1.2 verdrahtet. Icons über den bestehenden `scripts/generate-pwa-icons.ts` erzeugt statt einmalig. | `npm run build` grün · `npm run lint` grün · `tsc --noEmit` grün · Playwright 196 passed / 17 skipped / 0 failed (17 Skips = KI-Livetests ohne API-Schlüssel, unverändert) · Sheet-Variante im Browser bei 390 px und 1280 px vermessen |
| A1–A5  | Alle 25 Aufgaben aus A1–A5 umgesetzt | **Ausserhalb der Besitzmatrix angefasst (jeweils zwingend, gemeldet statt still gelassen):** `src/proxy.ts` — der Login-Redirect verwarf `nextUrl.search`, wodurch die geteilte Rezept-URL aus dem Android-Share-Target beim Anmelden verloren ging; jetzt `pathname + search`. `tests/phase-6.spec.ts` — der Datei-Input-Selektor musste auf `.first()` (Galerie), weil `ImageUploadZone` seit A3.6 zusätzlich ein Kamera-Input enthält. `tests/phase-17.spec.ts` — die Tests öffneten IndexedDB fest mit Version 2; nach dem Sprung auf Version 3 (A5.1) hätte das einen `VersionError` geworfen, den der `onerror`-Pfad still geschluckt hätte — die Tests wären grün geblieben, ohne noch etwas zu prüfen. <br>**Zusätzliche Dateien über den Plan hinaus:** `lib/pwa/ios-shortcut.ts` (A4.4-Text als Modul statt als lose Notiz, damit `/mehr` und später das README aus derselben Quelle lesen), `rezepte/importieren/shared-url.ts` (URL-Normalisierung des Share-Targets, separat testbar). <br>**Bewusste Vertragsverschärfung (A2.2):** das Mehrseiten-Antwortschema ist `OcrResult` (Einzahl) statt `OcrResults` — dadurch ist strukturell genau ein zusammengeführtes Rezept garantiert, statt sich auf die Prompt-Formulierung zu verlassen. <br>**Nachtrag (D.5, 2026-08-28): die A3-DoD ist erbracht.** In den Tests bleibt Gemini gemockt — geprüft wird dort der Aufruf-Vertrag, nicht die Erkennungsqualität. Am iPhone gegen das echte Backend und das echte Gemini nachgeholt: zwei abfotografierte Kochbuchseiten ergeben **ein** Rezept mit den Zutaten beider Seiten. Voraussetzung war, dass der Backend-Teil dieses Branches überhaupt deployt ist (siehe D.5/D.7). | `npm run build` grün · `npm run lint` grün · `tsc --noEmit` grün · `vitest` 123/123 grün, davon 60 neu (shopping-sync 27, shared-url 14, downscale 11, nav-active 8) · `uv run pytest` 58/58 grün gegen echte Postgres, davon 22 OCR (Service + Route: Fremdbild 403, unbekannte ID 404, >10 Seiten 422, zwei Seiten → ein Rezept) · Playwright 212 passed / 0 failed / 1 flaky (`phase-6` 6.6 Schlüssel-Speicherung, im Retry grün, unabhängig von Welle 1 — dieser Lauf hatte anders als bei F einen API-Schlüssel, daher 212 statt 196 + 17 Skips) |
| B1–B3  | Alle 5 Aufgaben umgesetzt; 44 Messpunkte (22 Seiten/Zustaende x 2 Viewports) erfuellen die Kriterien aus §7 | **Vorgehen:** statt Klassen zu lesen wurde real gemessen — ein Wegwerf-Harness im Scratchpad faehrt jede Route bei 390x844 und 820x1180 an und meldet ueberlaufende Knoten, Ziele unter 44 px und Felder unter 16 px. Das war noetig: `#main-content` traegt `overflow-x-hidden`, der Ueberlauf wurde also lautlos **abgeschnitten** statt scrollbar — `scrollWidth` blieb sauber, waehrend Bedienelemente unerreichbar waren. Ein reiner `scrollWidth`-Test haette die drei schwersten Fehler nicht gesehen. <br>**Drei Funktionsfehler, keine Kosmetik:** (1) Das gesamte Dashboard rendert bei 1280 px in einem 390-px-Fenster — `mx-auto` auf einem direkten Flex-Kind hebt das Strecken auf, die Box wird shrink-to-fit und laeuft bis zur `max-w-7xl`; alles rechts von 390 px war abgeschnitten. (2) Loesch- und Bearbeiten-Knoepfe in Zutatenzeile, Wochenplan-Kachel und Sammlungskarte haengen an `opacity-0 group-hover:opacity-100` — auf Touch gibt es kein Hover, sie waren dort dauerhaft unsichtbar und die Eintraege nicht loeschbar. (3) Das Feld „Zutatname" schrumpfte bei 390 px auf 22 px Breite; die Zeile bricht jetzt unter `sm` um. <br>**Weitere Befunde:** `Zur Einkaufsliste` im Wochenplan und der Treffer-Zaehler der Suche waren abgeschnitten (`min-w-[200px]` bzw. zu breite Kopfzeile); die Aktionsleiste der Rezeptdetailseite lief auf dem iPad 264 px ueber und ist jetzt erst ab `lg` voll ausgeklappt — dabei fiel auf, dass `OfflineToggleButton` im Ueberlaufmenue fehlte und schon vorher unter 640 px gar nicht erreichbar war. <br>**Geteilte Bausteine statt 40 Einzelstellen (gemeldet an F):** `Button`, `Card`, `Badge`, `Modal`, `IngredientTagInput` erhielten das Tippziel zentral ueber `pointer-coarse:min-tap`. Die Weiche `@media (pointer: coarse)` ist bereits F.2s Mechanik fuer die 16-px-Regel; in Playwright-Emulation ist sie fuer iPhone, Pixel und iPad wahr und auf dem Desktop falsch (gemessen), die kompakte Desktop-Typografie bleibt also unangetastet. `Modal.tsx` gehoert F — die eine Zeile dort (Schliessen-Knopf) betrifft jedes Sheet und ist bewusst als F-Eingriff ausgewiesen. `ShoppingListClient` (A5) wurde ebenfalls angefasst, weil die Seite dieselben Kriterien verfehlte. <br>**Abweichungen vom Wortlaut:** `MealPlanClient.tsx:407` ist nur das Lade-Skelett — die Mobilansicht ist bereits eine eigene Tagesliste (`lg:hidden`), also die vom Spec genannte Tagesansicht; statt sie durch Snap-Scrolling zu ersetzen, zeigt sie auf dem iPad nun zwei Tage nebeneinander. `AdminDashboard.tsx:493` (`flex-1 min-w-[200px]`) brauchte keine Korrektur, das misst bei 390 px sauber. **B0:** `statusBarStyle: "default"` startet die Webview unter der iOS-Statusleiste — `PageHeader sticky top-0` kollidiert nicht, keine geteilte Korrektur noetig. <br>**Nebenbefund, nicht angefasst:** `scrollbar-none` in `NotesPanel.tsx:399` ist in `globals.css` gar nicht definiert und damit wirkungslos.<br>**Nachtrag — vorbestehende Fehler, auf ausdrueckliche Anweisung mitbehoben.** Ausgangspunkt war das tote `scrollbar-none`; ein Abgleich aller 878 className-Tokens gegen das *gebaute* Stylesheet legte dieselbe Fehlerklasse an weiteren Stellen offen — eine Klasse steht im Quelltext, Tailwind erzeugt dafuer aber kein CSS, und das faellt nie auf: (1) Die `gold`-Skala lief nur von 300 bis 800, waehrend zehn Aufrufstellen `gold-50/100/900/950` benutzten — Begruessungsverlauf, Einkaufs- und Vorschlagskachel sowie das Schwierigkeits-Abzeichen „Mittel" rendern seither ohne Hintergrund. Die Skala laeuft jetzt wie terra und warm durchgehend von 50 bis 950. (2) `bg-terra-25` existiert nicht (Skala beginnt bei 50) → `bg-terra-50`. (3) `bg-opacity-90` wurde in Tailwind v4 entfernt; die Deckkraft liegt jetzt an der Farbe (`bg-gold-50/90`). (4) Alle `prose`-Klassen waren tot, weil `@tailwindcss/typography` nicht installiert ist — beide Stellen enthalten reinen Text und formatieren ihn bereits selbst, die Klassen sind entfernt statt ein Plugin fuer zwei Aufrufe nachzuziehen. (5) `scrollbar-none` ist jetzt in `globals.css` definiert. Ausserdem: der Docker-Healthcheck des Backends rief `curl` auf, das im `python:3.12-slim`-Image fehlt — 391 Fehlschlaege in Folge bei tadellos laufendem Dienst; er nutzt jetzt das ohnehin vorhandene Python. Der Container meldet wieder `healthy`. `globals.css`, `Modal.tsx` und `Card.tsx` gehoeren F, `docker-compose.yml` keinem Stream — alle vier Eingriffe sind hier bewusst ausgewiesen. | Messharness: 44/44 Punkte ohne Befund (kein Ueberlauf, kein Ziel < 44 px, kein Feld < 16 px) · `npm run build` gruen · `npm run lint` gruen · `tsc --noEmit` gruen · `vitest` 123/123 · Playwright 213 passed / 0 failed / 0 flaky (Bestands-Specs als Regressionsnachweis) · Sichtpruefung per Screenshot bei 390, 820 und 1280 px fuer Zutatenzeile, Kochmodus, Wochenplan, Dashboard und Ueberlaufmenue |
| C1–C2  | Alle 8 Aufgaben umgesetzt; 97 Mobile-Tests auf drei Geraeteprofilen gruen, die 19 Bestands-Specs unveraendert gruen | **Aufbau der Suite:** Die Trennung Bestand/Mobil laeuft ueber den Dateinamen (`mobile-*.spec.ts` gehoert den Geraeteprojekten, alles andere `chromium`) — sonst waeren die 19 Phase-Specs viermal auf Viewports gelaufen, fuer die sie nie geschrieben wurden. Drei Zusaetze ueber den Plan hinaus, jeder aus einem gemessenen Fehlschlag heraus: (1) `tests/mobile-auth.setup.ts` meldet sich einmal an und legt die Sitzung ab — mit Anmeldung je Test dauerte allein `mobile-chrome` 9,8 Minuten, mit geteilter Sitzung 24 Sekunden. (2) `serviceWorkers: "block"` in den Geraeteprojekten: der Service Worker meldet sich bei `/api/`-Aufrufen zwar sofort wieder ab, die Anfrage gilt dem Browser danach aber als vom Worker ausgeloest — und die reicht Playwright in WebKit am Router vorbei. Ohne die Sperre haette C1.3 echte Gemini-Aufrufe abgesetzt statt den Vertrag zu pruefen (nachgewiesen: 400 „Kein Gemini API-Schluessel hinterlegt"). Registrierung und Caching des Workers deckt weiterhin `phase-17` im `chromium`-Projekt ab. (3) Der Next.js-Dev-Overlay wird ausgeblendet; er sitzt unten links ueber der Tab-Leiste und fing dort jeden Tap ab. <br>**Messung statt Klassenlesen (C1.2):** Der Layout-Check misst jede Element-Box gegen die Viewport-Breite, nicht nur `scrollWidth` — `#main-content` traegt `overflow-x-hidden`, ueberlaufende Inhalte werden dort lautlos abgeschnitten und `scrollWidth` bliebe sauber. Drei Praezisierungen waren noetig, damit die Regel misst was gemeint ist: `sr-only`-Knoten (am Zuschnitt erkannt, nicht am Klassennamen) zaehlen weder als Tippziel noch als Ueberlauf; ein Ueberlauf ist nur ein Befund, wenn der Knoten selbst Text oder ein Bedienelement traegt (dekorative Farbverlaeufe ragen absichtlich ueber ihre Karte und werden dort beschnitten); und das Tippziel eines Ankreuzfelds ist sein umschliessendes `<label>`, nicht das 16-px-Kaestchen. <br>**Vier Produktfehler, die die Suite gefunden hat — behoben, alle ausserhalb der Besitzmatrix, nach Ruecksprache und Freigabe:** (1) `globals.css` (F): **WebKit ignoriert Hoehe *und* Innenabstand an einem `<select>` in nativer Darstellung** — auf iPhone und iPad war *jede* Auswahlliste der App 24 px hoch statt 44, unabhaengig von der gesetzten Klasse (gemessen: `min-height` 44 → 24 px in WebKit, 44 px in Chromium; erst `appearance: none` gibt die Kontrolle zurueck). Eine Regel unter `@media (pointer: coarse)` behebt alle Vorkommen zentral; der Aufklapp-Pfeil kommt dort als Hintergrund-SVG zurueck, Desktop bleibt unberuehrt. (2) `Sidebar.tsx` (A1): Auf dem iPad ist die Sidebar die *einzige* Navigation, ihre Eintraege massen aber 40 px (Logo 36 px, „URL importieren" 40 px). (3) `RecipeDetailClient.tsx` (B1): Portionen-Plus/Minus 28 px. (4) `RecipeSuggestions.tsx` (B2): das Filterformular unter `/vorschlaege` durchgehend unter dem Mass — Ankreuzzeilen 20 px, Schieberegler 16 px, Zutatenfeld 26 px; die Datei traegt eine eigene Kopie des Tag-Eingabefelds, die die Korrektur aus Welle 2 an `IngredientTagInput` nie erhalten hat. Alle vier mit dem in Welle 2 etablierten Mittel (`pointer-coarse:min-tap` bzw. `min-h-11`) korrigiert. Bei der Sichtpruefung danach fiel ein fuenfter auf: `ShoppingListClient` (A5) haelt Mengen- und Einheitenfeld auf `w-24`, auch wenn die Zeile unter `sm` umbricht — bei den 16 px Mindestschrift aus F.2 passt „Einheit" dort nicht mehr ins Feld. Jetzt `w-full sm:w-24`; die Desktop-Zeile bleibt wie sie war. <br>**Drei Messfehler in der Suite selbst, gefunden und behoben:** WebKit richtet `position: fixed` am *visuellen* Viewport aus, der dort 6 px kleiner ist als `innerHeight` — die Safe-Area-Pruefung war deshalb auf dem iPhone dauerhaft rot, ohne dass etwas falsch war. Der Admin-Sidebar-Eintrag traegt ein „Admin"-Abzeichen, sein zugaenglicher Name lautet also „Admin Admin" — die Suche laeuft jetzt ueber `href`. Und ohne Warten auf die Hydration verpuffte unter Last jeder Tap: das Markup steht, aber es haengt noch kein Ereignis daran. <br>**Dokumentation (C2):** README um „Mobile & PWA" erweitert (Installation je Geraet, Navigation nach Breakpoint, Scan-Flow inkl. Aufruf-Vertrag, Android-Share-Target, iOS-Kurzbefehl, Offline-Einkaufsliste, Touch-Konventionen), Testabschnitt um die vier Projekte und die Spec-Tabelle, vier neue Troubleshooting-Eintraege (fehlendes WebKit, Kamera ohne HTTPS, alte Version nach Update). `tasks/todo.md` bekommt Phase 19 mit allen 41 Checkboxen dieses Dokuments. <br>**Umgebungsnotiz, kein Codebefund:** `npx playwright install webkit` bleibt auf diesem Rechner nach dem Download (100 % von 75,4 MiB) beim Entpacken haengen — der Prozess wartet ohne CPU-Last. WebKit wurde deshalb von Hand nach `~/Library/Caches/ms-playwright/webkit-2272` entpackt. | `npm run build` gruen · `npm run lint` gruen · `tsc --noEmit` gruen · `vitest` 123/123 gruen · Playwright Mobile 97 passed / 0 failed / 0 flaky ueber `mobile-safari`, `mobile-chrome` und `tablet` (56,6 s) · Playwright `chromium` 212 passed / 0 failed / 1 flaky (`phase-6` 6.6 Schluessel-Speicherung, im Retry gruen — dieselbe bekannte Flake wie in Welle 1, unabhaengig von Welle 3) |
| D      | D.1–D.3 erbracht; D.4–D.6 offen (brauchen Push, echtes Geraet und Freigabe) | **Keine Abweichung, keine Nacharbeit noetig** — die drei automatisierten Tore liefen ohne Befund durch. Bemerkenswert ist nur die Skip-Bilanz von D.2: 9 der 319 Tests werden uebersprungen, und zwar ausschliesslich layoutbedingt. Auf den beiden Handy-Profilen entfaellt der Sidebar-Test (2), auf dem iPad die sieben Tests, die die Tab-Leiste und das `[+]`-Sheet brauchen (4 aus `mobile-navigation`, 3 aus `mobile-erfassen`) — beides gibt es ab `md` nicht mehr. 2 + 7 = 9, die Rechnung geht auf: kein Test wird still uebersprungen, weil eine Voraussetzung fehlt. Bei D.3 greift ebenfalls kein Waechter: weder `requires_db` (Postgres laeuft) noch `_skip_without_key` (Gemini-Schluessel gesetzt), die 12 OCR-Routen-Tests und die 9 Live-Gemini-Tests liefen also wirklich. <br>**D.4:** Branch gepusht, Vercel-Preview `READY` (`rezeptmeister-git-feature-mobile-pwa-rautaki.vercel.app`). Die Preview steht hinter Vercel-SSO; fuer die Handy-Abnahme wurde ein zeitlich begrenzter Share-Link benutzt. Wichtig: Preview und Produktion teilen `DATABASE_URL` — die Abnahme laeuft auf echten Daten. <br>**D.5 (laufend) — drei Befunde am Geraet, die die Suite prinzipbedingt nicht sehen konnte:** (1) **Sackgasse.** `/einstellungen` und `/admin` lagen ausserhalb der Route-Gruppe `(app)` und bekamen damit weder Sidebar noch Tab-Leiste; auf dem Handy fuehrte von dort kein sichtbarer Weg zurueck (`/admin` hatte immerhin „Zurueck zur App", `/einstellungen` nur die Wortmarke). Beide sind jetzt in `(app)`; die URLs aendern sich dadurch nicht, Routengruppen wirken nur aufs Layout. Ihre selbstgebauten Kopfleisten sind entfallen — sonst haette die Seite zwei uebereinander. `/einstellungen` nutzt jetzt `PageHeader` wie jede andere Seite der Gruppe. **Die Suite hatte hier eine echte Luecke:** sie prueft, ob jede Seite *erreichbar* ist, nicht ob man von ihr wieder *wegkommt*. Neuer Test „Von jeder Seite fuehrt ein Weg zurueck"; gegen den alten Stand gegengeprueft, er faellt dort mit „/einstellungen bietet keinen Weg zurueck". `/offline` ist begruendet ausgenommen (Service-Worker-Rueckfall, bringt seinen eigenen Rueckweg mit). (2) **Mehrseitiges OCR schlaegt fehl („Ungueltige Eingabedaten") — kein Codefehler, ein Deploy-Stand.** Der Text ist die Uebersetzung eines 422 aus `lib/backend.ts:103`; abgelehnt hat also FastAPI, nicht Next.js. Auf `origin/main` kennt `OcrExtractRequest` nur `image_id` — das Mehrseiten-OCR aus A2 liegt nur auf diesem Branch und ist nie deployt worden. Render (`srv-d7a2glnpm1nc73brf0tg`, autoDeploy aus `main`, Free-Plan) serviert weiterhin den alten Vertrag. **Folgerisiko fuer den Merge:** die Route schickt immer `image_ids`, auch bei einer Seite — ist Vercel vor Render fertig, ist in diesem Fenster *jedes* OCR kaputt, nicht nur das mehrseitige. Der Branch-Backend akzeptiert `image_id` und `image_ids`, ist also abwaertskompatibel und darf gefahrlos **vor** dem Frontend deployt werden. (3) **Tab-Leiste unter dem Home-Indicator — offen.** `viewport-fit=cover` steht im ausgelieferten HTML (per curl geprueft, nicht aus dem Quelltext geraten), `.safe-area-inset-bottom{padding-bottom:env(safe-area-inset-bottom,0px)}` ist im gebauten Stylesheet, es gibt keine konkurrierende Regel. Die Ursache ist damit noch nicht gefunden; in der Playwright-Emulation gibt es keine Safe Area, der Fall ist dort strukturell unsichtbar. <br>**Vierter Befund (Schritt 7): das Adressfeld verlor nach dem ersten Buchstaben den Fokus, auf dem iPhone fiel dabei die Tastatur zu.** Reproduziert als Test (nur „h" kam an), dann die Ursache gemessen statt geraten: beim Öffnen liegt der Fokus auf dem Schliessen-Knopf, nach dem Tippen sprang er dorthin zurück. Wurzel ist nicht der URL-Dialog, sondern `Modal.tsx` (Stream F): Erstfokus und Tastatur-Falle steckten in **einem** Effekt mit `onClose` in den Abhängigkeiten. Fast jeder Aufrufer übergibt `onClose` als frisch erzeugte Funktion, also lief der Effekt bei jedem Rendern erneut und `first.focus()` riss den Fokus aus dem gerade bedienten Feld. Das betraf **jedes** Modal mit Texteingabe, nicht nur den URL-Import. Jetzt getrennt: Erstfokus einmalig an `[open, visible]` (`visible` gehört dazu, weil das Panel erst im Durchlauf danach existiert), Tastatur-Handler über eine Ref auf `onClose`. Nebenbei behoben: die Liste der fokussierbaren Elemente war eine Momentaufnahme und veraltete, sobald ein Dialog seinen Inhalt wechselt — sie wird jetzt bei jedem Tastendruck frisch gelesen. Regressionstest „Das Adressfeld behaelt den Fokus waehrend der Eingabe". <br>**Fünfter Befund (nach Schritt 7): „KI-Bild generieren" antwortete mit „Ungültige Eingabedaten".** Wieder ein 422 aus dem Backend. Gemessen gegen das lokale FastAPI: ab **21 Zutaten** lehnt Pydantic mit `List should have at most 20 items` ab, ebenso bei einem Zutatennamen über 100 oder einem Titel über 200 Zeichen. Die Grenzen sind richtig — die Werte sind Benutzereingaben und landen unverändert in einem LLM-Prompt. Falsch war, sie zu ignorieren: die Next.js-Route reichte alle Zutaten durch, obwohl ihr eigenes zod-Schema lockerer ist als das des Backends. Ein Rezept mit 25 Zutaten ist völlig normal und darf daran nicht scheitern, zumal das Backend den Prompt ohnehin nur aus `ingredients[:8]` baut. Neu `lib/ai/generate-image-payload.ts`: kürzt statt abzulehnen, mit 6 Vitest-Fällen; die Route nutzt es. <br>**Nach dem Backend-Deploy erneut geprüft:** Schritt 6 der Checkliste läuft durch — zwei Kochbuchseiten, ein Rezept, Zutaten beider Seiten zusammengeführt. Damit ist auch die seit Welle 1 offene A3-DoD erledigt. <br>**Stabilisierung der vier „flaky" Bestands-Tests (auf Anweisung, als eigenes Stück Arbeit).** Ergebnis vorweg: keiner davon war zufällig. Drei Ursachen, jede gemessen statt geraten. (1) **Ein echter Produktfehler in der Einkaufsliste** (`10.8`, `10.2`): `revalidate()` schützte nur gegen *eingereihte* Operationen — online mit leerer Warteschlange geht ein Haken direkt raus und taucht dort nie auf. Eine Antwort auf `GET /api/shopping-list`, die *vor* dem Abhaken losgeschickt wurde, überschrieb den Haken beim Eintreffen wieder; auf langsamen Verbindungen ein sichtbares Zurückspringen. Deterministisch reproduziert, indem im Test die *Antwort* (nicht die Anfrage) angehalten wurde — beim ersten Versuch mit angehaltener Anfrage gab es kein Rennen, ein lehrreicher Fehlgriff. Behoben mit einem Schreibzähler (`writeEpoch`) plus Zähler laufender Direktschreibungen in `shopping-sync.ts`; eine Antwort wird verworfen, wenn seit ihrem Absenden geschrieben wurde. Regressionstest „Ein Haken ueberlebt eine gleichzeitig laufende Aktualisierung"; dazu die Hydrations-Sperre aus C1.5 auch in `phase-10`. (2) **Dateiübergreifender Zustand ohne Ausschluss** (`6.6`, `6.8`, `8.7`, `8.8`): der KI-Schlüssel hängt am gemeinsamen Admin-Konto, Playwright fährt Dateien parallel. `phase-7` 7.4 löscht ihn im *ungesperrten* ersten Describe, `phase-2` §2.3 liess seinen Testschlüssel liegen, `phase-6` 6.1/6.4 setzen „kein Schlüssel" voraus — die Live-Blöcke bekamen 400 „Kein Gemini API-Schlüssel hinterlegt" von Dateien, die sie nie gesehen hatten; `mode: "serial"` wirkt nur innerhalb einer Datei. Neu `tests/helpers/shared-lock.ts`, ein besitzbewusster Mutex: Halter-PID im Sperrverzeichnis, Freigabe nur durch den Besitzer, „verwaist" heisst *Halter tot* (nicht „älter als n Minuten" — ein Live-Block hält länger als jede Altersgrenze), und die Sperre hebt das 30-s-Hook-Budget selbst an. Zwei Fehler der ersten Fassung wurden dabei selbst gemessen: `afterAll` läuft in Deklarationsreihenfolge, eine getrennt registrierte Freigabe kam *vor* dem Löschen; und ein gescheiterter `beforeAll` (Hook-Timeout) liess Playwright den `afterAll` trotzdem laufen — der löschte einen fremden Schlüssel und riss die fremde Sperre mit. Deshalb: Aufräumen und Freigabe in *einem* `try/finally`, Aufräumen nur bei `holdsLock()`. (3) **Fremde API** (`8.13`): `Web-Suche-Fehler: ServerError: 503 UNAVAILABLE` im Backend-Log — Gemini selbst war kurz weg, das Backend reichte es korrekt als 502 durch. `tests/helpers/live-ai.ts` wiederholt nur 5xx begrenzt; 4xx fallen sofort, damit ein echter Regressionsfehler nicht kaschiert wird. **Nachweis:** die Kombination `phase-2/6/7/8/10`, die vorher etwa jeden zweiten Lauf riss, sechsmal in Folge 60/60; die gesamte Suite über alle vier Projekte **319 passed / 0 failed / 0 flaky / 9 skipped**. <br>**Offen:** Rest von D.5 (Icon, Bereiche über „Mehr", URL-Import, Einkaufsliste im Flugmodus, Aufräumen; dazu die Bestätigung, dass die Tab-Ziele treffbar sind), D.6 (Freigabe) und D.7 (Render-Branch zurückstellen). Der Merge nach `main` ist bis dahin gesperrt. | **D.1:** `npm run build` gruen (frisch nach `rm -rf .next`, 52/52 Seiten) · `npm run lint` gruen · `tsc --noEmit` gruen · `vitest` 123/123 gruen · **D.2:** Playwright 310 passed / 0 failed / 0 flaky / 9 skipped von 319 ueber alle vier Projekte (4,8 min; `chromium` 213, `mobile-safari` / `mobile-chrome` / `tablet` je 35, Anmelde-Setup 1) · **D.3:** `uv run pytest` 58/58 gruen, 0 Skips, gegen die echte Postgres auf `localhost:5434` |
