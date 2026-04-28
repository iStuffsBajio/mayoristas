import { useState } from 'react'

const HeartIcon = ({ filled }) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
  </svg>
)

const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
)

const PlusIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  </svg>
)

export default function ProductCard({ product }) {
  const [liked, setLiked] = useState(false)
  const [added, setAdded] = useState(false)

  const handleAdd = () => {
    setAdded(true)
    setTimeout(() => setAdded(false), 1600)
  }

  const discount = product.originalPrice
    ? Math.round((1 - product.price / product.originalPrice) * 100)
    : null

  const isLowStock = product.stock <= 10

  return (
    <div
      className="relative flex flex-col overflow-hidden"
      style={{
        backgroundColor: '#ffffff',
        border: '1px solid rgba(0,0,0,0.08)',
        borderRadius: '32px',
        transition: 'border-color 0.25s ease, transform 0.25s ease, box-shadow 0.25s ease',
        boxShadow: '0 2px 12px rgba(0,0,0,0.05)',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = 'rgba(0,0,0,0.14)'
        e.currentTarget.style.transform = 'translateY(-3px)'
        e.currentTarget.style.boxShadow = '0 16px 44px rgba(0,0,0,0.1)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'rgba(0,0,0,0.08)'
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.05)'
      }}
    >
      {/* Gradient image area */}
      <div
        className="relative h-52 flex items-center justify-center overflow-hidden"
        style={{ background: product.gradient, borderRadius: '32px 32px 0 0' }}
      >
        {/* Phone case silhouette */}
        <div
          style={{
            width: 88,
            height: 160,
            backgroundColor: 'rgba(0,0,0,0.22)',
            borderRadius: '22px',
            border: '2px solid rgba(255,255,255,0.25)',
            backdropFilter: 'blur(12px)',
            position: 'relative',
          }}
        >
          <div style={{ position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', width: 34, height: 6, backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: '999px' }} />
          <div style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', width: 30, height: 30, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.2)' }} />
        </div>

        {/* Badge */}
        {product.badge && (
          <div
            className="absolute top-4 left-4 text-xs font-bold px-3 py-1.5 text-white"
            style={{
              background: product.badgeType === 'action'
                ? 'linear-gradient(135deg, #D51A7A, #FF6B1A)'
                : 'linear-gradient(135deg, #00BCF2, #8DC63F)',
              borderRadius: '999px',
            }}
          >
            {product.badge}
          </div>
        )}

        {/* Like button */}
        <button
          onClick={() => setLiked(v => !v)}
          className="absolute top-4 right-4 p-2 transition-all"
          style={{
            backgroundColor: 'rgba(255,255,255,0.85)',
            borderRadius: '999px',
            border: 'none',
            cursor: 'pointer',
            color: liked ? '#D51A7A' : 'rgba(0,0,0,0.45)',
            backdropFilter: 'blur(8px)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
          }}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.95)')}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.85)')}
        >
          <HeartIcon filled={liked} />
        </button>

        {/* Low stock alert */}
        {isLowStock && (
          <div
            className="absolute bottom-3 text-xs font-semibold px-3 py-1"
            style={{
              left: '50%', transform: 'translateX(-50%)',
              backgroundColor: 'rgba(255,255,255,0.9)',
              color: '#D51A7A',
              borderRadius: '999px',
              border: '1px solid rgba(213,26,122,0.2)',
              backdropFilter: 'blur(8px)',
              whiteSpace: 'nowrap',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            }}
          >
            ⚡ Solo {product.stock} disponibles
          </div>
        )}
      </div>

      {/* Card content */}
      <div className="flex flex-col flex-1 p-5 gap-3">
        {/* Meta row */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium" style={{ color: 'rgba(0,0,0,0.4)' }}>
            {product.category}
          </span>
          <span className="text-xs font-semibold" style={{ color: '#00BCF2' }}>
            {product.model}
          </span>
        </div>

        {/* Name */}
        <h3 className="text-lg font-bold leading-tight" style={{ color: '#0A0A0A' }}>
          {product.name}
        </h3>

        {/* Color swatches */}
        <div className="flex items-center gap-2">
          {product.colors.map((color, i) => (
            <div
              key={i}
              style={{
                width: 14, height: 14, borderRadius: '50%',
                backgroundColor: color,
                border: '2px solid rgba(0,0,0,0.12)',
                cursor: 'pointer',
                transition: 'transform 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.35)')}
              onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
            />
          ))}
        </div>

        {/* Price + Button */}
        <div className="flex items-end justify-between mt-auto pt-1">
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-black" style={{ color: '#0A0A0A' }}>
                ${product.price.toLocaleString()}
              </span>
              {discount && (
                <span
                  className="text-xs font-bold px-2 py-0.5 text-white"
                  style={{ background: 'linear-gradient(135deg, #D51A7A, #FF6B1A)', borderRadius: '999px' }}
                >
                  -{discount}%
                </span>
              )}
            </div>
            {product.originalPrice && (
              <div className="text-xs line-through" style={{ color: 'rgba(0,0,0,0.32)' }}>
                ${product.originalPrice.toLocaleString()}
              </div>
            )}
          </div>

          <button
            onClick={handleAdd}
            className="flex items-center gap-2 text-sm font-semibold text-white transition-all"
            style={{
              background: added
                ? 'linear-gradient(135deg, #16a34a, #15803d)'
                : 'linear-gradient(135deg, #D51A7A, #FF6B1A)',
              borderRadius: '999px',
              border: 'none',
              cursor: 'pointer',
              padding: '10px 18px',
              boxShadow: added
                ? '0 4px 16px rgba(22,163,74,0.3)'
                : '0 4px 16px rgba(213,26,122,0.3)',
              transition: 'all 0.25s ease',
            }}
            onMouseEnter={e => !added && (e.currentTarget.style.transform = 'scale(1.06)')}
            onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
          >
            {added ? <CheckIcon /> : <PlusIcon />}
            <span>{added ? '¡Listo!' : 'Agregar'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
