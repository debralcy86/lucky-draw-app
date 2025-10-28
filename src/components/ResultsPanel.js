export default function ResultsPanel({ participants, winner }) {
  return (
    <div>
      <h3>Participants</h3>
      <ul>
        {participants.map((name, idx) => (
          <li
            key={idx}
            style={{
              fontWeight: name === winner ? 'bold' : 'normal',
              color: name === winner ? 'green' : 'black'
            }}
          >
            {name}
          </li>
        ))}
      </ul>

      {winner && (
        <p>
          🎉 The winner is <strong>{winner}</strong>!
        </p>
      )}
    </div>
  );
}
