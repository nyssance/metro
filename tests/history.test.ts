import { expect, test } from "bun:test"

import { createHistory } from "@nyssance/metro/history"

function canvas() {
  let state = { nodes: ["a"], edges: [] as string[] }
  const writes: (typeof state)[] = []
  const history = createHistory({
    read: () => ({ ...state }),
    write: (snapshot) => {
      writes.push(snapshot)
      state = snapshot
    },
    limit: 3,
    mergeMs: 50
  })
  return {
    history,
    writes,
    get: () => state,
    set: (next: Partial<typeof state>) => {
      state = { ...state, ...next }
    }
  }
}

test("undo and redo step through the captured states", () => {
  const { history, get, set } = canvas()
  history.captureUndo()
  set({ nodes: ["a", "b"] })
  history.captureUndo()
  set({ edges: ["a-b"] })
  expect(history.undo()).toBe(true)
  expect(get()).toEqual({ nodes: ["a", "b"], edges: [] })
  expect(history.undo()).toBe(true)
  expect(get()).toEqual({ nodes: ["a"], edges: [] })
  expect(history.undo()).toBe(false)
  expect(history.redo()).toBe(true)
  expect(history.redo()).toBe(true)
  expect(get()).toEqual({ nodes: ["a", "b"], edges: ["a-b"] })
  expect(history.canRedo()).toBe(false)
})

test("a repeated capture adds no empty step, and same-label captures in the window are one step", async () => {
  const { history, set } = canvas()
  history.captureUndo()
  history.captureUndo()
  expect(history.undoDepth()).toBe(1)
  set({ nodes: ["a", "b"] })
  history.captureUndo("delete")
  set({ nodes: ["a"] })
  history.captureUndo("delete")
  expect(history.undoDepth()).toBe(2)
  await Bun.sleep(60)
  set({ nodes: [] })
  history.captureUndo("delete")
  expect(history.undoDepth()).toBe(3)
})

test("a batch is one step, authoritative writes make none, and the stack is bounded and resettable", () => {
  const { history, set, get } = canvas()
  history.withUndoBatch(() => {
    set({ nodes: ["a", "b"] })
    history.captureUndo()
    set({ nodes: ["a", "b", "c"] })
  })
  expect(history.undoDepth()).toBe(1)
  history.withoutUndo(() => history.captureUndo())
  expect(history.undoDepth()).toBe(1)
  history.undo()
  expect(get().nodes).toEqual(["a"])
  for (let step = 0; step < 6; step++) {
    history.captureUndo()
    set({ edges: [String(step)] })
  }
  expect(history.undoDepth()).toBe(3)
  history.resetUndo()
  expect(history.canUndo()).toBe(false)
})
