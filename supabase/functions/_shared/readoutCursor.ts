import { AccountError, checked, uuid } from "./accountContract.ts";
export function encodeReadoutCursor(time: string, id: string) {
  return btoa(JSON.stringify({ time, id })).replaceAll("+", "-").replaceAll(
    "/",
    "_",
  ).replace(/=+$/, "");
}
export function decodeReadoutCursor(value: any) {
  if (value === undefined || value === null) return null;
  if (
    typeof value !== "string" || value.length > 512 ||
    !/^[a-zA-Z0-9_-]+$/.test(value)
  ) throw new AccountError("invalid_fields", 400);
  try {
    const data = JSON.parse(
      atob(value.replaceAll("-", "+").replaceAll("_", "/")),
    );
    if (
      Object.keys(data).some((k) => !["time", "id"].includes(k)) ||
      typeof data.time !== "string" || data.time.length > 80 ||
      !Number.isFinite(Date.parse(data.time)) || !uuid.test(data.id || "")
    ) throw new Error();
    return data;
  } catch {
    throw new AccountError("invalid_fields", 400);
  }
}
export async function readReadoutPage(
  service: any,
  kind: string,
  body: any,
  userId: string | null,
) {
  const limit = body.limit ?? 50;
  if (
    !Number.isInteger(limit) || limit < 1 || limit > 100 ||
    body.before !== undefined
  ) throw new AccountError("invalid_fields", 400);
  const cursor = decodeReadoutCursor(body.cursor);
  const rows = checked(
    await service.rpc("codevalanche_readout_page", {
      p_kind: kind,
      p_user_id: userId,
      p_cursor_time: cursor?.time ?? null,
      p_cursor_id: cursor?.id ?? null,
      p_limit: limit + 1,
    }),
  ) as any[];
  const hasMore = rows.length > limit,
    page = rows.slice(0, limit).map((r) => r.record);
  const last = page.at(-1);
  const nextCursor = hasMore && last
    ? encodeReadoutCursor(last._cursorTime, last._cursorId)
    : null;
  return {
    rows: page.map(({ _cursorTime, _cursorId, ...row }) => row),
    nextCursor,
    hasMore,
  };
}
