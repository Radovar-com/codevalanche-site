// Release announcement campaigns: save, test, approve, send in batches, and
// one-click unsubscribe. The database functions in
// migrations/202610290001_release_announcements.sql hold every rule that
// decides who is mailed; this module renders and hands mail to the provider.
import { AccountError, uuid } from "./accountContract.ts";
import { renderReleaseEmail, UNSUBSCRIBE_PAGE_URL } from "./releaseEmail.js";

const VERSION = /^\d+\.\d+\.\d+$/;
const KNOWN_ERRORS: Record<string, number> = {
  invalid_fields: 400,
  campaign_locked: 409,
  campaign_not_tested: 409,
  confirmation_mismatch: 400,
  campaign_not_sending: 409,
  operation_conflict: 409,
};

async function rpc(service: any, name: string, args: any) {
  const result = await service.rpc(name, args);
  if (result.error) {
    const code = Object.keys(KNOWN_ERRORS).find((c) =>
      String(result.error.message || "").includes(c)
    );
    throw new AccountError(
      code || "account_service_unavailable",
      code ? KNOWN_ERRORS[code] : 503,
    );
  }
  return result.data ?? [];
}

function base64url(bytes: ArrayBuffer) {
  let text = "";
  for (const b of new Uint8Array(bytes)) text += String.fromCharCode(b);
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(secret: string, userId: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return base64url(
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(`release-unsubscribe:${userId}`),
    ),
  );
}

// The token names the reader and proves we issued it; it never expires, so a
// link in an old email still unsubscribes.
export async function unsubscribeToken(secret: string, userId: string) {
  if (!secret || secret.length < 32) {
    throw new AccountError("worker_not_configured", 503);
  }
  return `${userId}.${await hmac(secret, userId)}`;
}

export async function verifyUnsubscribeToken(secret: string, token: string) {
  if (!secret || secret.length < 32) {
    throw new AccountError("worker_not_configured", 503);
  }
  const [userId, signature = ""] = String(token || "").split(".");
  if (!uuid.test(userId || "")) return null;
  const expected = await hmac(secret, userId);
  let difference = expected.length ^ signature.length;
  for (let i = 0; i < expected.length; i++) {
    difference |= expected.charCodeAt(i) ^ (signature.charCodeAt(i) || 0);
  }
  return difference === 0 ? userId.toLowerCase() : null;
}

export function releaseEmailSettings(env: (name: string) => string | undefined) {
  const functionUrl = env("RELEASE_EMAIL_FUNCTION_URL") ||
    `${env("SUPABASE_URL")}/functions/v1/release-announcements`;
  return {
    secret: env("RELEASE_EMAIL_UNSUBSCRIBE_SECRET") || "",
    from: env("RELEASE_EMAIL_FROM") || "",
    replyTo: env("RELEASE_EMAIL_REPLY_TO") || "",
    testTo: env("RELEASE_EMAIL_TEST_TO") || "",
    sendingEnabled: env("RELEASE_EMAIL_SENDING_ENABLED") === "true",
    dailyCap: Math.max(1, Number(env("RELEASE_EMAIL_DAILY_CAP") || 90) | 0),
    functionUrl,
  };
}

async function renderFor(
  settings: any,
  release: any,
  userId: string,
  inactive: boolean,
) {
  const token = await unsubscribeToken(settings.secret, userId);
  return renderReleaseEmail(release, {
    inactive,
    unsubscribeUrl: `${UNSUBSCRIBE_PAGE_URL}?t=${encodeURIComponent(token)}`,
    oneClickUrl: `${settings.functionUrl}?unsubscribe=${
      encodeURIComponent(token)
    }`,
  });
}

function checkVersion(version: any) {
  if (typeof version !== "string" || !VERSION.test(version)) {
    throw new AccountError("invalid_fields", 400);
  }
  return version;
}

async function campaign(service: any, version: string) {
  const [row] = await rpc(service, "codevalanche_release_campaign_get", {
    p_version: checkVersion(version),
  });
  if (!row) throw new AccountError("not_found", 404);
  return row;
}

