import { useEffect, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'
import { format, subDays, startOfDay } from 'date-fns'

const RANGES = [
  { label: 'All',     days: -1 },
  { label: 'Today',   days: 0  },
  { label: 'Last 7d', days: 7  },
  { label: 'Last 30d',days: 30 },
]

/**
 * Handles both date formats the collections collection can contain:
 * - Long (epoch ms)       — written by the Android app
 * - "YYYYMMDDHHmmss"     — written by the Node server (Safaricom TransTime)
 * - Firestore Timestamp   — written if serverTimestamp() was used
 */
function parseDate(raw) {
  if (!raw) return new Date()
  if (typeof raw === 'number') return new Date(raw)
  if (raw?.toDate) return raw.toDate()           // Firestore Timestamp object
  if (typeof raw === 'string' && raw.length === 14) {
    // "20241215143022" → "2024-12-15T14:30:22"
    return new Date(
      `${raw.slice(0,4)}-${raw.slice(4,6)}-${raw.slice(6,8)}` +
      `T${raw.slice(8,10)}:${raw.slice(10,12)}:${raw.slice(12,14)}`
    )
  }
  return new Date(raw)
}

export default function Collections() {
  const [all, setAll] = useState([])
  const [range, setRange] = useState(7)
  const [search, setSearch] = useState('')

  useEffect(() => {
    // No orderBy — Firestore silently drops docs when `date` has mixed types
    // (string from server vs Long from app). Sort client-side after parsing.
    const unsub = onSnapshot(
      collection(db, 'collections'),
      snap => {
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        docs.sort((a, b) => parseDate(b.date).getTime() - parseDate(a.date).getTime())
        setAll(docs)
      }
    )
    return unsub
  }, [])

  const cutoff = range === 0
    ? startOfDay(new Date()).getTime()
    : range === -1
      ? 0
      : subDays(new Date(), range).getTime()

  const filtered = all.filter(c => {
    const dateMs = parseDate(c.date).getTime()
    const inRange = range === -1 || dateMs >= cutoff
    const term = search.toLowerCase()
    const matchSearch = !term ||
      c.driverName?.toLowerCase().includes(term) ||
      (c.vehiclePlate || c.plateNumber)?.toLowerCase().includes(term) ||
      c.mpesaTransactionId?.toLowerCase().includes(term) ||
      c.mpesaRef?.toLowerCase().includes(term)
    return inRange && matchSearch
  })

  const total       = filtered.reduce((sum, c) => sum + (c.amount || 0), 0)
  const mpesaTotal  = filtered.filter(c => c.source === 'mpesa').reduce((sum, c) => sum + (c.amount || 0), 0)
  const manualTotal = filtered.filter(c => c.source !== 'mpesa').reduce((sum, c) => sum + (c.amount || 0), 0)

  const kes = n => `KES ${n.toLocaleString('en-KE', { maximumFractionDigits: 0 })}`

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Collections</h1>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Total',  value: kes(total),       color: 'text-gray-900'   },
          { label: 'M-Pesa', value: kes(mpesaTotal),  color: 'text-brand-600'  },
          { label: 'Manual', value: kes(manualTotal), color: 'text-blue-600'   },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <p className="text-xs text-gray-500">{label}</p>
            <p className={`text-xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex rounded-lg border border-gray-200 overflow-hidden bg-white shadow-sm">
          {RANGES.map(r => (
            <button
              key={r.days}
              onClick={() => setRange(r.days)}
              className={`px-4 py-2 text-sm transition-colors ${
                range === r.days
                  ? 'bg-brand-600 text-white font-medium'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Search driver, plate, M-Pesa ref…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white shadow-sm"
        />
        <span className="text-sm text-gray-500">{filtered.length} records</span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Date', 'Driver', 'Plate', 'Amount', 'Source', 'Reference'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map(c => {
              const date = parseDate(c.date)
              return (
                <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                    {format(date, 'd MMM yyyy, HH:mm')}
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900">{c.driverName || '—'}</td>
                  <td className="px-4 py-3 text-gray-700 font-mono">{c.vehiclePlate || c.plateNumber || '—'}</td>
                  <td className="px-4 py-3 font-semibold text-brand-700">{kes(c.amount || 0)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      c.source === 'mpesa'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-blue-100 text-blue-700'
                    }`}>
                      {c.source === 'mpesa' ? 'M-Pesa' : 'Manual'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                    {c.mpesaTransactionId || c.mpesaRef || '—'}
                  </td>
                </tr>
              )
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-gray-400 text-sm">
                  No collections found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}