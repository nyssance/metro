import { expect, test } from "bun:test"

import {
  colorNode,
  connect,
  copyNodes,
  disconnect,
  emptyCanvas,
  fileSection,
  findNodes,
  frameNode,
  groupNodes,
  nodesInside,
  parseCanvas,
  pasteNodes,
  putNode,
  removeNode,
  serializeCanvas
} from "@nyssance/metro/document"

function board() {
  let next = emptyCanvas()
  next = putNode(next, "invoice", { type: "file", file: "finance/invoice-0412.pdf" })
  next = putNode(next, "quote", { type: "link", url: "https://example.com/quote" })
  next = putNode(next, "doubt", { type: "text", text: "The two prices differ" })
  next = putNode(next, "call", { type: "file", file: "notes/call.md", subpath: "#Price" }, { x: -500, y: 10.4 })
  next = connect(next, "invoice", "quote", "same supplier")
  return connect(next, "doubt", "invoice", "")
}

test("a new node takes free space beside the last one, and a placed node goes where it was put", () => {
  const { nodes } = board()
  expect(nodes.map(({ id, x, y }) => [id, x, y])).toEqual([
    ["invoice", 0, 0],
    ["quote", 440, 0],
    ["doubt", 760, 0],
    ["call", -500, 10]
  ])
  const overlaps = nodes.some((a) =>
    nodes.some(
      (b) => a !== b && a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
    )
  )
  expect(overlaps).toBe(false)
  expect(putNode(board(), "area", { type: "group", label: "Supplier" }).nodes[0].id).toBe("area")
})

test("nodes are validated as the format defines them", () => {
  const put = (value: Parameters<typeof putNode>[2]) => () => putNode(emptyCanvas(), "x", value)
  expect(put({ type: "file", file: "/etc/hosts" })).toThrow("inside the project")
  expect(put({ type: "file", file: "a/../../b" })).toThrow("inside the project")
  expect(put({ type: "file", file: "a.md", subpath: "Price" })).toThrow("starting with #")
  expect(put({ type: "link", url: "example.com" })).toThrow("absolute URL")
})

test("replacing what a node is keeps its place and everything else written on it", () => {
  const coloured = parseCanvas(serializeCanvas(board()).replace('"id": "doubt"', '"id": "doubt",\n\t\t\t"color": "1"'))
  const edited = putNode(coloured, "doubt", { type: "link", url: "https://example.com/a" })
  const doubt = edited.nodes.find((node) => node.id === "doubt")!
  expect(doubt).toEqual({
    id: "doubt",
    type: "link",
    url: "https://example.com/a",
    x: 760,
    y: 0,
    width: 280,
    height: 140,
    color: "1"
  })
  expect(frameNode(edited, "doubt", { x: 3.6, width: 199.5 }).nodes.find((node) => node.id === "doubt")).toMatchObject({
    x: 4,
    y: 0,
    width: 200
  })
})

test("two nodes share one edge whichever way it is drawn, and its reason can be replaced or cleared", () => {
  let next = connect(board(), "quote", "invoice", "price mismatch")
  expect(next.edges).toEqual([
    { id: "invoice-quote", fromNode: "invoice", toNode: "quote", toEnd: "none", label: "price mismatch" },
    { id: "doubt-invoice", fromNode: "doubt", toNode: "invoice", toEnd: "none" }
  ])
  next = connect(next, "invoice", "quote", "")
  expect(next.edges[0]).not.toHaveProperty("label")
  expect(disconnect(next, "quote", "invoice").edges.map((edge) => edge.id)).toEqual(["doubt-invoice"])
  expect(() => disconnect(next, "quote", "call")).toThrow("No edge")
  expect(() => connect(next, "quote", "quote", "")).toThrow()
  expect(() => connect(next, "quote", "gone", "")).toThrow("two existing")
  expect(removeNode(next, "invoice").edges).toEqual([])
})

test("a canvas written elsewhere round-trips with the attributes this application does not use", () => {
  const foreign = {
    nodes: [
      {
        id: "g",
        type: "group",
        x: -20,
        y: -20,
        width: 700,
        height: 400,
        label: "Case",
        background: "bg.png",
        backgroundStyle: "cover"
      },
      { id: "a", type: "text", x: 0, y: 0, width: 250, height: 60, text: "# Lead", color: "#FF0000" },
      { id: "b", type: "file", x: 300, y: 0, width: 400, height: 300, file: "notes/call.md", subpath: "#^block" }
    ],
    edges: [
      {
        id: "e",
        fromNode: "a",
        fromSide: "right",
        fromEnd: "arrow",
        toNode: "b",
        toSide: "left",
        color: "4",
        label: "see"
      }
    ]
  }
  expect(parseCanvas(JSON.stringify(foreign))).toEqual(foreign)
  const relabelled = connect(parseCanvas(JSON.stringify(foreign)), "b", "a", "contradicts")
  expect(relabelled.edges[0]).toEqual({ ...foreign.edges[0], label: "contradicts" })
  expect(parseCanvas("{}")).toEqual(emptyCanvas())
  expect(() => parseCanvas(JSON.stringify({ nodes: [{ ...foreign.nodes[1], type: "shape" }] }))).toThrow(
    "Unknown node type"
  )
  expect(() => parseCanvas(JSON.stringify({ edges: foreign.edges }))).toThrow("two existing nodes")
})