// Owner actions. Every one is gated by the operator token in the function.
export async function runReleaseAction(
  body: any,
  { service, mailer, settings }: any,
) {
  switch (body?.action) {
    case "save": {
      const release = body.release;
      if (
        !release || release.version !== body.version ||
        !release.copy?.en?.headline
      ) throw new AccountError("invalid_fields", 400);
      // Render now, so a broken note fails here and not halfway through a send.
      renderReleaseEmail(release, {
        unsubscribeUrl: UNSUBSCRIBE_PAGE_URL,
        oneClickUrl: settings.functionUrl,
      });
      const [row] = await rpc(service, "codevalanche_release_campaign_save", {
        p_version: checkVersion(body.version),
        p_release: release,
        p_audience: body.audience === "opted_in" ? "opted_in" : "all_accounts",
      });
      return { version: row.version, state: row.state, audience: row.audience };
    }
    case "audience": {
      const row = await campaign(service, body.version);
      const [counts] = await rpc(
        service,
        "codevalanche_release_campaign_audience",
        { p_campaign_id: row.id },
      );
      return { version: row.version, state: row.state, ...counts };
    }
    case "send-test": {
      // Only to the owner's own address from the function secrets; the body
      // cannot choose where a test goes.
      if (!settings.testTo || !mailer) {
        throw new AccountError("worker_not_configured", 503);
      }
      const row = await campaign(service, body.version);
      const sent = [];
      for (const inactive of [false, true]) {
        const mail = await renderFor(
          settings,
          row.release,
          "00000000-0000-4000-8000-000000000000",
          inactive,
        );
        const receipt = await mailer.send({
          to: settings.testTo,
          subject: `[TEST] ${mail.subject}`,
          html: mail.html,
          text: mail.text,
          headers: mail.headers,
        }, { idempotencyKey: crypto.randomUUID() });
        sent.push({ variant: mail.variant, id: receipt.id });
      }
      await rpc(service, "codevalanche_release_campaign_mark_tested", {
        p_campaign_id: row.id,
      });
      return { version: row.version, state: "test_sent", sent };
    }
    case "approve": {
      const row = await campaign(service, body.version);
      const [result] = await rpc(
        service,
        "codevalanche_release_campaign_approve",
        { p_campaign_id: row.id, p_confirmation: String(body.confirmation || "") },
      );
      return { version: row.version, recipients: result.recipients };
    }
    case "send-batch": {
      if (!settings.sendingEnabled || !mailer) {
        throw new AccountError("worker_not_configured", 503);
      }
      const row = await campaign(service, body.version);
      const leaseId = crypto.randomUUID();
      const limit = Math.min(50, Math.max(1, Number(body.limit) | 0 || 20));
      const batch = await rpc(service, "codevalanche_release_campaign_claim", {
        p_campaign_id: row.id,
        p_lease_id: leaseId,
        p_limit: limit,
        p_daily_cap: settings.dailyCap,
      });
      let sent = 0, failed = 0;
      for (const reader of batch) {
        let receiptId: string | null = null;
        try {
          const mail = await renderFor(
            settings,
            row.release,
            reader.user_id,
            reader.variant === "inactive",
          );
          const receipt = await mailer.send({
            to: reader.email,
            subject: mail.subject,
            html: mail.html,
            text: mail.text,
            headers: mail.headers,
          }, { idempotencyKey: `release-${row.version}-${reader.user_id}` });
          receiptId = receipt.id;
          sent++;
        } catch {
          failed++;
        }
        await rpc(service, "codevalanche_release_campaign_settle", {
          p_campaign_id: row.id,
          p_user_id: reader.user_id,
          p_lease_id: leaseId,
          p_sent: Boolean(receiptId),
          p_receipt_id: receiptId,
        });
      }
      const [summary] = await rpc(
        service,
        "codevalanche_release_campaign_summary",
        { p_campaign_id: row.id },
      );
      return { version: row.version, batch: { sent, failed }, ...summary };
    }
    case "summary": {
      const row = await campaign(service, body.version);
      const [summary] = await rpc(
        service,
        "codevalanche_release_campaign_summary",
        { p_campaign_id: row.id },
      );
      return { version: row.version, ...summary };
    }
    case "cancel": {
      const row = await campaign(service, body.version);
      await rpc(service, "codevalanche_release_campaign_cancel", {
        p_campaign_id: row.id,
      });
      return { version: row.version, state: "cancelled" };
    }
    default:
      throw new AccountError("invalid_fields", 400);
  }
}

export async function unsubscribe(
  token: string,
  { service, settings }: any,
) {
  const userId = await verifyUnsubscribeToken(settings.secret, token);
  if (!userId) throw new AccountError("invalid_fields", 400);
  const [row] = await rpc(service, "codevalanche_release_email_unsubscribe", {
    p_user_id: userId,
  });
  return { unsubscribed: Boolean(row?.unsubscribed) };
}

// Resend (https://resend.com/docs/api-reference/emails/send-email). The key
// stays a function secret; nothing else in the project talks to the provider.
export function createResendMailer(
  env: (name: string) => string | undefined,
  fetcher = fetch,
) {
  const key = env("RESEND_API_KEY"), settings = releaseEmailSettings(env);
  if (!key || !settings.from) return null;
  return {
    send: async (mail: any, { idempotencyKey }: any) => {
      const response = await fetcher("https://api.resend.com/emails", {
        method: "POST",
        redirect: "error",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${key}`,
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          from: settings.from,
          to: [mail.to],
          ...(settings.replyTo ? { reply_to: settings.replyTo } : {}),
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
          headers: mail.headers,
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error("delivery_unconfirmed");
      const receipt = await response.json();
      if (typeof receipt?.id !== "string" || !receipt.id) {
        throw new Error("delivery_unconfirmed");
      }
      return { id: receipt.id };
    },
  };
}
