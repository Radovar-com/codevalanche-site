# Operare și lansare analytics propriu

Stare la 15 octombrie 2026: implementare în worktree-urile de integrare; **capturarea publică este oprită**. `src/config.js` și `R/app/analytics/config.ts` au `enabled:false`, URL colector gol, iar manifestul real de download este gol. Producția Supabase inspectată rămâne legacy. Există separat proiectul test Free codevalanche-analytics-test-20261015: 35 migrații aplicate și protocolul intern Auth verificat cu 24 verificări reale pe conturi sintetice, flag final false. T9/T10, UI și corecțiile runtime/compatibilitate au review local aprobat; E2E hosted, noua suită finală C și review-ul întregii ramuri rămân gate-uri separate. Acest ghid nu dovedește lansare, configurarea joburilor ori calificarea completă live.

În acest document C este repo-ul Codevalanche, R repo-ul Radovar, O repo-ul Company OS. Vezi [ghidul pentru redesign](owned-analytics-redesign.md), [operarea conturilor](owned-analytics-account-operations.md), [dovezile download](owned-download-evidence.md) și [definițiile rapoartelor](owned-analytics-report-definitions.md). Indexul durabil din O este `docs/verification/2026-10-15-owned-analytics-acceptance.md`.

## Ce reprezintă datele

| Domeniu | Populație și limită |
|---|---|
| O — rezultate operaționale de cont | Identitate Auth și rezultate confirmate; nu depind de acceptarea W. Absența acoperirii furnizorului rămâne `null`/necalificat. |
| W — website consimțit | Observații ale browserelor cu alegere și receipt valid; ID-urile nu sunt persoane. Nu reprezintă toți vizitatorii. |
| A — activitate de cont consimțită | Principal curent verificat și opt-in P4 curent, separat de W. Nu se importă istoricul Guest și nu se transferă identitatea între domenii. |
| D — distribuție | Click, redirect, delta de counter, transfer și activare sunt dovezi diferite. Nu împărți O sau D la W pentru a inventa o conversie. |

Un raport absent/necalificat întoarce `not_configured` și valori `null`, nu zero măsurat. Erorile de sursă sunt `unavailable`/`source_unavailable`; ferestrele incomplet acoperite sunt `partial`. `watermark` este ultima dovadă calificată, nu ora generării raportului. Acoperirea consimțământului rămâne `unknown` fără denominator verificat. `sampleSize` nu înlocuiește numărul de sesiuni sau persoane. Nu promite retenție D1/D7/D30 din ID-uri de browser.

Raw analytics se păstrează 90 zile; numai agregatele neidentificabile suportate se păstrează 13 luni. După raw nu există period uniques, repeat browsers sau funnel exact prin însumarea distinctelor zilnice. Profilele au rezultate terminale mutabile și raportare exactă numai în raw90d; retry-ul reușit poate înlocui eșecul anterior și muta bucket-ul. Profilele funcționale și cheile lor de idempotency durează până la ștergerea contului, separat de outcomes raw. Receipt-urile expiră în maximum180 zile; registry/binding expirate sau revocate se șterg numai după dispariția referințelor raw/sesiune încă reținute. Cookie180d nu promite ștergere simultană server-side. Arhiva D este zilnică UTC: după raw nu răspunde exact la zile Bucharest ori intervale UTC parțiale. Consultați capabilitățile fiecărei metrici înainte de export/comparație.

## Pachetul concret înainte de activare

