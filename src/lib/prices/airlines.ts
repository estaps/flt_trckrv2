// Airline names as Google Flights prints them, keyed by IATA code. Fare sites
// report the airline by name, so watches on booked flights need the name.
const AIRLINE_NAMES: Record<string, string> = {
  DL: "Delta",
  AA: "American",
  UA: "United",
  WN: "Southwest",
  B6: "JetBlue",
  AS: "Alaska",
  NK: "Spirit",
  F9: "Frontier",
  HA: "Hawaiian",
  SY: "Sun Country",
  AC: "Air Canada",
  WS: "WestJet",
  AM: "Aeromexico",
  AF: "Air France",
  KL: "KLM",
  VS: "Virgin Atlantic",
  BA: "British Airways",
  LH: "Lufthansa",
  KE: "Korean Air",
  LA: "LATAM",
};

export function airlineName(code: string): string | undefined {
  return AIRLINE_NAMES[code.trim().toUpperCase()];
}
