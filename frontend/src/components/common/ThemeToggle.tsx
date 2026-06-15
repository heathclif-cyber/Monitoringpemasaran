import { Moon, Sun } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { Button } from '@/components/ui/button'

export function ThemeToggle() {
  const theme = useAppStore((s) => s.theme)
  const toggleTheme = useAppStore((s) => s.toggleTheme)
  const isDark = theme === 'dark'

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8 text-muted-foreground hover:text-foreground"
      onClick={toggleTheme}
      title={isDark ? 'Mode terang' : 'Mode gelap'}
      aria-label={isDark ? 'Aktifkan mode terang' : 'Aktifkan mode gelap'}
    >
      {isDark ? <Sun size={16} /> : <Moon size={16} />}
    </Button>
  )
}