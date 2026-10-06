import { useEffect } from 'react'
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'

export function usePresence(userId) {
  useEffect(() => {
    if (!userId) return

    const userRef = doc(db, 'users', userId)

    let stopped = false

    async function heartbeat() {
      if (stopped) return

      try {
        await updateDoc(userRef, {
          online: true,
          lastSeen: serverTimestamp(),
        })
      } catch (err) {
        console.error('Presence heartbeat failed:', err)
      }
    }

    // immediately mark online
    heartbeat()

    // heartbeat every 30 seconds
    const interval = setInterval(heartbeat, 30000)

    async function goOffline() {
      try {
        await updateDoc(userRef, {
          online: false,
          lastSeen: serverTimestamp(),
        })
      } catch (err) {
        console.error('Failed to mark offline:', err)
      }
    }

    function handleBeforeUnload() {
      // Firestore writes are not guaranteed to finish here,
      // but we attempt it anyway.
      goOffline()
    }

    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      stopped = true
      clearInterval(interval)
      window.removeEventListener('beforeunload', handleBeforeUnload)

      // fires on logout/navigation while app is still running
      goOffline()
    }
  }, [userId])
}