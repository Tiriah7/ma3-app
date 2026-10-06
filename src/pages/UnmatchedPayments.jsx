import { useEffect, useState } from 'react'
import { collection, onSnapshot, query, where, doc, updateDoc, addDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { format } from 'date-fns'

export default function UnmatchedPayments() {
  const [payments, setPayments] = useState([])
  const [vehicles, setVehicles] = useState([])
  const [matching, setMatching] = useState(null)  // paymentId being matched
  const [selectedPlate, setSelectedPlate] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const unsubs = []
    unsubs.push(onSnapshot(
      query(collection(db, 'mpesa_payments'), where('matched', '==', false)),
      s => setPayments(s.docs.map(d => ({ id: d.id, ...d.data() })))
    ))
    unsubs.push(onSnapshot(collection(db, 'matatus'),
      s => setVehicles(s.docs.map(d => ({ id: d.id, ...d.data() })))
    ))
    return () => unsubs.forEach(u => u())
  }, [])

  async function handleMatch(payment) {
    if (!selectedPlate) return
    setSaving(true)
    setError('')
    try {
      const vehicle = vehicles.find(v => v.plateNumber === selectedPlate)
      if (!vehicle) throw new Error('Vehicle not found')

      // Create a collection record manually
      const colRef = await addDoc(collection(db, 'collections'), {
        vehicleId: vehicle.id,
        vehiclePlate: vehicle.plateNumber,
        plateNumber: vehicle.plateNumber,
        driverName: payment.firstName || 'Unknown',
        amount: payment.amount,
        source: 'mpesa',
        mpesaTransactionId: payment.transactionId,
        date: Date.now(),
        assignmentId: null,
        matched: true,
        matchedManually: true,
      })

      // Mark payment as matched
      await updateDoc(doc(db, 'mpesa_payments', payment.id), {
        matched: true,
        collectionId: colRef.id,
        matchedManually: true,
      })

      setMatching(null)
      setSelectedPlate('')
    } catch (e) {
      setError(e.message || 'Match failed')
    } finally {
      setSaving(false)
    }
  }

  const kes = n => `KES ${n.toLocaleString('en-KE', { maximumFractionDigits: 0 })}`

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Unmatched Payments</h1>
        <p className="text-sm text-gray-500 mt-1">
          M-Pesa payments that couldn't be auto-matched to a vehicle. Assign them manually below.
        </p>
      </div>

      {payments.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center">
          <p className="text-gray-600 font-medium">All payments matched</p>
          <p className="text-gray-400 text-sm mt-1">Nothing to action right now</p>
        </div>
      ) : (
        <div className="space-y-3">
          {payments.map(p => (
            <div key={p.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs text-gray-500">Transaction ID</p>
                    <p className="text-sm font-mono font-semibold text-gray-800">{p.transactionId}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Amount</p>
                    <p className="text-sm font-bold text-brand-700">{kes(p.amount || 0)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Bill Ref (typed by payer)</p>
                    <p className="text-sm font-mono text-gray-800">{p.billRefNumber || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Failure Reason</p>
                    <p className="text-sm text-red-600">{p.matchFailureReason || '—'}</p>
                  </div>
                </div>

                <button
                  onClick={() => { setMatching(p.id); setSelectedPlate(''); setError('') }}
                  className="flex-shrink-0 bg-brand-600 hover:bg-brand-700 text-white text-xs font-medium px-4 py-2 rounded-lg transition-colors"
                >
                  Match
                </button>
              </div>

              {/* Inline match form */}
              {matching === p.id && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <p className="text-xs font-medium text-gray-600 mb-2">Assign to vehicle:</p>
                  <div className="flex items-center gap-3">
                    <select
                      value={selectedPlate}
                      onChange={e => setSelectedPlate(e.target.value)}
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    >
                      <option value="">Select vehicle…</option>
                      {vehicles.map(v => (
                        <option key={v.id} value={v.plateNumber}>{v.plateNumber}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => handleMatch(p)}
                      disabled={!selectedPlate || saving}
                      className="bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                    >
                      {saving ? 'Saving…' : 'Confirm'}
                    </button>
                    <button
                      onClick={() => setMatching(null)}
                      className="text-gray-500 hover:text-gray-800 text-sm px-3 py-2 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                  {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
