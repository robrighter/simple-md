import { useCallback, useState } from 'react'
import { themes, defaultThemeId, THEME_STORAGE_KEY, type ThemeId } from './themes'

function applyThemeToDom(id: ThemeId) {
  const theme = themes.find((t) => t.id === id) ?? themes[0]
  const root = document.documentElement
  for (const [key, value] of Object.entries(theme.vars)) {
    if (key === 'color-scheme') {
      root.style.setProperty('color-scheme', value)
    } else {
      root.style.setProperty(key, value)
    }
  }
}

// Apply the stored theme before the first React render to avoid a flash
applyThemeToDom(
  ((localStorage.getItem(THEME_STORAGE_KEY) as ThemeId | null) ?? defaultThemeId),
)

export function useTheme() {
  const [themeId, setThemeIdState] = useState<ThemeId>(
    () => (localStorage.getItem(THEME_STORAGE_KEY) as ThemeId | null) ?? defaultThemeId,
  )

  const setThemeId = useCallback((id: ThemeId) => {
    localStorage.setItem(THEME_STORAGE_KEY, id)
    applyThemeToDom(id)
    setThemeIdState(id)
  }, [])

  return { themeId, setThemeId }
}
