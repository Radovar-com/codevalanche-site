# Instrucțiuni pentru agenți — Codevalanche

## IMPORTANT: păstrează conexiunile analytics la orice redesign

Acest proiect are o implementare proprie de analytics și consimțământ, conectată la rapoartele private Company OS. Când refaci pagini, secțiuni, componente, meniuri sau butoane, **păstrează ori reconectează instrumentarea elementelor modificate**. Aspectul nou nu este suficient pentru a considera lucrarea terminată.

Implementarea poate fi încă în integrare pe branchul `codex/owned-analytics-site-20261015`. Dacă fișierele de mai jos lipsesc din checkout, verifică branchurile/worktree-urile și istoricul înainte de refactorizare; absența locală nu înseamnă că analytics trebuie recreat sau eliminat. Îmbină lucrările paralele păstrând modificările celorlalți.

### Reguli pentru modificări

- Păstrează identificatorii semantici pentru aceeași acțiune/secțiune, indiferent de CSS, text, poziție sau structură. Nu reutiliza un ID vechi pentru alt sens și nu șterge identificatori istorici necesari rapoartelor.
- Păstrează atributele `data-analytics-*`, `data-download-platform` și hook-urile explicite în DOM-ul final. Un component nou trebuie să transmită markerii către elementul real; simpla păstrare a unor props într-un wrapper nu ajunge.
- Pentru o acțiune/secțiune/pagină nouă, înregistrează ID-ul în registrul comun și în validarea backend, apoi leagă evenimentul explicit. Nu adăuga taguri arbitrare, captură după text sau colectare de formulare/DOM.
- Păstrează inițializarea unică și izolată de funcțiile site-ului. O eroare/întârziere a SDK-ului ori colectorului nu trebuie să blocheze taburi, temă, navigare, login, profil sau download.
- Un click produce o singură acțiune semantică. Downloadul, intrarea în cont și contactul au evenimente dedicate; evită dublarea cu un CTA generic. Nu amâna navigarea/salvarea și nu folosi preventDefault doar pentru analytics.
- Păstrează bannerul și accesul permanent la preferințe. Fără acord opțional valid nu crea identificatori/coadă și nu trimite evenimente. Refuzul/retragerea rămân utilizabile în timpul cererilor; acordul de site W și acordul de cont A/P4 sunt independente.
- Pentru conturi, păstrează verificarea utilizatorului curent/P4, curățarea la logout/switch și separarea intențiilor de rezultatele confirmate. Nu trimite tokenuri, user_id, email, valori de profil/formular, URL/query brut sau alte date private în evenimente.
- La schimbări materiale de design marchează versiunea paginii prin configurația existentă; nu schimba pe ascuns definiția metricii și nu reseta istoricul. `pageVersion` și `definitionVersion` au sensuri diferite. Respectă limitele de retenție/capabilitate, nu promite istoric detaliat nelimitat.
- Păstrează configurația de mediu și starea reală de activare. Nu activa o sursă necalificată și nu trimite date din preview către producție. Fără Google Analytics, al doilea tracker ori biblioteci externe introduse doar pentru măsurare.

### Zone de consultat înainte de editare

- `src/account-funnel.js`, `src/site.js`: bootstrap și acțiuni website.
- `src/analytics/core/`: sursa SDK/CMP, registre, sanitizare, coadă și transport.
- `src/config.js`: configurația publică și versiunea paginii; manifestul de release rămâne sursa URL-urilor/ID-urilor aprobate.
- `src/account/analytics.js`, `src/account/app.js`: intenții de cont și integrarea A/P4.
- `supabase/functions/_shared/websiteAnalyticsContract.ts`: contract/registre backend; modifică sincronizat sursa browser și documentația relevantă.
- `docs/owned-analytics-account-operations.md` și ghidul de mentenanță/redesign, dacă este prezent.

`src/analytics/owned-analytics.js` și manifestul sunt generate. Nu le edita manual. Rebuildul cu `scripts/build-analytics.mjs` trebuie să păstreze identice distribuțiile Codevalanche/Radovar atunci când sursa comună se schimbă. Nu edita migrări deja aplicate pentru o schimbare nouă.

### Verificare proporțională cu schimbarea

Folosește runtime-ul pinuit de proiect (minimum Node 24.18.1), dependențele și lockfile-ul existente. Pentru markup/interacțiuni afectate rulează `node scripts/website-analytics-test.mjs`; pentru conturi verifică și testele dedicate account analytics. Pentru sursa comună rulează testele SDK/CMP relevante și verificarea distribuțiilor. Pentru modificări strict vizuale verifică markerii păstrați și suprafețele afectate, fără suite fără legătură.

Confirmă acțiunea reală o singură dată, navigarea nativă, acord/refuz/retragere și funcționarea fără analytics. În raportul final spune ce conexiuni ai păstrat/reconectat și ce verificări ai executat. Un build sau un test cu fixture nu dovedește activare publică. Păstrează schimbările în Git; nu rezolva conflicte prin înlocuirea întregului proiect sau ștergerea datelor.
