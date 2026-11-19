import {
  type Node,
  type NodeChangeset,
  type PositionChange,
  useReactFlow,
  useViewport,
  type XYPosition
} from "@xyflow/react"

export const NODE_SNAP_THRESHOLD = 8
export { SNAP_GRID_SIZE, snapCoordinate, snapPosition } from "./grid"

type Size = { width: number; height: number }

export type SnapGuide =
  { type: "vertical"; x: number; y1: number; y2: number } | { type: "horizontal"; y: number; x1: number; x2: number }

type Bounds = {
  left: number
  right: number
  top: number
  bottom: number
  width: number
  height: number
}

type ProposedChange = PositionChange & { position: XYPosition }

function isProposed(change: PositionChange): change is ProposedChange {
  return change.position !== undefined
}


function absolutePosition(
  node: Node,
  lookup: Map<string, Node>,
  proposedPositions: Map<string, XYPosition>
): XYPosition {
  const own = proposedPositions.get(node.id) ?? node.position
  let x = own.x
  let y = own.y
  let parentId = node.parentId
  const visited = new Set<string>([node.id])

  while (parentId && !visited.has(parentId)) {
    visited.add(parentId)
    const parent = lookup.get(parentId)
    if (!parent) break
    const parentPosition = proposedPositions.get(parent.id) ?? parent.position
    x += parentPosition.x
    y += parentPosition.y
    parentId = parent.parentId
  }
  return { x, y }
}

function relativePosition(
  node: Node,
  absolute: XYPosition,
  lookup: Map<string, Node>,
  proposedPositions: Map<string, XYPosition>
): XYPosition {
  if (!node.parentId) return absolute
  const parent = lookup.get(node.parentId)
  if (!parent) return absolute
  const parentAbsolute = absolutePosition(parent, lookup, proposedPositions)
  return { x: absolute.x - parentAbsolute.x, y: absolute.y - parentAbsolute.y }
}

function nodeBounds(position: XYPosition, { width, height }: Size): Bounds {
  return {
    left: position.x,
    right: position.x + width,
    top: position.y,
    bottom: position.y + height,
    width,
    height
  }
}

function movesWithSelection(node: Node, movingIds: Set<string>, lookup: Map<string, Node>): boolean {
  if (movingIds.has(node.id)) return true
  let parentId = node.parentId
  const visited = new Set<string>()
  while (parentId && !visited.has(parentId)) {
    if (movingIds.has(parentId)) return true
    visited.add(parentId)
    parentId = lookup.get(parentId)?.parentId
  }
  return false
}

function dedupeGuides(guides: SnapGuide[]): SnapGuide[] {
  const vertical = new Set<number>()
  const horizontal = new Set<number>()
  return guides.filter((guide) => {
    if (guide.type === "vertical") {
      const key = Math.round(guide.x)
      if (vertical.has(key)) return false
      vertical.add(key)
      return true
    }
    const key = Math.round(guide.y)
    if (horizontal.has(key)) return false
    horizontal.add(key)
    return true
  })
}

/**
 * Snap the positions being dragged, in place, to the edges and centre lines of the other nodes,
 * and return the guides to draw. `sizeOf` supplies the size of a node that is not measured yet.
 */
