import { describe, expect, it } from "vitest"
import { parseTaskFilters, parseTaskStatus, tasksHref } from "./search-params"

describe("parseTaskStatus", () => {
  it("accepts the three real statuses", () => {
    expect(parseTaskStatus("TODO")).toBe("TODO")
    expect(parseTaskStatus("IN_PROGRESS")).toBe("IN_PROGRESS")
    expect(parseTaskStatus("DONE")).toBe("DONE")
  })

  it("rejects an absent or unknown value", () => {
    expect(parseTaskStatus(undefined)).toBeNull()
    expect(parseTaskStatus("")).toBeNull()
    expect(parseTaskStatus("todo")).toBeNull()
    expect(parseTaskStatus("ARCHIVED")).toBeNull()
  })

  it("rejects names inherited through the prototype chain", () => {
    // `value in TaskStatus` walks the prototype chain, so these pass as if they
    // were real statuses — the exact hole the applications table shipped, which
    // became a 500 the moment a later feature indexed with the result.
    expect(parseTaskStatus("toString")).toBeNull()
    expect(parseTaskStatus("constructor")).toBeNull()
    expect(parseTaskStatus("hasOwnProperty")).toBeNull()
    expect(parseTaskStatus("__proto__")).toBeNull()
  })
})

describe("parseTaskFilters", () => {
  it("reads status, project and application", () => {
    expect(
      parseTaskFilters({ status: "DONE", project: "p1", application: "a1" })
    ).toEqual({ status: "DONE", projectId: "p1", applicationId: "a1" })
  })

  it("drops an unknown status rather than passing it to the query", () => {
    expect(parseTaskFilters({ status: "constructor" })).toEqual({})
  })

  it("ignores blank ids", () => {
    expect(parseTaskFilters({ project: "", application: "   " })).toEqual({})
  })

  it("takes the first value when a param repeats", () => {
    expect(parseTaskFilters({ status: ["DONE", "TODO"] })).toEqual({ status: "DONE" })
  })

  it("is empty for an empty query, which is what hides completed tasks", () => {
    expect(parseTaskFilters({})).toEqual({})
  })
})

describe("tasksHref", () => {
  it("builds a bare /tasks with no filters", () => {
    expect(tasksHref({})).toBe("/tasks")
  })

  it("carries every filter it is given, so changing one cannot drop another", () => {
    expect(tasksHref({ status: "DONE", projectId: "p1" })).toBe("/tasks?status=DONE&project=p1")
    expect(tasksHref({ applicationId: "a1" })).toBe("/tasks?application=a1")
  })

  it("encodes an id rather than pasting it into the query", () => {
    expect(tasksHref({ projectId: "a b&c" })).toBe("/tasks?project=a+b%26c")
  })
})
