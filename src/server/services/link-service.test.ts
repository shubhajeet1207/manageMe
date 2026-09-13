import { afterEach, describe, expect, it } from "vitest"
import { prisma } from "@/lib/db/prisma"
import {
  LinkNotFoundError,
  createLink,
  deleteLink,
  getLink,
  listLinkTags,
  listLinks,
  updateLink,
} from "./link-service"

const createdUserIds: string[] = []

async function makeUser() {
  const user = await prisma.user.create({
    data: {
      name: "Link Service Test",
      email: `link-svc-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
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

describe("createLink", () => {
  it("stores a link with its tags", async () => {
    const user = await makeUser()
    const link = await createLink(user.id, {
      url: "https://example.com/salary-guide",
      title: "Salary guide",
      tags: ["research", "pay"],
    })

    expect(link.url).toBe("https://example.com/salary-guide")
    expect(link.tags).toEqual(["research", "pay"])
    expect(link.description).toBeNull()
  })
})

describe("updateLink", () => {
  it("clears the description rather than leaving the old value", async () => {
    const user = await makeUser()
    const link = await createLink(user.id, {
      url: "https://example.com",
      title: "Example",
      description: "Worth reading",
      tags: [],
    })

    await updateLink(user.id, link.id, {
      url: "https://example.com",
      title: "Example",
      tags: [],
    })

    expect((await getLink(user.id, link.id)).description).toBeNull()
  })

  it("empties the tag list when the list it is given is empty", async () => {
    const user = await makeUser()
    const link = await createLink(user.id, {
      url: "https://example.com",
      title: "Example",
      tags: ["research"],
    })

    await updateLink(user.id, link.id, {
      url: "https://example.com",
      title: "Example",
      tags: [],
    })

    expect((await getLink(user.id, link.id)).tags).toEqual([])
  })
})

describe("listLinks", () => {
  it("filters by tag", async () => {
    const user = await makeUser()
    await createLink(user.id, { url: "https://a.example", title: "A", tags: ["research"] })
    await createLink(user.id, { url: "https://b.example", title: "B", tags: ["prep"] })

    expect((await listLinks(user.id, "research")).map((link) => link.title)).toEqual(["A"])
    expect(await listLinks(user.id)).toHaveLength(2)
  })

  it("lists each distinct tag once for the filter chips", async () => {
    const user = await makeUser()
    await createLink(user.id, { url: "https://a.example", title: "A", tags: ["Research"] })
    await createLink(user.id, { url: "https://b.example", title: "B", tags: ["research"] })

    expect(await listLinkTags(user.id)).toEqual(["Research"])
  })
})

describe("ownership", () => {
  it("does not read, update or delete another user's link", async () => {
    const owner = await makeUser()
    const other = await makeUser()
    const link = await createLink(owner.id, {
      url: "https://example.com",
      title: "Example",
      tags: [],
    })

    await expect(getLink(other.id, link.id)).rejects.toBeInstanceOf(LinkNotFoundError)
    await expect(
      updateLink(other.id, link.id, { url: "https://evil.example", title: "Hacked", tags: [] })
    ).rejects.toBeInstanceOf(LinkNotFoundError)
    await expect(deleteLink(other.id, link.id)).rejects.toBeInstanceOf(LinkNotFoundError)
    expect(await listLinks(other.id)).toHaveLength(0)
    expect(await listLinkTags(other.id)).toEqual([])

    expect((await getLink(owner.id, link.id)).title).toBe("Example")
  })
})
