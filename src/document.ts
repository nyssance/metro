/**
 * A canvas document in the JSON Canvas 1.0 format (https://jsoncanvas.org/spec/1.0/), so the same
 * file opens in any application that reads it. Attributes an application does not use, such as
 * colours, edge sides or another application's own data, are kept exactly as they were written.
 */
interface NodeBase {
  id: string
  x: number
  y: number
  width: number
  height: number
  [attribute: string]: unknown
}
/** Markdown text: a note, or an excerpt followed by a link to where it comes from. */
interface TextNode extends NodeBase {
  type: "text"
  text: string
}
/** A project file shown as itself; `subpath` narrows it to a heading or block and starts with `#`. */
interface FileNode extends NodeBase {
  type: "file"
  file: string
  subpath?: string
}
interface LinkNode extends NodeBase {
  type: "link"
  url: string
}
/** A visual container for the nodes inside its rectangle. */
interface GroupNode extends NodeBase {
  type: "group"
  label?: string
}
export type CanvasNode = TextNode | FileNode | LinkNode | GroupNode
/** Someone's judgement that two nodes are related, with the reason in `label`. */
interface CanvasEdge {
  id: string
  fromNode: string
  toNode: string
  label?: string
  [attribute: string]: unknown
}
/** Nodes are in ascending z-order: the last is drawn on top. */
export interface CanvasDocument {
  nodes: CanvasNode[]
  edges: CanvasEdge[]
  [attribute: string]: unknown
}
/** What a node is, without where it sits. */
export type CanvasContent =
  | { type: "text"; text: string }
  | { type: "file"; file: string; subpath?: string }
  | { type: "link"; url: string }
  | { type: "group"; label?: string }

const SIZES = { text: [280, 140], file: [400, 300], link: [280, 100], group: [600, 400] } as const
const GAP = 40
const ROW_WIDTH = 1400

export function emptyCanvas(): CanvasDocument {
  return { nodes: [], edges: [] }
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`Invalid ${label}`)
  return value as Record<string, unknown>
}

function content(value: Record<string, unknown>, id: string): CanvasContent {
  const { type, text, file, subpath, url, label } = value
  if (type === "text") {
    if (typeof text !== "string") throw new Error(`Text node ${id} needs text`)
    return { type, text }
  }
  if (type === "file") {
    if (typeof file !== "string" || file === "" || file.startsWith("/") || file.split(/[\\/]/).includes(".."))
      throw new Error(`File node ${id} needs a path inside the project`)
    if (subpath !== undefined && (typeof subpath !== "string" || !subpath.startsWith("#")))
      throw new Error(`File node ${id} needs a subpath starting with #`)
    return subpath === undefined ? { type, file } : { type, file, subpath }
  }
  if (type === "link") {
    if (typeof url !== "string" || !URL.canParse(url)) throw new Error(`Link node ${id} needs an absolute URL`)
    return { type, url }
  }
  if (type === "group") {
    if (label !== undefined && typeof label !== "string") throw new Error(`Group node ${id} has an invalid label`)
    return label === undefined ? { type } : { type, label }
  }
  throw new Error(`Unknown node type: ${String(type)}`)
}

/** Parse a canvas file. Anything that is not this format is rejected whole. */
export function parseCanvas(text: string): CanvasDocument {
  const raw = record(JSON.parse(text), "canvas file")
  const nodes = raw.nodes ?? []
  const edges = raw.edges ?? []
  if (!Array.isArray(nodes) || !Array.isArray(edges)) throw new Error("Invalid canvas file")
  const ids = new Set<string>()
  const canvas: CanvasDocument = { ...raw, nodes: [], edges: [] }
  for (const value of nodes as unknown[]) {
    const node = record(value, "canvas node")
    const { id, x, y, width, height } = node
    if (typeof id !== "string" || id === "" || ids.has(id)) throw new Error("A canvas node needs a unique id")
    if (![x, y, width, height].every(Number.isFinite)) throw new Error(`Node ${id} needs a position and a size`)
    ids.add(id)
    canvas.nodes.push({ ...node, ...content(node, id) } as CanvasNode)
  }
  for (const value of edges as unknown[]) {
    const edge = record(value, "canvas edge")
    const { id, fromNode, toNode, label } = edge
    if (typeof id !== "string" || id === "") throw new Error("A canvas edge needs an id")
    if (typeof fromNode !== "string" || typeof toNode !== "string" || !ids.has(fromNode) || !ids.has(toNode))
      throw new Error(`Edge ${id} needs two existing nodes`)
    if (label !== undefined && typeof label !== "string") throw new Error(`Edge ${id} has an invalid label`)
    canvas.edges.push(edge as CanvasEdge)
  }
  return canvas
}

