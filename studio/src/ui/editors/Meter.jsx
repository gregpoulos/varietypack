// A count with its minimum, shown red when it falls short.
export function Meter({ id, bad, children }) {
  return <span id={id} class={'meter' + (bad ? ' bad' : '')}>{children}</span>;
}
