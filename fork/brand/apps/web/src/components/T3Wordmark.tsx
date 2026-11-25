import type { SVGProps } from "react";

// Maeve fork: the orb's circle mark replaces T3's wordmark in branded builds.
export function T3Wordmark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
      <title>Maeve</title>
      <circle cx="30" cy="30" r="26" fill="currentColor" />
    </svg>
  );
}
