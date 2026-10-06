import { createContext, useContext, useState, useEffect } from 'react'
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from '../firebase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [firebaseUser, setFirebaseUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setFirebaseUser(firebaseUser)

      if (!firebaseUser) {
        setUser(null)
        setLoading(false)
        return
      }

      const profileSnap = await getDoc(doc(db, 'users', firebaseUser.uid))
      const profile = profileSnap.exists() ? profileSnap.data() : null

      if (profile && profile.role === 'ADMIN' && profile.active !== false && !profile.deleted) {
        setUser({ userId: firebaseUser.uid, ...profile })
      } else {
        await signOut(auth)
        setFirebaseUser(null)
        setUser(null)
      }

      setLoading(false)
    })

    return () => unsub()
  }, [])

  async function login(phone, password) {
    setLoading(true)
    setError('')

    try {
      const pseudoEmail = `${phone.trim()}@ma3.internal`

      const result = await signInWithEmailAndPassword(
        auth,
        pseudoEmail,
        password
      )

      const profileSnap = await getDoc(
        doc(db, 'users', result.user.uid)
      )

      if (!profileSnap.exists()) {
        setError('Account exists but profile is missing')
        await signOut(auth)
        return false
      }

      const profile = profileSnap.data()

      if (profile.role !== 'ADMIN') {
        setError('Admin access required')
        await signOut(auth)
        return false
      }

      if (profile.deleted) {
        setError('This account no longer exists')
        await signOut(auth)
        return false
      }

      if (profile.active === false) {
        setError('This account has been deactivated')
        await signOut(auth)
        return false
      }

      setUser({
        userId: result.user.uid,
        ...profile
      })

      return true

    } catch (e) {
      setError(mapAuthError(e))
      return false

    } finally {
      setLoading(false)
    }
  }

  function logout() {
    signOut(auth)
    setUser(null)
    setFirebaseUser(null)
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        firebaseUser,
        login,
        logout,
        loading,
        error,
        setError
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

function mapAuthError(e) {
  const msg = e.message || ''

  if (msg.includes('user-not-found')) {
    return 'Phone number not registered'
  }

  if (msg.includes('wrong-password') || msg.includes('invalid-credential')) {
    return 'Incorrect password'
  }

  if (msg.includes('too-many-requests')) {
    return 'Too many attempts — try again later'
  }

  return msg || 'Login failed'
}

export function useAuth() {
  return useContext(AuthContext)
}