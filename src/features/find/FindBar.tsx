import { useEffect, useRef } from 'react'

type FindBarProps = {
  query: string
  current: number
  total: number
  disabled?: boolean
  onQueryChange: (q: string) => void
  onNext: () => void
  onPrev: () => void
  onClose: () => void
}

export function FindBar({
  query,
  current,
  total,
  disabled = false,
  onQueryChange,
  onNext,
  onPrev,
  onClose,
}: FindBarProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
    } else if (event.key === 'Enter' || event.key === 'F3') {
      event.preventDefault()
      if (event.shiftKey) {
        onPrev()
      } else {
        onNext()
      }
    }
  }

  const counterText =
    total === 0 && query ? 'No results' : total > 0 ? `${current + 1} of ${total}` : ''

  return (
    <div className="find-bar" role="search" aria-label="Find in document">
      <input
        ref={inputRef}
        className="find-bar__input"
        type="text"
        placeholder="Find…"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={handleKeyDown}
        aria-label="Search text"
        spellCheck={false}
      />
      {counterText && (
        <span className={`find-bar__counter ${total === 0 ? 'find-bar__counter--empty' : ''}`}>
          {counterText}
        </span>
      )}
      {disabled && (
        <span className="find-bar__note">Switch to Text or Display mode to navigate</span>
      )}
      <div className="find-bar__actions">
        <button
          type="button"
          className="find-bar__btn"
          title="Previous match (Shift+Enter)"
          onClick={onPrev}
          disabled={disabled || total === 0}
          aria-label="Previous match"
        >
          ↑
        </button>
        <button
          type="button"
          className="find-bar__btn"
          title="Next match (Enter)"
          onClick={onNext}
          disabled={disabled || total === 0}
          aria-label="Next match"
        >
          ↓
        </button>
        <button
          type="button"
          className="find-bar__btn find-bar__btn--close"
          title="Close (Escape)"
          onClick={onClose}
          aria-label="Close find bar"
        >
          ×
        </button>
      </div>
    </div>
  )
}
