// Text drawn as split-flap tiles in the departures board look, plain text otherwise.
export function Flap({ text }: { text: string }) {
  return (
    <span className="flap" aria-label={text}>
      {[...text].map((ch, i) => <b key={i} aria-hidden="true">{ch === " " ? " " : ch}</b>)}
    </span>
  );
}
