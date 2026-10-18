# Mandat de securizare — Codevalanche.com și Radovar.com

Utilizatorul a aprobat implementarea autonomă, testarea, publicarea și raportul pentru constatările auditului din18octombrie2026. Această aprobare include pregătirea și integrarea corecțiilor; accesul administrativ ori configurațiile lipsă nu pot fi inventate. Nu se contractează costuri noi.

## Rezultat urmărit

Protecțiile relevante pentru site-urile publice și conturi sunt implementate și verificate separat în sursă, test și producție. Păstrăm designul, navigarea, contractul de conturi v1, consimțământul și analytics dezactivat. Mandatul nu reprezintă o certificare a celor250de subiecte și nu introduce sisteme distribuite fără nevoie. Aplicația desktop și execuția agenților sunt un audit distinct.

## Livrabile

1. Antete HTTP: CSP frame-ancestors none, X-Frame-Options DENY, nosniff, HSTS de un an fără includeSubDomains/preload, referrer/permissions policy. Păstrăm CSP meta cu hash-urile specifice și fluxurile Supabase/Turnstile. Workerul de margine nu schimbă corpuri, redirecturi, statusuri sau cache. Activarea necesită acces DNS/hosting și verificare HTTPS înainte/după.
2. Lanțul sursă–publicare: .env și fișiere locale sensibile ignorate; scanare secrete/push protection și actualizări de securitate activate unde contul permite; PR și verificări obligatorii, fără force push/deletion. Workflow-urile PR nu primesc permisiuni de publicare. Toate acțiunile rămân fixate la SHA.
3. MFA: schimbările destructive cer assurance recent conform politicii existente. Recuperarea rezistă la pierderea răspunsului/ștergere parțială fără pierderea arbitrară a codului ori ștergerea unui factor nou. Migrare aditivă, scope de actor, blocări și replay control; nicio rescriere a migrărilor aplicate.
4. Radovar: securitatea în browser și refuzul/retragerea analytics devin gates CI. SDK-ul comun folosește URL versionat după manifestul revizuit; paginile research sunt înregistrate sincronizat în contracte. Nu activăm colectarea.
5. Operațiuni: identificarea exactă producție/staging, configurație și migrări reale; backup protejat și probă de restaurare într-un mediu izolat când accesul permite. Monitorizare repetabilă a sănătății publice și runbook de incident/rollback. Fără dumpuri, tokenuri, PII ori chei în Git/public artifacts/loguri.
6. Publicare prin PR, teste și probes pe domenii; raport cu dovezi și orice blocaj rămas. Nu prezentăm o funcție staged drept protecție publicată.

## Limite de siguranță

Fără restore în producție, reset Auth, migrare integrală v2, CAPTCHA/OAuth activate fără verificarea clientului, rotație care invalidează clienți fără inventar, modificări de DNS mail sau modificări plătite. Backupul codului nu înlocuiește recuperarea bazei/Auth/configurațiilor. Lucrările existente ale altor agenți se păstrează.

## Acceptare

Teste negative/red-green pentru constatările MFA, antete și versiuni; suitele locale relevante și CI complete; teste browser pe site-urile exportate, refuz și SDK eșuat; antetele efective în răspunsurile HTTPS; setările GitHub citite înapoi; API/config/backend identificate fără expunere de secrete; backup/restore cu proveniență și limitări declarate. Orice acces extern lipsă rămâne explicit neconfirmat.
