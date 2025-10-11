import React, { useEffect, useState } from 'react'

const API_BASE = import.meta.env.VITE_API_BASE || import.meta.env.VITE_API_BASE

export default function App() {
  const [ping, setPing] = useState('checking…')
  useEffect(() => {
    const url = (API_BASE || '').replace(/\/$/, '') + '/api/admin/whoami'
    fetch(url, { credentials: 'include' })
      .then(r => setPing(`whoami status: ${r.status}`))
      .catch(e => setPing(`error: ${String(e)}`))
  }, [])
  return (
    <div style={{fontFamily:'system-ui, -apple-system, Segoe UI, Roboto, sans-serif', padding: 24}}>
      <h1>Lucky Draw Admin</h1>
      <div>API_BASE: {API_BASE || '(not set)'}</div>
      <div>{ping}</div>
    </div>
  )
}