export function snapNodeChanges<N extends Node>(
  nodes: N[],
  changes: NodeChangeset<N>,
  { threshold = NODE_SNAP_THRESHOLD, sizeOf }: { threshold?: number; sizeOf?: (node: N) => Size } = {}
): SnapGuide[] {
  const size = (node: N): Size => ({
    width: node.measured?.width ?? node.width ?? sizeOf?.(node).width ?? 0,
    height: node.measured?.height ?? node.height ?? sizeOf?.(node).height ?? 0
  })
  const positionChanges = changes.getByType("position").filter(isProposed)
  if (!positionChanges.length) return []

  const lookup = new Map(nodes.map((node) => [node.id, node]))
  const proposedPositions = new Map(positionChanges.map((change) => [change.id, change.position]))
  const movingIds = new Set(positionChanges.map((change) => change.id))
  const stationary = nodes.filter((node) => !node.hidden && !movesWithSelection(node, movingIds, lookup))
  if (!stationary.length) return []

  const xValues: number[] = []
  const yValues: number[] = []
  for (const node of stationary) {
    const bounds = nodeBounds(absolutePosition(node, lookup, proposedPositions), size(node))
    xValues.push(bounds.left, bounds.right, bounds.left + bounds.width / 2)
    yValues.push(bounds.top, bounds.bottom, bounds.top + bounds.height / 2)
  }

  const guides: SnapGuide[] = []

  for (const change of positionChanges) {
    const node = lookup.get(change.id)
    if (!node || !change.position) continue
    const absolute = absolutePosition(node, lookup, proposedPositions)
    const bounds = nodeBounds(absolute, size(node))
    let x = absolute.x
    let y = absolute.y

    const verticalExtent = [bounds.top, bounds.bottom, ...yValues]
    const horizontalExtent = [bounds.left, bounds.right, ...xValues]

    let closestX = threshold
    let verticalGuide: number | null = null
    for (const candidate of xValues) {
      const leftDistance = Math.abs(bounds.left - candidate)
      const rightDistance = Math.abs(bounds.right - candidate)
      const centerDistance = Math.abs(bounds.left + bounds.width / 2 - candidate)
      const distance = Math.min(leftDistance, rightDistance, centerDistance)
      if (distance >= closestX) continue
      closestX = distance
      verticalGuide = candidate
      x =
        leftDistance <= rightDistance && leftDistance <= centerDistance
          ? candidate
          : rightDistance <= leftDistance && rightDistance <= centerDistance
            ? candidate - bounds.width
            : candidate - bounds.width / 2
    }
    if (verticalGuide !== null) {
      guides.push({
        type: "vertical",
        x: verticalGuide,
        y1: Math.min(...verticalExtent),
        y2: Math.max(...verticalExtent)
      })
    }

    let closestY = threshold
    let horizontalGuide: number | null = null
    for (const candidate of yValues) {
      const topDistance = Math.abs(bounds.top - candidate)
      const bottomDistance = Math.abs(bounds.bottom - candidate)
      const centerDistance = Math.abs(bounds.top + bounds.height / 2 - candidate)
      const distance = Math.min(topDistance, bottomDistance, centerDistance)
      if (distance >= closestY) continue
      closestY = distance
      horizontalGuide = candidate
      y =
        topDistance <= bottomDistance && topDistance <= centerDistance
          ? candidate
          : bottomDistance <= topDistance && bottomDistance <= centerDistance
            ? candidate - bounds.height
            : candidate - bounds.height / 2
    }
    if (horizontalGuide !== null) {
      guides.push({
        type: "horizontal",
        y: horizontalGuide,
        x1: Math.min(...horizontalExtent),
        x2: Math.max(...horizontalExtent)
      })
    }

    const position = relativePosition(node, { x, y }, lookup, proposedPositions)
    proposedPositions.set(change.id, position)
    changes.remove(change)
    changes.add({ ...change, position })
  }

  return dedupeGuides(guides)
}

/** The guides of the drag in progress, drawn over the canvas. */
export function SnapGuides({ guides }: { guides: SnapGuide[] }) {
  const { flowToScreenPosition } = useReactFlow()
  useViewport()
  if (!guides.length) return null

  return (
    <svg
      aria-hidden="true"
      className="react-flow__helper-lines"
      style={{ position: "fixed", inset: 0, width: "100vw", height: "100vh", pointerEvents: "none", zIndex: 1001 }}
    >
      <g className="node-snap-helper-lines">
        {guides.map((guide) => {
          if (guide.type === "vertical") {
            const from = flowToScreenPosition({ x: guide.x, y: guide.y1 })
            const to = flowToScreenPosition({ x: guide.x, y: guide.y2 })
            return (
              <line
                key={`v-${guide.x}-${guide.y1}-${guide.y2}`}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke="#478EFF"
                strokeWidth={0.5}
                strokeLinecap="round"
                strokeDasharray="4 4"
              />
            )
          }
          const from = flowToScreenPosition({ x: guide.x1, y: guide.y })
          const to = flowToScreenPosition({ x: guide.x2, y: guide.y })
          return (
            <line
              key={`h-${guide.y}-${guide.x1}-${guide.x2}`}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke="#478EFF"
              strokeWidth={0.5}
              strokeLinecap="round"
              strokeDasharray="4 4"
            />
          )
        })}
      </g>
    </svg>
  )
}
