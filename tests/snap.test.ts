import { type Node, NodeChangeset } from "@xyflow/react"
import { expect, test } from "bun:test"

import { NODE_SNAP_THRESHOLD, snapNodeChanges } from "@nyssance/metro/snap"

function node(id: string, position: { x: number; y: number }, size = { w: 100, h: 100 }, parentId?: string): Node {
  return { id, position, parentId, measured: { width: size.w, height: size.h }, data: {} }
}

function drag(...moves: [id: string, position: { x: number; y: number }][]): NodeChangeset<Node> {
  return new NodeChangeset(moves.map(([id, position]) => ({ id, type: "position" as const, position, dragging: true })))
}

test("a dragged node snaps to the edges of the others and the guides are returned", () => {
  const moving = node("moving", { x: 0, y: 0 })
  const target = node("target", { x: 300, y: 300 })
  const changes = drag(["moving", { x: 194, y: 194 }])
  const guides = snapNodeChanges([moving, target], changes)

  expect(changes.getForNode("moving")).toMatchObject([{ position: { x: 200, y: 200 }, dragging: true }])
  expect(guides).toEqual([
    { type: "vertical", x: 300, y1: 194, y2: 400 },
    { type: "horizontal", y: 300, x1: 194, x2: 400 }
  ])
})

test("centre lines snap too, strictly inside the threshold", () => {
  const moving = node("moving", { x: 0, y: 20 })
  const target = node("target", { x: 300, y: 600 }, { w: 120, h: 100 })
  const centered = drag(["moving", { x: 306, y: 20 }])
  expect(snapNodeChanges([moving, target], centered)).toContainEqual({ type: "vertical", x: 360, y1: 20, y2: 700 })
  expect(centered.getForNode("moving")).toMatchObject([{ position: { x: 310, y: 20 } }])

  const exactThreshold = drag(["moving", { x: 192, y: 20 }])
  expect(
    snapNodeChanges(
      [node("moving", { x: 0, y: 20 }), node("target", { x: 300, y: 600 })],
      exactThreshold,
      { threshold: NODE_SNAP_THRESHOLD }
    )
  ).toEqual([])
  expect(exactThreshold.getForNode("moving")).toMatchObject([{ position: { x: 192, y: 20 } }])
})

test("a child snaps by its place on the canvas and is written back relative to its parent", () => {
  const parent = node("parent", { x: 100, y: 100 }, { w: 400, h: 300 })
  const child = node("child", { x: 10, y: 10 }, { w: 50, h: 50 }, "parent")
  const target = node("target", { x: 200, y: 500 })
  const changes = drag(["child", { x: 45, y: 10 }])
  const guides = snapNodeChanges([parent, child, target], changes)

  expect(changes.getForNode("child")).toMatchObject([{ position: { x: 50, y: 10 } }])
  expect(guides).toContainEqual({ type: "vertical", x: 200, y1: 100, y2: 600 })
})

test("nodes dragged together do not snap to one another", () => {
  const first = node("first", { x: 0, y: 0 })
  const second = node("second", { x: 150, y: 0 })
  const distant = node("distant", { x: 1000, y: 1000 })
  const changes = drag(["first", { x: 20, y: 20 }], ["second", { x: 170, y: 20 }])

  expect(snapNodeChanges([first, second, distant], changes)).toEqual([])
  expect(changes.toArray()).toMatchObject([{ position: { x: 20, y: 20 } }, { position: { x: 170, y: 20 } }])
})

test("a node that is not measured yet takes the size it is given", () => {
  const moving: Node = { id: "moving", position: { x: 0, y: 0 }, data: {} }
  const target = node("target", { x: 300, y: 300 })
  const changes = drag(["moving", { x: 194, y: 0 }])
  expect(snapNodeChanges([moving, target], changes, { sizeOf: () => ({ width: 100, height: 100 }) })).toEqual([
    { type: "vertical", x: 300, y1: 0, y2: 400 }
  ])
  expect(changes.getForNode("moving")).toMatchObject([{ position: { x: 200, y: 0 } }])
})
