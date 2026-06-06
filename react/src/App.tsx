import { Link, Route, Routes } from 'react-router-dom'
import SenderPage from './pages/SenderPage'
import ClaimPage from './pages/ClaimPage'

function App() {
  return (
    <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif', maxWidth: 640, margin: '0 auto' }}>
      <header style={{ marginBottom: 24 }}>
        <Link to="/" style={{ textDecoration: 'none', color: 'inherit' }}>
          <h1 style={{ margin: 0 }}>🎁 Gift Agent</h1>
        </Link>
      </header>
      <Routes>
        <Route path="/" element={<SenderPage />} />
        <Route path="/claim/:token" element={<ClaimPage />} />
      </Routes>
    </div>
  )
}

export default App
