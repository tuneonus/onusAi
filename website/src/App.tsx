import { Features } from './components/Features'
import { FinalCta } from './components/FinalCta'
import { Footer } from './components/Footer'
import { Header } from './components/Header'
import { Hero } from './components/Hero'
import { HowItWorks } from './components/HowItWorks'
import { IndustrySolutions } from './components/IndustrySolutions'
import { ProductPreview } from './components/ProductPreview'

export function App() {
  return (
    <div className="flex min-h-screen flex-col bg-navy-900 text-slate-100">
      <Header />
      <main className="flex-1">
        <Hero />
        <Features />
        <HowItWorks />
        <IndustrySolutions />
        <ProductPreview />
        <FinalCta />
      </main>
      <Footer />
    </div>
  )
}

export default App