export function serializeCanvas(canvas: CanvasDocument): string {
  return `${JSON.stringify(canvas, null, "\t")}\n`
}

/** Free space after the lowest row, wrapping to a new row below everything, so nothing already placed is covered. */
function freeFrame(canvas: CanvasDocument, type: CanvasContent["type"]) {
  const [width, height] = SIZES[type]
  if (canvas.nodes.length === 0) return { x: 0, y: 0, width, height }
  const left = Math.min(...canvas.nodes.map((node) => node.x))
  const top = Math.max(...canvas.nodes.map((node) => node.y))
  const x =
    Math.max(...canvas.nodes.filter((node) => node.y + node.height > top).map((node) => node.x + node.width)) + GAP
  return x + width <= left + ROW_WIDTH
    ? { x, y: top, width, height }
    : { x: left, y: Math.max(...canvas.nodes.map((node) => node.y + node.height)) + GAP, width, height }
}

/**
 * Add a node, or replace what an existing one is while it keeps its place. A new node without a
 * position is set out to the right of the last added row; a group goes beneath the others.
 */
export function putNode(
  canvas: CanvasDocument,
  id: string,
  value: CanvasContent,
  position?: { x: number; y: number }
): CanvasDocument {
  const next = content(value, id)
  const index = canvas.nodes.findIndex((node) => node.id === id)
  if (index !== -1) {
    const { text: _text, file: _file, subpath: _subpath, url: _url, label: _label, ...kept } = canvas.nodes[index]
    const nodes = canvas.nodes.with(index, { ...kept, ...next } as CanvasNode)
    return { ...canvas, nodes }
  }
  const frame = freeFrame(canvas, next.type)
  const node = {
    id,
    ...next,
    x: Math.round(position?.x ?? frame.x),
    y: Math.round(position?.y ?? frame.y),
    width: frame.width,
    height: frame.height
  } as CanvasNode
  return { ...canvas, nodes: next.type === "group" ? [node, ...canvas.nodes] : [...canvas.nodes, node] }
}

/** Remove a node with its edges. */
export function removeNode(canvas: CanvasDocument, id: string): CanvasDocument {
  if (!canvas.nodes.some((node) => node.id === id)) throw new Error(`Unknown node: ${id}`)
  return {
    ...canvas,
    nodes: canvas.nodes.filter((node) => node.id !== id),
    edges: canvas.edges.filter((edge) => edge.fromNode !== id && edge.toNode !== id)
  }
}

/** Move or resize a node. The format stores whole pixels. */
export function frameNode(
  canvas: CanvasDocument,
  id: string,
  frame: Partial<Pick<CanvasNode, "x" | "y" | "width" | "height">>
): CanvasDocument {
  const index = canvas.nodes.findIndex((node) => node.id === id)
  if (index === -1) throw new Error(`Unknown node: ${id}`)
  const rounded = Object.fromEntries(Object.entries(frame).map(([side, value]) => [side, Math.round(value)]))
  return { ...canvas, nodes: canvas.nodes.with(index, { ...canvas.nodes[index], ...rounded } as CanvasNode) }
}

function edgeBetween(canvas: CanvasDocument, a: string, b: string): CanvasEdge | undefined {
  return canvas.edges.find(
    (edge) => (edge.fromNode === a && edge.toNode === b) || (edge.fromNode === b && edge.toNode === a)
  )
}

