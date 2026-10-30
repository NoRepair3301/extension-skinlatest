import { S } from "../ui/strings.ts";
import { useRef } from "preact/hooks";

// The Skinly AI logo (assets/skinly-logo.svg) inlined; gradient and clip ids are unique per instance.
let instances = 0;

export function Logo({ size = 24 }: { size?: number }) {
  const ref = useRef(0);
  if (ref.current === 0) ref.current = ++instances;
  const p = `skl${ref.current}`;
  const u = (name: string) => `url(#${p}-${name})`;
  return (
    <svg class="logo" viewBox="0 0 128 128" width={size} height={size} role="img" aria-label={S.app.name}>
      <defs>
        <linearGradient id={`${p}-bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#1a1445" />
          <stop offset="1" stop-color="#3d2377" />
        </linearGradient>
        <radialGradient id={`${p}-glow`} cx="70" cy="58" r="60" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="#c58bff" stop-opacity=".5" />
          <stop offset="1" stop-color="#c58bff" stop-opacity="0" />
        </radialGradient>
        <linearGradient id={`${p}-head`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#ffffff" />
          <stop offset=".6" stop-color="#f1e8ff" />
          <stop offset="1" stop-color="#cdb9ff" />
        </linearGradient>
        <linearGradient id={`${p}-horn`} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stop-color="#ffb4e2" />
          <stop offset=".5" stop-color="#d7b6ff" />
          <stop offset="1" stop-color="#8ef5ea" />
        </linearGradient>
        <linearGradient id={`${p}-m1`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#ff7ac6" />
          <stop offset="1" stop-color="#8f7bff" />
        </linearGradient>
        <linearGradient id={`${p}-m2`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#7ef0f0" />
          <stop offset="1" stop-color="#9f86ff" />
        </linearGradient>
        <linearGradient id={`${p}-m3`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#ffd2a1" />
          <stop offset="1" stop-color="#ff8fcf" />
        </linearGradient>
        <radialGradient id={`${p}-spark`} cx="86" cy="12" r="14" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="#fff" stop-opacity=".9" />
          <stop offset="1" stop-color="#fff" stop-opacity="0" />
        </radialGradient>
        <clipPath id={`${p}-card`}>
          <rect width="128" height="128" rx="30" />
        </clipPath>
        <clipPath id={`${p}-hornclip`}>
          <path d="M63 43L86 12L73 48Z" />
        </clipPath>
      </defs>
      <rect width="128" height="128" rx="30" fill={u("bg")} />
      <rect width="128" height="128" rx="30" fill={u("glow")} />
      <g clip-path={u("card")}>
        <path d="M60 36C36 30 18 52 26 78C30 92 22 106 12 122" fill="none" stroke={u("m3")} stroke-width="7" stroke-linecap="round" opacity=".9" />
        <path d="M58 40C34 40 22 62 31 84C35 95 31 108 24 122" fill="none" stroke={u("m2")} stroke-width="9" stroke-linecap="round" />
        <path d="M62 44C42 48 36 68 44 88C47 97 45 108 41 120" fill="none" stroke={u("m1")} stroke-width="10" stroke-linecap="round" />
        <path d="M51 42L56 25L66 41Z" fill={u("head")} />
        <path d="M55 39L57 31L61 39Z" fill="#ffc2e6" />
        <path d="M56 41C68 42 78 56 89 71C95 79 91 88 83 88C77 88 73 88 70 92C66 98 67 112 66 132L45 132C43 90 46 54 56 41Z" fill={u("head")} />
        <path d="M63 43L86 12L73 48Z" fill={u("horn")} />
        <g clip-path={u("hornclip")} stroke="#fff" stroke-opacity=".6" stroke-width="2.6" stroke-linecap="round" fill="none">
          <path d="M62 44L77 49" />
          <path d="M66 38L81 42" />
          <path d="M70 32L83 35" />
          <path d="M75 25L85 27" />
        </g>
        <path d="M67 60L65.5 57.5M72 59.6L71.6 56.6M77 60.4L78.2 57.7" stroke="#3a2a6a" stroke-width="1.8" stroke-linecap="round" />
        <path d="M68 62Q73 67 79 62" fill="none" stroke="#3a2a6a" stroke-width="2.6" stroke-linecap="round" />
        <ellipse cx="73" cy="73" rx="5" ry="3.2" fill="#ffb3d9" opacity=".75" />
        <circle cx="87" cy="77" r="1.6" fill="#9a7fcf" />
        <path d="M78 85Q82 87 85 84" fill="none" stroke="#9a7fcf" stroke-width="1.8" stroke-linecap="round" />
      </g>
      <circle cx="86" cy="12" r="14" fill={u("spark")} />
      <path d="M86 2L88.4 9.6L96 12L88.4 14.4L86 22L83.6 14.4L76 12L83.6 9.6Z" fill="#fff" />
      <path d="M104 40L105.6 44.4L110 46L105.6 47.6L104 52L102.4 47.6L98 46L102.4 44.4Z" fill="#ffd6f0" />
      <path d="M22 28L23.3 31.7L27 33L23.3 34.3L22 38L20.7 34.3L17 33L20.7 31.7Z" fill="#c9f7ff" />
      <circle cx="108" cy="82" r="2" fill="#fff" opacity=".8" />
      <circle cx="14" cy="60" r="1.6" fill="#fff" opacity=".7" />
    </svg>
  );
}
