// One shared world state, persisted in localStorage and synced across the app tabs.
import { useSyncExternalStore } from 'react'
import { DEFAULT_REPLY_DELAY_MS } from '../data/company'
import { ALL_DOCS } from '../data/documents'
import { INBOX, SENT } from '../data/emails'
import { EXISTING_BILLS, FIRST_NEW_BILL_SEQ, PURCHASE_ORDERS, SUPPLIERS, TRACKER_ROWS } from '../data/masterData'
import type { WorldState } from '../data/types'

const KEY = 'meridian-world-v1'
const VERSION = 1

export function freshWorld(persona = 'sara', replyDelayMs = DEFAULT_REPLY_DELAY_MS): WorldState {
  return structuredClone({
    version: VERSION,
    persona,
    sessionStartedAt: Date.now(),
    replyDelayMs,
    suppliers: SUPPLIERS,
    pos: PURCHASE_ORDERS,
    bills: EXISTING_BILLS,
    emails: [...INBOX, ...SENT],
    docs: ALL_DOCS,
    downloads: [],
    tracker: TRACKER_ROWS,
    scheduled: [],
    nextBillSeq: FIRST_NEW_BILL_SEQ,
    firedRules: [],
  })
}

function load(): WorldState {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as WorldState
      if (parsed.version === VERSION) return parsed
    }
  } catch {
    /* fall through to a fresh world */
  }
  const w = freshWorld()
  save(w)
  return w
}

function save(w: WorldState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(w))
  } catch {
    /* storage full or blocked: keep working in memory */
  }
}

let cache: WorldState = load()
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

window.addEventListener('storage', (e) => {
  if (e.key === KEY) {
    cache = load()
    emit()
  }
})

function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function getWorld() {
  return cache
}

/** Mutate a fresh copy of the latest saved state (read-modify-write, so other tabs' changes aren't lost). */
export function update(mutate: (draft: WorldState) => void) {
  const draft = structuredClone(load())
  mutate(draft)
  save(draft)
  cache = draft
  emit()
}

export function resetWorld(persona: string, replyDelayMs: number) {
  const w = freshWorld(persona, replyDelayMs)
  save(w)
  cache = w
  emit()
}

/** The whole world state. Derive what you need in the component (the reference is stable between changes). */
export function useWorld(): WorldState {
  return useSyncExternalStore(subscribe, getWorld)
}

export const nowClock = () =>
  new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

let idCounter = 0
export const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(idCounter++).toString(36)}`
