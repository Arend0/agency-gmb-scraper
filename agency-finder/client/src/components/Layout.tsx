import { Link, NavLink, Outlet } from 'react-router-dom'

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  [
    'rounded-md px-3 py-2 text-sm font-medium transition-colors',
    isActive
      ? 'bg-[#FFC107]/15 text-gray-900 ring-1 ring-[#FFC107]/40'
      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
  ].join(' ')

export function Layout() {
  return (
    <div className="flex min-h-screen flex-col bg-white text-gray-900">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-6 px-4 sm:px-6">
          <Link
            to="/"
            className="flex items-center gap-2 text-base font-semibold tracking-tight text-gray-900"
          >
            <span
              className="size-2 shrink-0 rounded-sm bg-[#FFC107]"
              aria-hidden
            />
            Agency Finder
          </Link>
          <nav className="flex items-center gap-1" aria-label="Main">
            <NavLink to="/" className={navLinkClass} end>
              Search
            </NavLink>
            <NavLink to="/leads" className={navLinkClass}>
              Leads
            </NavLink>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        <Outlet />
      </main>
    </div>
  )
}
