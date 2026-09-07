'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'
import { Moon, Sun } from 'lucide-react'
import { newAdminThemeCookie, type NewAdminTheme } from '@/lib/new-admin/theme'
import { Button } from './ui'
import styles from './new-admin.module.css'

const ThemeContext = createContext<{ theme: NewAdminTheme; toggleTheme: () => void } | null>(null)

export function NewAdminThemeProvider({ initialTheme, children }: { initialTheme: NewAdminTheme; children: ReactNode }) {
  const [theme, setTheme] = useState(initialTheme)

  function toggleTheme() {
    const next = theme === 'light' ? 'dark' : 'light'
    setTheme(next)
    try {
      // Appearance only: host-local and scoped to the preview, never an auth cookie.
      document.cookie = newAdminThemeCookie(next, window.location.protocol === 'https:')
    } catch {
      // The switch remains usable for this visit when browser storage is blocked.
    }
  }

  return <ThemeContext.Provider value={{ theme, toggleTheme }}><div className={styles.theme} data-theme={theme}>{children}</div></ThemeContext.Provider>
}

export function useNewAdminTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('New admin theme provider is missing')
  return context
}

export function ThemeToggle() {
  const { theme, toggleTheme } = useNewAdminTheme()
  const label = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
  const Icon = theme === 'dark' ? Sun : Moon
  return <Button type="button" className={styles.themeToggle} aria-label={label} title={label} aria-pressed={theme === 'dark'} onClick={toggleTheme}><Icon size={18} aria-hidden="true" /></Button>
}
