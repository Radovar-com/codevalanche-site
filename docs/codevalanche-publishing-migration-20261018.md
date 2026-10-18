# Codevalanche website publisher migration — 18 October 2026

Status: **website publisher migration completed and verified on 18 October 2026**. The sole website publisher is [`Radovar-com/codevalanche-site`](https://github.com/Radovar-com/codevalanche-site). The personal website repository is archived and retained for recovery. No repository was deleted; any later deletion requires separate human approval.

The organization Pages site serves `codevalanche.com`, with HTTPS enforced and the `github-pages` deployment environment restricted to `main`. Cloudflare's proxied `www` target is `radovar-com.github.io`; Full (strict), security rules and mail records are preserved. The personal Pages service is unpublished, its publishing workflow is disabled, and its repository remains read-only.

## Baseline and scope

The read-only baseline on 18 October 2026 found identical source trees:

| Repository | Main commit before migration |
|---|---|
| Organization | `357e279dbde81dd39d8e02a51f49ad716237a86f` |
| Personal | `e73c3dc09555c5df9405f7fffe8c13db7ebe575e` |

Both commits have tree `9df6c89ec2646025343605819e041f1f5141f23c`. The personal Pages configuration was `build_type: workflow`, source `main` at `/`, custom domain `codevalanche.com`, with HTTPS enforced. Its successful build/deployment run was [`39106263345`](https://github.com/cata009/codevalanche-site/actions/runs/39106263345).

This migration changes website publishing ownership. It requires no Supabase database, authentication, account-function, email-provider, or desktop-release change. Keep the existing account backend and optional-measurement settings. Preserve all mail DNS records; matching DNS records does not demonstrate successful SMTP delivery or email authentication.

## Deployment contract

The deployment workflow must permit publication only from `Radovar-com/codevalanche-site`, `refs/heads/main`, on an approved push or manual dispatch. Pull requests build and test without deploying. Retain protected-main checks, pinned actions, and checkout with `persist-credentials: false`.

No new custom deployment secret is required. Use the built-in temporary `GITHUB_TOKEN`: checkout needs `contents: read`; the deployment job needs `pages: write` and `id-token: write`, with the main-only `github-pages` environment. Do not copy personal credentials or backend keys into the workflow. [GitHub workflow requirements](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)

## Complete and qualify the cutover

1. Capture current Pages, workflow, environment, certificate and website DNS settings before each change. Preserve the known-good source/run above. Check account/organization **Settings → Pages** for verified-domain ownership: verification is scoped to its account or organization and may block another account from using the domain. A null repository verification field does not settle account-level ownership. [Domain verification](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/verifying-your-custom-domain-for-github-pages)
2. Publish and inspect the organization's own Pages artifact before releasing the working personal domain. An equal source tree alone does not prove a successful deployment.
3. In a coordinated change, remove the personal Pages custom-domain binding and assign `codevalanche.com` to the organization Pages site. A custom domain cannot remain attached to both sites. With an Actions-based deployment, the source `CNAME` file does not configure the live binding; verify Pages API/UI readback.
4. Set Cloudflare's `www` CNAME target to **`Radovar-com.github.io`**, without a repository path. Check apex routing separately. Preserve the saved DNS proxy/TTL configuration, mail/security records, and Cloudflare **Full (strict)** TLS mode. The existing Pages certificate is not proof the target site has an eligible certificate; inspect origin and edge TLS separately. Do not weaken TLS to make a failed migration appear healthy. [Custom-domain configuration](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)
5. Require the organization deployment to succeed, correct custom-domain readback, HTTPS enforcement and a valid origin certificate, plus actual public content/revision, SDK, translations, privacy pages and account-service availability. Run the strict external public monitor, including headers and absence of injected analytics. Pages health may initially return `202`; a pending check is not success. Proxy-related health flags need interpretation alongside actual origin/edge checks.
6. Only after those acceptance checks pass, disable the personal Pages deployment workflow and explicitly unpublish its Pages service. Then archive the personal **website repository**, retaining its source/history. Archiving alone does not establish that Pages is unpublished. Never delete the repository or modify desktop-release repositories. Record final repository, workflow, Pages, domain, HTTPS and monitor readbacks. [Unpublishing Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/unpublishing-a-github-pages-site)

## Rollback procedure

This is a proposed recovery procedure, not a completed restore test or an atomic operation. DNS propagation, domain verification and certificate issuance can delay recovery. Re-read current state and use saved settings; do not overwrite concurrent changes blindly.

For the API paths below, use:

```text
O = /repos/Radovar-com/codevalanche-site
P = /repos/cata009/codevalanche-site
```

1. Stop the organization publisher with `PUT O/actions/workflows/deploy-pages.yml/disable`; cancel a specifically identified in-flight deployment if necessary.
2. If archived, restore the personal repository to writable state with `PATCH P`, body `{"archived":false}`. If its Pages service was unpublished, enable it with `POST P/pages`, body `{"build_type":"workflow"}`. Restore the saved source settings with `PUT P/pages`, body `{"build_type":"workflow","source":{"branch":"main","path":"/"}}`.
3. Restore the personal `github-pages` environment if altered: `PUT P/environments/github-pages`, body `{"deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true}}`; ensure its deployment branch policies contain `main` only. If missing, add it with `POST P/environments/github-pages/deployment-branch-policies`, body `{"name":"main","type":"branch"}`. Enable the original personal workflow with `PUT P/actions/workflows/344942777/enable`.
4. Rebuild the entire known-good original run with `POST P/actions/runs/39106263345/rerun`. It uses original SHA `e73c3dc09555c5df9405f7fffe8c13db7ebe575e` and ref `main`. Do not assume an old Pages artifact still exists. GitHub limits reruns to 30 days; beyond that window, restore the recorded source through a reviewed build, retaining the original personal-only publisher guard and branch protections. [Rerun behavior](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/re-run-workflows-and-jobs)
5. Release the organization's custom domain with `PUT O/pages`, body `{"cname":null}`. Restore the personal binding with `PUT P/pages`, body `{"cname":"codevalanche.com"}`. Restore the saved website DNS target, including the previous `www` target `cata009.github.io`, and verified-domain ownership if moved. Keep Full (strict), mail DNS and unrelated security settings intact.
6. Inspect `GET P/pages` and `GET P/pages/health`, certificate readiness and live HTTPS. When eligible, restore enforcement with `PUT P/pages`, body `{"https_enforced":true}`. Verify the recovered source/content, account availability, SDK, privacy, headers and strict external monitor. Keep the organization publisher disabled until recovery is qualified.

These endpoints manage Pages and workflows; none deletes a repository. Pages configuration mutations require appropriate Pages and repository-administration authority; workflow recovery needs Actions authority. Use an already authorized operator session, without printing or storing credentials. [Pages API](https://docs.github.com/en/rest/pages/pages), [workflow API](https://docs.github.com/en/rest/actions/workflows)

## Final acceptance record

- The reviewed publisher change was merged through [PR 5](https://github.com/Radovar-com/codevalanche-site/pull/5), organization main `04e119f1f3790dce80aadda0258f23f90c945a9c`. [Run 39108683283](https://github.com/Radovar-com/codevalanche-site/actions/runs/39108683283) built and deployed successfully; deployment `7151649396` identifies that SHA and the `github-pages` environment. Its build passed 569 tests, the consent/native-navigation browser harness and locale browser checks, with zero reported dependency advisories.
- Before the domain handoff, eight files served from the organization project address matched the exact downloaded organization deployment artifact. After handoff and again after personal retirement, eight production origin responses matched that artifact; eight corresponding `www` requests had valid TLS and approved redirects to the same apex paths. Both hostnames have an approved certificate and organization Pages HTTPS enforcement is enabled.
- [Strict external monitor 39109094605](https://github.com/Radovar-com/codevalanche-site/actions/runs/39109094605) passed all five fixed public page checks, including security headers and absence of injected external scripts. A fresh public-DNS probe also passed five checks after retirement. One local resolver still returned the former direct GitHub addresses during the earlier Cloudflare delegation propagation; its missing-edge-header result is retained as failed diagnostic evidence, separate from the successful Cloudflare-route checks. No global DNS or TLS protection was weakened.
- The account endpoint passed three unauthenticated refusal/preflight checks. Public configuration remains account contract v1 with optional analytics disabled; the SDK hash remains `04adcf64de54fcf797a5e3cff2dfb50422837774dd9d97fa009cbcd2ac98e4fa`. Production function v3 remains ACTIVE with the same qualified deployed source hashes. The project is in Supabase organization Radovar; the official production-project GitHub connections inventory returned zero connections with pagination complete. No function, database, Auth or desktop deployment was performed.
- All 16 account-site mail/control DNS comparisons passed across authoritative Cloudflare and a public resolver. The Cloudflare DNS table comparison showed only the intended `www` target change. No custom secret or repository webhook needed copying; the Pages workflow uses the built-in temporary token.
- At 07:50 UTC the personal website repository readback was `archived:true`, `has_pages:false`, Pages API `404`, publishing workflow `disabled_manually`, with original main `e73c3dc09555c5df9405f7fffe8c13db7ebe575e` unchanged. The desktop repositories and application were excluded from all mutations.

These checks establish website publishing ownership, content identity and unchanged public account/mail configuration. They do not establish authenticated production signup/login/MFA, email delivery, mailbox operation, DKIM signing, or the administrator's Supabase sign-in identity. No such actions were performed or claimed. Remaining personal-name references are historical evidence, rollback pointers and negative deployment test cases; they are not active website publishing bindings. Keep the personal archive until a separate later human decision.
