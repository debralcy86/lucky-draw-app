export default function Index() {
  if (typeof window !== 'undefined') window.location.replace('/login');
  return null;
}
