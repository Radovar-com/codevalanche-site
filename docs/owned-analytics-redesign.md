# Păstrarea analytics la redesign — Codevalanche și Radovar

Pentru paginile de produs, registrul rutelor, cele 17 traduceri și stările de download consultă și [ghidul de mentenanță al website-ului](product-website-maintenance.md).

Acest playbook se aplică oamenilor și agenților care schimbă oricare site. Citește și `AGENTS.md` din fiecare repo. Backendul, SDK-ul comun, CMP-ul și rapoartele Company OS sunt reutilizabile; legăturile UI sunt explicite și trebuie păstrate sau reconectate la fiecare redesign. Istoricul nu se resetează pentru a schimba aspectul.

## Hosting și backend

Redesignul vizual reutilizează backendul și datele existente. Schimbarea proiectului backend sau Auth este o migrare separată de date și identitate, cu plan explicit, reconciliere, autoritate și consimțământ curente, plus validarea integrării. Nu copia consimțăminte sau ID-uri de browser și nu lega persoane între domenii pentru a rezolva domeniul ori hostingul. Păstrează originile preview existente și nu reseta datele.

## Înainte de schimbare

Identifică branchul/worktree-ul care conține integrarea, commitul de bază și lucrările paralele. Inventariază markerii și handlerii elementelor pe care le înlocuiești. Dacă integrarea lipsește local, consultă branchul/istoricul înainte să o recreezi. Păstrează commiturile și schimbările concurente; integrează redesignul prin merge/reconciliere și review, fără înlocuirea întregului repo cu un template. Nu copia ID-uri de browser, receipt-uri sau acorduri între domenii și nu configura preview către colectorul producției.

| Suprafață | Legătura actuală de păstrat |
|---|---|
| C bootstrap | `src/site.js` importă dinamic `src/account-funnel.js`, cu eșec izolat. Acesta creează un singur client/CMP per document, mapează path→page ID și observă `[data-analytics-section]`. Config: `src/config.js`, `window.CODEVALANCHE_ANALYTICS`. |
| C navigare/contact/download | `src/account-funnel.js` ascultă ancore native: `data-download-platform` are prioritate și emite doar `download_clicked`; apoi account entry, `mailto:` cu `data-contact-id`, navigare și FAQ `details[data-analytics-faq]`. Nu adăuga un CTA generic pentru același click. |
| C download funcțional | `src/downloads.js` inițializează `CODEVALANCHE_DOWNLOAD_LINKS` separat de SDK; `scripts/build.mjs` inserează manifestul server comun. Păstrează platform/release/artifact/architecture și linkul nativ, inclusiv starea release în pregătire. |
| C cont | `src/account/app.js` și `src/account/analytics.js`: page/intents, request UUID pentru profile save, rezultat separat confirmat server-side, principal/P4 curent și cleanup la logout/switch/expiry. Nu muta tokenul în eveniment/storage. |
| R leaf global | `app/layout.tsx` montează `app/_components/AnalyticsProvider.tsx`; providerul încarcă dinamic SDK, anulează lucrările întârziate și dispose la cleanup. Conținutul paginii nu depinde de încărcarea analytics. |
| R rutare | `app/analytics/config.ts` mapează path→page ID și `BASE_PATH`. Providerul folosește ruta comisă, traversal și `popstate`; fără patch global History. Hash/rerender nu devin pageview nou. |
| R markeri | `SiteHeader.tsx`, `SiteFooter.tsx`, `DocPage.tsx`, `ProductExplorer.tsx` și paginile: `data-analytics-section`, `data-analytics-action`, `data-analytics-placement`, `data-analytics-target`, `data-analytics-section-id`, `data-analytics-contact`. |
| R selecții | `ProductExplorer.tsx` cheamă `trackFeature` din `app/analytics/config.ts` numai când selecția se schimbă; `radovar:feature` este consumat explicit de provider pentru `project/agents/review`. |
| Preferințe | C `src/analytics/consent-ui.js`, `[data-open-consent]`; R `CookiePreferences.tsx`, `preferences.css`, `ManageCookies` din footer. UI peste managerul comun, fără CMP separat sau copii locale de receipt/coadă. |

## ID-uri și versiuni

Aceeași acțiune sau secțiune păstrează același ID când se schimbă textul, CSS-ul, ordinea sau componenta. Exemplu C: secțiunea download păstrează `data-analytics-section="download"`; linkul Windows păstrează `data-download-platform="windows"` și metadatele release-ului verificat. Exemplu R pentru linkul produsului:

