import { useEffect, useState } from 'react'
import { collection, onSnapshot, query, where, doc, updateDoc, deleteDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { subDays } from 'date-fns'
import { useAuth } from '../context/AuthContext'

export default function Drivers() {
  const [drivers, setDrivers] = useState([])
  const [vehicles, setVehicles] = useState([])
  const [assignments, setAssignments] = useState([])
  const [collections, setCollections] = useState([])

  // Deactivation flow state
  const [confirmDeactivate, setConfirmDeactivate] = useState(null) // driver id
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState('')
  const [updating, setUpdating] = useState(false)

  // // Delete flow state
  // const [confirmDelete, setConfirmDelete] = useState(null)
  // const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    const unsubs = []
    unsubs.push(onSnapshot(collection(db, 'drivers'),
      s => setDrivers(s.docs.map(d => ({ id: d.id, ...d.data() })))))
    unsubs.push(onSnapshot(collection(db, 'matatus'),
      s => setVehicles(s.docs.map(d => ({ id: d.id, ...d.data() })))))
    unsubs.push(onSnapshot(collection(db, 'assignments'),
      s => setAssignments(s.docs.map(d => ({ id: d.id, ...d.data() })))))
    unsubs.push(onSnapshot(
      query(collection(db, 'collections'), where('date', '>=', subDays(new Date(), 30).getTime())),
      s => setCollections(s.docs.map(d => ({ id: d.id, ...d.data() })))
    ))
    return () => unsubs.forEach(u => u())
  }, [])

  const { user: currentUser } = useAuth()

  // Deactivate — requires a reason, updates status field (what Android reads)
  async function handleDeactivate(driver) {
    if (!reason.trim()) {
      setReasonError('Please enter a reason for deactivation')
      return
    }
    setUpdating(true)
    try {
      await updateDoc(doc(db, 'drivers', driver.id), {
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
  async function handleReactivate(driver) {
    setUpdating(true)
    try {
      await updateDoc(doc(db, 'drivers', driver.id), {
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

  // async function handleDelete(driver) {
  //   setDeleting(true)
  //   try {
  //     await deleteDoc(doc(db, 'drivers', driver.id))
  //     setConfirmDelete(null)
  //   } catch (e) {
  //     alert('Delete failed: ' + e.message)
  //   } finally {
  //     setDeleting(false)
  //   }
  // }

  const kes = n => `KES ${n.toLocaleString('en-KE', { maximumFractionDigits: 0 })}`

  const rows = drivers.map(d => {
    const driverAssignments = assignments.filter(a =>
      a.driverId === d.id || a.driverId === d.userId
    )
    const assignmentIds = new Set(driverAssignments.map(a => a.id))
    const activeAssignment = driverAssignments.find(a => a.status?.toUpperCase() === 'ACTIVE')
    const vehicle = activeAssignment
      ? vehicles.find(v => v.id === activeAssignment.vehicleId)
      : null
    const total30d = collections
      .filter(c => assignmentIds.has(c.assignmentId))
      .reduce((sum, c) => sum + (c.amount || 0), 0)
    return { ...d, vehiclePlate: vehicle?.plateNumber || '—', total30d }
  })

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Drivers</h1>
        <p className="text-sm text-gray-500 mt-1">{drivers.length} registered</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Name', 'Phone', 'National ID', 'Assigned Vehicle', '30d Collections', 'Status', ''].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map(d => {
              const isActive = d.status?.toUpperCase() === 'ACTIVE'
              return (
                <tr key={d.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">{d.name}</td>
                  <td className="px-4 py-3 text-gray-600">{d.phone || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{d.nationalId || '—'}</td>
                  <td className="px-4 py-3 font-mono font-semibold text-gray-800">{d.vehiclePlate}</td>
                  <td className="px-4 py-3 font-semibold text-brand-700">{kes(d.total30d)}</td>
                  <td className="px-4 py-3">
                    
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                      }`}>
                        {d.status || '—'}
                      </span>
                      </td>
                      <div>
                      {/* Show deactivation reason alongside status if present */}
                      {!isActive && d.deactivationReason && (
                        <p className="text-xs text-gray-400 mt-1 max-w-[160px] truncate" title={d.deactivationReason}>
                         Reason: {d.deactivationReason}
                        </p>
                      )}
                      {!isActive && (d.deactivatedBy || d.deactivationRequestedBy) && (
                        <p
                          className="text-xs text-gray-400 mt-1 max-w-[160px] truncate"
                          title={d.deactivatedBy || d.deactivationRequestedBy}
                        >
                          By: {d.deactivatedBy || d.deactivationRequestedBy}
                        </p>
                      )}
                    </div>
                  
                  <td className="px-4 py-3 min-w-[180px]">
                    {isActive ? (
                      confirmDeactivate === d.id ? (
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
                              onClick={() => handleDeactivate(d)}
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
                            onClick={() => { setConfirmDeactivate(d.id); setReason(''); setReasonError('') }}
                            className="text-xs text-red-400 hover:text-red-600 underline transition-colors"
                          >
                            Deactivate
                          </button>
                          {/* {confirmDelete === d.id ? (
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
                              onClick={() => setConfirmDelete(d.id)}
                              className="text-xs text-gray-400 hover:text-red-600 underline transition-colors"
                            >
                              Delete
                            </button>
                          )} */}
                        </div>
                      )
                    ) : (
                      <button
                        onClick={() => handleReactivate(d)}
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
                <td colSpan={7} className="px-4 py-12 text-center text-gray-400 text-sm">No drivers found</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}