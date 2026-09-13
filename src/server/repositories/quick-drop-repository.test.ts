import { afterEach, describe, expect, it } from "vitest"
import { prisma } from "@/lib/db/prisma"
import * as quickDropRepository from "./quick-drop-repository"

const createdUserIds: string[] = []

async function makeUser() {
  const user = await prisma.user.create({
    data: {
      name: "QuickDrop Repo Test",
      email: `qd-repo-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
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

describe("quickDropRepository", () => {
  it("creates an item and lists it newest first", async () => {
    const user = await makeUser()
    await quickDropRepository.create(user.id, { content: "first" })
    await quickDropRepository.create(user.id, { content: "second" })

    expect((await quickDropRepository.listByUser(user.id)).map((i) => i.content)).toEqual([
      "second",
      "first",
    ])
  })

  it("counts a user's pending items for the sidebar", async () => {
    const user = await makeUser()
    await quickDropRepository.create(user.id, { content: "a" })
    await quickDropRepository.create(user.id, { content: "b" })

    expect(await quickDropRepository.countByUser(user.id)).toBe(2)
  })

  it("dismisses an item", async () => {
    const user = await makeUser()
    const item = await quickDropRepository.create(user.id, { content: "a" })

    expect(await quickDropRepository.remove(user.id, item.id)).toBe(true)
    expect(await quickDropRepository.countByUser(user.id)).toBe(0)
  })

  describe("conversion is one transaction", () => {
    it("creates the task and removes the inbox row together", async () => {
      const user = await makeUser()
      const item = await quickDropRepository.create(user.id, { content: "Send follow-up" })

      const task = await quickDropRepository.convertToTask(user.id, item.id, {
        title: "Send follow-up",
        status: "TODO",
        completedAt: null,
      })

      expect(task?.title).toBe("Send follow-up")
      expect(await quickDropRepository.findById(user.id, item.id)).toBeNull()
    })

    it("creates the link and removes the inbox row together", async () => {
      const user = await makeUser()
      const item = await quickDropRepository.create(user.id, { content: "https://example.com" })

      const link = await quickDropRepository.convertToLink(user.id, item.id, {
        url: "https://example.com",
        title: "Example",
        tags: ["prep"],
      })

      expect(link?.url).toBe("https://example.com")
      expect(await quickDropRepository.findById(user.id, item.id)).toBeNull()
    })

    it("creates the project and removes the inbox row together", async () => {
      const user = await makeUser()
      const item = await quickDropRepository.create(user.id, { content: "Portfolio site" })

      const project = await quickDropRepository.convertToProject(user.id, item.id, {
        name: "Portfolio site",
        status: "IDEA",
      })

      expect(project?.status).toBe("IDEA")
      expect(await quickDropRepository.findById(user.id, item.id)).toBeNull()
    })

    it("leaves the item in the inbox when the create fails", async () => {
      const user = await makeUser()
      await prisma.project.create({ data: { userId: user.id, name: "Taken" } })
      const item = await quickDropRepository.create(user.id, { content: "Taken" })

      // The unique [userId, name] constraint makes the create fail inside the
      // transaction; the delete must roll back with it rather than losing the
      // capture.
      await expect(
        quickDropRepository.convertToProject(user.id, item.id, {
          name: "Taken",
          status: "IDEA",
        })
      ).rejects.toThrow()

      expect(await quickDropRepository.findById(user.id, item.id)).not.toBeNull()
    })
  })

  describe("ownership", () => {
    it("does not list, read, dismiss or convert another user's item", async () => {
      const owner = await makeUser()
      const other = await makeUser()
      const item = await quickDropRepository.create(owner.id, { content: "secret capture" })

      expect(await quickDropRepository.listByUser(other.id)).toHaveLength(0)
      expect(await quickDropRepository.countByUser(other.id)).toBe(0)
      expect(await quickDropRepository.findById(other.id, item.id)).toBeNull()
      expect(await quickDropRepository.remove(other.id, item.id)).toBe(false)
      expect(
        await quickDropRepository.convertToTask(other.id, item.id, {
          title: "Hijacked",
          status: "TODO",
          completedAt: null,
        })
      ).toBeNull()

      expect(await quickDropRepository.findById(owner.id, item.id)).not.toBeNull()
      expect(await prisma.task.count({ where: { userId: other.id } })).toBe(0)
    })
  })
})
