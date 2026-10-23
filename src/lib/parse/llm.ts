import { extractJson, type LlmImage, type LlmSettings } from "../llm";
import { ParsedDocument } from "./types";

const SYSTEM = `You extract travel bookings from airline emails, receipts and itineraries, and travel expenses from other receipts.
Reply with one JSON object and nothing else. Use this shape:
{
  "kind": "itinerary" | "ticket_receipt" | "cancellation" | "expense_receipt" | "unknown",
  "airline": two-letter IATA airline code,
  "confirmationCode": six-character record locator,
  "ticketNumber": 13-digit ticket number,
  "passengerName": string,
  "issuedOn": "YYYY-MM-DD",
  "bookingStatus": "held" | "ticketed" | "cancelled",
  "flights": [{
    "carrier": two-letter airline code, "flightNumber": digits only,
    "date": local departure date "YYYY-MM-DD",
    "depLabel": departure airport IATA code if printed, else the city as printed,
    "arrLabel": same for arrival,
    "depTimeLocal": "HH:MM" 24-hour local, "arrTimeLocal": "HH:MM",
    "cabin": string, "fareClass": one letter, "seat": string
  }],
  "charges": {"baseFare": number, "taxes": number, "total": number, "currency": "USD"},
  "paymentCard": card brand and last four digits,
  "ecreditsApplied": [{"number": string, "amount": number, "currency": "USD"}],
  "ecreditsIssued": [{"number": string, "amount": number, "currency": "USD", "expiresOn": "YYYY-MM-DD"}],
  "cancelledTicketNumbers": [string],
  "expense": {
    "category": "lodging" | "ground" | "car_rental" | "meals" | "baggage" | "parking" | "fuel" | "connectivity" | "fees" | "other",
    "merchant": business name, "total": number actually paid including tax and tip,
    "currency": ISO 4217 code, "date": "YYYY-MM-DD"
  }
}
Use "expense_receipt" with "expense" for any receipt that is not an airline ticket: hotels, taxis and rideshares, meals, car rentals, parking, bag fees.
"ground" covers taxis, rideshares, trains and transit.
Leave out any field the document does not state. Never guess numbers.`;

export async function parseWithLlm(settings: LlmSettings, text: string, sentAt?: string, images?: LlmImage[]) {
  const context = sentAt ? `The document was sent on ${sentAt}; use it to fill in missing years.\n\n` : "";
  const prompt = text.trim()
    ? `${context}Document text:\n\n${text.slice(0, 40000)}`
    : `${context}The document is the attached image.`;
  const res = await extractJson<unknown>(settings, { system: SYSTEM, prompt, images });
  const parsed = ParsedDocument.parse({ template: "llm", ...(res.data as object) });
  return { parsed: { ...parsed, template: "llm" }, model: res.model };
}
