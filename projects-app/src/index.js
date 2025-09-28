import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';

console.log('🏗️ Before Telegram.WebApp.ready()', window.Telegram?.WebApp);
try {
  window.Telegram?.WebApp?.ready();
  window.Telegram?.WebApp?.expand?.();
  window.Telegram?.WebApp?.enableClosingConfirmation?.(true);
  console.log('✅ Telegram WebApp ready + expanded');
} catch (e) {
  console.log('Telegram WebApp API not available or failed to init:', e);
}
console.log('✅ After setup, mounting React');

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
