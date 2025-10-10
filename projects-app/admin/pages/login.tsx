import { useState } from 'react';
import { useRouter } from 'next/router';
import { api } from '../lib/api';

export default function Login() {
  const [email, setEmail] = useState('admin@example.com');
  const [password, setPassword] = useState('changeme');
  const [token, setToken] = useState('');
  const [err, setErr] = useState('');
  const r = useRouter();

  async function doLogin(e: any) {
    e.preventDefault();
    setErr('');
    try {
      if (token) await api.loginWithToken(token);
      else await api.loginWithPassword(email, password);
      await api.whoami();
      r.push('/metrics');
    } catch (e: any) { setErr(e.message || String(e)); }
  }

  return (
    <form onSubmit={doLogin} style={{ maxWidth: 420 }}>
      <h2>Admin Login</h2>
      {err ? <div style={{ color: 'crimson' }}>{err}</div> : null}
      <div style={{ margin: '8px 0' }}>
        <label>Static Token</label>
        <input value={token} onChange={e=>setToken(e.target.value)} placeholder="optional" style={{ width: '100%', padding: 8 }} />
      </div>
      <div style={{ margin: '8px 0' }}>
        <label>Email</label>
        <input value={email} onChange={e=>setEmail(e.target.value)} style={{ width: '100%', padding: 8 }} />
      </div>
      <div style={{ margin: '8px 0' }}>
        <label>Password</label>
        <input type="password" value={password} onChange={e=>setPassword(e.target.value)} style={{ width: '100%', padding: 8 }} />
      </div>
      <button type="submit" style={{ padding: '8px 12px' }}>Login</button>
    </form>
  );
}
