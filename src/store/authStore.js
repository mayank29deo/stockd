import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  signInWithPopup, signOut, onAuthStateChanged
} from 'firebase/auth'
import { auth, googleProvider, firebaseReady } from '../firebase'

export const useAuthStore = create(persist(
  (set, get) => ({
    user: null,          // Firebase user object (null = not signed in)
    isGuest: false,      // true = browsing without account
    loading: true,       // waiting for Firebase auth state
    modalOpen: false,

    openModal:  () => set({ modalOpen: true }),
    closeModal: () => set({ modalOpen: false }),

    // Called once on app mount — syncs Firebase auth state
    init: () => {
      if (!firebaseReady) { set({ loading: false }); return }
      onAuthStateChanged(auth, (firebaseUser) => {
        if (firebaseUser) {
          set({
            user: {
              uid:         firebaseUser.uid,
              name:        firebaseUser.displayName,
              email:       firebaseUser.email,
              photo:       firebaseUser.photoURL,
              provider:    'google',
            },
            isGuest: false,
            loading: false,
            modalOpen: false,
          })
        } else {
          // Only clear user if not in guest mode
          if (!get().isGuest) {
            set({ user: null, loading: false })
          } else {
            set({ loading: false })
          }
        }
      })
    },

    signInWithGoogle: async () => {
      if (!firebaseReady) throw new Error('Firebase not configured. Add credentials to .env')
      try {
        await signInWithPopup(auth, googleProvider)
        // onAuthStateChanged handles the state update
      } catch (err) {
        console.error('Google sign-in failed:', err.message)
        throw err
      }
    },

    continueAsGuest: () => {
      set({
        isGuest: true,
        user: {
          uid:      'guest',
          name:     'Guest User',
          email:    null,
          photo:    null,
          provider: 'guest',
        },
        loading: false,
        modalOpen: false,
      })
    },

    signOutUser: async () => {
      await signOut(auth)
      set({ user: null, isGuest: false })
    },

    isAuthenticated: () => {
      const { user } = get()
      return !!user
    },
  }),
  {
    name: 'stockd-auth',
    partialize: (state) => ({ isGuest: state.isGuest }),  // only persist guest flag
  }
))
