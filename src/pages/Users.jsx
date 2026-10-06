import { useEffect, useState } from 'react'
import { collection, onSnapshot, doc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'

const ROLES = ['ADMIN', 'FIELD_MANAGER']

// Consider a user online if their lastSeen is within 2 minutes
function isOnline(user) {
  if (user.online === true && user.lastSeen) {
    const lastSeenMs = user.lastSeen?.toMillis?.() ?? user.lastSeen
    return Date.now() - lastSeenMs < 2 * 60 * 1000
  }
  return false
}

function OnlineDot({ online }) {
  return (
    <span className={`inline-block w-2 h-2 rounded-full ${online ? 'bg-green-500' : 'bg-gray-300'}`} />
  )
}

export default function Users() {
  const { user: currentUser, firebaseUser } = useAuth()
  const [users, setUsers] = useState([])
  const [form, setForm] = useState({ name: '', phone: '', nationalId: '', role: 'FIELD_MANAGER', password: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [confirmDeactivate, setConfirmDeactivate] = useState(null)
  const [updating, setUpdating] = useState(false)

  useEffect(() => {
    return onSnapshot(collection(db, 'users'), s =>
      setUsers(s.docs.map(d => ({ id: d.id, ...d.data() })))
    )
  }, [])

async function handleCreate(e) {
  e.preventDefault()
  setSaving(true)
  setError('')
  setSuccess('')

  if (!/^\d{10}$/.test(form.phone)) {
    setError('Phone number must be exactly 10 digits.')
    setSaving(false)
    return
  }

  if (!/^\d{8}$/.test(form.nationalId)) {
    setError('National ID must be exactly 8 digits.')
    setSaving(false)
    return
  }

  if (form.password.length < 6) {
    setError('Password must be at least 6 characters.')
    setSaving(false)
    return
  }

  if (!firebaseUser) {
    setError('Your login session has expired. Please log in again.')
    setSaving(false)
    return
  }

  try {
    // Get the Firebase Authentication ID token for the
    // currently logged-in administrator.
    const token = await firebaseUser.getIdToken()

    const apiUrl = `${import.meta.env.VITE_API_URL}/admin/users`

    console.log('API URL:', apiUrl)

    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: form.name,
          phone: form.phone,
          role: form.role,
          nationalId: form.nationalId,
          password: form.password,
        }),
      }
    )

    const result = await response.json()

    if (!response.ok) {
      throw new Error(result.error || 'Failed to create user')
    }

    setForm({
      name: '',
      phone: '',
      nationalId: '',
      role: 'FIELD_MANAGER',
      password: '',
    })

    setSuccess(`User ${form.name} created successfully`)
  } catch (e) {
    console.error('User creation failed:', e)
    setError(e.message || 'Failed to create user')
  } finally {
    setSaving(false)
  }
}

async function toggleActive(user) {
  setUpdating(true)

  try {
    await updateDoc(doc(db, 'users', user.id), {
      active: !user.active,
    })

    setConfirmDeactivate(null)
  } catch (e) {
    alert(e.message)
  } finally {
    setUpdating(false)
  }
}

  const otherUsers = users.filter(u => u.id !== currentUser?.userId)
  const onlineCount = otherUsers.filter(isOnline).length

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Users</h1>
        <p className="text-sm text-gray-500 mt-1">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
            {onlineCount} online now
          </span>
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Create form */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Create User</h2>
          <form onSubmit={handleCreate} className="space-y-3">
            {[
              { label: 'Full Name',   key: 'name',       type: 'text'     },
              { label: 'Phone',       key: 'phone',      type: 'tel'      },
              { label: 'National ID', key: 'nationalId', type: 'text'     },
              { label: 'Password',    key: 'password',   type: 'password' },
            ].map(({ label, key, type }) => (
              <div key={key}>
                <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
                <input
                  type={type}
                  value={form[key]}
                  onChange={e => {
                    let value = e.target.value
                    if (key === 'phone')      value = value.replace(/\D/g, '').slice(0, 10)
                    if (key === 'nationalId') value = value.replace(/\D/g, '').slice(0, 8)
                    setForm(f => ({ ...f, [key]: value }))
                  }}
                  required
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            ))}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
              <select
                value={form.role}
                onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>

            {error   && <p className="text-xs text-red-600 bg-red-50 rounded px-3 py-2">{error}</p>}
            {success && <p className="text-xs text-green-700 bg-green-50 rounded px-3 py-2">{success}</p>}

            <button
              type="submit"
              disabled={saving}
              className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-medium rounded-lg py-2 text-sm transition-colors"
            >
              {saving ? 'Creating…' : 'Create User'}
            </button>
          </form>
        </div>

        {/* User list */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['', 'Name', 'Phone', 'Role', 'Status', ''].map((h, i) => (
                  <th key={i} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {otherUsers.map(u => {
                const online = isOnline(u)
                const lastSeenMs = u.lastSeen?.toMillis?.() ?? u.lastSeen
                const lastSeenLabel = lastSeenMs
                  ? online
                    ? 'Online now'
                    : `Last seen ${formatRelative(lastSeenMs)}`
                  : 'Never'

                return (
                  <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <OnlineDot online={online} />
                        <span className="text-xs text-gray-400">{lastSeenLabel}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">{u.name}</td>
                    <td className="px-4 py-3 text-gray-600">{u.phone}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        u.role === 'ADMIN'         ? 'bg-purple-100 text-purple-700' :
                        u.role === 'FIELD_MANAGER' ? 'bg-blue-100 text-blue-700' :
                                                     'bg-gray-100 text-gray-600'
                      }`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        u.active !== false ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                      }`}>
                        {u.active !== false ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {u.active !== false ? (
                        confirmDeactivate === u.id ? (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500">
                              Confirm deactivation?
                            </span>

                            <button
                              onClick={() => toggleActive(u)}
                              disabled={updating}
                              className="text-xs text-white bg-red-500 hover:bg-red-600 disabled:opacity-50 px-2 py-1 rounded transition-colors"
                            >
                              {updating ? '…' : 'Yes'}
                            </button>

                            <button
                              onClick={() => setConfirmDeactivate(null)}
                              disabled={updating}
                              className="text-xs text-gray-500 hover:text-gray-800 px-2 py-1 transition-colors"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDeactivate(u.id)}
                            className="text-xs text-red-500 hover:text-red-700 underline transition-colors"
                          >
                            Deactivate
                          </button>
                        )
                      ) : (
                        <button
                          onClick={() => toggleActive(u)}
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
              {otherUsers.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-gray-400 text-sm">No users found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function formatRelative(ms) {
  if (!ms) return '—'
  const diff = Date.now() - ms
  const mins = Math.floor(diff / 60000)
  if (mins < 1)   return 'just now'
  if (mins < 60)  return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)   return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}