import { useEffect, useState, useCallback } from 'react';

import Img01_Welcome          from '../assets/figma/01_Welcome.png';
import Img01_1_LoginRegister  from '../assets/figma/01.1_Login_Register.png';
import Img02_Dashboard        from '../assets/figma/02_Dashboard.png';
import Img02_1_Dashboard      from '../assets/figma/02.1_Dashboard.png';
import Img03_GroupA           from '../assets/figma/03_LuckyDraw_GroupA.png';
import Img04_GroupB           from '../assets/figma/04_LuckyDraw_GroupB.png';
import Img04_GroupC           from '../assets/figma/04_LuckyDraw_GroupC.png';
import Img04_GroupD           from '../assets/figma/04_LuckyDraw_GroupD.png';

const steps = [
  { key: 'welcome',       label: '01 Welcome',             img: Img01_Welcome },
  { key: 'loginRegister', label: '01.1 Login/Register',    img: Img01_1_LoginRegister },
  { key: 'dash',          label: '02 Dashboard',           img: Img02_Dashboard },
  { key: 'dashAlt',       label: '02.1 Dashboard',         img: Img02_1_Dashboard },
  { key: 'groupA',        label: '03 Group A',             img: Img03_GroupA },
  { key: 'groupB',        label: '04 Group B',             img: Img04_GroupB },
  { key: 'groupC',        label: '04 Group C',             img: Img04_GroupC },
  { key: 'groupD',        label: '04 Group D',             img: Img04_GroupD },
];

export default function FigmaSteps() {
  const [index, setIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fit, setFit] = useState(true);
  const [scale, setScale] = useState(1);

  const current = steps[index];

  const prev = useCallback(() => {
    setIndex(i => (i - 1 + steps.length) % steps.length); // wrap-around
  }, []);

  const next = useCallback(() => {
    setIndex(i => (i + 1) % steps.length); // wrap-around
  }, []);

  function jump(i) { setIndex(i); }

  // Keyboard navigation: left/right arrows, Escape to exit fullscreen
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
      if (e.key === 'Escape' && isFullscreen) { setIsFullscreen(false); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prev, next, isFullscreen]);

  // Enter/exit fullscreen toggle
  function toggleFullscreen() { setIsFullscreen(v => !v); }

  // Zoom controls
  function zoomIn() { setFit(false); setScale(s => Math.min(5, Math.round((s + 0.25) * 100) / 100)); }
  function zoomOut() { setFit(false); setScale(s => Math.max(0.25, Math.round((s - 0.25) * 100) / 100)); }
  function zoomActual() { setFit(false); setScale(1); }
  function zoomFit() { setFit(true); setScale(1); }

  // Layout styles
  const containerStyle = isFullscreen
    ? {
        position: 'fixed', inset: 0, background: '#111', color: '#fff',
        zIndex: 1000, display: 'flex', padding: 12, gap: 12
      }
    : { display: 'flex', gap: 12, marginBottom: 16 };

  const sidebarStyle = {
    width: 200, minWidth: 160, maxHeight: isFullscreen ? 'calc(100vh - 24px)' : 400,
    overflow: 'auto', border: '1px solid #ddd', background: isFullscreen ? '#1a1a1a' : '#fafafa',
    padding: 8, borderRadius: 6
  };

  const listButtonStyle = (active) => ({
    display: 'flex', alignItems: 'center', gap: 8,
    width: '100%', padding: 6, marginBottom: 6,
    border: active ? '2px solid #2d6cdf' : '1px solid #ccc',
    background: active ? (isFullscreen ? '#2a2a2a' : '#eef4ff') : '#fff',
    color: isFullscreen ? '#eee' : '#111', borderRadius: 6, cursor: 'pointer'
  });

  const thumbStyle = { width: 48, height: 32, objectFit: 'cover', borderRadius: 4, border: '1px solid #ddd' };

  const viewerOuterStyle = isFullscreen
    ? { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }
    : { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 };

  const toolbarStyle = {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: 8,
    background: isFullscreen ? '#1a1a1a' : '#f6f6f6',
    border: '1px solid #ddd', borderRadius: 6, marginBottom: 8,
    color: isFullscreen ? '#eee' : '#111'
  };

  const viewerStyle = isFullscreen
    ? { flex: 1, overflow: 'auto', border: '1px solid #333', borderRadius: 6, background: '#000' }
    : { flex: 1, overflow: 'auto', border: '1px solid #ddd', borderRadius: 6, background: '#fff' };

  const imageStyle = fit
    ? { maxWidth: '100%', height: 'auto', display: 'block', margin: '0 auto' }
    : { maxWidth: 'none', display: 'block', margin: '0 auto', transform: `scale(${scale})`, transformOrigin: 'top left' };

  return (
    <div style={containerStyle}>
      {/* Sidebar with thumbnails (compact list) */}
      <div style={sidebarStyle}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8, justifyContent: 'space-between' }}>
          <button onClick={prev}>&larr; Prev</button>
          <button onClick={next}>Next &rarr;</button>
        </div>
        {steps.map((s, i) => (
          <button
            key={s.key}
            onClick={() => jump(i)}
            style={listButtonStyle(i === index)}
            aria-current={i === index ? 'step' : undefined}
            title={s.label}
          >
            <img src={s.img} alt="" style={thumbStyle} />
            <span style={{ fontSize: 12, textAlign: 'left' }}>{s.label}</span>
          </button>
        ))}
      </div>

      {/* Viewer and controls */}
      <div style={viewerOuterStyle}>
        <div style={toolbarStyle}>
          <strong style={{ flex: 1 }}>{current.label}</strong>
          <button onClick={zoomFit} title="Fit to screen">Fit</button>
          <button onClick={zoomActual} title="Actual size">Actual</button>
          <button onClick={zoomOut} title="Zoom out">-</button>
          <span title="Zoom level">{Math.round((fit ? 100 : scale * 100))}%</span>
          <button onClick={zoomIn} title="Zoom in">+</button>
          <button onClick={toggleFullscreen} title="Toggle fullscreen">{isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}</button>
        </div>
        <div style={viewerStyle}>
          <img
            src={current.img}
            alt={current.label}
            onClick={toggleFullscreen}
            style={{ ...imageStyle, cursor: 'zoom-in', padding: 8 }}
          />
        </div>
      </div>
    </div>
  );
}

