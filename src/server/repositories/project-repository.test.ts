import { afterEach, describe, expect, it } from "vitest"
import { prisma } from "@/lib/db/prisma"
import * as projectRepository from "./project-repository"

const createdUserIds: string[] = []

async function makeUser() {
  const user = await prisma.user.create({
    data: {
      name: "Project Repo Test",
      email: `project-repo-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
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

describe("projectRepository", () => {
  it("creates a project and lists it for its owner", async () => {
    const user = await makeUser()
    const created = await projectRepository.create(user.id, {
      name: "Portfolio site",
      status: "ACTIVE",
    })

    const list = await projectRepository.listByUser(user.id)
    expect(list.map((p) => p.id)).toContain(created.id)
  })

  it("counts a project's open tasks, excluding DONE", async () => {
    const user = await makeUser()
    const project = await projectRepository.create(user.id, { name: "Portfolio", status: "ACTIVE" })
    await prisma.task.createMany({
      data: [
        { userId: user.id, title: "a", projectId: project.id },
        { userId: user.id, title: "b", projectId: project.id, status: "IN_PROGRESS" },
        { userId: user.id, title: "c", projectId: project.id, status: "DONE" },
      ],
    })

    const list = await projectRepository.listByUser(user.id)
    expect(list.find((p) => p.id === project.id)?.openTaskCount).toBe(2)
  })

  it("finds a project by name for its owner", async () => {
    const user = await makeUser()
    await projectRepository.create(user.id, { name: "Learn Rust", status: "IDEA" })
    expect((await projectRepository.findByName(user.id, "Learn Rust"))?.status).toBe("IDEA")
  })

  it("counts a project's tasks for the delete dialog", async () => {
    const user = await makeUser()
    const project = await projectRepository.create(user.id, { name: "P", status: "ACTIVE" })
    await prisma.task.createMany({
      data: [
        { userId: user.id, title: "a", projectId: project.id },
        { userId: user.id, title: "b", projectId: project.id, status: "DONE" },
      ],
    })
    expect(await projectRepository.countTasks(user.id, project.id)).toBe(2)
  })

  it("deleting a project leaves its tasks, unlinked", async () => {
    const user = await makeUser()
    const project = await projectRepository.create(user.id, { name: "P", status: "ACTIVE" })
    const task = await prisma.task.create({
      data: { userId: user.id, title: "Survives", projectId: project.id },
    })

    expect(await projectRepository.remove(user.id, project.id)).toBe(true)

    const after = await prisma.task.findFirst({ where: { id: task.id, userId: user.id } })
    expect(after).not.toBeNull()
    expect(after?.projectId).toBeNull()
  })

  describe("the undefined trap", () => {
    it("clears description and url on update rather than leaving them", async () => {
      const user = await makeUser()
      const project = await projectRepository.create(user.id, {
        name: "P",
        status: "ACTIVE",
        description: "A description",
        url: "https://example.com",
      })
      expect(project.description).toBe("A description")
      expect(project.url).toBe("https://example.com")

      await projectRepository.update(user.id, project.id, { name: "P", status: "ACTIVE" })

      const after = await projectRepository.findById(user.id, project.id)
      expect(after?.description).toBeNull()
      expect(after?.url).toBeNull()
    })
  })

  describe("ownership", () => {
    it("does not list another user's projects", async () => {
      const owner = await makeUser()
      const other = await makeUser()
      await projectRepository.create(owner.id, { name: "P", status: "ACTIVE" })

      expect(await projectRepository.listByUser(other.id)).toHaveLength(0)
    })

    it("does not find another user's project by id", async () => {
      const owner = await makeUser()
      const other = await makeUser()
      const project = await projectRepository.create(owner.id, { name: "P", status: "ACTIVE" })

      expect(await projectRepository.findById(other.id, project.id)).toBeNull()
    })

    it("does not update another user's project", async () => {
      const owner = await makeUser()
      const other = await makeUser()
      const project = await projectRepository.create(owner.id, { name: "P", status: "ACTIVE" })

      expect(
        await projectRepository.update(other.id, project.id, { name: "Hacked", status: "DONE" })
      ).toBeNull()
      expect((await projectRepository.findById(owner.id, project.id))?.name).toBe("P")
    })

    it("does not delete another user's project", async () => {
      const owner = await makeUser()
      const other = await makeUser()
      const project = await projectRepository.create(owner.id, { name: "P", status: "ACTIVE" })

      expect(await projectRepository.remove(other.id, project.id)).toBe(false)
      expect(await projectRepository.findById(owner.id, project.id)).not.toBeNull()
    })
  })
})
