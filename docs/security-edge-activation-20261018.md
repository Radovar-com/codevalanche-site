# Edge activation — prepared checkpoint, 18 October 2026

The existing GitHub Pages hosting stays in place. Both domains have Cloudflare Free zones prepared through the owner's authenticated dashboard. No API token was created. Nameserver delegation is awaiting the explicit action-time confirmation; these settings are not yet evidence of live response headers.

The complete GoDaddy inventories were saved privately before any delegation. Cloudflare quick-scan omitted email records: five records on Radovar and four on Codevalanche were added manually. The resulting records match the complete source zones after excluding the former provider's apex NS and SOA: **22/22 Radovar and 14/14 Codevalanche**. MX priorities, SPF, DKIM, DMARC and ownership verification values are retained. DNSSEC was already off on both domains.

All records are initially DNS-only. After delegation, verify public DNS and wait for the Universal SSL certificate to become active before proxying only the apex and `www`. Email, DKIM, provider control and other non-web names stay DNS-only. This two-stage activation avoids sending visitors through an edge without a qualified HTTPS certificate.

Each zone has an active Response Header Transform Rule named `Website security headers`, restricted to its exact apex and `www` hostnames. It **adds** the CSP header, preserving any stricter origin header, and **sets** the other five headers to the values in `cloudflare/security-headers.mjs`. The browser also enforces the per-page meta CSP already built into HTML. No Worker was deployed, no body-rewrite proxy was enabled, and these rules do not change upstream caching or response bodies. [Cloudflare response header rule semantics](https://developers.cloudflare.com/rules/transform/response-header-modification/).

The configured TLS mode is Full (strict). Keep TLS 1.3 enabled and a minimum of TLS 1.2, with HTTPS redirection. Do not enable Rocket Loader, Web Analytics/RUM, Speed Brain, AI Labyrinth or Bot Preference Sync: those can inject or change page content or create additional measurement. Email Address Obfuscation and automatic HTTPS body rewrites must remain off so native contact links and hash-qualified scripts stay intact.

After activation, run:

```powershell
node scripts/security-public-smoke.mjs --require-headers
```

Require all fixed public targets to pass GET and HEAD, effective meta/hash inventory, real HTTP security headers and absence of injected trackers. Verify consent refusal/withdrawal and native account/product navigation in a browser. Recheck public MX, SPF and DKIM against the private preimage. Enable `SECURITY_PUBLIC_MONITOR_ENABLED=true` only in the canonical organization repository after strict live checks pass, then run and inspect a manual workflow. A successful scheduled check is not proof of external alert delivery.

Rollback uses the retained original GoDaddy nameservers (Radovar `ns73/ns74.domaincontrol.com`; Codevalanche `ns09/ns10.domaincontrol.com`) and private source-zone inventory. For an edge-only fault, first return the affected web records to DNS-only and verify origin HTTPS. Never bypass certificate validation or remove page CSP to make a probe pass. DNS changes have propagation delays; keep explicit evidence of what is actually active.
