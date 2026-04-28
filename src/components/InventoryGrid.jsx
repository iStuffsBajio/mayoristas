import { useState } from 'react'
import ProductCard from './ProductCard'
import { products, categories } from '../data/products'

export default function InventoryGrid() {
  const [active, setActive] = useState('Todos')

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-14">

      {/* Divider */}
      <div style={{ height: 1, backgroundColor: 'rgba(0,0,0,0.07)', marginBottom: 48 }} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-8">
        <div>
          <p className="text-xs font-bold tracking-widest uppercase mb-2" style={{ color: '#D51A7A' }}>
            Catálogo
          </p>
          <h2 className="text-3xl sm:text-4xl font-black" style={{ color: '#0A0A0A' }}>
            Productos Destacados
          </h2>
        </div>
        <p className="text-sm" style={{ color: '#999' }}>
          {products.length} productos disponibles
        </p>
      </div>

      {/* Category pills */}
      <div className="flex gap-2 flex-wrap mb-8">
        {categories.map(cat => {
          const isActive = active === cat
          return (
            <button
              key={cat}
              onClick={() => setActive(cat)}
              className="px-5 py-2 text-sm font-medium transition-all"
              style={
                isActive
                  ? { background: 'linear-gradient(135deg, #D51A7A, #FF6B1A)', borderRadius: '999px', color: 'white', border: 'none', cursor: 'pointer', boxShadow: '0 4px 14px rgba(213,26,122,0.25)' }
                  : { backgroundColor: 'rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.09)', borderRadius: '999px', color: '#555', cursor: 'pointer' }
              }
              onMouseEnter={e => { if (!isActive) { e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.09)'; e.currentTarget.style.color = '#0A0A0A' } }}
              onMouseLeave={e => { if (!isActive) { e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)'; e.currentTarget.style.color = '#555' } }}
            >
              {cat}
            </button>
          )
        })}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {products.map(product => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </section>
  )
}
