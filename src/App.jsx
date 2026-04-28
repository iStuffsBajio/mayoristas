import Navbar from './components/Navbar'
import Hero from './components/Hero'
import InventarioSemanal from './components/InventarioSemanal'
import InventoryGrid from './components/InventoryGrid'
import Personalizer from './components/Personalizer'
import Footer from './components/Footer'

export default function App() {
  return (
    <div className="bg-white min-h-screen font-sans" style={{ color: '#0A0A0A' }}>
      <Navbar />
      <main>
        <Hero />
        <InventarioSemanal />
        <InventoryGrid />
        <Personalizer />
      </main>
      <Footer />
    </div>
  )
}
