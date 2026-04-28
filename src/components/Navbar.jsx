import { useState } from 'react'

const SearchIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
  </svg>
)

const CartIcon = () => (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="8" cy="21" r="1" /><circle cx="19" cy="21" r="1" />
    <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
  </svg>
)

const UserIcon = () => (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
  </svg>
)

const MapPinIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" />
  </svg>
)

const ChevronDown = ({ open }) => (
  <svg
    width="13" height="13" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
    style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}
  >
    <path d="m6 9 6 6 6-6" />
  </svg>
)

const BRANCHES = ['León', 'San Luis Potosí', 'Aguascalientes', 'Torreón']

export default function Navbar() {
  const [branch, setBranch] = useState('León')
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const cartCount = 3

  return (
    <nav
      className="sticky top-0 z-50"
      style={{ backgroundColor: '#ffffff', borderBottom: '1px solid rgba(0,0,0,0.08)' }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3 sm:gap-5">

        {/* Logo */}
        <a href="#" style={{ textDecoration: 'none', flexShrink: 0 }}>
          <span
            className="text-2xl font-black tracking-tight select-none"
            style={{
              background: 'linear-gradient(135deg, #00BCF2 0%, #8DC63F 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            iStuffs
          </span>
        </a>

        {/* Branch selector */}
        <div className="relative" style={{ flexShrink: 0 }}>
          <button
            onClick={() => setOpen(v => !v)}
            className="flex items-center gap-1.5 text-sm font-medium transition-colors"
            style={{ color: 'rgba(0,0,0,0.5)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#0A0A0A')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(0,0,0,0.5)')}
          >
            <span style={{ color: '#00BCF2' }}><MapPinIcon /></span>
            <span className="hidden sm:block">{branch}</span>
            <ChevronDown open={open} />
          </button>

          {open && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
              <div
                className="absolute top-full left-0 mt-2 z-50 overflow-hidden shadow-xl"
                style={{
                  backgroundColor: '#ffffff',
                  border: '1px solid rgba(0,0,0,0.1)',
                  borderRadius: '18px',
                  minWidth: '190px',
                }}
              >
                {BRANCHES.map(b => (
                  <button
                    key={b}
                    onClick={() => { setBranch(b); setOpen(false) }}
                    className="flex items-center gap-2.5 w-full px-4 py-3 text-sm text-left transition-colors"
                    style={{
                      color: b === branch ? '#00BCF2' : 'rgba(0,0,0,0.65)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.04)')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <span
                      style={{
                        width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                        backgroundColor: b === branch ? '#00BCF2' : 'rgba(0,0,0,0.2)',
                      }}
                    />
                    <span className={b === branch ? 'font-semibold' : ''}>{b}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Search */}
        <div className="flex-1 relative">
          <span
            className="absolute left-4 top-1/2 pointer-events-none"
            style={{ color: 'rgba(0,0,0,0.3)', transform: 'translateY(-50%)' }}
          >
            <SearchIcon />
          </span>
          <input
            type="text"
            placeholder="Buscar fundas, accesorios, modelos..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="w-full text-sm outline-none transition-all"
            style={{
              backgroundColor: 'rgba(0,0,0,0.04)',
              border: '1px solid rgba(0,0,0,0.09)',
              borderRadius: '999px',
              padding: '10px 18px 10px 38px',
              color: '#0A0A0A',
            }}
            onFocus={e => {
              e.target.style.borderColor = 'rgba(0,188,242,0.5)'
              e.target.style.backgroundColor = 'rgba(0,188,242,0.03)'
            }}
            onBlur={e => {
              e.target.style.borderColor = 'rgba(0,0,0,0.09)'
              e.target.style.backgroundColor = 'rgba(0,0,0,0.04)'
            }}
          />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1" style={{ flexShrink: 0 }}>
          <button
            className="relative p-2.5 rounded-full transition-colors"
            style={{ color: 'rgba(0,0,0,0.55)', background: 'none', border: 'none', cursor: 'pointer' }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.06)'; e.currentTarget.style.color = '#0A0A0A' }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'rgba(0,0,0,0.55)' }}
          >
            <CartIcon />
            <span
              className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full text-white flex items-center justify-center font-bold"
              style={{ fontSize: 9, background: 'linear-gradient(135deg, #D51A7A, #FF6B1A)' }}
            >
              {cartCount}
            </span>
          </button>
          <button
            className="p-2.5 rounded-full transition-colors"
            style={{ color: 'rgba(0,0,0,0.55)', background: 'none', border: 'none', cursor: 'pointer' }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.06)'; e.currentTarget.style.color = '#0A0A0A' }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'rgba(0,0,0,0.55)' }}
          >
            <UserIcon />
          </button>
        </div>
      </div>
    </nav>
  )
}
