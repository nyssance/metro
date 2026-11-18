export interface WorkObject<Kind extends string, Content> {
  id: string
  type: Kind
  content: Content
}

/** Object identity and dependency direction do not depend on a canvas or its layout. */
export interface WorkRelation {
  id: string
  source: string
  target: string
}

export function findRelation<R extends WorkRelation>(relations: Record<string, R>, source: string, target: string) {
  return Object.values(relations).find((relation) => relation.source === source && relation.target === target)
}

/** Resolve each source once, in binding order. A view supplies its own output projection. */
export function resolveInputs<ObjectType, Input>(
  objects: Readonly<Record<string, ObjectType>>,
  relations: Readonly<Record<string, WorkRelation>>,
  target: string,
  project: (object: ObjectType) => Input | undefined
): Input[] {
  const result: Input[] = []
  const seen = new Set<string>()
  for (const relation of Object.values(relations)) {
    if (relation.target !== target || seen.has(relation.source)) continue
    seen.add(relation.source)
    const object = objects[relation.source]
    if (!Object.hasOwn(objects, relation.source)) continue
    const input = project(object)
    if (input !== undefined) result.push(input)
  }
  return result
}

/** Neighbors for a human or agent view, preserving the original binding order. */
export function relatedObjects(relations: Readonly<Record<string, WorkRelation>>) {
  const neighbors = new Map<string, Set<string>>()
  function link(from: string, to: string) {
    const targets = neighbors.get(from)
    if (targets) targets.add(to)
    else neighbors.set(from, new Set([to]))
  }
  for (const { source, target } of Object.values(relations)) {
    link(source, target)
    link(target, source)
  }
  return neighbors
}

export function setRelation<R extends WorkRelation>(relations: Record<string, R>, relation: R): Record<string, R> {
  return { ...relations, [relation.id]: relation }
}

export function removeRelation<R extends WorkRelation>(relations: Record<string, R>, id: string): Record<string, R> {
  const next = { ...relations }
  delete next[id]
  return next
}

/** Inspect dependency evidence without executing tasks. Cycles are valid in reference graphs. */
export function inspectDependencies<R extends Pick<WorkRelation, "source" | "target">>(relations: readonly R[], id: string) {
  const upstream: R[] = []
  const outgoing = new Map<string, R[]>()
  for (const relation of relations) {
    if (relation.target === id) upstream.push(relation)
    const entries = outgoing.get(relation.source)
    if (entries) entries.push(relation)
    else outgoing.set(relation.source, [relation])
  }
  const visited = new Set([id])
  const impact: Array<{ relation: R; depth: number }> = []
  const queue = [{ id, depth: 0 }]
  for (const current of queue) {
    for (const relation of outgoing.get(current.id) ?? []) {
      if (visited.has(relation.target)) continue
      visited.add(relation.target)
      const depth = current.depth + 1
      impact.push({ relation, depth })
      queue.push({ id: relation.target, depth })
    }
  }
  return { upstream, downstream: outgoing.get(id) ?? [], visited, impact }
}
