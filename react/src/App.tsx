import { Link, Route, Routes } from 'react-router-dom'
import SenderPage from './pages/SenderPage'
import ClaimPage from './pages/ClaimPage'
import AgentPage from './pages/AgentPage'

function App() {
  return (
    <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif', maxWidth: 640, margin: '0 auto' }}>
      <header style={{ marginBottom: 24, display: 'flex', gap: 16, alignItems: 'baseline' }}>
        <Link to="/" style={{ textDecoration: 'none', color: 'inherit' }}>
          <h1 style={{ margin: 0 }}>🎁 Gift Agent</h1>
        </Link>
        <nav style={{ display: 'flex', gap: 12 }}>
          <Link to="/">Send</Link>
          <Link to="/agent">Agent</Link>
        </nav>
      </header>
      <Routes>
        <Route path="/" element={<SenderPage />} />
        <Route path="/claim/:token" element={<ClaimPage />} />
        <Route path="/agent" element={<AgentPage />} />
      </Routes>
    </div>
  )
}

export default App
