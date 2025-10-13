import React, { useState, useEffect } from 'react';

export default function LoginGate({ children }) {
  const [key, setKey] = useState('');
  const [authorized, setAuthorized] = useState(false);

  // On mount, try to load a previously saved key and auto-authorize
  useEffect(() => {
    try {
      const saved = (typeof localStorage !== 'undefined') ? (localStorage.getItem('cronKey') || '').trim() : '';
      if (saved) {
        setKey(saved);
        if (saved === 'test-12345-xyz') {
          // expose globally for API client
          if (typeof window !== 'undefined') window.CRON_KEY = saved;
          setAuthorized(true);
        }
      }
    } catch (_) {}
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    const k = (key || '').trim();
    if (k === 'test-12345-xyz') {
      // persist & expose for api.js
      try { if (typeof localStorage !== 'undefined') localStorage.setItem('cronKey', k); } catch (_) {}
      if (typeof window !== 'undefined') window.CRON_KEY = k;
      setAuthorized(true);
    } else {
      alert('Invalid key');
    }
  };

  // Ensure window.CRON_KEY is always set when authorized
  useEffect(() => {
    if (authorized && typeof window !== 'undefined') {
      window.CRON_KEY = (key || '').trim() || (typeof localStorage !== 'undefined' ? (localStorage.getItem('cronKey') || '').trim() : '');
    }
  }, [authorized, key]);

  if (authorized) return children;

  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100vh',fontFamily:'sans-serif'}}>
      <h2>Admin Access</h2>
      <form onSubmit={handleSubmit}>
        <input
          type="password"
          placeholder="Enter CRON_KEY"
          value={key}
          onChange={e=>setKey(e.target.value)}
          style={{padding:'8px',width:'220px',margin:'6px'}}
        />
        <button type="submit" style={{padding:'8px 20px'}}>Unlock</button>
      </form>
    </div>
  );
}
