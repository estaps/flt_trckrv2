import { findAirport } from "../airports";
import { localToUtc } from "../time";
import type { ParsedDocument } from "./types";

export interface ResolvedFlight {
  carrier: string;
  flightNumber: string;
  depDate: string;
  depAirport: string | null;
  arrAirport: string | null;
  depTimeLocal?: string;
  arrTimeLocal?: string;
  depTimeUtc?: string;
  arrTimeUtc?: string;
  cabin?: string;
  fareClass?: string;
  seat?: string;
}

export interface ResolvedDocument {
  parsed: ParsedDocument;
  flights: ResolvedFlight[];
  warnings: string[];
}

// Turns printed airport labels into IATA codes and local times into UTC.
// Anything it cannot settle becomes a warning for the review inbox.
export function resolveDocument(parsed: ParsedDocument): ResolvedDocument {
  const warnings = [...parsed.warnings];
  const flights = parsed.flights.map((f) => {
    const dep = findAirport(f.depLabel);
    const arr = findAirport(f.arrLabel);
    const name = `${f.carrier} ${f.flightNumber}`;
    if (!dep.airport) warnings.push(`${name}: unknown departure airport "${f.depLabel}"`);
    else if (dep.ambiguous) warnings.push(`${name}: "${f.depLabel}" matched more than one airport; picked ${dep.airport.iata}`);
    if (!arr.airport) warnings.push(`${name}: unknown arrival airport "${f.arrLabel}"`);
    else if (arr.ambiguous) warnings.push(`${name}: "${f.arrLabel}" matched more than one airport; picked ${arr.airport.iata}`);

    const out: ResolvedFlight = {
      carrier: f.carrier.toUpperCase(),
      flightNumber: f.flightNumber.replace(/^0+/, ""),
      depDate: f.date,
      depAirport: dep.airport?.iata ?? null,
      arrAirport: arr.airport?.iata ?? null,
      depTimeLocal: f.depTimeLocal,
      arrTimeLocal: f.arrTimeLocal,
      cabin: f.cabin,
      fareClass: f.fareClass,
      seat: f.seat,
    };
    if (f.depTimeLocal && dep.airport) {
      const depUtc = localToUtc(f.date, f.depTimeLocal, dep.airport.tz);
      out.depTimeUtc = depUtc.toISOString();
      if (f.arrTimeLocal && arr.airport) {
        let arrUtc = localToUtc(f.date, f.arrTimeLocal, arr.airport.tz);
        // Arrival printed without a date: if it lands "before" it leaves, it is the next day.
        while (arrUtc <= depUtc) arrUtc = new Date(arrUtc.getTime() + 86400000);
        out.arrTimeUtc = arrUtc.toISOString();
      }
    }
    return out;
  });
  return { parsed, flights, warnings };
}
