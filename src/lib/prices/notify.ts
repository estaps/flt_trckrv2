import { getConfig } from "@/lib/config";

export interface Notice {
  title: string;
  message: string;
  kind: string;
  watchId: string;
  price: number;
  previousPrice: number | null;
  currency: string;
}

// Sends an alert to ALERT_WEBHOOK_URL. "ntfy" posts the message as plain text
// with a Title header (ntfy, Gotify-style bridges); "json" posts the whole notice.
// Returns false when no webhook is configured or the send failed.
export async function sendNotice(notice: Notice, fetchFn: typeof fetch = fetch): Promise<boolean> {
  const { ALERT_WEBHOOK_URL: url, ALERT_WEBHOOK_FORMAT: format } = getConfig();
  if (!url) return false;
  const init: RequestInit =
    format === "json"
      ? { body: JSON.stringify(notice), headers: { "content-type": "application/json" } }
      : { body: notice.message, headers: { Title: notice.title, Tags: "airplane", "content-type": "text/plain" } };
  try {
    const res = await fetchFn(url, { ...init, method: "POST", signal: AbortSignal.timeout(15_000) });
    if (!res.ok) console.error(`[prices] alert webhook returned HTTP ${res.status}`);
    return res.ok;
  } catch (err) {
    console.error("[prices] alert webhook failed:", err instanceof Error ? err.message : err);
    return false;
  }
}
