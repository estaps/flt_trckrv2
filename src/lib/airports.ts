import airportRows from "../../prisma/seed/airports.json";

// [iata, name, city, state, country, tz] from the MIT-licensed mwgg/Airports dataset.
type Row = [string, string, string, string, string, string];

export interface AirportInfo {
  iata: string;
  name: string;
  city: string;
  state: string;
  country: string;
  tz: string;
}

export interface AirportMatch {
  airport: AirportInfo | null;
  // More than one airport fit equally well; the caller should ask for review.
  ambiguous: boolean;
}

const airports: AirportInfo[] = (airportRows as Row[]).map(([iata, name, city, state, country, tz]) => ({
  iata,
  name,
  city,
  state,
  country,
  tz,
}));

const byIata = new Map(airports.map((a) => [a.iata, a]));

const normalize = (s: string) =>
  s
    .toUpperCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’.]/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();

const searchText = airports.map((a) => {
  const text = normalize(`${a.iata} ${a.city} ${a.name} ${a.state}`);
  return { airport: a, city: normalize(a.city), text, squashed: text.replace(/ /g, "") };
});

export function airportByIata(code: string): AirportInfo | undefined {
  return byIata.get(code.toUpperCase());
}

// Resolves an airline's airport label to an airport. Accepts IATA codes ("ATL")
// and the city labels airlines print ("WASHINGTON-REAGAN", "CHICAGO-O'HARE", "INDIANAPOLIS").
export function findAirport(label: string): AirportMatch {
  const q = normalize(label);
  if (/^[A-Z]{3}$/.test(q) && byIata.has(q)) return { airport: byIata.get(q)!, ambiguous: false };

  const parts = label.split(/[-/]/).map(normalize).filter(Boolean);
  const tokens = q.split(" ");
  const scored = searchText
    .filter((s) => tokens.every((t) => s.text.split(" ").includes(t) || s.squashed.includes(t)))
    .map((s) => {
      let score = 0;
      if (s.city === parts[0]) score += 4;
      if (/INTERNATIONAL/i.test(s.airport.name)) score += 2;
      if (s.airport.country === "US") score += 1;
      return { airport: s.airport, score };
    })
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return { airport: null, ambiguous: false };
  const ambiguous = scored.length > 1 && scored[1].score === scored[0].score;
  return { airport: scored[0].airport, ambiguous };
}

export function allAirports(): AirportInfo[] {
  return airports;
}