```tsx
<a href="https://codevalanche.com"
   data-analytics-action="product"
   data-analytics-placement="product_panel"
   data-analytics-section-id="codevalanche">Explore Codevalanche</a>
```

Un wrapper nou trebuie să transmită markerii pe ancora/butonul efectiv din DOM. Nu păstra doar props fără să ajungă în DOM. Dacă muți linkul într-un placement nou, verifică allowlist-ul; nu inventa etichete după text sau clase CSS. C are și inferență de placement după header/footer/hero/download: schimbarea acestor containere cere verificarea handlerului.

Sens nou înseamnă ID nou în C `src/analytics/core/registry.js`, validarea backend `supabase/functions/_shared/websiteAnalyticsContract.ts`, schema/fixtures `supabase/contracts/website-analytics/v1/` și catalogul/definițiile relevante. Adaugă apoi hook explicit și probă a acțiunii reale. Un atribut arbitrar singur nu înregistrează eveniment valid. Păstrează ID-urile și etichetele istorice pentru interpretarea filtrelor; nu reutiliza un ID vechi pentru alt sens.

Menține și `PAGE_SECTION_SCOPE` din C `supabase/functions/_shared/metricDefinitions.ts` când adaugi sau muți o secțiune pe alt tip de pagină. Maparea explicită page→section stabilește oportunitățile de expunere inclusiv când nu există niciun eveniment de expunere; numai markerii vizibili nu pot furniza denominatorul pentru zero-exposure. Verifică ambele site-uri și păstrează concordanța cu markup-ul real; o combinație pagină/secțiune neacoperită nu trebuie prezentată drept reach zero măsurat.

`pageVersion` din configurațiile C/R marchează o schimbare materială de design și permite compararea perioadelor. `definitionVersion` aparține contractului metricii/populației/metodei de calcul; schimbarea layoutului nu o rescrie. Dacă se schimbă sensul metricii, versiunea definiției și capabilitățile se revizuiesc separat. Nu amesteca populații/versiuni în comparații fără etichetare. Raw90d/agregate13mo sunt limite reale, nu istoric detaliat pe viață; vezi [operare](owned-analytics-operations.md).

## Comportament și consimțământ

Lasă clickul, navigarea, tabul, profile save și downloadul să funcționeze nativ. Nu aștepta flush/ACK și nu folosi `preventDefault` doar pentru analytics. Confirmă un eveniment semantic per acțiune; schimbarea unui tab activ pe el însuși nu produce selecție nouă. Nu captura text DOM, valori de formular, URL/query brut, email, token sau identitate declarată de browser.

Fără alegere opțională validă și receipt nu există ID/coadă/emisie. Refuzul/retragerea rămân accesibile în timpul requesturilor întârziate; ACK-ul vechi nu reînvie identitatea. Păstrează footerul Manage cookies, pointer-events, tastatura/focusul și poziția paginii la Accept/Decline. W și A/P4 sunt independente; R nu acordă consimțământ pentru C. Contul A verifică principalul curent/P4, păstrează tokenul doar în memorie/header și abandonează vechea identitate la logout/switch/expirare.

## Livrare și verificare

Schimbarea sursei SDK cere buildul pereche și `--check` din [ghidul de operare](owned-analytics-operations.md); distribuțiile și manifestele sunt generate. Nu edita manual bundle-ul R și nu crea un fork CMP. Păstrează configurația reală de activare, URL-urile exacte aprobate și `BASE_PATH`; nu activa o sursă necalificată pentru a demonstra redesignul.

Pentru C rulează `node scripts/website-analytics-test.mjs`; pentru conturile afectate, și cele două probe account analytics din ghid. Pentru R rulează `npm run typecheck`, `npm run build`, `node scripts/analytics-browser-test.mjs`; dacă schimbi routing/hosting verifică și exportul cu `BASE_PATH`. Folosește Node24.18.1 și dependențele existente. Pentru strict vizual verifică proporțional suprafețele/markerii afectați; nu transforma ghidul într-o cerere de suite fără legătură.

Verifică în browser desktop/mobil: o acțiune, page/section corect, acord/refuz/retragere, keyboard/focus, navigare/Back/hash și funcționare când SDK-ul/colectorul eșuează. StrictMode real și BFCache efectiv sunt probe distincte; un fixture sau build nu dovedește activare hosted. Raportul de livrare enumeră conexiunile păstrate/reconectate, verificările executate, head-urile și limitele rămase. Nu publica peste lucrări concurente și nu șterge datele sau dovezile pentru a „curăța” redesignul.
