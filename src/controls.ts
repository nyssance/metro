import { useReactFlow, useViewport } from "@xyflow/react"
import { useCallback, useEffect, useRef, useState } from "react"

import { isTextInput, MAX_ZOOM, MIN_ZOOM } from "./canvas"
import { computeTidyPositions, type TidyEdge, type TidyNode } from "./tidy"

type Positions = Record<string, { x: number; y: number }>

/**
 * Tidy the canvas along its edges, then let the person keep the result or go back. The
 * application supplies its nodes and how to move them, and draws the controls itself.
 * Alt+Shift+F tidies unless a field is being typed in.
 */
export function useTidyLayout(port: {
  nodes: () => TidyNode[]
  edges: () => TidyEdge[]
  move: (positions: Positions) => void
  /** Called once before nodes move, for the application to take its undo point. */
  beforeMove?: () => void
  onError?: (error: unknown) => void
  /** Ask to keep or revert afterwards. Without it the layout simply stays. */
  confirm?: boolean
}): { busy: boolean; pending: boolean; tidy: () => Promise<void>; keep: () => void; revert: () => void } {
  const { fitView } = useReactFlow()
  const [busy, setBusy] = useState(false)
  const [original, setOriginal] = useState<Positions | null>(null)
  const latest = useRef(port)
  latest.current = port

  const fit = useCallback(() => {
    requestAnimationFrame(() => void fitView({ padding: "8%", duration: 300 }))
  }, [fitView])

  const tidy = useCallback(async () => {
    if (busy || original !== null) return
    const { nodes, edges, move, beforeMove, onError, confirm = true } = latest.current
    const roots = nodes().filter((node) => !node.parentId)
    if (roots.length <= 1) return
    const start = new Map(roots.map((node) => [node.id, { ...node.position }]))
    setBusy(true)
    try {
      const positions = await computeTidyPositions(nodes(), edges())
      // The layout was computed for the canvas as it was; if anything moved meanwhile, leave it alone.
      const now = new Map(latest.current.nodes().map((node) => [node.id, node.position]))
      const changed = [...start].some(([id, position]) => {
        const current = now.get(id)
        return current?.x !== position.x || current.y !== position.y
      })
      if (changed || Object.keys(positions).length === 0) return
      const before: Positions = {}
      for (const id of Object.keys(positions)) {
        const position = start.get(id)
        if (position) before[id] = position
      }
      beforeMove?.()
      move(positions)
      if (confirm) setOriginal(before)
      fit()
    } catch (error) {
      onError?.(error)
    } finally {
      setBusy(false)
    }
  }, [busy, original, fit])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.repeat || isTextInput(event.target) || !event.altKey || !event.shiftKey) return
      if (event.ctrlKey || event.metaKey || event.code !== "KeyF") return
      event.preventDefault()
      event.stopPropagation()
      void tidy()
    }
    window.addEventListener("keydown", onKeyDown, true)
    return () => window.removeEventListener("keydown", onKeyDown, true)
  }, [tidy])

  return {
    busy,
    pending: original !== null,
    tidy,
    keep: () => setOriginal(null),
    revert: () => {
      if (original) latest.current.move(original)
      setOriginal(null)
      fit()
    }
  }
}

/** The zoom as a percentage, with the limits the shared canvas has. */
export function useZoomPercent(): {
  percent: number
  atMin: boolean
  atMax: boolean
  /** Zoom to a percentage, clamped to the limits; anything that is not a positive number is ignored. */
  setPercent: (percent: number) => void
  zoomIn: () => void
  zoomOut: () => void
} {
  const { zoomIn, zoomOut, zoomTo } = useReactFlow()
  const { zoom } = useViewport()
  return {
    percent: Math.round(zoom * 100),
    atMin: zoom <= MIN_ZOOM + 1e-3,
    atMax: zoom >= MAX_ZOOM - 1e-3,
    setPercent: (percent) => {
      if (Number.isFinite(percent) && percent > 0)
        void zoomTo(Math.max(MIN_ZOOM * 100, Math.min(MAX_ZOOM * 100, percent)) / 100)
    },
    zoomIn: () => void zoomIn(),
    zoomOut: () => void zoomOut()
  }
}

/** ⌘/Ctrl with + − 0: zoom in, zoom out, fit the canvas. Fields being typed in keep their keys. */
export function useZoomShortcuts(): void {
  const { fitView, zoomIn, zoomOut } = useReactFlow()
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.isComposing || event.altKey || isTextInput(event.target)) return
      if (!(event.ctrlKey || event.metaKey)) return
      if (event.key === "+" || event.key === "=") {
        event.preventDefault()
        void zoomIn()
      } else if (event.key === "-") {
        event.preventDefault()
        void zoomOut()
      } else if (event.key === "0") {
        event.preventDefault()
        void fitView({ padding: "8%" })
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [fitView, zoomIn, zoomOut])
}
