import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  signInWithPopup, signOut, onAuthStateChanged
} from 'firebase/auth'
import { auth, googleProvider, firebaseReady } from '../firebase'

const TRIAL_DAYS = 7

export const useAuthStore = create(persist(
  (set, get) => ({
    user: null,
    isGuest: false,
    loading: true,
    modalOpen: false,
    paywallOpen: false,       // sign-in gate (50s guest timer)
    planModalOpen: false,     // choose trial vs pro (after Google sign-in, no plan yet)
    trialExpiredOpen: false,  // blocking paywall when trial ends

    // Plan state — persisted
    plan: null,               // null | 'trial' | 'pro'
    trialStartDate: null,     // ISO string

    openModal:    () => set({ modalOpen: true }),
    closeModal:   () => set({ modalOpen: false }),
    triggerPaywall: () => set({ paywallOpen: true }),

    // ── Plan helpers ──────────────────────────────────────────
    isTrialActive: () => {
      const { plan, trialStartDate } = get()
      if (plan !== 'trial' || !trialStartDate) return false
      const elapsed = Date.now() - new Date(trialStartDate).getTime()
      return elapsed < TRIAL_DAYS * 24 * 60 * 60 * 1000
    },

    trialDaysLeft: () => {
      const { plan, trialStartDate } = get()
      if (plan !== 'trial' || !trialStartDate) return 0
      const elapsed = Date.now() - new Date(trialStartDate).getTime()
      const left = TRIAL_DAYS - Math.floor(elapsed / (24 * 60 * 60 * 1000))
      return Math.max(0, left)
    },

    hasAccess: () => {
      const { plan } = get()
      if (plan === 'pro') return true
      if (plan === 'trial') return get().isTrialActive()
      return false
    },

    startTrial: () => set({
      plan: 'trial',
      trialStartDate: new Date().toISOString(),
      planModalOpen: false,
      trialExpiredOpen: false,
    }),

    activatePro: () => set({
      plan: 'pro',
      planModalOpen: false,
      trialExpiredOpen: false,
    }),

    triggerTrialExpired: () => set({ trialExpiredOpen: true }),

    // ── Auth ──────────────────────────────────────────────────
    init: () => {
      if (!firebaseReady) { set({ loading: false }); return }
      onAuthStateChanged(auth, (firebaseUser) => {
        if (firebaseUser) {
          const currentPlan = get().plan
          set({
            user: {
              uid:      firebaseUser.uid,
              name:     firebaseUser.displayName,
              email:    firebaseUser.email,
              photo:    firebaseUser.photoURL,
              provider: 'google',
            },
            isGuest:      false,
            loading:      false,
            modalOpen:    false,
            paywallOpen:  false,
            // Show plan picker only if user has never chosen a plan
            planModalOpen: !currentPlan,
          })
        } else {
          set({
            user:        { uid: 'guest', name: 'Guest User', email: null, photo: null, provider: 'guest' },
            isGuest:     true,
            loading:     false,
            paywallOpen: false,
          })
        }
      })
    },

    signInWithGoogle: async () => {
      if (!firebaseReady) throw new Error('Firebase not configured. Add credentials to .env')
      try {
        await signInWithPopup(auth, googleProvider)
      } catch (err) {
        console.error('Google sign-in failed:', err.message)
        throw err
      }
    },

    continueAsGuest: () => {
      set({
        isGuest: true,
        user: { uid: 'guest', name: 'Guest User', email: null, photo: null, provider: 'guest' },
        loading: false,
        modalOpen: false,
      })
    },

    signOutUser: async () => {
      await signOut(auth)
      set({ user: null, isGuest: false, paywallOpen: false })
    },

    isAuthenticated: () => !!get().user,
  }),
  {
    name: 'stockd-auth',
    partialize: (state) => ({
      isGuest:       state.isGuest,
      plan:          state.plan,
      trialStartDate: state.trialStartDate,
    }),
  }
))
