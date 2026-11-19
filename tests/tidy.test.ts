import { SNAP_GRID_SIZE } from "@nyssance/metro/grid"
import { computeTidyPositions, type TidyEdge, type TidyNode } from "@nyssance/metro/tidy"
import { expect, test } from "bun:test"

function node(id: string, x: number, y: number, parentId?: string): TidyNode {
  return { id, position: { x, y }, size: { w: 200, h: 120 }, parentId }
}

test("linked nodes are laid out left to right on the grid", async () => {
  const nodes = [node("a", 913, 407), node("b", 115, 93), node("c", 512, 711)]
  const edges: TidyEdge[] = [
    { source: "a", target: "b" },
    { source: "b", target: "c" }
  ]

  const positions = await computeTidyPositions(nodes, edges)

  expect(Object.keys(positions)).toHaveLength(3)
  expect(positions.a.x).toBeLessThan(positions.b.x)
  expect(positions.b.x).toBeLessThan(positions.c.x)
  for (const position of Object.values(positions)) {
    expect(position.x % SNAP_GRID_SIZE).toBe(0)
    expect(position.y % SNAP_GRID_SIZE).toBe(0)
  }
})

test("an edge from a child counts for its group, and the child keeps its place inside it", async () => {
  const nodes = [node("group", 400, 300), node("child", 20, 30, "group"), node("target", 40, 900)]
  const edges: TidyEdge[] = [{ source: "child", target: "target" }]

  const positions = await computeTidyPositions(nodes, edges)

  expect(positions.child).toBeUndefined()
  expect(positions.group.x).toBeLessThan(positions.target.x)
})
