import * as React from 'react';
import { cn } from '@/lib/utils';

interface BrandLogoProps {
  className?: string;
  size?: number;
}

export function BrandLogo({ className, size = 36 }: BrandLogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 128 128"
      width={size}
      height={size}
      fill="none"
      aria-hidden="true"
      className={cn('shrink-0 rounded-[24%] shadow-soft', className)}
    >
      <defs>
        <linearGradient id="ws-logo-bg" x1="12" y1="8" x2="116" y2="120" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#4F46E5" />
          <stop offset="55%" stopColor="#2563EB" />
          <stop offset="100%" stopColor="#0EA5E9" />
        </linearGradient>
        <linearGradient id="ws-logo-card" x1="28" y1="34" x2="100" y2="104" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.98" />
          <stop offset="100%" stopColor="#EFF6FF" stopOpacity="0.92" />
        </linearGradient>
      </defs>
      <rect width="128" height="128" rx="30" fill="url(#ws-logo-bg)" />
      <rect x="4" y="4" width="120" height="120" rx="27" stroke="#FFFFFF" strokeOpacity="0.18" strokeWidth="2" />
      <rect x="24" y="34" width="80" height="70" rx="16" fill="url(#ws-logo-card)" />
      <path d="M24 50C24 41.1634 31.1634 34 40 34H88C96.8366 34 104 41.1634 104 50V55H24V50Z" fill="#DBEAFE" />
      <rect x="41" y="22" width="10" height="22" rx="5" fill="#FFFFFF" />
      <rect x="77" y="22" width="10" height="22" rx="5" fill="#FFFFFF" />
      <path d="M39 76L49 87L64 69L76 82L89 67" stroke="#2563EB" strokeWidth="7.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="89" cy="67" r="4.5" fill="#0EA5E9" />
    </svg>
  );
}
