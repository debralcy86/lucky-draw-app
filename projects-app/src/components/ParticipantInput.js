import { useState } from 'react';

export default function ParticipantInput({ onAdd }) {
  const [name, setName] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    onAdd(name);
    setName('');
  }

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="text"
        placeholder="Enter participant name"
        value={name}
        onChange={e => setName(e.target.value)}
      />
      <button type="submit">Add</button>
    </form>
  );
}