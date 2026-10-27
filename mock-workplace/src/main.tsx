import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Launcher from './apps/launcher/Launcher'
import LedgerPointApp from './apps/ledgerpoint/LedgerPointApp'
import MailApp from './apps/mail/MailApp'
import ProcureHubApp from './apps/procurehub/ProcureHubApp'
import TrackerApp from './apps/tracker/TrackerApp'
import { deliverDueReplies } from './lib/replies'
import './styles.css'

function App() {
  // Every open tab delivers due auto-replies; delivery is idempotent.
  useEffect(() => {
    const t = setInterval(deliverDueReplies, 1000)
    return () => clearInterval(t)
  }, [])
  return (
    <Routes>
      <Route path="/" element={<Launcher />} />
      <Route path="/mail" element={<Navigate to="/mail/inbox" replace />} />
      <Route path="/mail/*" element={<MailApp />} />
      <Route path="/ledgerpoint" element={<Navigate to="/ledgerpoint/bills" replace />} />
      <Route path="/ledgerpoint/*" element={<LedgerPointApp />} />
      <Route path="/procurehub/*" element={<ProcureHubApp />} />
      <Route path="/tracker" element={<TrackerApp />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
