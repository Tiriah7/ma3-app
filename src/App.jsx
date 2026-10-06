import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Login from './pages/Login'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Collections from './pages/Collections'
import Vehicles from './pages/Vehicles'
import Drivers from './pages/Drivers'
import Users from './pages/Users'
import UnmatchedPayments from './pages/UnmatchedPayments'
import PendingDeactivations from './pages/PendingDeactivations'

function ProtectedRoute({ children }) {
  const { user } = useAuth()
  return user ? children : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="collections" element={<Collections />} />
        <Route path="vehicles" element={<Vehicles />} />
        <Route path="drivers" element={<Drivers />} />
        <Route path="users" element={<Users />} />
        <Route path="unmatched" element={<UnmatchedPayments />} />
        <Route path="pending" element={<PendingDeactivations/>} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
