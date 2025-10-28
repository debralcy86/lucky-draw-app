import React, { useCallback, useRef, useState, useEffect, useMemo } from 'react';
// Inject once: remove focus ring for hotspot elements only
if (typeof document !== 'undefined' && !document.getElementById('hotspot-no-focus-style')) {
  const styleEl = document.createElement('style');
  styleEl.id = 'hotspot-no-focus-style';
  styleEl.textContent = `
    /* Only affect elements we render with data-hotspot attr */
    [data-hotspot] :focus { outline: none !important; box-shadow: none !important; }
    [data-hotspot] input:focus,
    [data-hotspot] select:focus,
    [data-hotspot] button:focus {
      outline: none !important;
      box-shadow: none !important;
    }
    [data-hotspot] * { -webkit-tap-highlight-color: transparent; }
  `;
  document.head.appendChild(styleEl);
}

const HANDLE_CONFIG = [
  { key: 'nw', cursor: 'nwse-resize', style: { left: 0, top: 0, transform: 'translate(-50%, -50%)' } },
  { key: 'ne', cursor: 'nesw-resize', style: { right: 0, top: 0, transform: 'translate(50%, -50%)' } },
  { key: 'se', cursor: 'nwse-resize', style: { right: 0, bottom: 0, transform: 'translate(50%, 50%)' } },
  { key: 'sw', cursor: 'nesw-resize', style: { left: 0, bottom: 0, transform: 'translate(-50%, 50%)' } },
];

const MIN_SIZE = 0.5; // minimum hotspot dimension in %