1. Înregistrează commiturile C/R/O și ordinea celor 35 migrații. Păstrează snapshotul original de 29 ca istoric: 28 sunt neschimbate, iar 022 are o singură revizie inițială provider-supported autorizată înainte de prima aplicare (obiecte absente în producția T0 și tranzacție 022 rolled back în test). Hash-urile originale/curente sunt distincte. După aplicarea 022, corecția qualifierului este aditivă prin 006, fără rescriere de istoric. Lanțul nou complet este `202610150001_owned_website_analytics.sql` → `202610150002_website_analytics_rollups.sql` → `202610150003_website_analytics_retention.sql` → `202610150004_profile_outcomes.sql` → `202610150005_download_evidence.sql` → `202610150006_auth_correlation_trigger_qualification.sql`. Revizuiește hash-urile și ordinea la head-ul final; nu modifica migrații deja aplicate.
2. Califică un staging separat, fără copii ale userilor producției, cu origini HTTPS exacte, Auth/redirecturi/SMTP specifice mediului și operator real autorizat. Nu folosi wildcard pentru preview și nu trimite preview în producție. Provisionarea cu cost necesită aprobarea controllerului după pregătirea acestui pachet; ghidul nu o autorizează.
3. Inventariază procesorii și logurile: câmpuri, acces, retenție, export, redacție, regiune și backup. Providerul poate loga IP/UA/referrer, iar GitHub Pages loghează IP pentru securitate; politica raw90d nu se aplică automat acestor loguri. Retențiile efective nu sunt încă verificate. Nu loga body, header, URL brut, token, user sau obiecte de eroare ale colectorului.
4. Pregătește configurația server pentru `website-analytics`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ACCOUNT_OAUTH_CLIENT_IDS`, `WEBSITE_ANALYTICS_NETWORK_SECRET`. Ultimele două trebuie calificate pentru mediul real; cheile rămân server-side și nu se tipăresc în loguri. Verifică semantica adresei efective de conexiune: un ingress comun nu este limitare per om. Headerul declarat de client nu devine autoritate de rețea.
5. Aplică schema aditivă și livrează împreună adaptoarele de cont read/write din 004, colectorul, `download-redirect` și citirile operatorului. Publicarea paginilor și migrarea Supabase sunt operații separate. Califică rolul, sesiunea, MFA, expirarea și retragerea operatorului pentru proxy-ul O `GET /api/website-analytics/:view`; fără JWT/service role în renderer.
6. Califică și activează separat jobul de mentenanță descris mai jos. Migrarea 009 definește orchestratorul și controlul privat al programării; nu instalează extensia ori jobul. Rulează drill de retention/rollback numai pe baza de test. Un rollback de fixture nu dovedește backup/restaurare completă a bazei și a conturilor Auth.
7. Pentru D, completează numai manifestul verificat `supabase/functions/_shared/download-manifest.json`, cu gateway HTTPS, origini exacte, release/artifact/platform/architecture și target fără credentials/query/fragment. Colectorul, gateway-ul și buildul public trebuie să folosească același manifest. Califică separat sursa counter/delivery/native; manifestul nu dovedește transfer sau instalare. Lipsa unei surse păstrează metricile ei neconfigurate.
8. Rulează gate-urile staging din indexul de acceptanță, inclusiv două sesiuni PostgreSQL independente pentru concurența ingest/revoke și deduplicare. Un PGlite cu o conexiune ori `Promise.all` nu califică aceste blocări. Verifică Auth/email/OAuth/MFA reale pe identități sintetice, fără promovări de rol improvizate.
9. Numai după probe și review configurează URL-urile publice aprobate și `enabled:true`, actualizează politica exact pentru versiunea lansată și livrează site-urile. Fără proiecte analytics moștenite, tracker secundar sau activare prin simpla salvare a preferinței. Înregistrează ora/commit/hash/config și sursele rămase `not_configured`.

## Compatibilitate hosted Auth și gate de producție

[Nota de compatibilitate](hosted-auth-correlation-compatibility.md) explică excepția 022 și 006. Instalarea legitimă ca owner/superuser păstrează ALWAYS; instalarea managed Supabase cu owner supabase_auth_admin folosește trigger O și calificare strictă fail-closed pentru origine/local, roluri/privilegii/defaulturi și definiții exacte, inclusiv tgattr gol. O nu promite execuție sub scrieri privilegiate replica arbitrare. Nu schimba ownership/grants și nu marca manual migrații ca aplicate.

Canary-ul staging post 006 a folosit GoTrue real pe conturi sintetice admin-confirmate, cu receipt/fence/rollback/suspendare/reactivare și retragerea actorului. Configurația a fost resetată false și membershipul actorului retras. Acesta califică protocolul intern izolat, nu livrare email, OAuth, MFA curent, operator/browser/API ori producție. Migrarea celor 35 și deploymentul funcțiilor în test nu activează captura site-urilor. Calificarea producției, joburile/restore, release-ul real și smoke-ul complet rămân necesare înainte de activare.

## Build și mentenanță pentru cele două site-uri

### Mentenanța datelor: instalare explicită și verificare

`202610150009_website_analytics_maintenance.sql` adaugă `wa_run_website_analytics_maintenance()` fără parametri de dată, identitate ori țintă. Folosește ora bazei și lanțul existent: 003 construiește agregatele W înainte de ștergerea raw și execută retenția profilurilor din 004 și D din 005; 007 adaugă receipt-urile provider-session. Helperul TypeScript existent rămâne un apel server-only cu dată controlată pentru probe; jobul nou cheamă direct orchestratorul fără parametri.

Politicile sunt raw90d pentru W/sesiuni, outcomes de profil, receipt-uri provider-session și cereri D; agregate W/D, health și snapshots provider13 luni. Registrul receipt/binding are politica separată de expirare și referințe descrisă mai sus. Profilul funcțional și cheile de idempotency rămân până la ștergerea contului. Agregatele nu păstrează user/session/browser IDs și nu permit reconstrucția distinctelor pe perioade după ștergerea raw. Un job zilnic aplică pragurile la fiecare execuție reușită; între execuții poate exista întârzierea de până la o zi, iar un job eșuat trebuie remediat.

Orchestratorul folosește aceeași blocare advisory ca refresh/prune, revine `skipped_busy` dacă rulează deja mentenanța și limitează așteptarea blocărilor la5 secunde. Lucrările de curățare sunt atomice: un eșec D anulează și ștergerile W anterioare din aceeași încercare. `wa_maintenance_state` este un singur rând privat cu ultima încercare finalizată, status, ultimul succes și numai SQLSTATE pentru eroare. Nu conține mesajul erorii, persoane, evenimente ori tokenuri. `last_success_at` este succesul mentenanței, **nu watermark al surselor analytics**. Cancelarea/timeout-ul întrerupe apelul și nu înscrie succes; starea poate rămâne la încercarea anterioară, deci se verifică și rezultatul schedulerului.

După review, administratorul bazei instalează/califică extensia pg_cron în mediul ales și verifică `cron.timezone` UTC/GMT și ținta locală. Instalarea migrației singure nu pornește nimic. Apoi, din conexiunea administrativă a bazei corecte:

```sql
-- Operație explicită; numai după calificarea extensiei și a mediului.
select public.wa_configure_website_analytics_maintenance(true);
select jobid,jobname,schedule,command,database,username,nodename,nodeport,active
from cron.job where jobname='owned-website-analytics-maintenance-v1';
```

Programarea este zilnic la02:17 UTC. Comanda locală fixează timeout-ul instrucțiunii la5 minute și așteptarea blocărilor la5 secunde, apoi cheamă orchestratorul. Nu există HTTP, API key sau secret în comandă. Configurarea repetată reutilizează un singur job, corectează ora/activarea pentru jobul verificat și refuză duplicate ori o comandă/identitate/bază/host/port diferite. Nu modifică joburi fără numele exact. `wa_configure_website_analytics_maintenance()` fără argument înseamnă dezactivare/eliminare, la fel ca apelul explicit cu `false`; nu creează job. Operațiile de programare rămân numai administratorului/ownerului funcției, fără EXECUTE pentru `service_role`, `authenticated` ori `anon`. Orchestratorul și citirea health sunt server-only pentru `service_role`, fără acces din browser.

```sql
select * from public.wa_maintenance_state;
select d.status,d.start_time,d.end_time,d.return_message
from cron.job_run_details d join cron.job j using(jobid)
where j.jobname='owned-website-analytics-maintenance-v1'
order by d.start_time desc limit 10;
-- Oprire explicită, idempotentă; nu șterge datele analytics.
select public.wa_configure_website_analytics_maintenance(false);
```

Un `succeeded` în pg_cron dovedește că instrucțiunea SQL s-a executat, nu că retenția a reușit: orchestratorul poate întoarce `failed` cu SQLSTATE ori `skipped_busy`. Confirmarea cere `wa_maintenance_state.status='succeeded'` și `last_success_at` în intervalul execuției observate. La timeout/cancel verifică failure-ul din cron chiar dacă starea încă arată un succes vechi. Lipsa unei execuții, succesul învechit ori o eroare nu se prezintă drept retenție calificată. Logs/backup/cron history ale providerului au propria politică; acest job nu le șterge și nu certifică retenția lor.

Calificarea locală folosește SQL real pentru retenție, rollback și autorizare; adaptorul cron din test verifică numai gestionarea jobului. Activarea efectivă, execuția reală pg_cron și observarea succesului trebuie consemnate separat în dovezile staging înainte de lansare. Niciun rezultat local nu înseamnă că jobul rulează în producție.

Runtime-ul este Node `24.18.1`; C declară npm `11.16.0` în `engines` și `packageManager`. Workflow-urile C `.github/workflows/deploy-pages.yml` și R `.github/workflows/deploy.yml` fixează Node `24.18.1`; păstrează pașii existenți. Nu presupune că pinul Node verifică singur versiunea npm ori că workflow-ul a rulat deja. Folosește dependențele și lockfile-urile existente.

Din rădăcina C, rebuildul comun real este:

```powershell
node scripts/build-analytics.mjs --radovar-root 'C:/cale/catre/R'
node scripts/build-analytics.mjs --check --radovar-root 'C:/cale/catre/R'
```

Înlocuiește calea cu checkout-ul R aferent aceleiași livrări. Sursa este C `src/analytics/core/`; `src/analytics/owned-analytics.js`, `src/analytics/manifest.json`, R `public/analytics/owned-analytics.js` și `manifest.json` sunt generate. Nu le edita manual și nu genera doar C dacă sursa comună s-a schimbat. Buildul verifică byte parity și manifest; `sha256` identifică bundle-ul, `sourceSha256` include și contractul/manifest helper, deci se poate schimba fără schimbarea bytes SDK. Păstrează perechea în commituri coordonate. `npm run build` din C produce `dist` și inserează manifestul public; R `npm run build` produce exportul Next și respectă `BASE_PATH`.

Verificări proporționale: C `node scripts/website-analytics-test.mjs`; conturi `node scripts/account-analytics-browser-test.mjs` și `node scripts/account-analytics-ui.test.mjs`; R `npm run typecheck`, `npm run build`, `node scripts/analytics-browser-test.mjs`. Pentru SDK/CMP folosește suitele relevante din `scripts/` și verificarea perechii. Acceptanța finală combinată și runnerul O sunt coordonate de controller la head-uri stabile; acest checkpoint nu pretinde că le-a executat.

## Smoke după publicare și diagnostic

Într-un browser nou pentru fiecare domeniu verifică zero ID/coadă/request opțional înainte de acord, apoi acceptare cu receipt valid, refuz, retragere în același/alt tab și offline, ACK întârziat și regrant. Testează mobil/desktop, focusul CMP/footer, refresh, hash, rută, Back/Forward și restaurare BFCache observată efectiv. Repetă cu asset SDK lipsă, colector indisponibil și limitare: navigarea, loginul, profilul și downloadul funcționează independent.

Urmărește lanțul sintetic etichetat și exclus din business: receipt → raw acceptat → agregat → raport → dashboard → explicație explicită. Compară populația, definiția, fereastra `[from,to)`, timezone, watermark și limitările; nu doar contorul. Testează DST 23h/25h și limitele raw/arhivă. Auth A/B/Guest, logout/switch/expiry/P4 regrant trebuie să respingă identitatea/coada veche. `download_clicked` este un singur intent; 302 este redirect, counter delta este interval, 206/range nu este fișier complet.

Explicația O folosește nouă unelte agregate read-only și dovezi preluate server-side în runtime-ul Claude CLI existent. Nu este tool calling MCP nativ; Codex/GLM analytics rămân neconfigurate. Acțiunea operatorului este explicită; datele de autentificare nu merg în prompt. Probe cu child sintetic nu certifică prose/live provider.

## Rollback sigur

Oprește mai întâi capturarea prin configurația ambelor site-uri și restrânge sursa/colectorul conform incidentului. Publică asset/config corect și verifică rețeaua: o alegere acceptată anterior nu trebuie să trimită către endpoint relativ ori vechi. Păstrează CMP și retragerea; indisponibilitatea colectorului nu justifică reactivarea unei cozi vechi. Păstrează conturi/download funcționale și marchează intervalul afectat ca lacună, nu zero trafic.

Păstrează schema aditivă și datele; nu folosi purge/drop sau reset Auth pentru rollback. **După primul save canonic în `codevalanche_profiles`, păstrează writerul și toți readerii noi chiar cu capture off.** Auth metadata este fallback numai înainte de primul owned row. Revenirea la readeri metadata-only poate afișa nume/bio vechi; este necesară reconciliere explicită înainte de o astfel de revenire. Nu suprascrie niciodată profilul canonic cu metadata Auth veche.

Înregistrează commiturile revenite, starea manifestului și intervalul de lipsă a datelor; revizuiește din nou gate-urile înainte de reactivare. Păstrează dovezile SDD și copiile durabile pe durata integrării/aprobărilor; nici acest ghid, nici un build local nu închid gate-urile hosted.
