import type { Booking, Flight } from "@prisma/client";
import { Flap } from "./Flap";
import { dayLabel, statusLabel, statusTone } from "@/lib/ui/format";

// One flight drawn as a boarding pass: route on the left, a perforated stub with the details on the right.
export function FlightPass({ flight: f }: { flight: Flight & { booking?: Booking | null } }) {
  const held = f.booking && f.booking.status !== "ticketed" ? f.booking.status : null;
  return (
    <article className={`pass${f.status === "cancelled" ? " cancelled" : ""}`}>
      <div className="pass-main">
        <div className="airport"><Flap text={f.depAirport} /><small>{f.depTimeLocal ?? ""}</small></div>
        <div className="path" aria-label="to" />
        <div className="airport to"><Flap text={f.arrAirport} /><small>{f.arrTimeLocal ?? ""}</small></div>
      </div>
      <div className="pass-stub">
        <div className="fl">
          <Flap text={`${f.carrier} ${f.flightNumber}`} />
          <span className={`tag ${statusTone(f.status)}`}>{statusLabel(f.status)}</span>
        </div>
        <div><small>Date</small>{dayLabel(f.depDate)}</div>
        <div><small>Seat</small>{f.seat ?? "—"}</div>
        {f.booking ? <div><small>Confirmation</small>{f.booking.confirmationCode}</div> : null}
        {held ? <div><small>Booking</small><span className={`tag ${statusTone(held)}`}>{statusLabel(held)}</span></div> : null}
        {f.cabin ? <div><small>Cabin</small>{f.cabin}</div> : null}
      </div>
    </article>
  );
}
