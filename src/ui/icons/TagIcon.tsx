import type { IconProps } from './IconProps';

export function TagIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...props}>
      <path
        d="M4 12V5h7l8.5 8.5a2.1 2.1 0 0 1 0 3l-3 3a2.1 2.1 0 0 1-3 0L4 12Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <circle
        cx="8.5"
        cy="8.5"
        r="1"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}
