# Codevalanche website publisher migration — 18 October 2026

Status: **in progress; final acceptance pending**. The intended sole website publisher is [`Radovar-com/codevalanche-site`](https://github.com/Radovar-com/codevalanche-site). The personal website repository is retained for recovery and archived only after successful publication verification. No repository deletion is part of this procedure.

The organization Pages site has been enabled without a custom domain, and its `github-pages` environment is restricted to `main`. This preparation does not establish that the public domain has moved or that the personal publisher is retired.

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

## Final acceptance still required

Record the final organization publishing commit and successful deployment, domain/HTTPS readback, strict external monitor result, personal Pages unpublication, disabled personal publishing workflow, and personal repository archive flag. Until those checks are recorded, this document must continue to describe the migration as in progress.
