/**
 * Randomly shuffles the participants array using Fisher–Yates
 * and returns the first element as the winner.
 *
 * @param {Array<string>} participants
 * @returns {string}
 */
export function pickWinner(participants) {
  if (!Array.isArray(participants) || participants.length === 0) {
    throw new Error('participants must be a non-empty array');
  }

  // Make a shallow copy
  const arr = participants.slice();

  // Fisher–Yates shuffle
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }

  // First item after shuffle is the winner
  return arr[0];
}