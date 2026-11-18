import { expect, test } from "bun:test"

import { findRelation, inspectDependencies, resolveInputs } from "@nyssance/metro"

test("a quote can use attachments without a canvas and retain legacy binding order", () => {
  const objects = { email: "supplier quote", sheet: "price list" }
  const relations = {
    a: { id: "a", source: "sheet", target: "quote" },
    b: { id: "b", source: "email", target: "quote" },
    c: { id: "c", source: "sheet", target: "quote" },
    d: { id: "d", source: "removed", target: "quote" },
    e: { id: "e", source: "email", target: "reply" }
  }
  expect(resolveInputs(objects, relations, "quote", (text) => text)).toEqual(["price list", "supplier quote"])
  expect(findRelation(relations, "sheet", "quote")).toBe(relations.a)
})

test("inspection preserves independent paths, direct references and approval cycles", () => {
  const links = [
    { source: "quote", target: "review" },
    { source: "quote", target: "archive" },
    { source: "review", target: "send" },
    { source: "archive", target: "send" },
    { source: "review", target: "quote" }
  ]
  const graph = inspectDependencies(links, "quote")
  expect(graph.upstream).toEqual([links[4]])
  expect(graph.downstream).toEqual(links.slice(0, 2))
  expect(graph.impact).toEqual([
    { relation: links[0], depth: 1 },
    { relation: links[1], depth: 1 },
    { relation: links[2], depth: 2 }
  ])
})

test("input resolution preserves zero and ignores inherited keys", () => {
  const relations = {
    a: { id: "a", source: "quantity", target: "invoice" },
    b: { id: "b", source: "constructor", target: "invoice" }
  }
  expect(resolveInputs({ quantity: 0 }, relations, "invoice", (value) => value)).toEqual([0])
})
