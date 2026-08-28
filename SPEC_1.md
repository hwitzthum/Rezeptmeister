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
| **1** | **A1** | Navigation & Mehr-Menü                | ✅ parallel               | ⬜     | 0/5         |
| **1** | **A2** | Backend: Mehrseiten-OCR               | ✅ parallel               | ⬜     | 0/4         |
| **1** | **A3** | Frontend: Scan-Flow                   | ✅ parallel               | ⬜     | 0/6         |
| **1** | **A4** | URL-Import unterwegs                  | ✅ parallel               | ⬜     | 0/4         |
| **1** | **A5** | Einkaufsliste offline + Sync          | ✅ parallel               | ⬜     | 0/6         |
| **2** | **B1** | Seiten-Sweep: Rezepte-Bereich         | ✅ parallel               | ⬜     | 0/5         |
| **2** | **B2** | Seiten-Sweep: Planen & Entdecken      | ✅ parallel               | ⬜     | 0/5         |
| **2** | **B3** | Seiten-Sweep: Admin, Konto, Sonstiges | ✅ parallel               | ⬜     | 0/5         |
| **3** | **C1** | Playwright-Mobile-Suite               | teilweise                 | ⬜     | 0/5         |
| **3** | **C2** | Dokumentation (README, todo.md)       | ✅ parallel zu C1         | ⬜     | 0/3         |
| **4** | **D**  | Gesamt-Verifikation & Abnahme         | nein                      | ⬜     | 0/6         |

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

- [ ] **A1.1** Breakpoint `lg:` → `md:` in `Sidebar.tsx` und `app/(app)/layout.tsx` — ab 768 px
      (iPad hoch) erscheint die Sidebar, die Tab-Leiste verschwindet, `pb-16` entfällt.
- [ ] **A1.2** Tab-Leiste neu belegen: `Rezepte · Suche · [+] · Einkauf · Mehr` (Dashboard wandert ins
      Mehr-Menü, bleibt über das Logo erreichbar). Tap-Targets ≥ 44 px, `safe-area-inset-bottom`
      greift jetzt tatsächlich.
- [ ] **A1.3** Neue Seite `app/(app)/mehr/page.tsx`: gruppierte Liste **aller** übrigen Bereiche
      (Dashboard, Wochenplan, Sammlungen, Bildergalerie, Vorschläge, Werkzeuge, Einstellungen, Admin
      nur bei `USER_ROLE.admin`) plus `ThemeToggle`, Benutzername, Abmelden — gespeist aus `nav-items`.
- [ ] **A1.4** `CreateActionSheet`: `[+]` öffnet ein Sheet mit drei Wegen — _Rezept abfotografieren_
      → `/rezepte/scannen`, _Von URL importieren_ → `UrlImportDialog`, _Manuell erfassen_ → `/rezepte/neu`.
- [ ] **A1.5** Sidebar liest ihre Einträge aus `nav-items` statt aus lokalen Arrays (Desktop-Verhalten
      unverändert).

**DoD:** Jede Route ist rein per Antippen erreichbar; Desktop-Layout unverändert.

### A2 — Backend: Mehrseiten-OCR

- [ ] **A2.1** `extract_recipes_from_images(image_paths: list[str], api_key)` in `ocr_service.py`:
      alle Bilder als `types.Part.from_bytes` in **einen** Gemini-Aufruf. Einzelbild-Funktion bleibt
      für den Galerie-Weg bestehen.
- [ ] **A2.2** Prompt-Variante, die explizit sagt: die Bilder sind **aufeinanderfolgende Seiten
      desselben Rezepts** → zu einem Rezept zusammenführen (fortgesetzte Zutatenliste, Schritte
      weiterzählen, keine Duplikate, Kopf-/Fusszeilen ignorieren).
- [ ] **A2.3** `routers/ocr.py`: `image_ids: list[UUID]` (1–10), `image_id` bleibt optional.
      Eigentumsprüfung für **jedes** Bild; Pfadauflösung über `contextlib.AsyncExitStack` um die
      vorhandene `_utils.resolved_image_path`.
- [ ] **A2.4** Pytest im Muster der bestehenden Backend-Tests (echte Postgres-Instanz,
      `skipif` bei fehlender DB): Fremdbild → 403, unbekannte ID → 404, zwei Seiten → ein Rezept.

**DoD:** `uv run pytest` grün; Vertrag 4.1 erfüllt.

### A3 — Frontend: Scan-Flow

- [ ] **A3.1** Neue Route `app/(app)/rezepte/scannen/page.tsx`, kamera-first:
      `<input type="file" accept="image/*" capture="environment" multiple>`, zusätzlich
      „Aus Galerie wählen" ohne `capture`.
