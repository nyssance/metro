/**
 * In-memory undo and redo over whatever part of the state a canvas calls undoable. The history
 * owns snapshots; the canvas owns the state and supplies access to it. A snapshot is compared by
 * the identity of its values, so the state must replace what changes rather than mutate it.
 */
export function createHistory<Snapshot extends Record<string, unknown>>(access: {
  /** The undoable values as they are now. */
  read: () => Snapshot
  /** Put a snapshot back; the canvas reconciles whatever else depends on it. */
  write: (snapshot: Snapshot) => void
  /** How many steps are kept. */
  limit?: number
  /** Captures with the same label inside this window are one step, as with a batch delete. */
  mergeMs?: number
}) {
  const { limit = 60, mergeMs = 300 } = access
  let past: Snapshot[] = []
  let future: Snapshot[] = []
  let applying = false
  let suppressed = 0
  let lastLabel: string | undefined
  let lastAt = 0

  const unchangedSince = (snapshot: Snapshot): boolean => {
    const current = access.read()
    const keys = new Set([...Object.keys(snapshot), ...Object.keys(current)])
    return [...keys].every((key) => snapshot[key] === current[key])
  }

  /** Call before a user operation: the current state becomes an undo point. `label` names the intent. */
  function captureUndo(label?: string): void {
    if (applying || suppressed > 0) return
    const top = past.at(-1)
    // Nothing undoable changed since the last point: a repeated capture adds no empty step.
    if (top && unchangedSince(top)) {
      if (label) {
        lastLabel = label
        lastAt = Date.now()
      }
      return
    }
    const now = Date.now()
    if (label && label === lastLabel && now - lastAt < mergeMs) {
      lastAt = now
      return
    }
    lastLabel = label
    lastAt = now
    past.push(access.read())
    if (past.length > limit) past.shift()
    future = []
  }

  /** A batch of operations counts as one undo point. */
  function withUndoBatch<T>(fn: () => T): T {
    captureUndo()
    return withoutUndo(fn)
  }

  /** Apply synchronous authoritative updates without creating user history. */
  function withoutUndo<T>(fn: () => T): T {
    suppressed++
    try {
      return fn()
    } finally {
      suppressed--
    }
  }

  function apply(snapshot: Snapshot): void {
    applying = true
    try {
      access.write(snapshot)
    } finally {
      applying = false
    }
    lastLabel = undefined
  }

  function undo(): boolean {
    const previous = past.pop()
    if (!previous) return false
    future.push(access.read())
    apply(previous)
    return true
  }

  function redo(): boolean {
    const next = future.pop()
    if (!next) return false
    past.push(access.read())
    apply(next)
    return true
  }

  const canUndo = (): boolean => past.length > 0
  const canRedo = (): boolean => future.length > 0
  const undoDepth = (): number => past.length

  /** Empty both stacks; required when the canvas shows another document. */
  function resetUndo(): void {
    past = []
    future = []
    lastLabel = undefined
  }

  return { captureUndo, withUndoBatch, withoutUndo, undo, redo, canUndo, canRedo, undoDepth, resetUndo }
}
