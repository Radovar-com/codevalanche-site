# Registru de securitate și fiabilitate — 250 de teme

**Checkpoint: 18 octombrie 2026, după publicarea Radovar și a funcției legacy de conturi, cu publicarea finală Codevalanche în verificare.** Numerele și denumirile sunt păstrate din [lista originală](security-topics-250-20261018.txt). Registrul este o evaluare pe domenii și un plan de urmărire, nu o certificare și nici rezultatul a 250 de teste independente.

Stările descriu numai constatarea delimitată în rând; numărul lor nu se transformă într-un procent de securitate sau conformitate:

- **confirmatlive**: există o citire efectivă a configurației, serviciului ori rezultatului operațional indicat; nu înseamnă protecție universală.
- **sursă/test**: implementare sau probă verificată în sursă, export local, SQL izolat ori staging; nu o promovăm automat la producție.
- **neconfirmat**: lipsește calificarea necesară ori controlul este cunoscut ca neactivat. Rândul arată ce trebuie verificat.
- **neaplicabil**: mecanismul nu aparține arhitecturii administrate în acest mandat; nu adăugăm infrastructură doar pentru a bifa lista. Componentele interne ale furnizorilor rămân în responsabilitatea lor.

**Granițe ale checkpointului:** C include sursa legacy `073f723` și operațiunile `8a03892`, împinse în PR [#4](https://github.com/Radovar-com/codevalanche-site/pull/4) și în oglinda publicată prin PR [#1](https://github.com/cata009/codevalanche-site/pull/1); verificările de publicare sunt încă în curs. R este publicat din `5eb618536492ba50a188ef0e9a4132a192f29739`, după PR [#4](https://github.com/Radovar-com/radovar-site/pull/4) și [deploy reușit](https://github.com/Radovar-com/radovar-site/actions/runs/39104391446). Citirea live confirmă SDK-ul și manifestul `04adcf64…98e4fa`, 114.127 bytes, import versionat, toate cele 13 asseturi Next disponibile și aceleași fonturi. Funcția de producție `codevalanche-account` este **deployment 3, ACTIVE**, cu contractul public v1 păstrat: preimage-ul deploymentului 2 a fost verificat, cele trei fișiere recitite sunt identice byte cu sursa, iar verificările publice negative/preflight au trecut 6/6 înainte și 6/6 după publicare. Cele 21/21 probe autentificate hosted rămân dovezi staging; nu au fost folosite conturi ori sesiuni autentificate reale de producție. Nu s-au aplicat migrările sau pachetul modern MFA staged. Regulile HTTP Cloudflare sunt salvate, dar **nu live** până la delegarea DNS și activarea proxy-ului. Inventarele DNS complete coincid: R 22/22, C 14/14; ambele zone sunt momentan DNS-only pentru emiterea sigură a certificatelor. Analytics rămâne dezactivat; perechea SDK generată are același SHA `04adcf64de54fcf797a5e3cff2dfb50422837774dd9d97fa009cbcd2ac98e4fa`.

## Dovezi folosite

- **[ARH]** — exporturile statice C și R; R folosește Next cu `output: export`, fără server Next public administrat de noi. Conturile sunt un serviciu separat.
- **[CSP]** — generarea CSP și testele de browser; politica meta cu hash-uri nu poate înlocui antetele de răspuns.
- **[EDGE]** — adaptoare HTTP testate local; activarea DNS/edge și citirea antetelor reale sunt încă neconfirmate.
- **[AUTH]** — readback producție: minimum 12 caractere, JWT 3.600 s, rotație refresh activă, reutilizare 10 s; CAPTCHA/HIBP/reauth la schimbarea parolei sunt false.
- **[RLS]** — opt aserțiuni live: cinci tabele legacy cu RLS, fără privilegii pentru rolurile client; cele două RPC sunt numai pentru server, cu search path fix.
- **[LEG]** — sursa legacy separată: 15 teste locale, 21/21 probe hosted corectate în staging, cleanup verificat; zero utilizatori cu flag admin la checkpointul producției. Nu pretinde owner MFA înscris. Publicarea efectivă este delimitată prin [LIVE].
- **[LIVE]** — release legacy de producție la 06:25:04 UTC: deployment 2 → 3 ACTIVE, sursă recitită identică byte și legată de `073f723`, preimage protejat păstrat, 6/6 probe publice negative/preflight înainte și după. Configurația publică rămâne v1/analytics false; catalogul rămâne cinci tabele fără ledger. Nu califică fluxuri autentificate în producție și nu publică backendul modern staged.
- **[MFA]** — backend staged: prospețime AMR, recuperare durabilă și teste SQL/handler; pachetul de calificare raportat are 350 de probe. Migrarea nu este aplicată în producția legacy.
- **[UI]** — fluxul staged cere explicit a doua verificare înaintea primelor coduri de recuperare; probe browser/unit pentru retry și izolare de cont.
- **[GIT]** — readback din sesiune: trei ramuri `main` cer PR și check `build`, inclusiv pentru administratori; force push/deletion sunt oprite. În ambele repo-uri de organizație sunt activate secret scanning, push protection și remedierile Dependabot; politica Actions este limitată la GitHub-owned și SHA. Configurația live nu se deduce doar din YAML.
- **[CI]** — workflow-uri revizuite cu build fără privilegii de publicare, deploy numai din sursa verificată și concurență PR separată. C la `073f723` a avut 568/568 teste complete și audit npm cu zero vulnerabilități; acestea nu constituie un audit exhaustiv.
- **[RTEST]** — R: 21 teste unitare și browser cu 223 de evenimente sintetice validate, refuz/retragere, SDK eșuat și rute research; CI curat și publicare confirmată. Numerele evenimentelor sunt probe sintetice, nu trafic de producție. Buildul folosește aceleași fișiere de font locale și un uploader cu dependența sa fixată la SHA, păstrând politica Actions.
- **[SDK]** — distribuție comună regenerată și identică; câmpuri semantice validate, scopuri de pagină/secțiune și colectare dezactivată.
- **[CACHE]** — revizie comună pentru grafurile de module, CSS și cataloage; hash final pentru bundle-ul contului. HTML-ul deja cache-uit poate persista în fereastra hostului.
- **[OPS]** — metadate operaționale și limite documentate: producție legacy separată de staging; alerte externe și recuperare completă necalificate.
- **[BACK]** — backupuri cifrate și restore local limitat la aplicație; restore-ul arhivei complete staging a refuzat rolurile incompatibile. Nu este full Auth restore. Serverele locale de drill au fost oprite; unele directoare private au fost păstrate, nu declarate șterse.
- **[CUST]** — confirmare operațională a sesiunii: artefacte cifrate încărcate în Drive privat, SHA verificat după descărcare și acces owner-only. Cheia rămâne DPAPI locală; recuperarea pe alt dispozitiv nu este calificată. Nu publicăm linkuri private, chei sau date din backupuri.
- **[JOB]** — outbox, workers, retenție și limite de retry din sursa staged; sănătatea unui job staging nu califică automat producția sau alertele.
- **[DATE]** — definiții de rapoarte, contracte și teste de intervale/UTC/DST; măsurătorile necalificate rămân nule.
- **[LEGAL]** — pagini de confidențialitate și proceduri tehnice; nu reprezintă aviz juridic ori certificare.
- **[PROD]** — manifest de release și descrierea limitelor desktop/provider; niciun installer sau comportament AI nu devine calificat prin publicarea site-ului.

## Registrul complet

| ID | Temă originală | Domeniu | Stare | Constatare și pas următor | Dovadă |
|---:|---|---|---|---|---|
| 1 | SQL Injection | Conturi | sursă/test | RPC-urile și interogările folosesc parametri; sursa legacy este publicată în deployment 3, dar probele SQL nu devin audit universal de producție. Backendul modern staged nu a fost aplicat. | [LEG], [LIVE], [MFA] |
| 2 | XSS | Web/conturi | sursă/test | Textul UI și JSON-LD sunt tratate explicit; CSP blochează scripturi injectate în probe. Nu echivalăm acestea cu un pentest complet. | [CSP], [RTEST] |
| 3 | CSRF | Conturi | sursă/test | Legacy deployment 3 refuză live POST fără bearer; Origin nepermis este refuzat separat. Fluxurile autentificate/native rămân probe staging, iar CORS nu este autorizare. | [LEG], [LIVE] |
| 4 | CORS | Conturi | confirmatlive | Legacy deployment 3 păstrează allowlist explicit, fără wildcard de preview; Origin nepermis dă 403, iar OPTIONS pe originea canonică dă 204, confirmate live. | [LEG], [LIVE] |
| 5 | SSRF | Web/furnizor | neaplicabil | Exporturile publice nu primesc URL-uri de fetch de la utilizator. Orice viitor proxy/backend nou necesită evaluare separată. | [ARH] |
| 6 | IDOR | Conturi | sursă/test | Actorul provine din token verificat; sesiuni străine sunt refuzate în probe. Protecția RLS live este verificată separat. | [LEG], [RLS] |
| 7 | Path Traversal | Web/conturi | sursă/test | Rutele publice sunt înregistrate, nu citiri arbitrare de fișiere; restore-ul acceptă numai ținte locale controlate. | [ARH], [BACK] |
| 8 | Mass Assignment | Conturi | sursă/test | Profilul permite numai câmpurile aprobate; metadata utilizatorului nu acordă admin. Păstrăm validarea serverului înaintea mutațiilor. | [LEG] |
| 9 | Clickjacking | Web | neconfirmat | `frame-ancestors`/X-Frame-Options sunt pregătite, dar nu live. Activăm adaptorul și verificăm antetul HTTP real. | [EDGE] |
| 10 | Content Security Policy | Web | sursă/test | Exporturile au CSP meta cu hash-uri; probele verifică injecție și colector extern. Antetul suplimentar așteaptă activare. | [CSP], [EDGE] |
| 11 | Security Headers | Web | neconfirmat | Codul adaptorului este verificat; nu declarăm HSTS, nosniff ori Permissions-Policy live înaintea readbackului pe domenii. | [EDGE] |
| 12 | Input Validation | Conturi | sursă/test | Scheme, tipuri, limite și caractere de control sunt testate; nu acceptăm flag-uri de calificare ori proprietar din client. | [LEG], [MFA] |
| 13 | Server-Side Authorization | Conturi | confirmatlive | Legacy deployment 3 este ACTIVE, cu sursă recitită identică și refuzuri publice 401 confirmate. Rolul/sesiunea/MFA sunt calificate hosted în staging, fără probe pe conturi autentificate reale de producție. | [LEG], [LIVE] |
| 14 | Row-Level Security | Conturi | confirmatlive | Toate cele cinci tabele legacy au RLS; privilegiile efective client sunt refuzate, 8/8 aserțiuni. Repetăm verificarea după schimbări. | [RLS] |
| 15 | Least Privilege | Conturi/operare | sursă/test | CI separă build/deploy; DB refuză rolurile client. Cheia service_role rămâne privilegiată și necesită custodie strictă. | [CI], [RLS], [OPS] |
| 16 | RBAC | Conturi | sursă/test | Staged folosește memberships; legacy păstrează flag-ul admin controlat de server. Nu transferăm rolurile staged în producție. | [MFA], [LEG] |
| 17 | Secrets Management | Operare | sursă/test | Secretele nu intră în Git/loguri; backupul folosește cheie DPAPI. Custodia independentă și recuperabilă rămân de calificat. | [BACK], [CUST] |
| 18 | .env in .gitignore | Sursă/operare | sursă/test | Reguli și teste protejează fișierele env, scratch-ul și cache-urile; niciun env nu este urmărit în scope-ul verificat. | [CI] |
| 19 | API Key Rotation | Furnizor | neconfirmat | Nu s-a făcut rotație oarbă. Inventariem consumatorii și calificăm schimbarea/revenirea înaintea invalidării clienților. | [OPS] |
| 20 | Secret Scanning | GitHub | confirmatlive | Secret scanning și push protection sunt activate în cele două repo-uri de organizație; nu garantează absența oricărui secret istoric. | [GIT] |
| 21 | Hashing vs Encryption | Conturi/operare | sursă/test | Codurile de recuperare sunt hash-uite, backupurile sunt cifrate AES-GCM; niciun hash public nu este prezentat drept cifrare. | [MFA], [BACK] |
| 22 | Password Salting | Furnizor Auth | neconfirmat | Stocarea parolelor aparține Auth; nu am inspectat hash-uri private și nu certificăm configurația internă din această probă. | [AUTH] |
| 23 | bcrypt & Argon2 | Furnizor Auth | neconfirmat | Nu alegem un algoritm nou în site. Verificarea politicii/hash-ului administrat necesită dovezi distincte, fără extragerea credențialelor. | [AUTH] |
| 24 | JWT Expiry | Conturi | confirmatlive | Producția raportează expirare la 3.600 s; verificările issuer/audience/rol/sesiune sunt acum în sursa deploymentului 3 recitită exact. Probele autentificate rămân staging. | [AUTH], [LEG], [LIVE] |
| 25 | Refresh Tokens | Conturi | confirmatlive | Rotația refresh este activă, cu fereastră de reutilizare de 10 s; testele de lifecycle nu înlocuiesc inventarul tuturor clienților. | [AUTH], [UI] |
| 26 | OAuth 2.0 | Conturi/furnizor | sursă/test | Redirecturile, client binding și fluxurile operator au teste; patternul live `/account/**` nu a fost restrâns fără calificarea clienților. | [AUTH], [MFA] |
| 27 | OpenID Connect | Conturi/furnizor | sursă/test | Sunt verificate câmpurile tokenului și dovada principalului; nu pretindem certificare OIDC sau acoperire pentru orice client extern. | [LEG], [MFA] |
| 28 | Session Fixation | Conturi | sursă/test | Tokenul este legat de subiect și sesiunea existentă; schimbarea contului și rezultatele întârziate au regresii. | [LEG], [UI] |
| 29 | MFA | Conturi | sursă/test | Garda TOTP/factor din legacy deployment 3 este publicată, cu probe autentificate staging. Recuperarea durabilă și UI-ul modern rămân staged/nepublicate; zero flag-uri admin live nu înseamnă owner cu MFA înscris. | [LEG], [LIVE], [MFA], [UI] |
| 30 | Brute Force Protection | Conturi | confirmatlive | Există limite Auth citite live; verificările legacy testate sunt publicate în deployment 3. CAPTCHA este încă false, fără calificare de atac susținut. | [AUTH], [LEG], [LIVE] |
| 31 | Account Enumeration | Conturi | sursă/test | Sunt utilizate refuzuri și erori normalizate; nu am calificat toate răspunsurile/timingurile publice de signup și recuperare. | [LEG], [UI] |
| 32 | Timing Attacks | Conturi/furnizor | neconfirmat | Nu există analiză temporală statistică ori dovadă constant-time pentru întregul flux; nu o deducem din răspunsuri uniforme. | [AUTH] |
| 33 | File Upload Validation | Web/conturi | neconfirmat | Site-urile nu au upload public nou; inventarul complet Storage, MIME, dimensiuni și acces rămâne de calificat separat. | [ARH], [OPS] |
| 34 | Webhook Signature Verification | Conturi/staged | sursă/test | Există validări de proveniență/semnătură pentru surse staged; un webhook nou nu este calificat doar pentru că are endpoint. | [JOB], [DATE] |
| 35 | TLS Certificate Expiry | Furnizor/operare | neconfirmat | Nu există dovadă de alertare la expirare pentru întregul lanț; includem certificat, reînnoire și probă de notificare în verificarea hostului. | [OPS], [EDGE] |
| 36 | HSTS | Web | neconfirmat | Valoarea de un an este pregătită, fără preload/includeSubDomains; nu este încă antet live verificat. | [EDGE] |
| 37 | Encryption at Rest | Operare/furnizor | sursă/test | Artefactele de backup sunt cifrate; această dovadă nu califică automat toate mediile de stocare ori custodia cheilor furnizorilor. | [BACK], [CUST] |
| 38 | Dependency Vulnerabilities | Sursă/CI | sursă/test | Auditurile npm C/R au raportat zero vulnerabilități; pinul Deno legacy și componentele furnizorilor nu sunt acoperite automat de acele lockfile-uri. | [CI], [GIT], [LEG] |
| 39 | Supply Chain Attacks | GitHub/CI | confirmatlive | Politica Actions GitHub-owned + SHA și protecția push sunt citite live; lockfile-urile/auditul acoperă separat dependențele npm. | [GIT], [CI] |
| 40 | Threat Modeling | Toate | sursă/test | Spec-ul delimitează web, conturi, furnizori și desktop; completăm amenințările când apar date sau interfețe noi. | [PROD], [OPS] |
| 41 | Indexes | Conturi | sursă/test | Snapshotul include indexurile reale ale celor cinci tabele; optimizarea cere planuri de execuție, nu indexuri adăugate preventiv. | [BACK] |
| 42 | EXPLAIN ANALYZE | Conturi | neconfirmat | Nu avem planuri reprezentative măsurate; le colectăm în staging pentru interogările relevante înaintea optimizării. | [OPS] |
| 43 | N+1 Queries | Conturi | sursă/test | Citirile/RPC-urile au scope și teste; lipsesc profilele de volum pentru a exclude N+1 în toate operațiile. | [DATE], [LEG] |
| 44 | Full Table Scans | Conturi | neconfirmat | Nu există inventar de scanări costisitoare sub sarcină; verificăm planurile și dimensiunile reale înainte de concluzii. | [OPS] |
| 45 | Connection Pooling | Furnizor DB | neconfirmat | Limitele și comportamentul poolerului nu sunt calificate prin probele SQL existente; nu introducem un pooler propriu pentru exporturi. | [ARH], [OPS] |
| 46 | Database Migrations | Conturi | sursă/test | Istoricul este separat: producție legacy fără ledger, staging cu 41 migrări. Nu aplicăm în bloc cele locale neaplicate. | [OPS] |
| 47 | Down Migrations | Conturi/operare | neconfirmat | Nu presupunem reversibilitate automată; fiecare schimbare cere plan compatibil de revenire și probă izolată. | [OPS], [BACK] |
| 48 | Transactions | Conturi | sursă/test | Recuperarea durabilă și restore-ul limitat folosesc tranzacții; apelurile Auth externe nu sunt pretinse atomice cu SQL. | [MFA], [BACK] |
| 49 | ACID | Conturi/furnizor | sursă/test | Testele SQL verifică commit/rollback pe scope-uri concrete; nu extindem garanțiile tranzacției la efectele furnizorului. | [MFA], [JOB] |
| 50 | Isolation Levels | Conturi | sursă/test | Sunt testate blocări și curse țintite; nu există calificare universală serializabilă pentru toate fluxurile distribuite. | [MFA], [JOB] |
| 51 | Deadlocks | Conturi | neconfirmat | Nu afirmăm absența deadlock-urilor din teste secvențiale; urmărim concurența și erorile DB în probe dedicate. | [MFA], [OPS] |
| 52 | Optimistic Locking | Conturi/staged | sursă/test | Generații, versiuni de politică și idempotency delimitează rezultate vechi; verificăm fiecare mutație nouă în același model. | [MFA], [DATE] |
| 53 | Pessimistic Locking | Conturi/staged | sursă/test | Rezervarea recuperării blochează rândul codului și păstrează factorii inițiali; nu promite lock comun cu API-ul Auth. | [MFA] |
| 54 | Normalization | Conturi | sursă/test | Schema și legăturile sunt capturate pentru scope-ul legacy; nu avem audit complet al tuturor schemelor furnizorului. | [BACK] |
| 55 | Denormalization | Conturi/staged | sursă/test | Rollup-urile sunt separate de evenimente și limitează ce poate fi reconstituit; nu inventăm distincte sau funnels după ștergerea raw. | [DATE] |
| 56 | Foreign Keys | Conturi | sursă/test | Restore-ul aplicației compară constrângerile; ancorele Auth locale sunt artificiale și nu dovedesc recuperarea relațiilor Auth reale. | [BACK] |
| 57 | Unique Constraints | Conturi/staged | sursă/test | ID-uri și constrângeri susțin deduplicarea; probele verifică retry identic versus conținut conflictual. | [DATE], [MFA] |
| 58 | Cascading Deletes | Conturi/staged | sursă/test | Există probe de erasure și cascades; nu declarăm ștergerea copiilor furnizorului sau a fișierelor locale prin aceste operații. | [JOB], [BACK] |
| 59 | Soft Deletes | Conturi | sursă/test | Stările de suspendare/deletion_pending sunt distincte de ștergere; producția legacy nu devine pipeline-ul staged prin acest patch. | [LEG], [OPS] |
| 60 | UUIDs vs Auto-Increment | Conturi | sursă/test | UUID-urile sunt validate și legate de proprietar; alegerea tipului de ID nu înlocuiește autorizarea. | [LEG], [DATE] |
| 61 | Cursor-Based Pagination | Conturi/staged | sursă/test | Citirile staged au teste de cursor/scope; legacy păstrează paginarea existentă, cu limite validate. | [DATE], [LEG] |
| 62 | Full-Text Search | Web | neaplicabil | Nu există motor public de căutare full-text în aceste exporturi; nu introducem unul pentru această listă. | [ARH] |
| 63 | Read Replicas | Furnizor DB | neconfirmat | Nu avem replici de citire proprii sau dovadă de calificare a celor administrate; păstrăm acest aspect în inventarul furnizorului. | [OPS] |
| 64 | Replication Lag | Furnizor DB | neconfirmat | Nu există măsurare a lagului pentru o replică calificată; nu deducem valoarea zero din răspunsuri reușite. | [OPS] |
| 65 | Sharding | Web/conturi | neaplicabil | Exporturile și volumul necalificat nu justifică sharding propriu; reevaluăm numai pe măsurători și nevoie demonstrată. | [ARH], [OPS] |
| 66 | Partitioning | Conturi | neconfirmat | Nu există justificare de volum/plan pentru partitionare nouă; verificăm retenția și interogările înaintea unei astfel de migrări. | [DATE], [OPS] |
| 67 | Hot Partitions | Conturi/furnizor | neconfirmat | Nu am măsurat skew sau hotspot-uri; nu presupunem o problemă de partiții într-o arhitectură fără acest design propriu. | [OPS] |
| 68 | Postgres VACUUM | Furnizor DB | neconfirmat | Autovacuum, bloat și pragurile efective nu au fost calificate; backupul și testele SQL nu sunt dovezi de întreținere VACUUM. | [OPS] |
| 69 | Materialized Views | Conturi/staged | neaplicabil | Rapoartele folosesc modelul existent de evenimente/rollup; nu adăugăm materialized views fără cerință și plan măsurat. | [DATE] |
| 70 | Backups | Operare | confirmatlive | Există artefacte cifrate și copii Drive private cu SHA verificat; scope-ul producției rămâne numai aplicația, nu Auth complet. | [BACK], [CUST] |
| 71 | Testing Your Restores | Operare | sursă/test | Restore-ul local al celor cinci tabele a trecut; arhiva completă staging a refuzat rolurile incompatibile. Full Auth restore rămâne deschis. | [BACK] |
| 72 | Point-in-Time Recovery | Furnizor DB | neconfirmat | PITR este false și nu există restore point expus în readback; WAL=true nu dovedește recuperare disponibilă. | [OPS] |
| 73 | Change Data Capture | Web | neaplicabil | Nu operăm pipeline CDC pentru site-urile statice; trigger-ele staged au scopuri explicite, nu devin un CDC generic. | [ARH], [JOB] |
| 74 | Outbox Pattern | Conturi/staged | sursă/test | Outbox-urile și worker-ele au probe de retry/proveniență; activarea și livrarea reală se califică separat. | [JOB] |
| 75 | ORM Lazy Loading | Web/conturi | neaplicabil | Nu folosim ORM cu lazy loading în traseul auditat; verificăm interogările explicite, nu introducem un ORM nou. | [ARH], [LEG] |
| 76 | CAP Theorem | Arhitectură | neaplicabil | Nu construim un datastore distribuit propriu; documentăm separat compromisurile serviciilor administrate când devin relevante. | [ARH], [OPS] |
| 77 | Eventual Consistency | Conturi/staged | sursă/test | Efectele Auth și stările SQL pot fi separate; retry-ul reconciliază observații, fără a declara rollback al unui efect extern. | [MFA], [JOB] |
| 78 | Strong Consistency | Conturi | sursă/test | Autoritatea critică este verificată în DB și token; nu extindem această proprietate la cache/CDN ori la întregul furnizor. | [MFA], [RLS] |
| 79 | Raft Consensus | Web | neaplicabil | Nu există cluster Raft administrat de proiect; nu adăugăm consensus pentru a servi fișiere statice. | [ARH] |
| 80 | Leader Election | Web | neaplicabil | Site-urile nu rulează lideri proprii; exclusivitatea unui job se verifică în mecanismul existent, fără orchestrator nou. | [ARH], [JOB] |
| 81 | Split Brain | Furnizor | neconfirmat | Nu controlăm consensus-ul furnizorului și nu avem drill de split brain; probele locale nu califică această proprietate. | [OPS] |
| 82 | Quorums | Web | neaplicabil | Nu operăm un sistem de quorum propriu; nu confundăm replicarea internă a unui furnizor cu o garanție verificată aici. | [ARH] |
| 83 | Clock Skew | Conturi/staged | sursă/test | Sunt refuzate dovezi MFA viitoare și tratate timestampuri întârziate; nu există monitorizare globală de sincronizare a ceasurilor. | [LEG], [DATE] |
| 84 | Distributed Locks | Conturi/staged | sursă/test | Folosim blocările SQL și coordonarea SDK existente; niciun lock nu este prezentat ca atomic peste apelurile externe Auth. | [MFA], [SDK] |
| 85 | Consistent Hashing | Web | neaplicabil | Nu există cache/cluster distribuit propriu de repartizat; nu adăugăm hashing distribuit pentru originea statică. | [ARH] |
| 86 | Bloom Filters | Web | neaplicabil | Nu există cerință măsurată pentru această structură probabilistică; autorizarea nu trebuie bazată pe rezultate aproximative. | [ARH] |
| 87 | Two-Phase Commit | Conturi | neaplicabil | Auth și DB nu oferă un 2PC comun în această implementare; folosim stări explicite și reconciliere, nu pretindem atomicitate. | [MFA], [JOB] |
| 88 | CQRS | Conturi/staged | sursă/test | Citirile și operațiile sunt delimitate în contracte; nu declarăm platformă CQRS completă și nu facem rescriere arhitecturală. | [DATE] |
| 89 | Event Sourcing | Conturi/staged | neaplicabil | Evenimentele analytics nu sunt jurnalul canonic al întregii aplicații; retenția lor nu permite reconstruirea totală a stării. | [DATE] |
| 90 | Race Conditions | Conturi/web | sursă/test | Există regresii pentru logout târziu, schimbare de cont, receipt/revoke și recuperare parțială; calificarea rămâne pe cazurile testate. | [UI], [MFA], [RTEST] |
| 91 | Backpressure | Conturi/staged | sursă/test | Coada și loturile analytics sunt limitate; verificăm comportamentul la outage fără a bloca navigarea sau a crește coada nelimitat. | [SDK] |
| 92 | Load Shedding | Conturi/furnizor | sursă/test | Rate limit și refuzuri explicite sunt prevăzute; nu avem calificare de trafic susținut sau capacitate totală a furnizorului. | [AUTH], [LEG] |
| 93 | Bulkheads | Web | sursă/test | Analytics este leaf opțional; eșecul lui nu trebuie să oprească produsul, login-ul ori navigarea. Verificat în browser. | [RTEST], [SDK] |
| 94 | Jitter | Conturi/staged | neconfirmat | Retry-urile sunt limitate, dar jitter-ul și distribuția lor sub concurență nu sunt calificate; se probează înaintea extinderii worker-elor. | [JOB], [SDK] |
| 95 | Retry Storms | Conturi/staged | sursă/test | Cozi, loturi și idempotency limitează repetările; lipsesc probe de furtună de retry la scară reală. | [SDK], [JOB] |
| 96 | Cascading Failures | Web/conturi | sursă/test | Probe de SDK indisponibil și provider parțial verifică degradarea; nu constituie drill complet pentru toate dependențele. | [RTEST], [MFA] |
| 97 | Thundering Herd | Furnizor/conturi | neconfirmat | Nu există probă de vârf sincronizat ori cache miss masiv; măsurăm înainte de a introduce un coordonator nou. | [OPS] |
| 98 | Cache Invalidation | Web | sursă/test | Revizia traversează intrări și importuri; JSON-ul localei nu mai folosește force-cache. HTML-ul vechi are încă TTL-ul hostului. | [CACHE] |
| 99 | Cache Hit Ratio | Furnizor CDN | neconfirmat | Nu avem raport de hit ratio calificat; nu inventăm randament CDN dintr-un singur răspuns sau din Lighthouse. | [OPS] |
| 100 | TTLs | Web/conturi | sursă/test | Expirări Auth, consimțământ, coadă și recuperare au scopuri distincte; le verificăm separat, fără identitate reînnoită implicit. | [AUTH], [SDK], [MFA] |
| 101 | Cache Warming | Web | neaplicabil | Exportul static nu necesită job propriu de încălzire; nu consumăm trafic sau costuri fără un beneficiu măsurat. | [ARH] |
| 102 | Write-Through vs Write-Back | Web | neaplicabil | Nu există cache propriu de scriere pentru site-uri; starea conturilor nu este autorizată din cache-ul paginii. | [ARH], [LEG] |
| 103 | Redis Eviction Policies | Web | neaplicabil | Nu operăm Redis în această arhitectură; nu introducem o dependență nouă pentru acest subiect. | [ARH] |
| 104 | CDNs | Web/furnizor | confirmatlive | Originile publice folosesc GitHub Pages; Cloudflare nu este încă strat live calificat. Configurația nouă cere readback separat. | [GIT], [EDGE] |
| 105 | Cache-Control Headers | Web/conturi | sursă/test | API-ul prevede no-store, adaptorul păstrează cache-ul originii; valorile efective pe domenii se verifică la publicare. | [LEG], [EDGE], [CACHE] |
| 106 | ETags | Furnizor CDN | neconfirmat | Nu avem calificare completă a cererilor condiționale/304; nu echivalăm versionarea URL-ului cu validarea ETag. | [CACHE] |
| 107 | Dead Letter Queues | Conturi/staged | sursă/test | Joburile au stări terminale și retry controlat; livrarea alertelor pentru eșecuri nu este confirmată. Nu folosim Kafka DLQ. | [JOB], [OPS] |
| 108 | Poison Messages | Conturi/staged | sursă/test | Schemele resping payloaduri invalide, iar retry-ul nu trebuie să le promoveze drept succes; există probe pentru rezultate conflictuale. | [DATE], [JOB] |
| 109 | At-Least-Once Delivery | Conturi/staged | sursă/test | Retrimiterea este tratată explicit și deduplicată; nu susținem că un click confirmă livrarea, transferul sau instalarea. | [SDK], [DATE] |
| 110 | Exactly-Once Semantics | Conturi/staged | sursă/test | Unicitatea se aplică ID-urilor și efectelor delimitate; nu declarăm exactly-once global peste rețea și furnizori. | [DATE], [MFA] |
| 111 | Message Ordering | Conturi/staged | sursă/test | Reviziile și ordinea page/CTA sunt verificate; sosirea târzie nu devine automat ordinea reală a acțiunilor. | [DATE] |
| 112 | Kafka Consumer Groups | Web | neaplicabil | Nu există Kafka administrat de aceste site-uri; nu adăugăm broker ori grupuri de consumatori. | [ARH] |
| 113 | Partition Keys | Web/conturi | neaplicabil | Nu operăm partiții de broker proprii; cheile de site/pagină din rapoarte sunt contracte de grain, nu un Kafka implicit. | [ARH], [DATE] |
| 114 | Background Jobs | Conturi/staging | confirmatlive | Jobul staged de retenție are succes observat la 02:17; producția legacy nu are acel job, iar alertele rămân neconfirmate. | [OPS] |
| 115 | Webhook Retries | Conturi/furnizor | neconfirmat | Nu există probă completă de livrare/retry a webhook-urilor live; worker-ele testate nu califică automat un furnizor nou. | [JOB], [OPS] |
| 116 | DNS | Web/operare | confirmatlive | Domeniile publice servesc site-urile existente; nu s-a calificat încă un cutover Cloudflare sau modificarea DNS mail. | [GIT], [EDGE] |
| 117 | DNS Propagation | Web/operare | neconfirmat | Nu avem probă înainte/după pentru cutover și TTL-uri; accesul și propagarea trebuie verificate înainte de schimbare. | [EDGE] |
| 118 | HTTP Status Codes | Web/conturi | sursă/test | 401/403/404/429/503 și DTO-urile au probe; release-ul funcției necesită smoke efectiv pe versiunea publicată. | [LEG], [UI] |
| 119 | HTTP Method Semantics | Conturi | sursă/test | GET implicit citește contul, POST validează JSON și OPTIONS are CORS explicit; mutațiile rămân autorizate server-side. | [LEG] |
| 120 | Keep-Alive | Web/staged | sursă/test | Transportul analytics folosește loturi limitate și omit credentials; navigarea nativă nu așteaptă flush-ul cozii. | [SDK], [RTEST] |
| 121 | HTTP/2 | Furnizor | neconfirmat | Negocierea protocolului și performanța lui nu au fost calificate în acest registru; nu modificăm hostul doar pentru bifă. | [OPS] |
| 122 | WebSockets | Web/desktop | neaplicabil | Exporturile publice nu oferă canal WS de produs; HMR de dezvoltare nu este trafic de producție. Desktopul rămâne audit separat. | [ARH], [PROD] |
| 123 | Server-Sent Events | Web/desktop | neaplicabil | Nu există chat/SSE public în aceste site-uri; streamingul agenților nu este calificat de acest mandat web. | [ARH], [PROD] |
| 124 | Long Polling | Web | neaplicabil | Nu există serviciu public propriu de long polling de calificat; nu introducem unul ca substitut de monitorizare. | [ARH] |
| 125 | gRPC | Web | neaplicabil | Site-urile și contractul conturilor folosesc HTTP/JSON; nu avem infrastructură gRPC proprie. | [ARH], [LEG] |
| 126 | Protocol Buffers | Web | neaplicabil | Nu există format Protobuf în contractul auditat; validăm schema JSON existentă. | [DATE] |
| 127 | API Versioning | Conturi | confirmatlive | Configurația publică recitită păstrează contractul v1; funcția legacy are deployment 3, nu API v3. API-ul modern v2 și migrările sale rămân staged/nepublicate. | [LEG], [LIVE], [OPS] |
| 128 | OpenAPI Specs | Conturi/staged | neconfirmat | Există scheme JSON/DTO versionate; un document OpenAPI complet și concordanța lui cu API-ul efectiv nu sunt calificate. | [DATE] |
| 129 | Backward Compatibility | Conturi | sursă/test | Legacy deployment 3 păstrează contractul calificat în staging și are readback exact plus smoke negativ live. Fluxurile autentificate și toate binarele/clienții instalați nu au fost recalificate în producție. | [LEG], [LIVE] |
| 130 | Request Size Limits | Conturi | sursă/test | Limitele tokenului și corpului JSON sunt păstrate în sursa legacy deployment 3 recitită exact; loturile analytics și arhivele au limite separate. Nu este probă de sarcină susținută. | [LEG], [LIVE], [SDK], [BACK] |
| 131 | Compression | Furnizor CDN | neconfirmat | Nu există inventar de content-encoding și probe de negociere pentru toate tipurile; nu deducem compresia din mărimea fișierelor sursă. | [OPS] |
| 132 | Latency vs Throughput | Web/conturi | neconfirmat | Nu avem benchmark reprezentativ de sarcină; un test funcțional sau Lighthouse nu certifică throughput ori latență API. | [OPS] |
| 133 | Egress Fees | Furnizor/operare | neconfirmat | Costurile și pragurile de egress nu sunt calificate; nu activăm servicii plătite sau generăm trafic de test necontrolat. | [OPS] |
| 134 | VPCs | Infrastructură proprie | neaplicabil | Nu administrăm un VPC pentru aceste exporturi; rețeaua internă a furnizorilor nu este calificată aici. | [ARH] |
| 135 | Subnets | Infrastructură proprie | neaplicabil | Nu există subrețele proprii în mandat; nu inventăm o topologie pentru serviciile administrate. | [ARH] |
| 136 | NAT Gateways | Infrastructură proprie | neaplicabil | Nu folosim un NAT gateway propriu; nu introducem costuri de rețea fără necesitate. | [ARH] |
| 137 | Firewalls | Furnizor/operare | neconfirmat | Adaptorul de antete nu este WAF/firewall; regulile efective și protecția de trafic necesită verificarea furnizorului. | [EDGE], [OPS] |
| 138 | Security Groups | Infrastructură proprie | neaplicabil | Nu administrăm security groups proprii; accesul DB/furnizor se inventariază separat, fără a presupune izolarea rețelei. | [ARH], [OPS] |
| 139 | Service Mesh | Web | neaplicabil | Nu există mesh de microservicii administrat de proiect; nu îl adăugăm pentru site-uri statice. | [ARH] |
| 140 | Ingress Controllers | Web | neaplicabil | Nu există ingress Kubernetes propriu; regulile Pages/edge sunt mecanismele relevante. | [ARH], [EDGE] |
| 141 | Health Checks | Operare | sursă/test | Există probe repetabile cu stare unavailable/incompletă; execuția lor programată și livrarea alertelor nu sunt demonstrate. | [OPS] |
| 142 | Liveness vs Readiness Probes | Operare | sursă/test | Readiness separă job reușit, mentenanță logică și recuperare; nu avem poduri proprii pentru probes Kubernetes. | [OPS] |
| 143 | Graceful Shutdown | Web/furnizor | neaplicabil | Nu există daemon web propriu în producție; ciclul runtime-ului Edge aparține furnizorului, nu exportului static. | [ARH] |
| 144 | Connection Draining | Furnizor | neconfirmat | Nu administrăm load balancer/draining și nu avem drill al furnizorului; nu declarăm garanția dintr-un deploy reușit. | [OPS] |
| 145 | Stateless Services | Web/conturi | sursă/test | Fișierele publice sunt statice; autoritatea conturilor și retry-ul durabil sunt în DB, nu într-o singură instanță Edge. | [ARH], [MFA] |
| 146 | Failover | Furnizor/operare | neconfirmat | Nu există probă completă de failover DB/Auth/host; restore-ul limitat nu o înlocuiește. | [BACK], [OPS] |
| 147 | Multi-Region | Infrastructură proprie | neaplicabil | Nu operăm backend multi-region propriu; regiunea DB observată este eu-central-1, iar CDN-ul nu dovedește replicare DB. | [ARH], [OPS] |
| 148 | Availability Zones | Furnizor | neconfirmat | Nu există dovadă de topologie sau drill între zone; proiect ACTIVE_HEALTHY nu certifică redundanța. | [OPS] |
| 149 | Single Points of Failure | Operare | neconfirmat | DB/Auth administrat și cheia DPAPI locală sunt dependențe critice; copia Drive nu elimină punctul unic de recuperare a cheii. | [OPS], [CUST] |
| 150 | Disaster Recovery | Operare | neconfirmat | Lipsesc full Auth restore, Storage/config și recuperarea cheii pe alt dispozitiv; calificăm aceste componente într-o țintă compatibilă izolată. | [BACK], [CUST] |
| 151 | RTO & RPO | Operare | neconfirmat | Nu există drill complet reușit și cadență calificată care să susțină RTO/RPO; nu publicăm valori inventate. | [BACK], [OPS] |
| 152 | SLAs | Furnizor/comercial | neconfirmat | Nu s-a verificat un SLA contractual cap-coadă pentru site/conturi; inventariem obligațiile înaintea unei promisiuni către utilizatori. | [OPS], [LEGAL] |
| 153 | SLOs | Operare | neconfirmat | Nu sunt stabilite și măsurate obiective de disponibilitate/latență; activarea unui tracker nu este substitut de SLO. | [OPS] |
| 154 | Error Budgets | Operare | neconfirmat | Fără SLO și fereastră măsurată nu calculăm buget de eroare; definim mai întâi populația și sursa. | [OPS], [DATE] |
| 155 | Incident Response | Operare | sursă/test | Există pași de identificare, refuz sigur și rollback; exercițiul complet și responsabilitatea operațională rămân de confirmat. | [OPS], [LEG] |
| 156 | On-Call | Operare | neconfirmat | Nu există rotație și destinatar cu alertă recepționată demonstrat; desemnăm responsabil și probăm escaladarea. | [OPS] |
| 157 | Runbooks | Operare | sursă/test | Comenzile documentate păstrează scope-ul și nu cer credențiale în argumente; executăm numai pașii autorizați pentru mediul identificat. | [OPS], [BACK] |
| 158 | Postmortems | Operare | sursă/test | Eșecurile de restore și calificare MFA sunt păstrate explicit; nu rescriem un test eșuat drept succes al altei versiuni. | [OPS], [LEG] |
| 159 | Chaos Engineering | Web/conturi | sursă/test | Sunt injectate eșecuri în fixtures și staging; nu s-au provocat outage-uri de producție și nu pretindem un program chaos complet. | [RTEST], [MFA] |
| 160 | Graceful Degradation | Web | sursă/test | Navigarea, release-status și consent rămân utilizabile când SDK/API opțional eșuează; probele acoperă blocare, întârziere și excepții. | [RTEST], [PROD] |
| 161 | Autoscaling | Infrastructură proprie | neaplicabil | Nu administrăm autoscaler de aplicație pentru exporturi; limitele planurilor furnizorului se verifică fără a crea cluster nou. | [ARH], [OPS] |
| 162 | Horizontal vs Vertical Scaling | Infrastructură proprie | neaplicabil | Nu există server web propriu de scalat; deciziile DB cer măsurători, nu infrastructură introdusă preventiv. | [ARH], [OPS] |
| 163 | Cold Starts | Furnizor Edge | neconfirmat | Nu am măsurat distribuția cold/warm și impactul asupra API-ului; un răspuns hosted reușit nu stabilește percentila. | [OPS] |
| 164 | Capacity Planning | Operare | neconfirmat | Lipsesc trafic de vârf, cote și sarcină reprezentativă; inventariem aceste limite înainte de estimarea capacității. | [OPS] |
| 165 | Load Testing | Conturi/furnizor | neconfirmat | Nu s-a executat benchmark susținut în producție; un test viitor trebuie limitat și izolat, cu scop și praguri clare. | [OPS] |
| 166 | Memory Leaks | Web | sursă/test | Cleanup-ul observatorilor/listenerelor și importurile întârziate au probe; nu avem profil heap care să excludă orice leak. | [SDK], [RTEST] |
| 167 | OOM Killer | Furnizor/operare | neconfirmat | Nu există calificare a limitelor de memorie sau alertelor OOM; dimensiunile requesturilor/backupurilor sunt doar garduri locale. | [OPS], [BACK] |
| 168 | Structured Logging | Conturi | sursă/test | Sursa legacy deployment 3 recitită exact emite action/status/outcome/requestId, fără identități sau body. Retenția și livrarea efectivă a logurilor furnizorului nu sunt calificate prin publicare. | [LEG], [LIVE] |
| 169 | Log Levels | Conturi/furnizor | neconfirmat | Sursa legacy deployment 3 include evenimente operaționale bounded, dar politica efectivă de niveluri/retention a furnizorului nu este calificată. | [LEG], [LIVE], [OPS] |
| 170 | Log Rotation | Furnizor/operare | neconfirmat | Retenția și rotația logurilor furnizorului trebuie citite separat; retenția analytics nu le impune. | [OPS], [LEGAL] |
| 171 | Distributed Tracing | Web/conturi | neaplicabil | Nu operăm o rețea de microservicii care cere tracing propriu; requestId local nu este prezentat drept tracing distribuit. | [ARH], [LEG] |
| 172 | OpenTelemetry | Web | neaplicabil | Nu introducem OTel ori al doilea tracker fără cerință; observabilitatea operațională și consimțământul sunt scopuri distincte. | [ARH], [SDK] |
| 173 | Correlation IDs | Conturi | sursă/test | Sursa legacy deployment 3 recitită exact generează X-Request-Id și log bounded; nu folosește tokenul, emailul sau identificatorul utilizatorului ca ID de corelare. Nu este calificare de tracing distribuit. | [LEG], [LIVE] |
| 174 | Metrics Cardinality | Web/staged | sursă/test | Cataloagele semantice limitează valori și dimensiuni; nu folosim URL brut, text DOM sau email drept etichete. | [SDK], [DATE] |
| 175 | p99 Latency | Web/conturi | neconfirmat | Nu există distribuție calificată p99/p95 pentru API sau site; nu transformăm un scor Lighthouse într-o astfel de măsură. | [OPS] |
| 176 | Alert Fatigue | Operare | neconfirmat | Livrarea alertelor nu este încă probată; stabilim praguri acționabile și escaladare înainte de optimizarea volumului lor. | [OPS] |
| 177 | Error Tracking | Web/staged | sursă/test | SDK-ul prevede coduri normalizate, fără stack/PII arbitrar; colectarea publică rămâne dezactivată. | [SDK], [LEGAL] |
| 178 | Profiling | Web/conturi | neconfirmat | Nu există profil CPU/heap reprezentativ; colectăm probe pe problema observată, fără optimizare generică. | [OPS] |
| 179 | Flame Graphs | Web/conturi | neconfirmat | Nu au fost generate flame graph-uri pentru trasee de producție; nu sunt o condiție artificială pentru exportul static. | [ARH], [OPS] |
| 180 | Infrastructure as Code | Operare | sursă/test | Workflow-urile și adaptoarele sunt în sursă; nu pretindem că DNS, mail și toate setările externe sunt deja reconciliate din cod. | [CI], [EDGE] |
| 181 | Terraform State | Infrastructură proprie | neaplicabil | Nu există Terraform state administrat aici; nu adăugăm backend de state sau secrete Terraform pentru aceste site-uri. | [ARH] |
| 182 | GitOps | GitHub/operare | sursă/test | Funcția legacy a fost publicată separat, cu sursă și readback legate de `073f723`. Push/PR/publicarea finală C și confirmarea deploy-ului R rămân de închis; release-ul funcției nu le înlocuiește. | [CI], [GIT], [LIVE] |
| 183 | Blue-Green Deployments | Web | neaplicabil | Nu operăm două flote proprii; publicarea Pages și staging-ul calificat sunt suficiente pentru mandatul actual, fără garanție blue-green nouă. | [ARH], [CI] |
| 184 | Canary Releases | Web | neaplicabil | Nu există router canary propriu sau împărțire de trafic calificată; preview-ul/buildul nu este canary de producție. | [CI] |
| 185 | Rollbacks | Operare | sursă/test | Preimage-ul funcției deployment 2 este verificat și păstrat cu configurație de rollback; deployment 3 nu a cerut revenire. Rollbackul/restore-ul producției nu au fost executate ori declarate reușite. | [LEG], [LIVE], [BACK] |
| 186 | Feature Flags | Web/conturi | confirmatlive | Readbackul public Codevalanche după release confirmă analytics enabled=false și contract v1; CAPTCHA rămâne false. Nu s-au activat colectori sau API-ul modern v2. | [SDK], [AUTH], [LIVE] |
| 187 | Environment Parity | Conturi/operare | neconfirmat | Readbackul după deployment 3 păstrează cinci tabele legacy fără ledger; staging are 41 migrări și versiune PG diferită. Publicarea funcției nu califică paritatea. | [OPS], [LEG], [LIVE] |
| 188 | Staging Environments | Conturi/operare | confirmatlive | Proiectul staging este identificat separat; 21/21 probe pe slug izolat și cleanup verificat, fără a suprascrie funcția staging comună. | [OPS], [LEG] |
| 189 | 12-Factor Apps | Conturi/operare | sursă/test | Configurația și secretele sunt separate de sursă; nu prezentăm respectarea unei liste de principii drept audit al furnizorului. | [CI], [OPS] |
| 190 | Multi-Stage Builds | Web | neaplicabil | Pipeline-ul produce exporturi statice; nu există Dockerfile de produs care necesită etape separate. | [ARH], [CI] |
| 191 | Non-Root Containers | Infrastructură proprie | neaplicabil | Nu publicăm containere administrate de proiect; userul intern al runtime-ului furnizorului nu este verificat de acest registru. | [ARH] |
| 192 | Image Scanning | Infrastructură proprie | neaplicabil | Nu avem imagini container proprii de scanat; auditul npm și proveniența asseturilor sunt controalele relevante existente. | [CI], [PROD] |
| 193 | Resource Requests & Limits | Conturi/operare | sursă/test | Requesturi, loturi și arhive sunt limitate; nu declarăm requests/limits Kubernetes sau capacitate provider calificată. | [LEG], [SDK], [BACK] |
| 194 | Pod Disruption Budgets | Infrastructură proprie | neaplicabil | Nu administrăm poduri Kubernetes; nu creăm cluster și PDB ca să bifăm o temă fără aplicabilitate. | [ARH] |
| 195 | Semantic Versioning | Sursă/contracte | sursă/test | SDK/contract au versiuni și SHA distincte; ID-urile noi nu schimbă sensuri istorice sau versiunea definiției metricii. | [SDK], [DATE] |
| 196 | Lockfiles | Sursă/CI | sursă/test | Dependențele și runtime-urile sunt pin-uite, instalarea folosește npm ci; verificăm schimbările de lockfile în PR. | [CI] |
| 197 | Reproducible Builds | Sursă/CI | sursă/test | SDK C/R este verificat byte-identic după generare; nu extrapolăm la toate binarele desktop sau mediile furnizorilor. | [SDK], [CI] |
| 198 | Branch Protection | GitHub | confirmatlive | Trei ramuri main cer PR/check build inclusiv pentru admin; force push/deletion sunt oprite. Nu echivalează cu merge/publicare deja efectuate. | [GIT] |
| 199 | Public S3 Buckets | Web/furnizor Storage | neconfirmat | Nu există S3 propriu necesar site-urilor; inventarul complet al bucketurilor/permisiunilor Storage nu este calificat. | [ARH], [OPS] |
| 200 | Presigned URLs | Web | neaplicabil | Site-ul nu emite linkuri private semnate noi; release-ul folosește numai manifestul aprobat și niciun installer inventat. | [PROD] |
| 201 | Cloud Billing Alerts | Operare | neconfirmat | Nu există alertă de cost/cotă livrată și verificată; aceasta rămâne pas explicit, fără activarea de servicii plătite. | [OPS] |
| 202 | Unit Tests | Sursă | sursă/test | Există probe negative și red/green; counts raportate sunt checkpointuri de suite, nu număr de vulnerabilități eliminate. | [CI], [MFA], [RTEST] |
| 203 | Integration Tests | Conturi | sursă/test | SQL real izolat și Auth hosted staging sunt testate; diferența de schemă față de producție rămâne explicită. | [MFA], [LEG], [OPS] |
| 204 | End-to-End Tests | Web/conturi | sursă/test | Browserul verifică navigare/consent, iar staging API verifică acțiuni Auth; release-ul final cere și smoke public nou. | [RTEST], [LEG] |
| 205 | Contract Testing | Conturi/staged | sursă/test | Browser/backend și cataloagele sunt sincronizate; contractul v1 public nu este înlocuit implicit cu v2. | [SDK], [DATE], [LEG] |
| 206 | Flaky Tests | Teste | sursă/test | Retry-ul Google a fost separat de avansarea ceasului virtual; răspunsul întârziat reproducea cursa, fără slăbirea timeoutului de producție. | [UI] |
| 207 | Mocking | Teste | sursă/test | Raportăm distinct mock, PostgreSQL local și provider hosted; un mock reușit nu califică livrare, backup sau Auth real. | [UI], [MFA], [LEG] |
| 208 | Regression Tests | Sursă | sursă/test | Antete, workflow, SDK query, scope-uri research și recuperare au regresii țintite; păstrăm și cazurile negative. | [CI], [RTEST], [MFA] |
| 209 | Smoke Tests | Operare | confirmatlive | Legacy deployment 3 are 6/6 probe negative/preflight în producție înainte și după publicare, fără conturi reale. Smoke-ul website-urilor după publicarea lor rămâne separat de aceste probe și de cele 21/21 staging. | [LEG], [LIVE], [CI] |
| 210 | Property-Based Testing | Teste | neconfirmat | Suitele au cazuri explicite, nu calificare property-based generală; alegem generatoare numai pentru invariante relevante. | [DATE], [MFA] |
| 211 | Fuzzing | Teste | neconfirmat | Nu s-a făcut campanie fuzzing ori scanare activă a producției; putem extinde offline parser-ele/schemele, cu limite clare. | [CI], [DATE] |
| 212 | Error Handling | Web/conturi | sursă/test | Refuzurile și rezultatele externe necunoscute sunt distincte de succes; UI-ul opțional eșuat nu oprește funcțiile esențiale. | [MFA], [RTEST] |
| 213 | Edge Cases | Web/conturi | sursă/test | Manifest valid gol versus invalid, retry parțial, cataloage lipsă și RTL au probe; nu declarăm acoperire universală. | [PROD], [CACHE], [MFA] |
| 214 | Off-by-One Errors | Conturi/staged | sursă/test | Intervalele exclusive și grain-ul paginii au regresii; rezultatul nu dovedește absența erorilor în toate buclele. | [DATE] |
| 215 | Floating Point Math | Rapoarte/staged | sursă/test | Schema impune valori finite și unități potrivite; scorurile/percentilele nu sunt sume de evenimente duplicate. | [DATE] |
| 216 | Storing Money as Floats | Web | neaplicabil | Site-urile nu implementează contabilitate sau checkout; nu introducem un registru financiar pentru acest mandat. | [ARH], [PROD] |
| 217 | Time Zones | Conturi/staged | sursă/test | Intervalele de raport acceptă timezone IANA și stochează timestampuri UTC; restaurarea normalizează doar prezentarea UTC documentată. | [DATE], [BACK] |
| 218 | Daylight Saving Time | Rapoarte/staged | sursă/test | Testele verifică zile București de 23/25 ore; nu aproximăm toate zilele prin 24 ore fixe. | [DATE] |
| 219 | Unicode | Web/conturi | sursă/test | Există probe pentru traduceri, RTL/CJK și caractere de control; nu este audit exhaustiv al fiecărui șir Unicode. | [CSP], [UI], [PROD] |
| 220 | Character Encoding | Web | sursă/test | Charset UTF-8 rămâne înaintea CSP și în primii 1.024 bytes; hash-urile normalizează textul scripturilor conform exportului. | [CSP] |
| 221 | Thread Safety | Conturi/desktop | sursă/test | Sunt verificate curse async și blocări SQL; thread-urile native desktop nu intră în această calificare web. | [MFA], [UI], [PROD] |
| 222 | Event Loop Blocking | Web | sursă/test | Importul SDK nu condiționează UI-ul, iar cererile au limite țintite; profilarea generală CPU rămâne neconfirmată. | [RTEST], [UI] |
| 223 | Unhandled Promise Rejections | Web | sursă/test | Importurile/bootstrap-ul opțional au catch și cleanup; browserul verifică inclusiv SDK care aruncă excepții. | [RTEST], [SDK] |
| 224 | Integer Overflow | Conturi/staged | sursă/test | Schema și limitele folosesc verificări de număr întreg sigur pe câmpuri relevante; nu declarăm verificare formală a întregii aritmetici. | [DATE], [LEG] |
| 225 | Garbage Collection | Web/furnizor | neconfirmat | Nu avem profil de heap/GC și nu controlăm colectorul furnizorului; cleanup-ul listenerelor este probat separat. | [RTEST], [OPS] |
| 226 | Schema Validation | Conturi/staged | sursă/test | Contractele validează forme, câmpuri, enum-uri și identificatori; un câmp cu formă validă nu acordă autoritate. | [DATE], [LEG] |
| 227 | Debouncing | Web | sursă/test | Resize/navigarea amânată folosesc mecanisme locale; hash/rerender nu trebuie să adauge pageview. Nu afirmăm optimizare globală. | [RTEST], [SDK] |
| 228 | Big O Notation | Web/conturi | neconfirmat | Cozile sunt bounded, dar costul tuturor queryurilor nu este profilat; alegem trasee concrete pentru analiza de complexitate. | [SDK], [OPS] |
| 229 | Technical Debt | Sursă/operare | sursă/test | Separarea legacy/staged și migrările neaplicate sunt documentate; nu ascundem diferența printr-un bulk push. | [LEG], [OPS] |
| 230 | Dead Code | Sursă | neconfirmat | Nu există inventar complet de cod mort; ID-urile istorice păstrate pentru rapoarte nu se șterg ca simplă curățenie. | [SDK], [DATE] |
| 231 | Merge Conflicts | Sursă/CI | sursă/test | Ownership-ul și commiturile seriale păstrează schimbările altora; diff-ul final și gates rămân obligatorii înainte de merge. | [CI] |
| 232 | GDPR | Juridic/date | neconfirmat | Minimizarea și paginile legale nu sunt certificat GDPR; lipsesc calificarea juridică completă, inventarul DPA și exercițiile de drepturi. | [LEGAL], [OPS] |
| 233 | PII Handling | Conturi/operare | sursă/test | Evenimentele/logurile evită text/URL/email arbitrar, iar backupurile sunt cifrate; inventarul complet al procesării externe rămâne deschis. | [SDK], [LEG], [BACK] |
| 234 | Audit Logs | Conturi/operare | sursă/test | Jurnalul DB modern rămâne staged; legacy deployment 3 include log privat best-effort fără identități, confirmat în sursa recitită. Nu îl numim audit imuabil și nu calificăm astfel retenția logurilor furnizorului. | [MFA], [LEG], [LIVE] |
| 235 | Data Residency | Furnizori | neconfirmat | Regiunea DB eu-central-1 este observată; CDN, Drive și subprocesatorii nu au inventar complet de rezidență/calificare juridică. | [OPS], [CUST], [LEGAL] |
| 236 | SOC 2 | Organizație | neconfirmat | Nu există dovadă de certificare SOC 2 a organizației; certificarea unui furnizor nu se transferă automat produsului. | [LEGAL] |
| 237 | PCI DSS | Web | neaplicabil | Aceste site-uri nu procesează date de card; nu pretindem certificare PCI DSS și reevaluăm dacă apare un checkout. | [ARH], [LEGAL] |
| 238 | Cookie Consent | Web | sursă/test | Refuzul/retragerea și separarea C/R sunt testate; colectarea rămâne oprită și nu este activată prin acceptarea din UI. | [SDK], [RTEST] |
| 239 | Software Licenses | Sursă/juridic | neconfirmat | Lockfile-ul nu este audit de licențe; trebuie inventariate dependențele, fonturile și drepturile asupra asseturilor distribuite. | [CI], [PROD] |
| 240 | SPF, DKIM & DMARC | DNS/mail | neconfirmat | Nu s-au schimbat înregistrările mail și nu există calificare completă a autentificării email; verificăm înaintea modificărilor SMTP/DNS. | [AUTH], [OPS] |
| 241 | Email Bounce Handling | Furnizor mail | neconfirmat | Recuperarea de staging a folosit link verificat în memorie, fără SMTP; nu dovedește livrare, bounce handling sau reputație. | [LEG], [OPS] |
| 242 | Chargebacks | Comercial/web | neaplicabil | Nu există procesare de plăți proprie în site-uri; tranzacțiile cu furnizorii nu devin un sistem de chargeback al produsului. | [ARH], [PROD] |
| 243 | Bot Protection | Conturi/furnizor | neconfirmat | CAPTCHA și HIBP sunt false în readback; rate limit nu califică protecție completă anti-bot. Activarea cere probă de flux. | [AUTH] |
| 244 | Prompt Injection | Desktop/AI | neconfirmat | Agenții și tool-urile desktop cer audit separat de permisiuni și conținut neîncredere; site-ul nu dovedește izolarea promptului. | [PROD] |
| 245 | Hallucinated Packages | Desktop/AI | neconfirmat | Pin-urile web nu demonstrează că un agent nu inventează pachete; evaluăm separat rezolvarea și verificarea dependențelor generate. | [PROD], [CI] |
| 246 | Real-time streaming | Desktop/AI | neconfirmat | Streamingul agenților/furnizorilor nu a fost auditat în acest mandat; exporturile web nu implementează un chat public. | [PROD], [ARH] |
| 247 | Context Windows | Desktop/AI | neconfirmat | Limitele modelelor și handoff-ul cer probe pe runtime; nu promitem context perfect păstrat din descrierea de marketing. | [PROD] |
| 248 | Evals | Desktop/AI | neconfirmat | Nu există calificare de evals pentru siguranța/fiabilitatea agenților; articolul research nu certifică produsul sau toate modelele. | [PROD] |
| 249 | Model Version Pinning | Desktop/furnizor AI | neconfirmat | Versiunile provider/model și politica de schimbare nu sunt calificate aici; SHA-ul SDK web nu este pin de model AI. | [PROD], [SDK] |
| 250 | Reading the maxed LOC Diff | Sursă/review | sursă/test | Diff-urile au fost revizuite pe scope-uri; constatările MFA/UX au primit corecții și probe distincte. Freeze-ul nu este audit blanket al aplicației. | [LEG], [MFA], [UI], [CI] |

## Ordinea lucrărilor rămase

1. **Release website verificat:** finalizare push/PR/build/publish și smoke pentru versiunea efectiv servită C/R. Funcția legacy deployment 3 este deja publicată cu readback exact și 6/6 probe negative/preflight; migrările staged nu au fost aplicate. Actualizarea checkpointului website se face pe readback, nu anticipat.
2. **Protecții HTTP:** accesul DNS/edge, activarea adaptorului și verificarea framing/HSTS/nosniff pe ambele domenii. Până atunci #9, #11 și #36 nu sunt închise live.
3. **Recuperare:** custodie a cheii recuperabilă pe alt dispozitiv; țintă Supabase compatibilă pentru arhiva completă; Auth, Storage, configurații și rădăcini de semnare verificate separat. Copia cifrată Drive nu închide #150 sau #151.
4. **Operare:** destinatari și alerte cu livrare probată pentru job eșuat, succes prea vechi, backup, cotă și cost; apoi cadență de captură/restore. Nu există încă dovadă pentru on-call/SLO/p99.
5. **Calificări proporționale:** mail, redirecturi, CAPTCHA/HIBP, query plans și limite de sarcină în staging. Fără activare de tracking, scanare agresivă ori cost nou implicit.
6. **Audit separat desktop/AI:** #244–249 cu runtime-uri, modele, tool-uri și criterii concrete. Nu inventăm Kafka, Raft, sharding, Kubernetes sau certificări pentru a transforma registrul în 250 de bife verzi.

[ARH]: ../scripts/build.mjs
[CSP]: ../scripts/postbuild-security.mjs
[EDGE]: ../cloudflare/security-headers.mjs
[AUTH]: ../ops/security-operations-auth-production-20261018.json
[RLS]: ../ops/security-operations-production-authorization-20261018.json
[LEG]: ../deploy/legacy-security/README.md
[LIVE]: ../ops/security-operations-legacy-production-release-20261018.json
[MFA]: ../supabase/functions/_shared/mfaRecovery.ts
[UI]: ../scripts/account-sdk-lifecycle.test.mjs
[GIT]: https://github.com/Radovar-com/codevalanche-site/pull/4
[CI]: ../.github/workflows/deploy-pages.yml
[RTEST]: https://github.com/Radovar-com/radovar-site/tree/3e186fd/scripts
[SDK]: ../src/analytics/manifest.json
[CACHE]: ../scripts/asset-cache.mjs
[OPS]: security-operations-20261018.md
[BACK]: security-operations-20261018.md#backups-and-actual-restore-results
[CUST]: security-operations-20261018.md#remaining-recovery-and-operations-qualification
[JOB]: owned-analytics-operations.md
[DATE]: owned-analytics-report-definitions.md
[LEGAL]: ../src/privacy.html
[PROD]: product-website-maintenance.md
