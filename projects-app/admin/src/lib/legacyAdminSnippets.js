

// legacyAdminSnippets.js
// Extracted from old admin screens (09–14)
// Provides shared constants and grid coordinate helpers for Draws, Figures, and Group A–D layouts.

export const BOARD_GROUPS = ['A', 'B', 'C', 'D'];

// Raw grid coordinates (percent-based) from legacy layout
export const FIGURE_GRID_COORDS = (() => {
  const rows = [
    { top: 29.93, width: 11.83, height: 3.43, start: 10.45, spacing: 12.41 },
    { top: 35.63, width: 11.83, height: 3.43, start: 10.45, spacing: 12.41 },
    { top: 41.28, width: 11.83, height: 3.43, start: 10.45, spacing: 12.41 },
    { top: 46.98, width: 11.83, height: 3.43, start: 10.45, spacing: 12.41 },
  ];
  const coords = [];
  for (let r = 0; r < rows.length; r++) {
    const { top, width, height, start, spacing } = rows[r];
    for (let i = 0; i < 9; i++) {
      coords.push({ left: start + i * spacing, top, width, height });
    }
  }
  return coords; // 36 cells
})();

// Helper: convert a percent-based rect to pixel rect given a container size
export function pctRectToPx(rectPct, containerWidth, containerHeight) {
  const { left, top, width, height } = rectPct;
  return {
    left: Math.round((left / 100) * containerWidth),
    top: Math.round((top / 100) * containerHeight),
    width: Math.round((width / 100) * containerWidth),
    height: Math.round((height / 100) * containerHeight),
  };
}

// --- Normalization helpers to fit legacy coords into a 0..100% frame ---
// Bounds of the legacy grid frame in the original design space
export const FIGURE_GRID_BOUNDS = {
  left: 10.45,
  width: 111.11, // computed design-space width
  top: 29.93,
  height: 20.48, // (lastTop+height) - top = (46.98+3.43) - 29.93
};

// Coords normalized to a neat 0..100% frame
export const FIGURE_GRID_NORMALIZED = FIGURE_GRID_COORDS.map(r => ({
  left: ((r.left - FIGURE_GRID_BOUNDS.left) / FIGURE_GRID_BOUNDS.width) * 100,
  top: ((r.top - FIGURE_GRID_BOUNDS.top) / FIGURE_GRID_BOUNDS.height) * 100,
  width: (r.width / FIGURE_GRID_BOUNDS.width) * 100,
  height: (r.height / FIGURE_GRID_BOUNDS.height) * 100,
}));

// Aspect ratio (% padding-top) to keep the normalized grid snug
export const FIGURE_GRID_ASPECT = (FIGURE_GRID_BOUNDS.height / FIGURE_GRID_BOUNDS.width) * 100; // ~18.43%