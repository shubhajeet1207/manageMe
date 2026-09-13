import { afterEach, describe, expect, it } from "vitest"
import { prisma } from "@/lib/db/prisma"
import { ApplicationNotOwnedError } from "./application-service"
import { ProjectNotOwnedError } from "./project-service"
import {
  TaskNotFoundError,
  countOpenTasksByApplication,
  createTask,
  deleteTask,
  getTask,
  listTasks,
  quickAddTask,
  setTaskDone,
  updateTask,
} from "./task-service"

const createdUserIds: string[] = []

async function makeUser() {
  const user = await prisma.user.create({
    data: {
      name: "Task Service Test",
      email: `task-svc-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
      hashedPassword: "hashed",
    },
  })
  createdUserIds.push(user.id)
  return user
}

async function makeProject(userId: string, name = "Portfolio site") {
  return prisma.project.create({ data: { userId, name } })
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

describe("createTask", () => {
  it("creates a TODO task with no owner", async () => {
    const user = await makeUser()
    const task = await createTask(user.id, { title: "Send follow-up", status: "TODO" })

    expect(task.title).toBe("Send follow-up")
    expect(task.status).toBe("TODO")
    expect(task.completedAt).toBeNull()
    expect(task.projectId).toBeNull()
  })

  it("stamps completedAt when a task is created already DONE", async () => {
    const user = await makeUser()
    const task = await createTask(user.id, { title: "Already done", status: "DONE" })
    expect(task.completedAt).not.toBeNull()
  })

  it("attaches to the user's own project and application", async () => {
    const user = await makeUser()
    const project = await makeProject(user.id)
    const application = await makeApplication(user.id)

    const task = await createTask(user.id, {
      title: "Prepare system design round",
      status: "TODO",
      projectId: project.id,
      applicationId: application.id,
    })

    expect(task.projectId).toBe(project.id)
    expect(task.applicationId).toBe(application.id)
  })
})

describe("the cross-entity guards, exercised through the public service", () => {
  it("refuses to create a task against another user's project, and writes nothing", async () => {
    const owner = await makeUser()
    const other = await makeUser()
    const project = await makeProject(owner.id)

    await expect(
      createTask(other.id, { title: "Sneak in", status: "TODO", projectId: project.id })
    ).rejects.toBeInstanceOf(ProjectNotOwnedError)

    expect(await prisma.task.count({ where: { userId: other.id } })).toBe(0)
  })

  it("refuses to create a task against another user's application, and writes nothing", async () => {
    const owner = await makeUser()
    const other = await makeUser()
    const application = await makeApplication(owner.id)

    await expect(
      createTask(other.id, { title: "Sneak in", status: "TODO", applicationId: application.id })
    ).rejects.toBeInstanceOf(ApplicationNotOwnedError)

    expect(await prisma.task.count({ where: { userId: other.id } })).toBe(0)
  })

  it("refuses to update a task onto another user's project, leaving the row untouched", async () => {
    const owner = await makeUser()
    const other = await makeUser()
    const project = await makeProject(owner.id)
    const mine = await createTask(other.id, { title: "Mine", status: "TODO" })

    await expect(
      updateTask(other.id, mine.id, { title: "Moved", status: "TODO", projectId: project.id })
    ).rejects.toBeInstanceOf(ProjectNotOwnedError)

    const after = await prisma.task.findUnique({ where: { id: mine.id } })
    expect(after?.title).toBe("Mine")
    expect(after?.projectId).toBeNull()
  })

  it("refuses to update a task onto another user's application", async () => {
    const owner = await makeUser()
    const other = await makeUser()
    const application = await makeApplication(owner.id)
    const mine = await createTask(other.id, { title: "Mine", status: "TODO" })

    await expect(
      updateTask(other.id, mine.id, {
        title: "Moved",
        status: "TODO",
        applicationId: application.id,
      })
    ).rejects.toBeInstanceOf(ApplicationNotOwnedError)
  })

  it("allows unlinking, because an undefined id is not a foreign id", async () => {
    const user = await makeUser()
    const project = await makeProject(user.id)
    const task = await createTask(user.id, {
      title: "Ship it",
      status: "TODO",
      projectId: project.id,
    })

    const updated = await updateTask(user.id, task.id, { title: "Ship it", status: "TODO" })
    expect(updated.projectId).toBeNull()
  })

  it("guards the quick-add path too", async () => {
    const owner = await makeUser()
    const other = await makeUser()
    const project = await makeProject(owner.id)

    await expect(
      quickAddTask(other.id, { title: "Sneak in", projectId: project.id })
    ).rejects.toBeInstanceOf(ProjectNotOwnedError)
  })
})

describe("the clear battery", () => {
  it("clears notes, dueDate, projectId and applicationId", async () => {
    const user = await makeUser()
    const project = await makeProject(user.id)
    const application = await makeApplication(user.id)

    const task = await createTask(user.id, {
      title: "Send follow-up",
      status: "TODO",
      notes: "Draft the email",
      dueDate: new Date("2026-09-14T00:00:00.000Z"),
      projectId: project.id,
      applicationId: application.id,
    })

    await updateTask(user.id, task.id, { title: "Send follow-up", status: "TODO" })

    const after = await getTask(user.id, task.id)
    expect(after.notes).toBeNull()
    expect(after.dueDate).toBeNull()
    expect(after.projectId).toBeNull()
    expect(after.applicationId).toBeNull()
  })

  it("stores a due date at UTC midnight on the day it was given", async () => {
    const user = await makeUser()
    const task = await createTask(user.id, {
      title: "Send follow-up",
      status: "TODO",
      dueDate: new Date("2026-09-14T00:00:00.000Z"),
    })

    expect(task.dueDate?.toISOString()).toBe("2026-09-14T00:00:00.000Z")
  })
})

describe("completedAt is service-owned", () => {
  it("sets it when a task becomes DONE and clears it when it leaves", async () => {
    const user = await makeUser()
    const task = await createTask(user.id, { title: "Send follow-up", status: "TODO" })

    const done = await setTaskDone(user.id, task.id, true)
    expect(done.status).toBe("DONE")
    expect(done.completedAt).not.toBeNull()

    const undone = await setTaskDone(user.id, task.id, false)
    expect(undone.status).toBe("TODO")
    expect(undone.completedAt).toBeNull()
  })

  it("returns a task to TODO rather than IN_PROGRESS when unchecked", async () => {
    const user = await makeUser()
    const task = await createTask(user.id, { title: "Send follow-up", status: "IN_PROGRESS" })

    await setTaskDone(user.id, task.id, true)
    const undone = await setTaskDone(user.id, task.id, false)
    expect(undone.status).toBe("TODO")
  })

  it("clears completedAt when an edit moves a DONE task back to TODO", async () => {
    const user = await makeUser()
    const task = await createTask(user.id, { title: "Send follow-up", status: "DONE" })
    expect(task.completedAt).not.toBeNull()

    const reopened = await updateTask(user.id, task.id, {
      title: "Send follow-up",
      status: "TODO",
    })
    expect(reopened.completedAt).toBeNull()
  })

  it("does not move completedAt on an unrelated edit to a DONE task", async () => {
    const user = await makeUser()
    const task = await createTask(user.id, { title: "Send follow-up", status: "DONE" })

    const renamed = await updateTask(user.id, task.id, { title: "Sent", status: "DONE" })
    expect(renamed.completedAt?.getTime()).toBe(task.completedAt?.getTime())
  })
})

describe("listTasks", () => {
  it("hides DONE tasks by default and sorts by due date with nulls last", async () => {
    const user = await makeUser()
    await createTask(user.id, { title: "No date", status: "TODO" })
    await createTask(user.id, {
      title: "Later",
      status: "TODO",
      dueDate: new Date("2026-10-01T00:00:00.000Z"),
    })
    await createTask(user.id, {
      title: "Sooner",
      status: "TODO",
      dueDate: new Date("2026-09-14T00:00:00.000Z"),
    })
    await createTask(user.id, { title: "Finished", status: "DONE" })

    const list = await listTasks(user.id, {})
    expect(list.map((task) => task.title)).toEqual(["Sooner", "Later", "No date"])

    const done = await listTasks(user.id, { status: "DONE" })
    expect(done.map((task) => task.title)).toEqual(["Finished"])
  })

  it("filters by project and by application", async () => {
    const user = await makeUser()
    const project = await makeProject(user.id)
    const application = await makeApplication(user.id)

    await createTask(user.id, { title: "On project", status: "TODO", projectId: project.id })
    await createTask(user.id, {
      title: "On application",
      status: "TODO",
      applicationId: application.id,
    })

    expect((await listTasks(user.id, { projectId: project.id })).map((t) => t.title)).toEqual([
      "On project",
    ])
    expect(
      (await listTasks(user.id, { applicationId: application.id })).map((t) => t.title)
    ).toEqual(["On application"])
  })
})

describe("countOpenTasksByApplication", () => {
  it("counts non-DONE tasks per application in one pass", async () => {
    const user = await makeUser()
    const application = await makeApplication(user.id)

    await createTask(user.id, { title: "A", status: "TODO", applicationId: application.id })
    await createTask(user.id, { title: "B", status: "DONE", applicationId: application.id })
    await createTask(user.id, { title: "Unattached", status: "TODO" })

    const counts = await countOpenTasksByApplication(user.id)
    expect(counts.get(application.id)).toBe(1)
  })
})

describe("ownership", () => {
  it("does not read, update, complete or delete another user's task", async () => {
    const owner = await makeUser()
    const other = await makeUser()
    const task = await createTask(owner.id, { title: "Send follow-up", status: "TODO" })

    await expect(getTask(other.id, task.id)).rejects.toBeInstanceOf(TaskNotFoundError)
    await expect(
      updateTask(other.id, task.id, { title: "Hacked", status: "DONE" })
    ).rejects.toBeInstanceOf(TaskNotFoundError)
    await expect(setTaskDone(other.id, task.id, true)).rejects.toBeInstanceOf(TaskNotFoundError)
    await expect(deleteTask(other.id, task.id)).rejects.toBeInstanceOf(TaskNotFoundError)
    expect(await listTasks(other.id, {})).toHaveLength(0)

    const survived = await getTask(owner.id, task.id)
    expect(survived.title).toBe("Send follow-up")
    expect(survived.status).toBe("TODO")
  })
})