export type CanvasSide = "top" | "right" | "bottom" | "left"

/**
 * Relate two nodes, or replace the reason on the edge they already share, whichever way it was
 * drawn. A new edge has no arrowhead: it says the two belong together, not that one leads to the
 * other. `sides` records where a hand-drawn edge leaves and arrives.
 */
export function connect(
  canvas: CanvasDocument,
  from: string,
  to: string,
  label: string,
  sides?: { fromSide: CanvasSide; toSide: CanvasSide }
): CanvasDocument {
  if (from === to) throw new Error("A node cannot connect to itself")
  if (![from, to].every((id) => canvas.nodes.some((node) => node.id === id)))
    throw new Error("An edge needs two existing nodes")
  const existing = edgeBetween(canvas, from, to)
  const { label: _label, ...edge } = existing ?? {
    id: `${from}-${to}`,
    fromNode: from,
    ...(sides ? { fromSide: sides.fromSide } : {}),
    toNode: to,
    ...(sides ? { toSide: sides.toSide } : {}),
    toEnd: "none"
  }
  const next = (label ? { ...edge, label } : edge) as CanvasEdge
  return { ...canvas, edges: existing ? canvas.edges.with(canvas.edges.indexOf(existing), next) : [...canvas.edges, next] }
}

export function disconnect(canvas: CanvasDocument, from: string, to: string): CanvasDocument {
  const existing = edgeBetween(canvas, from, to)
  if (!existing) throw new Error(`No edge between ${from} and ${to}`)
  return { ...canvas, edges: canvas.edges.filter((edge) => edge !== existing) }
}

/** The nodes a group contains: those lying wholly inside its rectangle. */
export function nodesInside(canvas: CanvasDocument, groupId: string): string[] {
  const group = canvas.nodes.find((node) => node.id === groupId)
  if (group?.type !== "group") return []
  return canvas.nodes
    .filter(
      (node) =>
        node !== group &&
        node.x >= group.x &&
        node.y >= group.y &&
        node.x + node.width <= group.x + group.width &&
        node.y + node.height <= group.y + group.height
    )
    .map((node) => node.id)
}

/** Set or clear a node's colour: a preset "1" to "6", or a hex colour. */
export function colorNode(canvas: CanvasDocument, id: string, color: string | undefined): CanvasDocument {
  const index = canvas.nodes.findIndex((node) => node.id === id)
  if (index === -1) throw new Error(`Unknown node: ${id}`)
  if (color !== undefined && !/^([1-6]|#[\da-f]{6})$/i.test(color)) throw new Error(`Invalid colour: ${color}`)
  const { color: _color, ...node } = canvas.nodes[index]
  return { ...canvas, nodes: canvas.nodes.with(index, (color ? { ...node, color } : node) as CanvasNode) }
}

/**
 * The part of a Markdown file a subpath points at: `#Heading` is that heading with everything
 * under it, `#^id` is the block ending with that marker. The whole text when it is not found.
 */
export function fileSection(text: string, subpath: string | undefined): string {
  if (!subpath) return text
  const lines = text.split("\n")
  if (subpath.startsWith("#^")) {
    const end = lines.findIndex((line) => line.trimEnd().endsWith(subpath.slice(1)))
    if (end === -1) return text
    let start = end
    while (start > 0 && lines[start - 1].trim() !== "") start--
    return lines.slice(start, end + 1).join("\n")
  }
  const wanted = subpath.slice(1).split("#").at(-1)!.trim().toLowerCase()
  const heading = (line: string) => /^(#{1,6})\s+(.*?)\s*$/.exec(line)
  const start = lines.findIndex((line) => heading(line)?.[2].toLowerCase() === wanted)
  if (start === -1) return text
  const level = heading(lines[start])![1].length
  const next = lines.findIndex((line, index) => index > start && (heading(line)?.[1].length ?? 7) <= level)
  return lines.slice(start, next === -1 ? undefined : next).join("\n")
}
