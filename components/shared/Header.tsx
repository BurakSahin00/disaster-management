import { ReactNode } from 'react'
import { Logo } from './Logo'

interface HeaderProps {
  center?: ReactNode
  right?: ReactNode
}

export function Header({ center, right }: HeaderProps) {
  return (
    <header className="h-[52px] flex items-center justify-between px-5 bg-white border-b border-border shrink-0 gap-4">
      <div className="flex items-center gap-4">
        <Logo />
        {center && (
          <>
            <div className="w-px h-[22px] bg-border" />
            {center}
          </>
        )}
      </div>
      {right && <div className="flex items-center gap-2">{right}</div>}
    </header>
  )
}
