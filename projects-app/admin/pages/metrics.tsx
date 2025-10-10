import useSWR from 'swr';
import { useRouter } from 'next/router';
import { api } from '../lib/api';
const fetcher = () => api.metrics();

export default function Metrics() {
  const { data, error, isLoading, mutate } = useSWR('/metrics', fetcher);
  const r = useRouter();

  return (
    <div>
      <div style={{ display:'flex', gap:8, alignItems:'center' }}>
        <h2 style={{ margin:'8px 0' }}>Admin Metrics</h2>
        <button onClick={()=>mutate()} style={{ padding:'6px 10px' }}>Refresh</button>
        <button onClick={async()=>{ await api.logout(); r.push('/login'); }} style={{ padding:'6px 10px' }}>Logout</button>
      </div>
      {isLoading && <div>Loading…</div>}
      {error && <div style={{ color:'crimson' }}>{String(error as any)}</div>}
      {data && <pre style={{ background:'#f6f8fa', padding:12, borderRadius:8 }}>{JSON.stringify(data, null, 2)}</pre>}
    </div>
  );
}
