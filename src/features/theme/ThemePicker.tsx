import { useEffect } from 'react'
import { themes, type Theme, type ThemeId } from './themes'

type ThemePickerProps = {
  open: boolean
  currentThemeId: ThemeId
  onSelect: (id: ThemeId) => void
  onClose: () => void
}

export function ThemePicker({ open, currentThemeId, onSelect, onClose }: ThemePickerProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="ai-modal theme-picker-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Choose theme"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="ai-modal__panel theme-picker-panel">
        <div className="theme-picker__header">
          <h2 className="theme-picker__title">Theme</h2>
          <button
            type="button"
            className="theme-picker__close"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="theme-picker__grid">
          {themes.map((theme) => (
            <ThemeCard
              key={theme.id}
              theme={theme}
              active={theme.id === currentThemeId}
              onSelect={onSelect}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function ThemeCard({
  theme,
  active,
  onSelect,
}: {
  theme: Theme
  active: boolean
  onSelect: (id: ThemeId) => void
}) {
  const { barBg, bodyBg, ink, accent } = theme.swatch

  return (
    <button
      type="button"
      className={`theme-card ${active ? 'theme-card--active' : ''}`}
      onClick={() => onSelect(theme.id)}
      aria-pressed={active}
      title={theme.label}
    >
      <div className="theme-card__preview">
        {/* Bar strip */}
        <div className="theme-card__bar" style={{ background: barBg }}>
          <span className="theme-card__bar-dots">
            <span style={{ background: accent }} />
            <span style={{ background: accent, opacity: 0.6 }} />
            <span style={{ background: accent, opacity: 0.35 }} />
          </span>
        </div>
        {/* Body area */}
        <div className="theme-card__body" style={{ background: bodyBg }}>
          <span className="theme-card__line theme-card__line--h1" style={{ background: ink }} />
          <span className="theme-card__line" style={{ background: ink, opacity: 0.45 }} />
          <span className="theme-card__line theme-card__line--short" style={{ background: ink, opacity: 0.3 }} />
          <span className="theme-card__accent-dot" style={{ background: accent }} />
        </div>
      </div>
      <span className="theme-card__label" style={{ color: active ? 'var(--accent)' : 'var(--ink-soft)' }}>
        {theme.label}
      </span>
      {active && (
        <span className="theme-card__check" aria-hidden="true">✓</span>
      )}
    </button>
  )
}
