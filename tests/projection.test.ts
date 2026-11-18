import { expect, test } from "bun:test"
import { projectWorkNodes, projectWorkEdges } from "@alwith/workflow/projection"

test("a partial layout leaves work relations intact", () => {
  const objects = { brief: "Brief", review: "Review" }
  const edges = { input: { id: "input", source: "brief", target: "review" } }
  const nodes = projectWorkNodes(objects, { brief: { x: 0, y: 0 } }, (id, label, position) => ({
    id, data: { label }, position
  }))
  expect(nodes.map(node => node.id)).toEqual(["brief"])
  expect(projectWorkEdges(edges, new Set(nodes.map(node => node.id)))).toEqual([])
  expect(projectWorkEdges(edges)).toEqual([edges.input])
})
