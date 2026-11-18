import type { WorkRelation } from "./relations"
import type { Edge, Node, XYPosition } from "@xyflow/react"

/** A layout can show a subset of the same work at independent positions. */
export function projectWorkNodes<T, N extends Node>(
  objects: Readonly<Record<string, T>>,
  positions: Readonly<Record<string, XYPosition>>,
  render: (id: string, object: T, position: XYPosition) => N
): N[] {
  const nodes: N[] = []
  for (const [id, position] of Object.entries(positions)) {
    if (Object.hasOwn(objects, id)) nodes.push(render(id, objects[id], position))
  }
  return nodes
}

export function projectWorkEdges(relations: Readonly<Record<string, WorkRelation>>, visible?: ReadonlySet<string>): Edge[] {
  const edges: Edge[] = []
  for (const { id, source, target } of Object.values(relations)) {
    if (!visible || (visible.has(source) && visible.has(target))) edges.push({ id, source, target })
  }
  return edges
}