test("a hand-drawn edge remembers its sides, a group knows what lies inside it, and colours follow the format", () => {
  let next = connect(board(), "call", "quote", "", { fromSide: "bottom", toSide: "top" })
  expect(next.edges.at(-1)).toEqual({
    id: "call-quote",
    fromNode: "call",
    fromSide: "bottom",
    toNode: "quote",
    toSide: "top",
    toEnd: "none"
  })
  next = frameNode(putNode(next, "area", { type: "group" }), "area", { x: -10, y: -10, width: 760, height: 320 })
  expect(nodesInside(next, "area")).toEqual(["invoice", "quote"])
  expect(nodesInside(next, "invoice")).toEqual([])
  next = colorNode(next, "quote", "4")
  expect(next.nodes.find((node) => node.id === "quote")?.color).toBe("4")
  expect(colorNode(next, "quote", undefined).nodes.find((node) => node.id === "quote")).not.toHaveProperty("color")
  expect(() => colorNode(next, "quote", "red")).toThrow("Invalid colour")
})

test("a subpath narrows a Markdown file to one heading's section or one block", () => {
  const text = [
    "# Call",
    "intro",
    "",
    "## Price",
    "Agreed on 45",
    "### Terms",
    "30 days",
    "## Delivery",
    "April 20",
    "",
    "Paid in full ^paid"
  ].join("\n")
  expect(fileSection(text, "#Price")).toBe("## Price\nAgreed on 45\n### Terms\n30 days")
  expect(fileSection(text, "#Call#Delivery")).toBe("## Delivery\nApril 20\n\nPaid in full ^paid")
  expect(fileSection(text, "#^paid")).toBe("Paid in full ^paid")
  expect(fileSection(text, "#Missing")).toBe(text)
  expect(fileSection(text, undefined)).toBe(text)
})

test("a copy keeps its arrangement and inner edges, takes what its groups contain, and lands where it is put", () => {
  let next = frameNode(putNode(board(), "area", { type: "group", label: "Supplier" }), "area", {
    x: -10,
    y: -10,
    width: 760,
    height: 320
  })
  next = connect(next, "doubt", "call", "")
  const clip = copyNodes(next, ["area", "doubt"])
  expect(clip.nodes.map((node) => node.id)).toEqual(["area", "invoice", "quote", "doubt"])
  expect(clip.edges.map((edge) => edge.id)).toEqual(["invoice-quote", "doubt-invoice"])

  let serial = 0
  const pasted = pasteNodes(next, clip, () => `copy${++serial}`, { x: 2000, y: 500 })
  expect(pasted.ids).toEqual(["copy1", "copy2", "copy3", "copy4"])
  expect(pasted.canvas.nodes[0]).toMatchObject({ id: "copy1", type: "group", x: 2000, y: 500, label: "Supplier" })
  const copy = (id: string) => pasted.canvas.nodes.find((node) => node.id === id)!
  expect([copy("copy2").x, copy("copy2").y]).toEqual([2010, 510])
  expect(copy("copy3").x - copy("copy2").x).toBe(440)
  expect(pasted.canvas.edges.slice(-2)).toMatchObject([
    { id: "copy2-copy3", fromNode: "copy2", toNode: "copy3", label: "same supplier" },
    { id: "copy4-copy2", fromNode: "copy4", toNode: "copy2" }
  ])
  expect(nodesInside(pasted.canvas, "copy1")).toEqual(["copy2", "copy3"])
  expect(pasteNodes(next, copyNodes(next, ["doubt"]), () => "again").canvas.nodes.at(-1)).toMatchObject({ x: 800, y: 40 })
  expect(pasteNodes(next, { nodes: [], edges: [] }, () => "x").canvas).toBe(next)
})

test("a group is drawn around the chosen nodes, and a search matches what they show", () => {
  const next = groupNodes(board(), ["invoice", "quote"], "pair")
  expect(next.nodes[0]).toEqual({ id: "pair", type: "group", x: -24, y: -24, width: 768, height: 348 })
  expect(nodesInside(next, "pair")).toEqual(["invoice", "quote"])
  expect(() => groupNodes(board(), ["gone"], "g")).toThrow("at least one node")
  expect(findNodes(board(), "PRICE")).toEqual(["doubt", "call"])
  expect(findNodes(board(), "example.com")).toEqual(["quote"])
  expect(findNodes(board(), "  ")).toEqual([])
})
