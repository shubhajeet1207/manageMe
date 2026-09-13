import { afterEach, describe, expect, it } from "vitest"
import { prisma } from "@/lib/db/prisma"
import { ProjectNotOwnedError } from "./project-service"
import { ApplicationNotOwnedError } from "./application-service"
import {
  QuickDropItemNotFoundError,
  captureQuickDropItem,
  countQuickDropItems,
  dismissQuickDropItem,
  listQuickDropItems,
  triageQuickDropToLink,
  triageQuickDropToProject,
  triageQuickDropToTask,
} from "./quick-drop-service"

const createdUserIds: string[] = []

async function makeUser() {
  const user = await prisma.user.create({
    data: {
      name: "QuickDrop Service Test",
      email: `qd-svc-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
      hashedPassword: "hashed",
    },
  })
  createdUserIds.push(user.id)
  return user
}

afterEach(async () => {
  if (createdUserIds.length === 0) return
  const ids = [...createdUserIds]
  createdUserIds.length = 0
  await prisma.user.deleteMany({ where: { id: { in: ids } } })
})

describe("capture", () => {
  it("stores one line of content and counts it", async () => {
    const user = await makeUser()
    await captureQuickDropItem(user.id, { content: "https://jobs.example/posting" })

    expect(await countQuickDropItems(user.id)).toBe(1)
    expect((await listQuickDropItems(user.id))[0].content).toBe("https://jobs.example/posting")
  })
})

describe("triage", () => {
  it("turns an item into a task and removes it from the inbox", async () => {
    const user = await makeUser()
    const item = await captureQuickDropItem(user.id, { content: "Send follow-up to Acme" })

    const task = await triageQuickDropToTask(user.id, {
      quickDropItemId: item.id,
      title: "Send follow-up to Acme",
      status: "TODO",
    })

    expect(task.title).toBe("Send follow-up to Acme")
    expect(await countQuickDropItems(user.id)).toBe(0)
  })

  it("turns an item into a link and removes it from the inbox", async () => {
    const user = await makeUser()
    const item = await captureQuickDropItem(user.id, { content: "https://example.com" })

    const link = await triageQuickDropToLink(user.id, {
      quickDropItemId: item.id,
      url: "https://example.com",
      title: "Example",
      tags: [],
    })

    expect(link.url).toBe("https://example.com")
    expect(await countQuickDropItems(user.id)).toBe(0)
  })

  it("turns an item into a project and removes it from the inbox", async () => {
    const user = await makeUser()
    const item = await captureQuickDropItem(user.id, { content: "Spin up a portfolio site" })

    const project = await triageQuickDropToProject(user.id, {
      quickDropItemId: item.id,
      name: "Spin up a portfolio site",
      status: "IDEA",
    })

    expect(project.status).toBe("IDEA")
    expect(await countQuickDropItems(user.id)).toBe(0)
  })

  it("guards a triage that carries another user's projectId, and leaves the item in place", async () => {
    const owner = await makeUser()
    const other = await makeUser()
    const project = await prisma.project.create({
      data: { userId: owner.id, name: "Portfolio site" },
    })
    const item = await captureQuickDropItem(other.id, { content: "Sneak in" })

    await expect(
      triageQuickDropToTask(other.id, {
        quickDropItemId: item.id,
        title: "Sneak in",
        status: "TODO",
        projectId: project.id,
      })
    ).rejects.toBeInstanceOf(ProjectNotOwnedError)

    expect(await countQuickDropItems(other.id)).toBe(1)
    expect(await prisma.task.count({ where: { userId: other.id } })).toBe(0)
  })

  it("guards a triage that carries another user's applicationId", async () => {
    const owner = await makeUser()
    const other = await makeUser()
    const company = await prisma.company.create({ data: { userId: owner.id, name: "Acme" } })
    const application = await prisma.application.create({
      data: { userId: owner.id, companyId: company.id, roleTitle: "Engineer" },
    })
    const item = await captureQuickDropItem(other.id, { content: "Sneak in" })

    await expect(
      triageQuickDropToTask(other.id, {
        quickDropItemId: item.id,
        title: "Sneak in",
        status: "TODO",
        applicationId: application.id,
      })
    ).rejects.toBeInstanceOf(ApplicationNotOwnedError)

    expect(await countQuickDropItems(other.id)).toBe(1)
  })

  it("leaves the item in the inbox when the create half fails", async () => {
    const user = await makeUser()
    await prisma.project.create({ data: { userId: user.id, name: "Portfolio site" } })
    const item = await captureQuickDropItem(user.id, { content: "Portfolio site" })

    // The unique [userId, name] constraint is what makes the create fail here,
    // which is the point: the delete and the create are one transaction, so a
    // failed create must not cost the capture.
    await expect(
      triageQuickDropToProject(user.id, {
        quickDropItemId: item.id,
        name: "Portfolio site",
        status: "IDEA",
      })
    ).rejects.toThrow()

    expect(await countQuickDropItems(user.id)).toBe(1)
  })
})

describe("ownership", () => {
  it("does not list, dismiss or triage another user's item", async () => {
    const owner = await makeUser()
    const other = await makeUser()
    const item = await captureQuickDropItem(owner.id, { content: "Mine" })

    expect(await listQuickDropItems(other.id)).toHaveLength(0)
    expect(await countQuickDropItems(other.id)).toBe(0)
    await expect(dismissQuickDropItem(other.id, item.id)).rejects.toBeInstanceOf(
      QuickDropItemNotFoundError
    )
    await expect(
      triageQuickDropToTask(other.id, {
        quickDropItemId: item.id,
        title: "Stolen",
        status: "TODO",
      })
    ).rejects.toBeInstanceOf(QuickDropItemNotFoundError)

    expect(await countQuickDropItems(owner.id)).toBe(1)
    expect(await prisma.task.count({ where: { userId: other.id } })).toBe(0)
  })

  it("dismisses the owner's own item", async () => {
    const user = await makeUser()
    const item = await captureQuickDropItem(user.id, { content: "Mine" })

    await dismissQuickDropItem(user.id, item.id)
    expect(await countQuickDropItems(user.id)).toBe(0)
  })
})
