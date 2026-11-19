import type { ElkNode } from "elkjs/lib/elk-api"

import { snapCoordinate } from "./grid"

type XY = { x: number; y: number }
/** What the layout needs of a node: where it is, how large, and the group it sits in, if any. */
export interface TidyNode {
  id: string
  parentId?: string
  position: XY
  size: { w: number; h: number }
}
export interface TidyEdge {
  source: string
  target: string
}

const NODE_GAP = 80
const COMPONENT_GAP = NODE_GAP * 1.5
const MAX_ROW_WIDTH = 3200

type ElkInstance = {
  layout: (graph: ElkNode) => Promise<ElkNode>
}

let elkPromise: Promise<ElkInstance> | null = null

function getElk(): Promise<ElkInstance> {
  elkPromise ??= import("elkjs/lib/elk.bundled.js")
    .then(({ default: ELK }) => new ELK())
    .catch((error) => {
      elkPromise = null
      throw error
    })
  return elkPromise
}

function resolveRootId(id: string, nodes: Map<string, TidyNode>): string {
  let current = id
  const visited = new Set<string>()
  for (let depth = 0; depth < 256; depth += 1) {
    const node = nodes.get(current)
    if (!node?.parentId || visited.has(current)) break
    visited.add(current)
    current = node.parentId
  }
  return current
}

function connectedComponents(rootNodes: TidyNode[], edges: TidyEdge[], nodes: Map<string, TidyNode>) {
  const rootIds = new Set(rootNodes.map((node) => node.id))
  const parent = new Map(rootNodes.map((node) => [node.id, node.id]))
  const find = (id: string): string => {
    let root = id
    while (parent.get(root) !== root) root = parent.get(root) ?? root
    let cursor = id
    while (parent.get(cursor) !== root) {
      const next = parent.get(cursor)
      parent.set(cursor, root)
      if (!next) break
      cursor = next
    }
    return root
  }
  const union = (left: string, right: string) => {
    const leftRoot = find(left)
    const rightRoot = find(right)
    if (leftRoot !== rightRoot) parent.set(leftRoot, rightRoot)
  }

  for (const edge of edges) {
    const source = resolveRootId(edge.source, nodes)
    const target = resolveRootId(edge.target, nodes)
    if (source !== target && rootIds.has(source) && rootIds.has(target)) union(source, target)
  }

  const groups = new Map<string, TidyNode[]>()
  for (const node of rootNodes) {
    const root = find(node.id)
    const group = groups.get(root)
    if (group) group.push(node)
    else groups.set(root, [node])
  }

  return [...groups.values()]
    .map((group) =>
      group.toSorted((a, b) =>
        Math.abs(a.position.y - b.position.y) > 1 ? a.position.y - b.position.y : a.position.x - b.position.x
      )
    )
    .toSorted((a, b) => {
      const aY = Math.min(...a.map((node) => node.position.y))
      const bY = Math.min(...b.map((node) => node.position.y))
      if (Math.abs(aY - bY) > 1) return aY - bY
      return Math.min(...a.map((node) => node.position.x)) - Math.min(...b.map((node) => node.position.x))
    })
}

function normalize(positions: Map<string, XY>) {
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  for (const position of positions.values()) {
    minX = Math.min(minX, position.x)
    minY = Math.min(minY, position.y)
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return
  for (const position of positions.values()) {
    position.x -= minX
    position.y -= minY
  }
}

/**
 * Tidy the canvas: children stay relative to their group, connected root
 * nodes are laid out together, and disconnected components keep their original
 * top-to-bottom order before being packed into rows.
 */
export async function computeTidyPositions(
  canvasNodes: TidyNode[],
  canvasEdges: TidyEdge[]
): Promise<Record<string, XY>> {
  const rootNodes = canvasNodes.filter((node) => !node.parentId)
  if (rootNodes.length <= 1) return {}

  const nodeMap = new Map(canvasNodes.map((node) => [node.id, node]))
  const components = connectedComponents(rootNodes, canvasEdges, nodeMap)
  const layouts: Array<{ positions: Map<string, XY>; width: number; height: number }> = []
  const elk = await getElk()

  for (const component of components) {
    const ids = new Set(component.map((node) => node.id))
    const edgePairs = new Set<string>()
    const edges = []
    for (const edge of canvasEdges) {
      const source = resolveRootId(edge.source, nodeMap)
      const target = resolveRootId(edge.target, nodeMap)
      const pair = `${source}->${target}`
      if (source === target || !ids.has(source) || !ids.has(target) || edgePairs.has(pair)) continue
      edgePairs.add(pair)
      edges.push({ id: `edge-${source}-${target}`, sources: [source], targets: [target] })
    }

    const graph: ElkNode = {
      id: "root",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": "RIGHT",
        "elk.spacing.nodeNode": String(NODE_GAP),
        "elk.layered.spacing.nodeNodeBetweenLayers": String(NODE_GAP * 2),
        "elk.padding": "[top=0,left=0,bottom=0,right=0]"
      },
      children: component.map((node) => ({
        id: node.id,
        width: Math.max(1, node.size.w),
        height: Math.max(1, node.size.h)
      })),
      edges
    }

    try {
      const result = await elk.layout(graph)
      const positions = new Map<string, XY>()
      for (const child of result.children ?? []) {
        positions.set(child.id, { x: child.x ?? 0, y: child.y ?? 0 })
      }
      normalize(positions)
      let width = 0
      let height = 0
      for (const [id, position] of positions) {
        const node = nodeMap.get(id)
        if (!node) continue
        width = Math.max(width, position.x + node.size.w)
        height = Math.max(height, position.y + node.size.h)
      }
      if (positions.size) layouts.push({ positions, width, height })
    } catch {
      // Keep a failed component untouched; the other components can still tidy.
    }
  }

  const anchorX = snapCoordinate(Math.min(...rootNodes.map((node) => node.position.x)))
  const anchorY = snapCoordinate(Math.min(...rootNodes.map((node) => node.position.y)))
  const positions: Record<string, XY> = {}
  let x = anchorX
  let y = anchorY
  let rowHeight = 0

  for (const layout of layouts) {
    if (x > anchorX && x + layout.width > anchorX + MAX_ROW_WIDTH) {
      x = anchorX
      y += rowHeight + COMPONENT_GAP
      rowHeight = 0
    }
    for (const [id, local] of layout.positions) {
      const node = nodeMap.get(id)
      if (!node) continue
      const next = { x: snapCoordinate(x + local.x), y: snapCoordinate(y + local.y) }
      if (Math.abs(next.x - node.position.x) > 0.5 || Math.abs(next.y - node.position.y) > 0.5) positions[id] = next
    }
    x += layout.width + COMPONENT_GAP
    rowHeight = Math.max(rowHeight, layout.height)
  }

  return positions
}