- [ ] **A3.2** Seitenliste mit Thumbnails, Reihenfolge ändern, einzelne Seiten löschen,
      „Weitere Seite aufnehmen".
- [ ] **A3.3** `lib/images/downscale.ts`: Canvas-Downscaling (max. Kante ~2000 px, JPEG q0.85) **vor**
      dem Upload — iPhone-Fotos sind 3–5 MB und scheitern sonst am 10-MB-Limit bzw. an Mobilfunk.
- [ ] **A3.4** Upload über die bestehende Route `POST /api/images/upload` (eine Anfrage pro Seite, mit
      Fortschrittsanzeige), danach **ein** OCR-Aufruf über alle `imageIds`.
- [ ] **A3.5** `app/api/ai/ocr/route.ts`: zod auf `imageIds: z.array(z.string().uuid()).min(1).max(10)`
      erweitern, `imageId` weiter akzeptieren, Proxy-Timeout 120 s. Rate-Limit bleibt `AI_LIMIT`.
- [ ] **A3.6** Ergebnis in den vorhandenen `components/ocr/OcrMultiPreview.tsx` geben (Speichern
      unverändert); `capture="environment"` als optionalen Kamera-Button in `ImageUploadZone` nachrüsten.

**DoD:** Zwei Fotos → ein Rezept, gegen echtes Backend verifiziert.

### A4 — URL-Import unterwegs

- [ ] **A4.1** `UrlImportDialog` nutzt `variant="sheet"`, bekommt `inputMode="url"`,
      `autocomplete="url"`, `autoCapitalize="none"`.
- [ ] **A4.2** Button **„Aus Zwischenablage einfügen"** (`navigator.clipboard.readText()`, still
      ausgeblendet wo nicht verfügbar).
- [ ] **A4.3** Neue Seite `app/(app)/rezepte/importieren/page.tsx`: liest `?url=`, öffnet den Dialog
      vorbefüllt (`initialUrl`, `autoStart`) — Ziel des Android-Share-Targets aus F.3.
- [ ] **A4.4** Text für die iOS-Kurzbefehl-Anleitung erstellen (Kurzbefehl mit _Teilen-Sheet-Eingabe_
      → _URL öffnen_ auf `https://…/rezepte/importieren?url=[Eingabe]`) und an **C2** übergeben; ein
      Kurz-Einstieg dazu erscheint auf der Mehr-Seite (Umsetzung dort durch A1 nach Textübergabe).

**DoD:** Import startet aus Sheet, aus Mehr-Menü und aus geteilter URL.

### A5 — Einkaufsliste offline + Sync

- [ ] **A5.1** `lib/offline/db.ts` auf `DB_VERSION 3`, Stores `shoppingList` + `pendingOps` gemäss 4.2;
      `recipes`-Store unangetastet (gemerkte Offline-Rezepte gehen nicht verloren).
- [ ] **A5.2** `lib/offline/shopping-sync.ts`: `queueOp()`, `flushQueue()`, `sendOrQueue()`-Wrapper.
- [ ] **A5.3** `ShoppingListClient` ersetzt seine fünf rohen `fetch`-Aufrufe durch den Wrapper — die
      optimistische Update-Logik bleibt, nur der Rollback entfällt, wenn der Fehler „offline" heisst.
- [ ] **A5.4** Hydration: beim Mount aus IndexedDB laden, dann gegen das Netz revalidieren; jede
      Server-Antwort aktualisiert den Snapshot.
- [ ] **A5.5** Replay bei `online`-Event und Seiten-Fokus, in Reihenfolge, **Last-Write-Wins** pro
      Item-ID; erfolgreiche Ops löschen, dauerhaft fehlschlagende (404 = Item serverseitig weg)
      verwerfen statt endlos wiederholen.
- [ ] **A5.6** `OfflineIndicator` zeigt „n Änderungen werden synchronisiert"; Unit-Tests für die
      Queue in `lib/offline/__tests__/` (Muster wie `lib/shopping/__tests__`).

**DoD:** Im Flugmodus abhaken bleibt bestehen und synchronisiert nach Reconnect.

---

## 7. Welle 2 — Seiten-Sweep (B1–B3 parallel, nach Welle 1)

Einheitliche Kriterien für jede Seite bei **390 × 844** (iPhone) und **820 × 1180** (iPad):
kein horizontaler Scroll · Tap-Targets ≥ 44 px · Modals → `variant="sheet"` · Sticky-Action-Bars
über der Safe-Area · Tabellen unter `md` → Kartenliste · Inputs ≥ 16 px.
**Keiner dieser Streams editiert `globals.css`** — Bedarf an neuen Utilities wird gemeldet, nicht
selbst gebaut.

