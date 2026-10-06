// PendingDeletions.jsx
import { useEffect, useState } from 'react'
import { collection, onSnapshot, query, where, doc, deleteDoc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'

function PendingDeactivationSection({ title, collectionName, items, displayName }) {
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState('')

  async function approve(id) {
    setBusyId(id); setError('')
    try {
      await updateDoc(doc(db, collectionName, id), {
        deactivated: true,
        deactivationRequested: false,
        status: 'INACTIVE'
      })
    } catch (e) {
      setError(e.message || 'Deactivation failed')
    } finally {
      setBusyId(null)
    }
  }

  async function restore(id) {
    setBusyId(id); setError('')
    try {
      await updateDoc(doc(db, collectionName, id), {
        deactivated: false,
        deactivationRequested: false,
        deactivationRequestedBy: '',
        status: 'ACTIVE',
        deactivationReason: ''   // erased on restore
      })
    } catch (e) {
      setError(e.message || 'Reactivation failed')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="mb-8">
      <h2 className="text-lg font-semibold text-gray-900 mb-3">
        {title} {items.length > 0 && <span className="text-gray-400 font-normal">({items.length})</span>}
      </h2>

      {items.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center">
          <p className="text-gray-400 text-sm">No pending deactivations</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(item => (
            <div key={item.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-gray-800">{displayName(item)}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Reason: {item.deactivationReason || '—'}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Requested by: {item.deactivationRequestedBy || 'Unknown'}
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => restore(item.id)}
                    disabled={busyId === item.id}
                    className="bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-700 text-xs font-medium px-3 py-2 rounded-lg transition-colors"
                  >
                    {busyId === item.id ? 'Restoring…' : 'Reject'}
                  </button>
                  <button
                    onClick={() => approve(item.id)}
                    disabled={busyId === item.id}
                    className="bg-red-50 hover:bg-red-100 text-red-700 text-xs font-medium px-3 py-2 rounded-lg transition-colors"
                  >
                    {busyId === item.id ? 'Deactivating…' : 'Approve deactivation'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </div>
  )
}

export default function PendingDeactivations() {
  const [vehicles, setVehicles] = useState([])
  const [drivers, setDrivers] = useState([])

  useEffect(() => {
    const unsubs = []
    unsubs.push(onSnapshot(
      query(collection(db, 'matatus'), where('deactivationRequested', '==', true)),
      s => setVehicles(s.docs.map(d => ({ id: d.id, ...d.data() })))
    ))
    unsubs.push(onSnapshot(
      query(collection(db, 'drivers'), where('deactivationRequested', '==', true)),
      s => setDrivers(s.docs.map(d => ({ id: d.id, ...d.data() })))
    ))
    return () => unsubs.forEach(u => u())
  }, [])

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Pending Deactivations</h1>
        <p className="text-sm text-gray-500 mt-1">
          Vehicles and drivers deactivated from the app, awaiting approval.
        </p>
      </div>

      <PendingDeactivationSection
        title="Vehicles"
        collectionName="matatus"
        items={vehicles}
        displayName={v => v.plateNumber}
      />
      <PendingDeactivationSection
        title="Drivers"
        collectionName="drivers"
        items={drivers}
        displayName={d => `${d.name} · ${d.phone}`}
      />
    </div>
  )
}