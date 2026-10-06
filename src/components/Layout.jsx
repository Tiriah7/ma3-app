import { useEffect, useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { usePresence } from '../hooks/usePresence'

export default function Layout() {
  const { user, logout } = useAuth()
  usePresence(user?.userId)
  const navigate = useNavigate()

  const [unmatchedCount, setUnmatchedCount]   = useState(0)
  const [pendingCount,   setPendingCount]     = useState(0)

  useEffect(() => {
    const unsubs = []

    unsubs.push(onSnapshot(
      query(collection(db, 'mpesa_payments'), where('matched', '==', false)),
      s => setUnmatchedCount(s.size)
    ))

    // Pending deactivations: vehicles or drivers with deactivated = true
    unsubs.push(onSnapshot(
      query(collection(db, 'matatus'), where('deactivationRequested', '==', true)),
      s => setPendingCount(prev => {
        // We'll accumulate both collections — store vehicle count separately
        window._pendingVehicles = s.size
        return (window._pendingVehicles ?? 0) + (window._pendingDrivers ?? 0)
      })
    ))
    unsubs.push(onSnapshot(
      query(collection(db, 'drivers'), where('deactivationRequested', '==', true)),
      s => setPendingCount(() => {
        window._pendingDrivers = s.size
        return (window._pendingVehicles ?? 0) + (window._pendingDrivers ?? 0)
      })
    ))

    return () => unsubs.forEach(u => u())
  }, [])

  function handleLogout() {
    logout()
    navigate('/login')
  }

  const links = [
    { to: '/dashboard',   label: 'Dashboard',          icon: '📊' },
    { to: '/collections', label: 'Collections',         icon: '💰' },
    { to: '/vehicles',    label: 'Vehicles',            icon: '🚐' },
    { to: '/drivers',     label: 'Drivers',             icon: '👤' },
    { to: '/users',       label: 'Users',               icon: '🔑', excludeFromOnline: true },
    { to: '/unmatched',   label: 'Unmatched Payments',  icon: '⚠️', count: unmatchedCount },
    { to: '/pending',     label: 'Pending Deactivations',   icon: '⏳', count: pendingCount   },
  ]

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-60 bg-gray-900 text-white flex flex-col flex-shrink-0">
        <div className="px-6 py-5 border-b border-gray-700">
          <p className="text-lg font-bold text-brand-500">Ma3</p>
          <p className="text-xs text-gray-400 mt-0.5">Admin Management Panel</p>
        </div>

        <nav className="flex-1 overflow-y-auto py-4">
          {links.map(({ to, label, icon, count }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-6 py-2.5 text-sm transition-colors ${
                  isActive
                    ? 'bg-brand-700 text-white font-medium'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                }`
              }
            >
              <span>{icon}</span>
              <span className="flex-1">{label}</span>
              {count > 0 && (
                <span className="bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                  {count}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="px-6 py-4 border-t border-gray-700">
          <p className="text-xs text-gray-400 truncate">{user?.name}</p>
          <p className="text-xs text-gray-600 truncate">{user?.phone}</p>
          <button
            onClick={handleLogout}
            className="mt-3 text-xs text-red-400 hover:text-red-300 transition-colors"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto bg-gray-50">
        <Outlet />
      </main>
    </div>
  )
}