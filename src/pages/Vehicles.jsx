import { useEffect, useState } from 'react'
import { collection, onSnapshot, query, where, doc, deleteDoc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { subDays, format } from 'date-fns'
import { useAuth } from '../context/AuthContext'

// Pairs raw DEPARTURE + ARRIVAL trip events into [{departure, arrival}] rows.
// Unpaired departures (vehicle still out) show with no arrival time.
function pairTrips(trips) {
  const sorted = [...trips].sort((a, b) => a.timestamp - b.timestamp)
  const paired = []
  let pendingDeparture = null

  for (const trip of sorted) {
    if (trip.type === 'DEPARTURE') {
      // If there's already an unpaired departure, push it as-is (missed arrival)
      if (pendingDeparture) paired.push({ departure: pendingDeparture, arrival: null })
      pendingDeparture = trip
    } else if (trip.type === 'ARRIVAL') {
      paired.push({ departure: pendingDeparture, arrival: trip })
      pendingDeparture = null
    }
  }
  // Any leftover departure with no arrival yet
  if (pendingDeparture) paired.push({ departure: pendingDeparture, arrival: null })

  return paired.reverse() // most recent first
}

function TripsModal({ vehicle, assignments, trips, onClose }) {
  const vehicleAssignmentIds = new Set(
    assignments
      .filter(a => a.vehicleId === vehicle.id)
      .map(a => a.id)
  )
  const vehicleTrips = trips.filter(t => vehicleAssignmentIds.has(t.assignmentId))
  const paired = pairTrips(vehicleTrips)

  function duration(dep, arr) {
    if (!dep || !arr) return '—'
    const ms = arr.timestamp - dep.timestamp
    const mins = Math.floor(ms / 60000)
    if (mins < 60) return `${mins}m`
    return `${Math.floor(mins / 60)}h ${mins % 60}m`
  }

  return (
    // Backdrop
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Panel */}
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{vehicle.plateNumber}</h2>
            <p className="text-xs text-gray-500 mt-0.5">{paired.length} trips recorded</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-xl leading-none transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Table */}
        <div className="overflow-y-auto flex-1">
          {paired.length === 0 ? (
            <div className="py-16 text-center text-gray-400 text-sm">No trips recorded for this vehicle</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  {['#', 'Date', 'Departure', 'Arrival', 'Duration', 'Status'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paired.map(({ departure, arrival }, i) => {
                  const ts = departure?.timestamp || arrival?.timestamp
                  return (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-400 text-xs">{paired.length - i}</td>
                      <td className="px-4 py-3 text-gray-600">
                        {ts ? format(new Date(ts), 'd MMM yyyy') : '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-800">
                        {departure ? format(new Date(departure.timestamp), 'HH:mm') : '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-800">
                        {arrival ? format(new Date(arrival.timestamp), 'HH:mm') : '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {duration(departure, arrival)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          arrival
                            ? 'bg-green-100 text-green-700'
                            : 'bg-yellow-100 text-yellow-700'
                        }`}>
                          {arrival ? 'Completed' : 'In progress'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Vehicles() {
  const [vehicles, setVehicles] = useState([])
  const [collections, setCollections] = useState([])
  const [assignments, setAssignments] = useState([])
  const [drivers, setDrivers] = useState([])
  const [trips, setTrips] = useState([])
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [selectedVehicle, setSelectedVehicle] = useState(null)

    // Deactivation flow state
  const [confirmDeactivate, setConfirmDeactivate] = useState(null) // vehicle id
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState('')
  const [updating, setUpdating] = useState(false)

  useEffect(() => {
    const unsubs = []
    unsubs.push(onSnapshot(collection(db, 'matatus'),
      s => setVehicles(s.docs.map(d => ({ id: d.id, ...d.data() })))))
    unsubs.push(onSnapshot(
      query(collection(db, 'collections'), where('date', '>=', subDays(new Date(), 30).getTime())),
      s => setCollections(s.docs.map(d => ({ id: d.id, ...d.data() })))
    ))
    unsubs.push(onSnapshot(collection(db, 'assignments'),
      s => setAssignments(s.docs.map(d => ({ id: d.id, ...d.data() })))))
    unsubs.push(onSnapshot(collection(db, 'drivers'),
      s => setDrivers(s.docs.map(d => ({ id: d.id, ...d.data() })))))
    unsubs.push(onSnapshot(collection(db, 'trips'),
      s => setTrips(s.docs.map(d => ({ id: d.id, ...d.data() })))))
    return () => unsubs.forEach(u => u())
  }, [])

  const { user: currentUser } = useAuth()


    // Deactivate — requires a reason, updates status field (what Android reads)
  async function handleDeactivate(vehicle) {
    if (!reason.trim()) {
      setReasonError('Please enter a reason for deactivation')
      return
    }
    setUpdating(true)
    try {
      await updateDoc(doc(db, 'matatus', vehicle.id), {
        status:              'INACTIVE',
        deactivated:         true,
        deactivationReason:  reason.trim(),
        deactivatedAt:       Date.now(),
        deactivatedBy:       currentUser.name
      })
      setConfirmDeactivate(null)
      setReason('')
      setReasonError('')
    } catch (e) {
      alert(e.message)
    } finally {
      setUpdating(false)
    }
  }

    // Reactivate — clears deactivation fields
  async function handleReactivate(vehicle) {
    setUpdating(true)
    try {
      await updateDoc(doc(db, 'matatus', vehicle.id), {
            status:                   'ACTIVE',
            deactivated:              false,
            deactivationReason:       '',
            deactivatedAt:            null,
            deactivatedBy:            null,
            deactivationRequested:    false,
            deactivationRequestedBy:  ''
      })
    } catch (e) {
      alert(e.message)
    } finally {
      setUpdating(false)
    }
  }

  // async function handleDelete(vehicle) {
  //   setDeleting(true)
  //   try {
  //     await deleteDoc(doc(db, 'matatus', vehicle.id))
  //     setConfirmDelete(null)
  //   } catch (e) {
  //     alert('Delete failed: ' + e.message)
  //   } finally {
  //     setDeleting(false)
  //   }
  // }

  const kes = n => `KES ${n.toLocaleString('en-KE', { maximumFractionDigits: 0 })}`

  const rows = vehicles.map(v => {
    const assignment = assignments.find(a =>
      a.vehicleId === v.id && a.status?.toUpperCase() === 'ACTIVE'
    )
    const driver = assignment
      ? drivers.find(d => d.id === assignment.driverId || d.userId === assignment.driverId)
      : null
    const total30d = collections
      .filter(c => c.vehicleId === v.id)
      .reduce((sum, c) => sum + (c.amount || 0), 0)

    // Trip count across all assignments for this vehicle
    const vehicleAssignmentIds = new Set(
      assignments.filter(a => a.vehicleId === v.id).map(a => a.id)
    )
    const tripCount = trips.filter(t => vehicleAssignmentIds.has(t.assignmentId)).length

    return { ...v, driverName: driver?.name || '—', total30d, tripCount }
  })

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Vehicles</h1>
        <p className="text-sm text-gray-500 mt-1">{vehicles.length} registered</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Plate', 'Capacity', 'Current Driver', '30d Collections', 'Trips', 'Status', ''].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map(v => {
              const isActive = v.status?.toUpperCase() === 'ACTIVE'
              return (
              <tr key={v.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 font-mono font-semibold text-gray-900">{v.plateNumber}</td>
                <td className="px-4 py-3 text-gray-600">{v.capacity || '—'}</td>
                <td className="px-4 py-3 text-gray-700">{v.driverName}</td>
                <td className="px-4 py-3 font-semibold text-brand-700">{kes(v.total30d)}</td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => setSelectedVehicle(v)}
                    className="text-xs text-brand-600 hover:text-brand-800 font-medium underline underline-offset-2 transition-colors"
                  >
                    {v.tripCount} {v.tripCount === 1 ? 'event' : 'events -> Check Trips'}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                    v.status?.toUpperCase() === 'ACTIVE'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-500'
                  }`}>
                    {v.status || '—'}
                  </span>
                </td>
                  <div>
                    {/* Show deactivation reason alongside status if present */}
                      {!isActive && v.deactivationReason && (
                        <p className="text-xs text-gray-400 mt-1 max-w-[160px] truncate" title={v.deactivationReason}>
                          Reason: {v.deactivationReason}
                        </p>
                      )}
                      {!isActive && (v.deactivatedBy || v.deactivationRequestedBy) && (
                        <p
                          className="text-xs text-gray-400 mt-1 max-w-[160px] truncate"
                          title={v.deactivatedBy || v.deactivationRequestedBy}
                        >
                          By: {v.deactivatedBy || v.deactivationRequestedBy}
                        </p>
                      )}
                    </div>
                  <td className="px-4 py-3 min-w-[180px]">
                    {isActive ? (
                      confirmDeactivate === v.id ? (
                        <div className="space-y-2">
                          <textarea
                            value={reason}
                            onChange={e => { setReason(e.target.value); setReasonError('') }}
                            placeholder="Reason for deactivation…"
                            rows={2}
                            className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-red-400 resize-none"
                          />
                          {reasonError && (
                            <p className="text-xs text-red-500">{reasonError}</p>
                          )}
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleDeactivate(v)}
                              disabled={updating}
                              className="text-xs text-white bg-red-500 hover:bg-red-600 disabled:opacity-50 px-2 py-1 rounded transition-colors"
                            >
                              {updating ? '…' : 'Confirm'}
                            </button>
                            <button
                              onClick={() => { setConfirmDeactivate(null); setReason(''); setReasonError('') }}
                              className="text-xs text-gray-500 hover:text-gray-800 px-2 py-1 transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => { setConfirmDeactivate(v.id); setReason(''); setReasonError('') }}
                            className="text-xs text-red-400 hover:text-red-600 underline transition-colors"
                          >
                            Deactivate
                          </button>
                          {/* {confirmDelete === v.id ? (
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-gray-500">Delete?</span>
                              <button onClick={() => handleDelete(d)} disabled={deleting}
                                className="text-xs text-white bg-red-500 hover:bg-red-600 px-2 py-1 rounded disabled:opacity-50">
                                {deleting ? '…' : 'Yes'}
                              </button>
                              <button onClick={() => setConfirmDelete(null)}
                                className="text-xs text-gray-500 hover:text-gray-800 px-1">
                                No
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmDelete(v.id)}
                              className="text-xs text-gray-400 hover:text-red-600 underline transition-colors"
                            >
                              Delete
                            </button>
                          )} */}
                        </div>
                      )
                    ) : (
                      <button
                        onClick={() => handleReactivate(v)}
                        disabled={updating}
                        className="text-xs text-green-600 hover:text-green-700 underline transition-colors disabled:opacity-50"
                      >
                        {updating ? '…' : 'Reactivate'}
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-gray-400 text-sm">No vehicles found</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selectedVehicle && (
        <TripsModal
          vehicle={selectedVehicle}
          assignments={assignments}
          trips={trips}
          onClose={() => setSelectedVehicle(null)}
        />
      )}
    </div>
  )
}