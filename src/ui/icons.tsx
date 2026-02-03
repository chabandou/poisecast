import type { CSSProperties } from 'react'

type IconProps = {
  size?: number
  className?: string
  style?: CSSProperties
  title?: string
}

function Svg({ size = 24, className, style, title, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      role={title ? 'img' : 'presentation'}
      aria-label={title}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  )
}

export function IconPlay(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9 7l8 5-8 5V7z" fill="currentColor" stroke="none" />
    </Svg>
  )
}

export function IconPause(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="7" y="6.5" width="3.2" height="11" rx="1" fill="currentColor" stroke="none" />
      <rect x="13.8" y="6.5" width="3.2" height="11" rx="1" fill="currentColor" stroke="none" />
    </Svg>
  )
}

export function IconPrev(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M7 6v12" />
      <path d="M17 7l-7 5 7 5V7z" fill="currentColor" stroke="none" />
    </Svg>
  )
}

export function IconNext(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M17 6v12" />
      <path d="M7 7l7 5-7 5V7z" fill="currentColor" stroke="none" />
    </Svg>
  )
}

export function IconRss(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 19a1.5 1.5 0 1 0 0.01 0" />
      <path d="M5 11a8 8 0 0 1 8 8" />
      <path d="M5 5a14 14 0 0 1 14 14" />
    </Svg>
  )
}

export function IconWave(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 8v8" />
      <path d="M10 5v14" />
      <path d="M14 7v10" />
      <path d="M18 9v6" />
    </Svg>
  )
}

export function IconList(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M8 6h13" />
      <path d="M8 12h13" />
      <path d="M8 18h13" />
      <path d="M3 6h.01" />
      <path d="M3 12h.01" />
      <path d="M3 18h.01" />
    </Svg>
  )
}

export function IconSearch(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="11" cy="11" r="6" />
      <path d="M20 20l-3.2-3.2" />
    </Svg>
  )
}

export function IconUpload(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3v12" />
      <path d="M8 7l4-4 4 4" />
      <path d="M4 21h16" />
    </Svg>
  )
}

