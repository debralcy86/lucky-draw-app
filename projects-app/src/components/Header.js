import React from 'react';

export default function Header({ isAdmin = false, onNavigate }) {
  // If user is not admin, hide header entirely
  if (!isAdmin) return null;

  // Visible only for adminid=true
  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        marginBottom: 12,
        padding: '8px 12px',
      }}
    >
      <button
        onClick={() => onNavigate?.('adminDashboard')}
        style={{
          padding: '6px 12px',
          borderRadius: 6,
          border: '1px solid #ccc',
          background: '#f8f8f8',
          cursor: 'pointer',
        }}
      >
        Admin
      </button>
      {/* TAG: header-admin-only-v1 */}
    </header>
  );
}