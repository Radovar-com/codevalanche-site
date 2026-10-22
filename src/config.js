// Public browser configuration. Supabase publishable keys are not admin credentials.
// accountServer: which account function contract the account pages use. "v1" = the
// function that is live today (only its actions; newer features stay hidden);
// "v2" = the newer server (API v2, recovery codes, activity, analytics consent).
// operatorOAuth: observe operator consent through the server without enabling account v2.
// turnstileSiteKey: public Cloudflare Turnstile site key. Empty = no CAPTCHA widget.
window.CODEVALANCHE_CONFIG = { accountOrigin: "https://codevalanche.com", apiOrigin: "", supabaseUrl: "https://hvevaxsfeyiikjhcsafi.supabase.co", supabasePublishableKey: "sb_publishable_p8gw6zszkBJZhZp6Zz6TIw_TJpO9as-", accountServer: "v1", operatorOAuth: true, turnstileSiteKey: "" }
// Enable only after collector/provider/release qualification. No network credentials belong here.
window.CODEVALANCHE_ANALYTICS = { enabled: true, baseUrl: "https://hvevaxsfeyiikjhcsafi.supabase.co/functions/v1/website-analytics/v1", pageVersion: "codevalanche_product_20261017" }
// Build replaces this from the same server-owned manifest used by the gateway.
window.CODEVALANCHE_RELEASE_MANIFEST = { version: 1, gatewayBaseUrl: "", allowedOrigins: [], assets: [] }
