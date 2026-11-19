import { getConfig } from "@/lib/config";
import { syncAllWatches } from "./sync";

let timer: NodeJS.Timeout | undefined;

// Reads fares from the sidecar every PRICE_SYNC_MINUTES (0 turns it off).
// The sidecar does the scraping on its own schedule; this only collects results.
export function startPriceSync(): void {
  if (timer) return;
  let config;
  try {
    config = getConfig();
  } catch {
    return; // Incomplete environment, for example during `next build`.
  }
  if (!config.FLIGHT_FINDER_URL || config.PRICE_SYNC_MINUTES === 0) return;
  const run = () =>
    syncAllWatches()
      .then((results) => {
        const points = results.reduce((n, r) => n + r.newPoints, 0);
        const failed = results.filter((r) => r.error).length;
        if (points || failed) console.log(`[prices] synced ${results.length} watches: ${points} new prices, ${failed} failed`);
      })
      .catch((err) => console.error("[prices] sync failed:", err));
  timer = setInterval(run, config.PRICE_SYNC_MINUTES * 60_000);
  timer.unref();
  setTimeout(run, 30_000).unref();
}
