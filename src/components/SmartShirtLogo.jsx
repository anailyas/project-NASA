export default function SmartShirtLogo({ size = 26, className = '' }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      height={size}
      viewBox="0 0 48 48"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M16 7h5c.7 3.2 3.2 5.5 6.5 5.5S33.3 10.2 34 7h5l5 4 3 12-7 3-3-6v21H11V20l-3 6-7-3 3-12 5-4h7Z"
        fill="rgba(97, 217, 238, .05)"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <path
        d="M12 29h8l2.5-5 5 11 4.5-8H39"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <circle cx="28" cy="35" r="1.5" fill="currentColor" />
    </svg>
  );
}
