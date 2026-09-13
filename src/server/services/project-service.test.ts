import { afterEach, describe, expect, it } from "vitest"
import { prisma } from "@/lib/db/prisma"
import {
  ProjectNameTakenError,
  ProjectNotFoundError,
  ProjectNotOwnedError,
  assertProjectOwned,
  countProjectTasks,
  createProject,
  deleteProject,
  getProject,
  listProjects,
  updateProject,
} from "./project-service"

const createdUserIds: string[] = []

async function makeUser() {
  const user = await prisma.user.create({
    data: {
      name: "Project Service Test",
      email: `proj-svc-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
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

describe("createProject", () => {
  it("creates a project with its defaults", async () => {
    const user = await makeUser()
    const project = await createProject(user.id, { name: "Portfolio site", status: "ACTIVE" })

    expect(project.name).toBe("Portfolio site")
    expect(project.status).toBe("ACTIVE")
    expect(project.description).toBeNull()
  })

  it("refuses a name the user already has", async () => {
    const user = await makeUser()
    await createProject(user.id, { name: "Portfolio site", status: "ACTIVE" })

    await expect(
      createProject(user.id, { name: "Portfolio site", status: "IDEA" })
    ).rejects.toBeInstanceOf(ProjectNameTakenError)
  })

  it("lets two users hold the same project name", async () => {
    const first = await makeUser()
    const second = await makeUser()
    await createProject(first.id, { name: "Portfolio site", status: "ACTIVE" })

    await expect(
      createProject(second.id, { name: "Portfolio site", status: "ACTIVE" })
    ).resolves.toBeDefined()
  })
})

describe("updateProject", () => {
  it("clears description and url rather than leaving the old values", async () => {
    const user = await makeUser()
    const project = await createProject(user.id, {
      name: "Portfolio site",
      status: "ACTIVE",
      description: "A plan",
      url: "https://example.com",
    })

    await updateProject(user.id, project.id, { name: "Portfolio site", status: "ACTIVE" })

    const after = await getProject(user.id, project.id)
    expect(after.description).toBeNull()
    expect(after.url).toBeNull()
  })

  it("refuses a name another of the user's projects already holds", async () => {
    const user = await makeUser()
    await createProject(user.id, { name: "Portfolio site", status: "ACTIVE" })
    const second = await createProject(user.id, { name: "Learn Rust", status: "IDEA" })

    await expect(
      updateProject(user.id, second.id, { name: "Portfolio site", status: "IDEA" })
    ).rejects.toBeInstanceOf(ProjectNameTakenError)
  })

  it("keeps its own name on an edit that does not change it", async () => {
    const user = await makeUser()
    const project = await createProject(user.id, { name: "Portfolio site", status: "ACTIVE" })

    const updated = await updateProject(user.id, project.id, {
      name: "Portfolio site",
      status: "PAUSED",
    })
    expect(updated.status).toBe("PAUSED")
  })
})

describe("listProjects", () => {
  it("filters by status and counts only open tasks", async () => {
    const user = await makeUser()
    const active = await createProject(user.id, { name: "Portfolio site", status: "ACTIVE" })
    await createProject(user.id, { name: "Learn Rust", status: "IDEA" })

    await prisma.task.create({ data: { userId: user.id, title: "A", projectId: active.id } })
    await prisma.task.create({
      data: { userId: user.id, title: "B", projectId: active.id, status: "DONE" },
    })

    const all = await listProjects(user.id)
    expect(all).toHaveLength(2)

    const filtered = await listProjects(user.id, "ACTIVE")
    expect(filtered).toHaveLength(1)
    expect(filtered[0].openTaskCount).toBe(1)
  })
})

describe("deleteProject", () => {
  it("unlinks its tasks instead of deleting them", async () => {
    const user = await makeUser()
    const project = await createProject(user.id, { name: "Portfolio site", status: "ACTIVE" })
    const task = await prisma.task.create({
      data: { userId: user.id, title: "Ship it", projectId: project.id },
    })

    expect(await countProjectTasks(user.id, project.id)).toBe(1)
    await deleteProject(user.id, project.id)

    const after = await prisma.task.findUnique({ where: { id: task.id } })
    expect(after).not.toBeNull()
    expect(after?.projectId).toBeNull()
  })
})

describe("ownership", () => {
  it("does not read, update or delete another user's project", async () => {
    const owner = await makeUser()
    const other = await makeUser()
    const project = await createProject(owner.id, { name: "Portfolio site", status: "ACTIVE" })

    await expect(getProject(other.id, project.id)).rejects.toBeInstanceOf(ProjectNotFoundError)
    await expect(
      updateProject(other.id, project.id, { name: "Hacked", status: "DONE" })
    ).rejects.toBeInstanceOf(ProjectNotFoundError)
    await expect(deleteProject(other.id, project.id)).rejects.toBeInstanceOf(ProjectNotFoundError)
    expect(await listProjects(other.id)).toHaveLength(0)

    const survived = await getProject(owner.id, project.id)
    expect(survived.name).toBe("Portfolio site")
  })

  it("assertProjectOwned refuses another user's project with the not-found wording", async () => {
    const owner = await makeUser()
    const other = await makeUser()
    const project = await createProject(owner.id, { name: "Portfolio site", status: "ACTIVE" })

    await expect(assertProjectOwned(other.id, project.id)).rejects.toBeInstanceOf(
      ProjectNotOwnedError
    )
    await expect(assertProjectOwned(other.id, project.id)).rejects.toThrow("Project not found")
    await expect(assertProjectOwned(owner.id, project.id)).resolves.toBeUndefined()
  })
})
