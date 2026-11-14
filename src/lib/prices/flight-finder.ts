// Client for the flight-finder sidecar (github.com/affromero/flight-finder).
// It scrapes fares on its own schedule; this app creates one tracker per watch
// and reads the fares back.
import type { Fare } from "./match";

export class FlightFinderError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

export interface TrackerRequest {
  origin: string;
  destination: string;
  departDate: string; // YYYY-MM-DD
  returnDate?: string | null;
  cabin: string;
  currency: string;
  airline?: string | null;
  maxStops?: number | null;
  label?: string | null;
}

export interface FaresResult {
  fares: Fare[];
  lastChecked: string | null;
  lastStatus: string | null;
}

type FetchFn = typeof fetch;

export class FlightFinderClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token?: string,
    private readonly fetchFn: FetchFn = fetch,
  ) {}

  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    if (init.body) headers.set("content-type", "application/json");
    if (this.token) headers.set("authorization", `Bearer ${this.token}`);
    let res: Response;
    try {
      res = await this.fetchFn(new URL(path, this.baseUrl), {
        ...init,
        headers,
        redirect: "error",
        signal: AbortSignal.timeout(30_000),
      });
    } catch (err) {
      throw new FlightFinderError(`flight-finder is unreachable: ${err instanceof Error ? err.message : err}`);
    }
    const body = (await res.json().catch(() => null)) as { ok?: boolean; data?: T; error?: string } | null;
    if (!res.ok || body?.ok === false || !body) {
      throw new FlightFinderError(body?.error ?? `flight-finder returned HTTP ${res.status}`, res.status);
    }
    return body.data as T;
  }

  async createTracker(req: TrackerRequest): Promise<{ id: string; deleteToken: string }> {
    const roundTrip = Boolean(req.returnDate);
    const route = `${req.origin} to ${req.destination}`;
    const data = await this.call<{ queries: Array<{ id: string; deleteToken: string }> }>("/api/queries", {
      method: "POST",
      body: JSON.stringify({
        rawInput: `${route} on ${req.departDate}${roundTrip ? `, returning ${req.returnDate}` : ""}`,
        dateFrom: req.departDate,
        dateTo: req.returnDate ?? req.departDate,
        flexibility: 0,
        cabinClass: req.cabin,
        tripType: roundTrip ? "round_trip" : "one_way",
        currency: req.currency,
        preferredAirlines: req.airline ? [req.airline] : [],
        maxStops: req.maxStops ?? null,
        label: req.label ? req.label.slice(0, 60) : null,
        routes: [
          {
            origin: req.origin,
            originName: req.origin,
            destination: req.destination,
            destinationName: req.destination,
            date: req.departDate,
            ...(roundTrip ? { returnDate: req.returnDate } : {}),
            selectedFlights: [],
          },
        ],
      }),
    });
    const q = data.queries?.[0];
    if (!q?.id) throw new FlightFinderError("flight-finder did not return a tracker id");
    return { id: q.id, deleteToken: q.deleteToken };
  }

  async fares(trackerId: string): Promise<FaresResult> {
    const data = await this.call<{ snapshots: Fare[]; lastChecked: string | null; lastStatus: string | null }>(
      `/api/queries/${encodeURIComponent(trackerId)}/prices`,
    );
    return { fares: data.snapshots ?? [], lastChecked: data.lastChecked, lastStatus: data.lastStatus };
  }

  async deleteTracker(trackerId: string, deleteToken: string): Promise<void> {
    await this.call(`/api/queries/${encodeURIComponent(trackerId)}`, {
      method: "DELETE",
      body: JSON.stringify({ deleteToken }),
    });
  }
}
