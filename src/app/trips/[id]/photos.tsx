import type { Flight, TripPhoto } from "@prisma/client";
import { ConfirmButton } from "@/components/ConfirmButton";
import { PHOTO_KINDS } from "@/lib/schemas";
import { ymd } from "@/lib/ui/format";
import { editPhoto, readPhoto, removePhoto, uploadPhotos } from "./actions";

const flightLabel = (f: Flight) => `${f.carrier} ${f.flightNumber} ${f.depAirport}-${f.arrAirport} ${ymd(f.depDate)}`;

export function PhotosSection({ tripId, photos, flights, error }: { tripId: string; photos: TripPhoto[]; flights: Flight[]; error?: string }) {
  const flightById = new Map(flights.map((f) => [f.id, f]));
  return (
    <section className="card" id="photos">
      <div className="card-head"><h3>Ticket photos</h3></div>
      {error ? <p className="error">{error}</p> : null}
      {photos.length === 0 ? (
        <p className="empty">No photos yet. Add captures of tickets, boarding passes and receipts.</p>
      ) : (
        <div className="gallery">
          {photos.map((p) => {
            const flight = p.flightId ? flightById.get(p.flightId) : undefined;
            return (
              <figure key={p.id}>
                <a href={`/api/photos/${p.id}/file`} target="_blank">
                  <img src={`/api/photos/${p.id}/file?size=thumb`} alt={p.caption ?? p.filename ?? "photo"} loading="lazy" />
                </a>
                <figcaption>
                  <span className="tag dim">{PHOTO_KINDS[p.kind as keyof typeof PHOTO_KINDS] ?? p.kind}</span>
                  {p.caption ? <span>{p.caption}</span> : null}
                  {flight ? <div className="muted small">{flightLabel(flight)}</div> : null}
                  <details>
                    <summary className="small">edit</summary>
                    <form action={editPhoto} className="stack">
                      <input type="hidden" name="photoId" value={p.id} />
                      <select name="kind" defaultValue={p.kind}>
                        {Object.entries(PHOTO_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                      <input name="caption" defaultValue={p.caption ?? ""} placeholder="Caption" />
                      <select name="flightId" defaultValue={p.flightId ?? ""}>
                        <option value="">No flight</option>
                        {flights.map((f) => <option key={f.id} value={f.id}>{flightLabel(f)}</option>)}
                      </select>
                      <button type="submit">Save</button>
                    </form>
                  </details>
                  <div className="row small">
                    {p.documentId ? (
                      <a href={`/inbox/${p.documentId}`}>parsed result</a>
                    ) : (
                      <form action={readPhoto}>
                        <input type="hidden" name="photoId" value={p.id} />
                        <button type="submit" className="link" title="Read flights or an expense from this photo">read it</button>
                      </form>
                    )}
                    <form action={removePhoto}>
                      <input type="hidden" name="photoId" value={p.id} />
                      <ConfirmButton message="Delete this photo?" className="link danger">delete</ConfirmButton>
                    </form>
                  </div>
                </figcaption>
              </figure>
            );
          })}
        </div>
      )}
      <hr className="divider" style={{ margin: "16px 0" }} />
      <form action={uploadPhotos} className="inline">
        <input type="hidden" name="tripId" value={tripId} />
        <label>Photos<input name="photos" type="file" multiple accept="image/*" required /></label>
        <label>Kind
          <select name="kind" defaultValue="ticket">
            {Object.entries(PHOTO_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label>Caption<input name="caption" placeholder="optional" /></label>
        <button type="submit">Add photos</button>
      </form>
    </section>
  );
}
