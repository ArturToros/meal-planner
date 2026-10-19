import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import type { Household, Person } from '../lib/types'
import type { Action, Toast } from '../lib/store'
import { L } from '../lib/i18n'

export interface AppCtx {
  h: Household
  me: Person
  dispatch: (a: Action) => void
  toast: (t: Toast) => void
  go: (hash: string) => void
  now: Date
}

export function useRoute(): string[] {
  const read = () => (location.hash.replace(/^#\/?/, '') || 'plan').split('/').map(decodeURIComponent)
  const [route, setRoute] = useState(read)
  useEffect(() => {
    const fn = () => {
      setRoute(read())
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', fn)
    return () => window.removeEventListener('hashchange', fn)
  }, [])
  return route
}

export function go(hash: string) {
  location.hash = hash.startsWith('#') ? hash : '#/' + hash
}

export function back(fallback = 'plan') {
  if (history.length > 1) history.back()
  else go(fallback)
}

export function Nav({ tab }: { tab: string }) {
  const tabs: [string, string][] = [
    ['plan', L('Plan', 'План')],
    ['recipes', L('Recipes', 'Рецепти')],
    ['list', L('List', 'Списък')],
    ['money', L('Money', 'Разходи')],
  ]
  return (
    <nav className="nav" aria-label={L('Main', 'Основно меню')}>
      <div className="nav-inner">
        {tabs.map(([id, label]) => (
          <a key={id} href={'#/' + id} className={tab === id ? 'on' : ''} aria-current={tab === id ? 'page' : undefined}>
            {label}
          </a>
        ))}
      </div>
    </nav>
  )
}

export function Back({ label = L('Back', 'Назад'), fallback }: { label?: string; fallback?: string }) {
  return (
    <div className="top">
      <button className="link" onClick={() => back(fallback)}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" aria-hidden="true">
          <path d="M15 5l-7 7 7 7" />
        </svg>
        {label}
      </button>
    </div>
  )
}

export function Chevron() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M9 5l7 7-7 7" />
    </svg>
  )
}

export function Icon({ name, size = 20 }: { name: 'camera' | 'doc' | 'plus' | 'gear' | 'link' | 'x'; size?: number }) {
  const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'square' as const, 'aria-hidden': true }
  if (name === 'camera')
    return (
      <svg {...p}>
        <rect x="2" y="6" width="20" height="15" />
        <circle cx="12" cy="13.5" r="4" />
        <path d="M8 6l2-3h4l2 3" />
      </svg>
    )
  if (name === 'doc')
    return (
      <svg {...p}>
        <rect x="5" y="2" width="14" height="20" />
        <path d="M9 7h6M9 11h6M9 15h4" />
      </svg>
    )
  if (name === 'plus')
    return (
      <svg {...p} strokeWidth={2.6}>
        <path d="M12 4v16M4 12h16" />
      </svg>
    )
  if (name === 'x')
    return (
      <svg {...p}>
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    )
  if (name === 'link')
    return (
      <svg {...p}>
        <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
        <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
      </svg>
    )
  return (
    <svg {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" />
    </svg>
  )
}

export function Stepper({ value, onChange, min = 0, max = 30, label }: { value: number; onChange: (n: number) => void; min?: number; max?: number; label: string }) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" aria-label={L(`Fewer ${label}`, `По-малко ${label}`)} onClick={() => onChange(Math.max(min, value - 1))}>
        −
      </button>
      <span aria-live="polite">{value}</span>
      <button type="button" aria-label={L(`More ${label}`, `Повече ${label}`)} onClick={() => onChange(Math.min(max, value + 1))}>
        +
      </button>
    </div>
  )
}

export function Sheet({ children, onClose, label }: { children: ReactNode; onClose: () => void; label: string }) {
  useEffect(() => {
    const fn = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onClose])
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={label} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}

export function PhotoInput({ onFiles, multiple, children, className, camera, style }: { onFiles: (f: File[]) => void; multiple?: boolean; children: ReactNode; className?: string; camera?: boolean; style?: CSSProperties }) {
  return (
    <label className={className} style={{ cursor: 'pointer', ...style }}>
      {children}
      <input
        type="file"
        accept="image/*"
        className="sr"
        multiple={multiple}
        capture={camera ? 'environment' : undefined}
        onChange={(e) => {
          const files = [...(e.target.files ?? [])]
          e.target.value = ''
          if (files.length) onFiles(files)
        }}
      />
    </label>
  )
}

export function eur(n: number): string {
  return '€' + (Math.round(n * 100) / 100).toFixed(n % 1 === 0 ? 0 : 2)
}

export function letters(p: Person[]): string {
  return p.join(' ')
}
