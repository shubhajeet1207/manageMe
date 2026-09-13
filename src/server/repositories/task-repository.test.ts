import { afterEach, describe, expect, it } from "vitest"
import { prisma } from "@/lib/db/prisma"
import * as taskRepository from "./task-repository"

const createdUserIds: string[] = []

async function makeUser() {
  const user = await prisma.user.create({
    data: {
      name: "Task Repo Test",
      email: `task-repo-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
      hashedPassword: "hashed",
    },
  })
  createdUserIds.push(user.id)
  return user
}

async function makeApplication(userId: string) {
  const company = await prisma.company.create({
    data: { userId, name: `Acme ${Math.random().toString(36).slice(2, 8)}` },
  })
  return prisma.application.create({
    data: { userId, companyId: company.id, roleTitle: "Engineer" },
  })
}

afterEach(async () => {
  if (createdUserIds.length === 0) return
  const ids = [...createdUserIds]
  createdUserIds.length = 0
  await prisma.user.deleteMany({ where: { id: { in: ids } } })
})

const DAY = (value: string) => new Date(`${value}T00:00:00.000Z`)

describe("taskRepository", () => {
  it("creates a task and lists it for its owner", async () => {
    const user = await makeUser()
    const created = await taskRepository.create(user.id, {
      title: "Send follow-up",
      status: "TODO",
      completedAt: null,
    })

    const list = await taskRepository.listByUser(user.id, {})
    expect(list.map((t) => t.id)).toContain(created.id)
  })

  it("stores a due date at UTC midnight and reads it back the same day", async () => {
    const user = await makeUser()
    const created = await taskRepository.create(user.id, {
      title: "x",
      status: "TODO",
      dueDate: DAY("2026-09-14"),
      completedAt: null,
    })
    expect(created.dueDate?.toISOString()).toBe("2026-09-14T00:00:00.000Z")
  })

  it("sorts by due date ascending with no-due-date last", async () => {
    const user = await makeUser()
    await taskRepository.create(user.id, { title: "none", status: "TODO", completedAt: null })
    await taskRepository.create(user.id, {
      title: "later",
      status: "TODO",
      dueDate: DAY("2026-12-01"),
      completedAt: null,
    })
    await taskRepository.create(user.id, {
      title: "sooner",
      status: "TODO",
      dueDate: DAY("2026-01-01"),
      completedAt: null,
    })

    const list = await taskRepository.listByUser(user.id, {})
    expect(list.map((t) => t.title)).toEqual(["sooner", "later", "none"])
  })

  it("excludes DONE tasks by default and returns them when asked", async () => {
    const user = await makeUser()
    await taskRepository.create(user.id, { title: "open", status: "TODO", completedAt: null })
    await taskRepository.create(user.id, {
      title: "finished",
      status: "DONE",
      completedAt: new Date(),
    })

    expect((await taskRepository.listByUser(user.id, {})).map((t) => t.title)).toEqual(["open"])
    expect(
      (await taskRepository.listByUser(user.id, { status: "DONE" })).map((t) => t.title)
    ).toEqual(["finished"])
  })

  it("filters by project and by application", async () => {
    const user = await makeUser()
    const project = await prisma.project.create({ data: { userId: user.id, name: "P" } })
    const application = await makeApplication(user.id)

    await taskRepository.create(user.id, {
      title: "on project",
      status: "TODO",
      projectId: project.id,
      completedAt: null,
    })
    await taskRepository.create(user.id, {
      title: "on application",
      status: "TODO",
      applicationId: application.id,
      completedAt: null,
    })
    await taskRepository.create(user.id, { title: "loose", status: "TODO", completedAt: null })

    expect(
      (await taskRepository.listByUser(user.id, { projectId: project.id })).map((t) => t.title)
    ).toEqual(["on project"])
    expect(
      (await taskRepository.listByUser(user.id, { applicationId: application.id })).map(
        (t) => t.title
      )
    ).toEqual(["on application"])
  })

  it("carries the context each row renders as a chip", async () => {
    const user = await makeUser()
    const application = await makeApplication(user.id)
    await taskRepository.create(user.id, {
      title: "chip",
      status: "TODO",
      applicationId: application.id,
      completedAt: null,
    })

    const [task] = await taskRepository.listByUser(user.id, {})
    expect(task.application?.roleTitle).toBe("Engineer")
    expect(task.application?.company.name).toContain("Acme")
  })

  it("counts open tasks per application in one grouped query", async () => {
    const user = await makeUser()
    const first = await makeApplication(user.id)
    const second = await makeApplication(user.id)

    await taskRepository.create(user.id, {
      title: "a",
      status: "TODO",
      applicationId: first.id,
      completedAt: null,
    })
    await taskRepository.create(user.id, {
      title: "b",
      status: "IN_PROGRESS",
      applicationId: first.id,
      completedAt: null,
    })
    await taskRepository.create(user.id, {
      title: "c",
      status: "DONE",
      applicationId: first.id,
      completedAt: new Date(),
    })
    await taskRepository.create(user.id, {
      title: "d",
      status: "TODO",
      applicationId: second.id,
      completedAt: null,
    })

    const counts = await taskRepository.countOpenByApplication(user.id)
    expect(counts.get(first.id)).toBe(2)
    expect(counts.get(second.id)).toBe(1)
  })

  it("sets and clears completedAt through setDone", async () => {
    const user = await makeUser()
    const task = await taskRepository.create(user.id, {
      title: "x",
      status: "IN_PROGRESS",
      completedAt: null,
    })

    const done = await taskRepository.setDone(user.id, task.id, true)
    expect(done?.status).toBe("DONE")
    expect(done?.completedAt).toBeInstanceOf(Date)

    // Unchecking returns the task to TODO, never to IN_PROGRESS: a two-state
    // control cannot restore a three-state field.
    const undone = await taskRepository.setDone(user.id, task.id, false)
    expect(undone?.status).toBe("TODO")
    expect(undone?.completedAt).toBeNull()
  })

  describe("the undefined trap", () => {
    it("clears notes, dueDate, projectId and applicationId on update", async () => {
      const user = await makeUser()
      const project = await prisma.project.create({ data: { userId: user.id, name: "P" } })
      const application = await makeApplication(user.id)

      const task = await taskRepository.create(user.id, {
        title: "x",
        status: "TODO",
        notes: "Some notes",
        dueDate: DAY("2026-09-14"),
        projectId: project.id,
        applicationId: application.id,
        completedAt: null,
      })
      expect(task.notes).toBe("Some notes")
      expect(task.dueDate).not.toBeNull()
      expect(task.projectId).toBe(project.id)
      expect(task.applicationId).toBe(application.id)

      await taskRepository.update(user.id, task.id, {
        title: "x",
        status: "TODO",
        completedAt: null,
      })

      const after = await taskRepository.findById(user.id, task.id)
      expect(after?.notes).toBeNull()
      expect(after?.dueDate).toBeNull()
      expect(after?.projectId).toBeNull()
      expect(after?.applicationId).toBeNull()
    })
  })

  describe("ownership", () => {
    it("does not list another user's tasks", async () => {
      const owner = await makeUser()
      const other = await makeUser()
      await taskRepository.create(owner.id, { title: "x", status: "TODO", completedAt: null })

      expect(await taskRepository.listByUser(other.id, {})).toHaveLength(0)
    })

    it("does not find another user's task by id", async () => {
      const owner = await makeUser()
      const other = await makeUser()
      const task = await taskRepository.create(owner.id, {
        title: "x",
        status: "TODO",
        completedAt: null,
      })

      expect(await taskRepository.findById(other.id, task.id)).toBeNull()
    })

    it("does not update, complete or delete another user's task", async () => {
      const owner = await makeUser()
      const other = await makeUser()
      const task = await taskRepository.create(owner.id, {
        title: "x",
        status: "TODO",
        completedAt: null,
      })

      expect(
        await taskRepository.update(other.id, task.id, {
          title: "Hacked",
          status: "DONE",
          completedAt: null,
        })
      ).toBeNull()
      expect(await taskRepository.setDone(other.id, task.id, true)).toBeNull()
      expect(await taskRepository.remove(other.id, task.id)).toBe(false)

      const after = await taskRepository.findById(owner.id, task.id)
      expect(after?.title).toBe("x")
      expect(after?.status).toBe("TODO")
    })
  })
})
