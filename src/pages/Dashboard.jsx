import { useEffect, useState } from 'react'
import { collection, onSnapshot, query, where, orderBy, limit } from 'firebase/firestore'
import { db } from '../firebase'
import { format, subDays, startOfDay, endOfDay } from 'date-fns'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import StatCard from '../components/StatCard'

export default function Dashboard() {
  const [collections, setCollections] = useState([])
  const [vehicles, setVehicles] = useState([])
  const [drivers, setDrivers] = useState([])
  const [unmatchedCount, setUnmatchedCount] = useState(0)
  const [pendingDeactivations, setPendingDeactivations] = useState(0)

  useEffect(() => {
    const unsubs = []

    // All collections (last 30 days for charts)
    const thirtyDaysAgo = subDays(new Date(), 30).getTime()
    unsubs.push(onSnapshot(
      query(collection(db, 'collections'), where('date', '>=', thirtyDaysAgo), orderBy('date', 'desc')),
      snap => setCollections(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    ))

    unsubs.push(onSnapshot(collection(db, 'matatus'),
      snap => setVehicles(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    ))

    unsubs.push(onSnapshot(collection(db, 'drivers'),
      snap => setDrivers(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    ))

    unsubs.push(onSnapshot(
      query(collection(db, 'mpesa_payments'), where('matched', '==', false)),
      snap => setUnmatchedCount(snap.size)
    ))

    const pendingVehicleIds = new Set()
    const pendingDriverIds = new Set()
    const updatePendingCount = () =>
      setPendingDeactivations(pendingVehicleIds.size + pendingDriverIds.size)

    unsubs.push(onSnapshot(
      query(collection(db, 'matatus'), where('deactivationRequested', '==', true)),
      snap => {
        pendingVehicleIds.clear()
        snap.docs.forEach(d => pendingVehicleIds.add(d.id))
        updatePendingCount()
      }
    ))
    unsubs.push(onSnapshot(
      query(collection(db, 'drivers'), where('deactivationRequested', '==', true)),
      snap => {
        pendingDriverIds.clear()
        snap.docs.forEach(d => pendingDriverIds.add(d.id))
        updatePendingCount()
      }
    ))

    return () => unsubs.forEach(u => u())
  }, [])

  const today = new Date()
  const todayStart = startOfDay(today).getTime()
  const todayEnd   = endOfDay(today).getTime()

  const todayCollections = collections.filter(c => c.date >= todayStart && c.date <= todayEnd)
  const todayTotal = todayCollections.reduce((sum, c) => sum + (c.amount || 0), 0)

  const weekTotal = collections
    .filter(c => c.date >= subDays(today, 7).getTime())
    .reduce((sum, c) => sum + (c.amount || 0), 0)

  // Build 7-day chart data
  const chartData = Array.from({ length: 7 }, (_, i) => {
    const day = subDays(today, 6 - i)
    const start = startOfDay(day).getTime()
    const end   = endOfDay(day).getTime()
    const total = collections
      .filter(c => c.date >= start && c.date <= end)
      .reduce((sum, c) => sum + (c.amount || 0), 0)
    return { day: format(day, 'EEE'), total }
  })

  // Top 5 vehicles by collection amount (last 30 days)
  const vehicleTotals = collections.reduce((acc, c) => {
    acc[c.vehicleId] = (acc[c.vehicleId] || 0) + (c.amount || 0)
    return acc
  }, {})
  const topVehicles = Object.entries(vehicleTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([vehicleId, total]) => {
      const vehicle = vehicles.find(v => v.id === vehicleId)
      return { plate: vehicle?.plateNumber || vehicleId, total }
    })

  const kes = n => `KES ${n.toLocaleString('en-KE', { maximumFractionDigits: 0 })}`

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">{format(today, 'EEEE, d MMMM yyyy')}</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
        <StatCard
          label="Today's Collections"
          value={kes(todayTotal)}
          sub={`${todayCollections.length} transactions`}
          accent
        />
        <StatCard
          label="This Week"
          value={kes(weekTotal)}
          sub="Last 7 days"
        />
        <StatCard
          label="Active Vehicles"
          value={vehicles.filter(v => v.status === 'ACTIVE').length}
          sub={`of ${vehicles.length} total`}
        />
        <StatCard
          label="Unmatched Payments"
          value={unmatchedCount}
          sub={unmatchedCount > 0 ? 'Needs attention' : 'All clear'}
          warn={unmatchedCount > 0}
        />
        <StatCard
          label="Pending Deactivations"
          value={pendingDeactivations}
          sub={pendingDeactivations > 0 ? 'Needs attention' : 'All clear'}
          warn={pendingDeactivations > 0}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 7-day chart */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Collections — Last 7 Days</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} barSize={32}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="day" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={v => kes(v)} />
              <Bar dataKey="total" fill="#16a34a" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Top vehicles */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Top Vehicles (30 days)</h2>
          {topVehicles.length === 0 ? (
            <p className="text-xs text-gray-400">No data yet</p>
          ) : (
            <ul className="space-y-3">
              {topVehicles.map(({ plate, total }, i) => (
                <li key={plate} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-400 w-4">{i + 1}</span>
                    <span className="text-sm font-medium text-gray-800">{plate}</span>
                  </div>
                  <span className="text-sm text-brand-600 font-semibold">{kes(total)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
