const FALLBACK_EVIDENCE_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <rect width="1280" height="720" fill="#0B1320"/>
  <path d="M0 520h1280M240 0v720M640 0v720M1040 0v720" stroke="#164E63" stroke-width="2" opacity=".7"/>
  <circle cx="640" cy="330" r="110" fill="none" stroke="#38BDF8" stroke-width="4" opacity=".75"/>
  <path d="M640 210v240M520 330h240" stroke="#38BDF8" stroke-width="3" opacity=".75"/>
  <text x="640" y="590" fill="#BAE6FD" font-family="monospace" font-size="26" text-anchor="middle">BORDERLENS // EVIDENCE FRAME</text>
</svg>`;

export const FALLBACK_EVIDENCE_URL = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(FALLBACK_EVIDENCE_SVG)}`;

export const evidenceSource = (value?: string | null) => value || FALLBACK_EVIDENCE_URL;