- [ ] **B1** Rezepte-Bereich: Liste, Detail, Neu, Bearbeiten, Kochmodus, `components/recipes/**`
      (u. a. `NotesPanel.tsx:405`).
- [ ] **B2** Planen & Entdecken: Wochenplan (`MealPlanClient.tsx:407` `grid-cols-1 lg:grid-cols-7` →
      Snap-Scrolling oder Tagesansicht mobil; `:368` `min-w-[200px]`), Sammlungen, Suche
      (inkl. Datei-Input dort), Vorschläge, Bildergalerie, `OcrPreviewPanel.tsx:128`,
      `NutritionPanel.tsx:140` (`grid-cols-5` bei 390 px).
- [ ] **B3** Admin (`AdminDashboard.tsx:539` `<table>` → Kartenliste unter `md`; `:493` `min-w-[200px]`),
      Einstellungen, Auth-Seiten, Offline-Seiten (`offline/rezept/page.tsx:233`), Werkzeuge, Dashboard.
- [ ] **B0** _(alle drei)_ `PageHeader` (`sticky top-0`) auf Kollision mit der iOS-Statusleiste im
      Standalone-Modus prüfen — Befund an F melden, falls eine geteilte Korrektur nötig ist.
- [ ] **B4** _(alle drei)_ Jeder Stream meldet am Ende die Liste geänderter Seiten an **C1**, damit die
      E2E-Suite sie abdeckt.

---

## 8. Welle 3 — Tests & Dokumentation (C1 ∥ C2)

### C1 — Playwright-Mobile-Suite

- [ ] **C1.1** `playwright.config.ts`: Projekte `mobile-safari` (iPhone 14), `mobile-chrome` (Pixel 7),
      `tablet` (iPad gen 7). Bestehendes `chromium` bleibt unverändert, damit die 19 Phase-Specs
      weiterlaufen.
- [ ] **C1.2** `tests/mobile-navigation.spec.ts`: **jede** Route ist rein per Antippen (Tab-Leiste →
      Mehr) erreichbar — sichert den heutigen Hauptmangel ab. Plus: für jede Seite
      `scrollWidth <= clientWidth`, alle sichtbaren Buttons/Links ≥ 44 px.
- [ ] **C1.3** `tests/mobile-erfassen.spec.ts`: `[+]`-Sheet führt zu allen drei Zielen;
      Mehrseiten-Upload via `setInputFiles` mit zwei Bildern → **ein** OCR-Request mit zwei `imageIds`.
- [ ] **C1.4** `tests/mobile-import.spec.ts`: Share-Target-Route füllt den URL-Dialog vor.
- [ ] **C1.5** `tests/mobile-einkaufsliste.spec.ts`: `context.setOffline(true)` → abhaken → Haken
      bleibt → `setOffline(false)` → Nachsynchronisierung serverseitig sichtbar.

### C2 — Dokumentation

- [ ] **C2.1** README: Mobile/PWA-Installation, Scan-Flow, Android-Share-Target, iOS-Kurzbefehl
      (Text von A4). _README-Vollständigkeit ist Teil von „fertig"._
- [ ] **C2.2** `tasks/todo.md`: neue Phase mit allen Checkboxen dieses Dokuments.
- [ ] **C2.3** `SPEC_1.md`: Tracker-Tabelle laufend aktualisieren, am Ende Review-Abschnitt je Stream.

---

## 9. Welle 4 — Gesamt-Verifikation (D, allein)

- [ ] **D.1** `npm run build` + `npm run lint` (Build fängt Next-Fehler, die `tsc` allein übersieht).
- [ ] **D.2** Kompletter Playwright-Lauf über **alle vier** Projekte — inkl. der 19 Bestands-Specs
      als Regressionsnachweis.
- [ ] **D.3** `uv run pytest` gegen eine **echte** Postgres-Instanz.
- [ ] **D.4** Branch pushen → Vercel-Preview-URL. **HTTPS ist Pflicht**: Kamera und Service Worker
      laufen nicht über `http://` im LAN.
- [ ] **D.5** Manuelle iPhone-Checkliste: Installieren über „Zum Home-Bildschirm" · Icon prüfen ·
      Tab-Leiste sitzt über dem Home-Indicator · zweiseitiges Rezept abfotografieren · URL importieren ·
      Einkaufsliste im Flugmodus abhaken · alle Bereiche über „Mehr" erreichbar.
- [ ] **D.6** Ehrliche Gesamtbewertung + **Freigabe einholen**, erst dann Merge nach `main`.

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
| A1–A5  | —        | —                     | —     |
| B1–B3  | —        | —                     | —     |
| C1–C2  | —        | —                     | —     |
| D      | —        | —                     | —     |