function percentToNumber(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = parseFloat(value.replace('%', ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function createSignature(list = []) {
  return list
    .map((h) => [h?.key ?? '', h?.left ?? '', h?.top ?? '', h?.width ?? '', h?.height ?? ''].join(':'))
    .join('|');
}

function prepareEditableHotspots(list = []) {
  return list.map((h, idx) => {
    const left = percentToNumber(h.left);
    const top = percentToNumber(h.top);
    const width = Math.max(MIN_SIZE, percentToNumber(h.width));
    const height = Math.max(MIN_SIZE, percentToNumber(h.height));
    return {
      key: h.key ?? `__hotspot_${idx}`,
      data: h,
      rect: { left, top, width, height },
    };
  });
}

function ensureRectBounds(rect) {
  const left = clamp(rect.left, 0, 100 - MIN_SIZE);
  const top = clamp(rect.top, 0, 100 - MIN_SIZE);
  const width = clamp(rect.width, MIN_SIZE, 100 - left);
  const height = clamp(rect.height, MIN_SIZE, 100 - top);
  return { left, top, width, height };
}

function getEventPoint(evt) {
  if (!evt) return { x: 0, y: 0 };
  if (evt.touches && evt.touches.length > 0) {
    const touch = evt.touches[0];
    return { x: touch.clientX, y: touch.clientY };
  }
  if (evt.changedTouches && evt.changedTouches.length > 0) {
    const touch = evt.changedTouches[0];
    return { x: touch.clientX, y: touch.clientY };
  }
  return { x: evt.clientX, y: evt.clientY };
}

function preventDefault(event) {
  if (event?.preventDefault) event.preventDefault();
}

// HotspotImage: renders an image with absolute-positioned clickable hotspots.
// Props:
// - src, alt
// - hotspots: [{ key, left:'%', top:'%', width:'%', height:'%', title?, ariaLabel?, onClick? }]
// - editable?: boolean — when true, click-drag to draw a rect; logs JSON with % coords
// - onDraft?(rect, meta) — callback when a draft rect is created or edited
// - interactionsEnabled?: boolean — allow hotspots to trigger their click handlers (defaults to false)
export default function HotspotImage({
  src,
  alt,
  hotspots = [],
  editable = false,
  showOverlay = false,
  onDraft,
  onBack,
  backLabel = 'Back',
  autoExpandTelegram = true,
  fullHeight = false,
  interactionsEnabled = false,
  overlayStyle,
}) {
  const wrapRef = useRef(null);
  const signatureRef = useRef(createSignature(hotspots));
  const [editHotspots, setEditHotspots] = useState(() => prepareEditableHotspots(hotspots));
  const [activeIndex, setActiveIndex] = useState(null);
  const interactionRef = useRef(null); // { type, handle, index, startClient, container, initialRect, latestRect, hasMoved, metaKey }

  const [drag, setDrag] = useState(null); // {x0,y0,x1,y1} in px
  const [lastDraft, setLastDraft] = useState(null); // {left:'%',top:'%',width:'%',height:'%'}
  const [snap, setSnap] = useState(true); // snap to 1% grid for easier tagging
  const [twoClick, setTwoClick] = useState(false); // two-click precision mode

  const removeWindowListeners = useRef(() => {});

  useEffect(() => {
    return () => {
      removeWindowListeners.current();
      interactionRef.current = null;
    };
  }, []);

  useEffect(() => {
    const nextSignature = createSignature(hotspots);
    setEditHotspots((prev) => {
      if (!prev || prev.length !== hotspots.length) {
        signatureRef.current = nextSignature;
        return prepareEditableHotspots(hotspots);
      }
      if (nextSignature !== signatureRef.current) {
        signatureRef.current = nextSignature;
        return prepareEditableHotspots(hotspots);
      }
      signatureRef.current = nextSignature;
      return prev.map((entry, idx) => {
        const nextData = hotspots[idx];
        if (nextData && entry.data !== nextData) {
          return { ...entry, data: nextData };
        }
        return entry;
      });
    });
  }, [hotspots]);

  useEffect(() => {
    if (!editable) {
      setActiveIndex(null);
      interactionRef.current = null;
      removeWindowListeners.current();
    }
  }, [editable]);

  // Make Telegram WebApp use full height like bet.html
  useEffect(() => {
    if (!autoExpandTelegram) return;
    try {
      if (window.Telegram && window.Telegram.WebApp) {
        window.Telegram.WebApp.ready();
        window.Telegram.WebApp.expand();
      }
    } catch (_) {}
  }, [autoExpandTelegram]);

  const pctNumber = useCallback((px, total) => Math.max(0, Math.min(100, (px / total) * 100)), []);
  const toPctString = useCallback((num) => `${num.toFixed(2)}%`, []);
  const snapNum = useCallback((num) => {
    if (!snap) return num;
    const step = 1; // 1% increments
    return Math.round(num / step) * step;
  }, [snap]);

  const emitDraft = useCallback((rect, meta) => {
    const draft = {
      left: toPctString(rect.left),
      top: toPctString(rect.top),
      width: toPctString(rect.width),
      height: toPctString(rect.height),
    };
    setLastDraft(draft);
    const snippet = `{ left: '${draft.left}', top: '${draft.top}', width: '${draft.width}', height: '${draft.height}' }`;
    // eslint-disable-next-line no-console
    if (meta) {
      console.log('Hotspot draft:', draft, 'snippet:', snippet, meta);
    } else {
      console.log('Hotspot draft:', draft, 'snippet:', snippet);
    }
    if (onDraft) onDraft(draft, meta);
  }, [onDraft, toPctString]);

  const attachWindowListeners = useCallback((move, up) => {
    window.addEventListener('mousemove', move, { passive: false });
    window.addEventListener('mouseup', up, { passive: false });
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', up, { passive: false });
    removeWindowListeners.current = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', up);
      removeWindowListeners.current = () => {};
    };
  }, []);

  const onPointerDown = (e) => {
    if (!editable) return;
    if (e.button !== undefined && e.button !== 0) return;
    const target = e.target;
    if (target && (target.closest('[data-ui-overlay="true"]') || target.closest('button, input, textarea, select'))) {
      return;
    }
    preventDefault(e);
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const point = getEventPoint(e);
    const x = point.x - rect.left;
    const y = point.y - rect.top;

    if (twoClick) {
      if (!drag) {
        setDrag({ x0: x, y0: y, x1: x, y1: y });
      } else {
        setDrag((d) => ({ ...d, x1: x, y1: y }));
        setTimeout(() => finalizeDraft(), 0);
      }
      return;
    }

    setDrag({ x0: x, y0: y, x1: x, y1: y });
    const move = (ev) => {
      preventDefault(ev);
      const r = wrapRef.current?.getBoundingClientRect();
      if (!r) return;
      if (!twoClick) {
        const p = getEventPoint(ev);
        setDrag((d) => d && ({ ...d, x1: p.x - r.left, y1: p.y - r.top }));
      }
    };
    const up = () => {
      finalizeDraft();
    };
    attachWindowListeners(move, up);
  };

  const onPointerMove = (e) => {
    if (!editable || !drag || twoClick) return;
    preventDefault(e);
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const point = getEventPoint(e);
    setDrag((d) => d && ({ ...d, x1: point.x - rect.left, y1: point.y - rect.top }));
  };

  const finalizeDraft = () => {
    if (!editable || !drag) return;
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) { setDrag(null); return; }
    const x = Math.min(drag.x0, drag.x1);
    const y = Math.min(drag.y0, drag.y1);
    const w = Math.abs(drag.x1 - drag.x0);
    const h = Math.abs(drag.y1 - drag.y0);
    let left = pctNumber(x, rect.width);
    let top = pctNumber(y, rect.height);
    let width = pctNumber(w, rect.width);
    let height = pctNumber(h, rect.height);
    left = snapNum(left); top = snapNum(top); width = snapNum(width); height = snapNum(height);
    setDrag(null);
    const bounded = ensureRectBounds({ left, top, width, height });
    emitDraft(bounded, { mode: 'draw' });
  };

  const onPointerUp = () => {
    if (!twoClick) {
      finalizeDraft();
      removeWindowListeners.current();
    }
  };

  const renderRect = (d) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect || !d) return null;
    const x = Math.min(d.x0, d.x1);
    const y = Math.min(d.y0, d.y1);
    const w = Math.abs(d.x1 - d.x0);
    const h = Math.abs(d.y1 - d.y0);
    return (
      <div style={{ position: 'absolute', left: x, top: y, width: w, height: h, border: '2px dashed #2d6cdf', borderRadius: 8, pointerEvents: 'none' }} />
    );
  };

  const copyDraft = useCallback(async (snippet) => {
    if (!snippet || !navigator?.clipboard) return;
    try { await navigator.clipboard.writeText(snippet); } catch {}
  }, []);

  const handleInteractionMove = useCallback((event) => {
    const data = interactionRef.current;
    if (!data) return;
    preventDefault(event);
    const { index, type, handle, container, initialRect, startClient } = data;
    if (!container.width || !container.height) return;

    const point = getEventPoint(event);
    const deltaX = point.x - startClient.x;
    const deltaY = point.y - startClient.y;
    if (!data.hasMoved && (Math.abs(deltaX) > 1 || Math.abs(deltaY) > 1)) {
      data.hasMoved = true;
    }

    const dxPct = (deltaX / container.width) * 100;
    const dyPct = (deltaY / container.height) * 100;

    const base = initialRect;
    const right = base.left + base.width;
    const bottom = base.top + base.height;

    let next = { ...base };

    if (type === 'move') {
      const newLeft = clamp(base.left + dxPct, 0, 100 - base.width);
      const newTop = clamp(base.top + dyPct, 0, 100 - base.height);
      next = { left: newLeft, top: newTop, width: base.width, height: base.height };
    } else if (type === 'resize') {
      if (handle === 'nw') {
        const newLeft = clamp(base.left + dxPct, 0, right - MIN_SIZE);
        const newTop = clamp(base.top + dyPct, 0, bottom - MIN_SIZE);
        next = {
          left: newLeft,
          top: newTop,
          width: right - newLeft,
          height: bottom - newTop,
        };
      } else if (handle === 'ne') {
        const newRight = clamp(right + dxPct, base.left + MIN_SIZE, 100);
        const newTop = clamp(base.top + dyPct, 0, bottom - MIN_SIZE);
        next = {
          left: base.left,
          top: newTop,
          width: newRight - base.left,
          height: bottom - newTop,
        };
      } else if (handle === 'se') {
        const newRight = clamp(right + dxPct, base.left + MIN_SIZE, 100);
        const newBottom = clamp(bottom + dyPct, base.top + MIN_SIZE, 100);
        next = {
          left: base.left,
          top: base.top,
          width: newRight - base.left,
          height: newBottom - base.top,
        };
      } else if (handle === 'sw') {
        const newLeft = clamp(base.left + dxPct, 0, right - MIN_SIZE);
        const newBottom = clamp(bottom + dyPct, base.top + MIN_SIZE, 100);
        next = {
          left: newLeft,
          top: base.top,
          width: right - newLeft,
          height: newBottom - base.top,
        };
      }
    }

    next = ensureRectBounds({
      left: snapNum(next.left),
      top: snapNum(next.top),
      width: snapNum(next.width),
      height: snapNum(next.height),
    });

    data.latestRect = next;
    setEditHotspots((prev) => prev.map((entry, i) => (i === index ? { ...entry, rect: next } : entry)));
  }, [snapNum]);

  const handleInteractionEnd = useCallback((event) => {
    const data = interactionRef.current;
    if (!data) return;
    event?.preventDefault?.();
    removeWindowListeners.current();
    interactionRef.current = null;

    if (!data.hasMoved) {
      setActiveIndex(data.index);
      return;
    }

    const finalRect = data.latestRect || data.initialRect;
    const bounded = ensureRectBounds({
      left: snapNum(finalRect.left),
      top: snapNum(finalRect.top),
      width: snapNum(finalRect.width),
      height: snapNum(finalRect.height),
    });

    setEditHotspots((prev) => prev.map((entry, i) => (i === data.index ? { ...entry, rect: bounded } : entry)));
    setActiveIndex(data.index);
    emitDraft(bounded, { mode: 'edit', index: data.index, key: data.metaKey, handle: data.handle });
  }, [emitDraft, snapNum]);

  const startInteraction = useCallback((type, index, handle, event) => {
    if (!editable) return;
    preventDefault(event);
    event.stopPropagation();
    const entry = editHotspots?.[index];
    if (!entry) return;
    const containerRect = wrapRef.current?.getBoundingClientRect();
    if (!containerRect) return;

    const moveListener = handleInteractionMove;
    const upListener = handleInteractionEnd;

    attachWindowListeners(moveListener, upListener);

    interactionRef.current = {
      type,
      handle,
      index,
      startClient: getEventPoint(event),
      container: { width: containerRect.width, height: containerRect.height },
      initialRect: { ...entry.rect },
      latestRect: { ...entry.rect },
      hasMoved: false,
      metaKey: entry.key,
    };
    setActiveIndex(index);
  }, [editable, editHotspots, handleInteractionEnd, handleInteractionMove, attachWindowListeners]);

  const hotspotsForRender = editable && editHotspots
    ? editHotspots.map((entry, idx) => ({
        ...entry.data,
        left: toPctString(entry.rect.left),
        top: toPctString(entry.rect.top),
        width: toPctString(entry.rect.width),
        height: toPctString(entry.rect.height),
        key: entry.data?.key ?? entry.key ?? `editable-${idx}`,
      }))
    : hotspots;

  const activeRect = editable && activeIndex != null && editHotspots?.[activeIndex]
    ? editHotspots[activeIndex].rect
    : null;

  const draftDisplay = useMemo(() => {
    if (activeRect) {
      return {
        left: toPctString(activeRect.left),
        top: toPctString(activeRect.top),
        width: toPctString(activeRect.width),
        height: toPctString(activeRect.height),
      };
    }
    if (lastDraft) {
      return lastDraft;
    }
    return null;
  }, [activeRect, lastDraft, toPctString]);

  const draftSnippet = draftDisplay
    ? `{ left: '${draftDisplay.left}', top: '${draftDisplay.top}', width: '${draftDisplay.width}', height: '${draftDisplay.height}' }`
    : '';

  return (
    <div
      ref={wrapRef}
      style={{ position: 'relative', display: 'block', width: '100%', maxWidth: '414px', margin: '0 auto', userSelect: 'none', touchAction: 'none', minHeight: fullHeight ? '100dvh' : undefined, paddingBottom: 'env(safe-area-inset-bottom)' }}
      onMouseDown={onPointerDown}
      onMouseMove={onPointerMove}
      onMouseUp={onPointerUp}
      onTouchStart={onPointerDown}
      onTouchMove={onPointerMove}
      onTouchEnd={onPointerUp}
    >
      <img
        src={src}
        alt={alt}
        draggable={false}
        onDragStart={(e) => e.preventDefault()}
        style={{ width: '100%', height: 'auto', display: 'block', border: '1px solid #eee', borderRadius: 6, userSelect: 'none' }}
      />

      {hotspotsForRender.map((h, index) => {
        const key = h.key || `${h.left}-${h.top}-${index}`;
        const overlayActive = editable;
        const editingEntry = editable ? editHotspots?.[index] : null;
        const isActive = editable && activeIndex === index;
        const overlayRect = editingEntry?.rect || {
          left: percentToNumber(h.left),
          top: percentToNumber(h.top),
          width: percentToNumber(h.width),
          height: percentToNumber(h.height),
        };

        const isClickable = typeof h.onClick === 'function';

        const overlayEl = overlayActive ? (
          <div
            key={`${key}-overlay`}
            data-ui-overlay="true"
            style={{
              position: 'absolute',
              left: h.left,
              top: h.top,
              width: h.width,
              height: h.height,
              border: editable ? `2px dashed ${isActive ? '#2d6cdf' : 'rgba(45,108,223,0.65)'}` : '1px dashed rgba(255,0,0,0.6)',
              backgroundColor: editable ? 'rgba(45,108,223,0.12)' : 'rgba(255,0,0,0.12)',
              borderRadius: 8,
              pointerEvents: editable ? 'auto' : 'none',
              cursor: editable ? 'move' : 'default',
              boxShadow: isActive ? '0 0 0 1px rgba(45,108,223,0.35)' : undefined,
            }}
            onMouseDown={(e) => startInteraction('move', index, 'move', e)}
            onTouchStart={(e) => startInteraction('move', index, 'move', e)}
            onDoubleClick={(e) => {
              if (!editable || !interactionsEnabled) return;
              e.stopPropagation();
              if (typeof h.onClick === 'function') {
                h.onClick(e);
              }
            }}
          >
            {editable && (
              <>
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: -22,
                    background: 'rgba(45,108,223,0.85)',
                    color: '#fff',
                    fontSize: 10,
                    padding: '2px 6px',
                    borderRadius: 4,
                    pointerEvents: 'none',
                    whiteSpace: 'nowrap',
                    transform: 'translateY(-4px)',
                  }}
                >
                  {`${toPctString(overlayRect.left)} · ${toPctString(overlayRect.top)} · ${toPctString(overlayRect.width)} × ${toPctString(overlayRect.height)}`}
                </div>
                {HANDLE_CONFIG.map((handle) => (
                  <span
                    key={handle.key}
                    data-ui-overlay="true"
                    style={{
                      position: 'absolute',
                      width: 12,
                      height: 12,
                      borderRadius: '50%',
                      border: '2px solid #fff',
                      background: '#2d6cdf',
                      boxShadow: '0 0 6px rgba(0,0,0,0.15)',
                      cursor: handle.cursor,
                      ...handle.style,
                    }}
                    onMouseDown={(e) => startInteraction('resize', index, handle.key, e)}
                    onTouchStart={(e) => startInteraction('resize', index, handle.key, e)}
                  />
                ))}
              </>
            )}
          </div>
        ) : null;

        if (h.kind === 'input') {
          const inputType = h.inputType || 'number';
          const isNumeric = inputType === 'number' || h.coerceNumber === true;
          const inputValue =
            h.value != null
              ? isNumeric && typeof h.value === 'number'
                ? h.value
                : String(h.value)
              : '';
          const handleChange = (event) => {
            if (!h.onChange) return;
            if (isNumeric && h.coerceNumber !== false) {
              const next = Math.max(0, Math.floor(Number(event.target.value) || 0));
              h.onChange(next);
            } else {
              h.onChange(event.target.value);
            }
          };
          const handleClick = (event) => {
            if (typeof h.onClick === 'function') {
              h.onClick(event);
            }
          };
          const baseInputStyle = {
            width: '100%',
            height: '100%',
            boxSizing: 'border-box',
            border: '2px solid #2d6cdf',
            borderRadius: 8,
            background: 'rgba(255,255,255,0.9)',
            color: '#111',
            textAlign: isNumeric ? 'center' : 'left',
            fontWeight: isNumeric ? 600 : 500,
            padding: isNumeric ? '0 0' : '0 12px',
          };
          return (
            <React.Fragment key={key}>
              <div
                data-ui-overlay="true"
                style={{ position: 'absolute', left: h.left, top: h.top, width: h.width, height: h.height, pointerEvents: (editable || !interactionsEnabled) ? 'none' : 'auto' }}
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
              >
                <input
                  type={inputType}
                  min={isNumeric ? (h.min ?? 0) : undefined}
                  step={isNumeric ? (h.step ?? 1) : undefined}
                  value={inputValue}
                  placeholder={h.placeholder || (isNumeric ? '0' : '')}
                  aria-label={h.ariaLabel || h.title || 'points'}
                  onChange={handleChange}
                  onBlur={h.onBlur}
                  onClick={handleClick}
                  readOnly={h.readOnly}
                  disabled={h.disabled}
                  inputMode={h.inputMode}
                  autoComplete={h.autoComplete}
                  style={{ ...baseInputStyle, ...(h.inputStyle || {}) }}
                />
              </div>
              {overlayEl}
            </React.Fragment>
          );
        }

        if (h.kind === 'select') {
          const options = h.options || [];
          const selectValue = h.value != null ? String(h.value) : '';
          const handleSelect = (event) => {
            h.onChange && h.onChange(event.target.value);
          };
          return (
            <React.Fragment key={key}>
              <div
                data-ui-overlay="true"
                style={{ position: 'absolute', left: h.left, top: h.top, width: h.width, height: h.height, pointerEvents: (editable || !interactionsEnabled) ? 'none' : 'auto' }}
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
              >
                <select
                  value={selectValue}
                  aria-label={h.ariaLabel || h.title || 'dropdown'}
                  onChange={handleSelect}
                  disabled={h.disabled}
                  style={{
                    width: '100%',
                    height: '100%',
                    boxSizing: 'border-box',
                    border: '2px solid #2d6cdf',
                    borderRadius: 8,
                    background: 'rgba(255,255,255,0.9)',
                    color: '#111',
                    fontWeight: 500,
                    padding: '0 12px',
                    appearance: 'none',
                    WebkitAppearance: 'none',
                  }}
                >
                  {h.placeholder && (
                    <option value="" disabled={h.requireSelection ?? true}>
                      {h.placeholder}
                    </option>
                  )}
                  {options.map((opt) => {
                    const value = typeof opt === 'string' ? opt : String(opt.value ?? opt.label ?? '');
                    const label = typeof opt === 'string' ? opt : opt.label ?? opt.value ?? '';
                    return (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    );
                  })}
                </select>
              </div>
              {overlayEl}
            </React.Fragment>
          );
        }

        return (
          <React.Fragment key={key}>
            <button
              aria-label={h.ariaLabel || h.title || 'hotspot'}
              title={h.title}
              aria-disabled={!isClickable}
              tabIndex={-1}
              onMouseDown={(e) => e.preventDefault()}
              onClick={(event) => {
                if (!interactionsEnabled || !isClickable) {
                  event.preventDefault();
                  return;
                }
                h.onClick(event);
              }}
              style={{
                position: 'absolute',
                left: h.left,
                top: h.top,
                width: h.width,
                height: h.height,
                background: 'rgba(0,0,0,0)',
                border: '2px solid transparent',
                borderRadius: 8,
                cursor: (editable || !interactionsEnabled || !isClickable) ? 'default' : 'pointer',
                pointerEvents: (editable || !interactionsEnabled || !isClickable) ? 'none' : 'auto',
                outline: 'none',
                boxShadow: 'none',
                WebkitTapHighlightColor: 'transparent',
              }}
              onFocus={(e) => e.currentTarget.blur()}
            />
            {overlayEl}
          </React.Fragment>
        );
      })}

      {editable && renderRect(drag)}
      {onBack && (
        <button
          data-ui-overlay="true"
          onClick={onBack}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            left: 8,
            top: 8,
            padding: '6px 12px',
            borderRadius: 999,
            border: '1px solid rgba(0,0,0,0.1)',
            background: '#ffffffcc',
            color: '#111',
            fontSize: 13,
            fontWeight: 600,
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          }}
        >
          {backLabel}
        </button>
      )}
      
    </div>
  );
}

