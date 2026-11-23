export default function PortalLoader({ label = "Cargando" }: { label?: string }) {
  return (
    <div className="portal-loader">
      <svg viewBox="0 0 100 100" className="portal-loader-mark" role="presentation">
        <defs>
          <linearGradient id="portal-loader-grad" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor="var(--color-primary-deep)" />
            <stop offset="1" stopColor="var(--color-primary-hover)" />
          </linearGradient>
        </defs>
        <g
          className="portal-loader-arms"
          stroke="url(#portal-loader-grad)"
          strokeWidth="10"
          strokeLinecap="round"
          fill="none"
        >
          <path d="M50,50 L50.5,25" transform="rotate(0 50 50)" />
<circle cx="50" cy="22" r="6" transform="rotate(0 50 50)" />
          <path d="M50,50 L50.5,25" transform="rotate(120 50 50)" />
<circle cx="50" cy="22" r="6" transform="rotate(120 50 50)" />
          <path d="M50,50 L50.5,25" transform="rotate(240 50 50)" />
<circle cx="50" cy="22" r="6" transform="rotate(240 50 50)" />
        </g>
        <circle className="portal-loader-core" cx="50" cy="50" r="13" fill="#fff3e6" />
      </svg>
      <span className="portal-loader-label">{label}</span>
    </div>
  );
}
