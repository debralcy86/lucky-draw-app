export default function DrawControls({ onDraw, disabled }) {
  return (
    <button onClick={onDraw} disabled={disabled}>
      Draw Winner
    </button>
  );
}