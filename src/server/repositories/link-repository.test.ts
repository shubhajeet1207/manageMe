import { afterEach, describe, expect, it } from "vitest"
import { prisma } from "@/lib/db/prisma"
import * as linkRepository from "./link-repository"

const createdUserIds: string[] = []

async function makeUser() {
  const user = await prisma.user.create({
    data: {
      name: "Link Repo Test",
      email: `link-repo-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
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

describe("linkRepository", () => {
  it("creates a link and lists it newest first", async () => {
    const user = await makeUser()
    await linkRepository.create(user.id, {
      url: "https://example.com/older",
      title: "Older",
      tags: [],
    })
    await linkRepository.create(user.id, {
      url: "https://example.com/newer",
      title: "Newer",
      tags: [],
    })

    const list = await linkRepository.listByUser(user.id)
    expect(list.map((l) => l.title)).toEqual(["Newer", "Older"])
  })

  it("filters by tag", async () => {
    const user = await makeUser()
    await linkRepository.create(user.id, {
      url: "https://example.com/a",
      title: "A",
      tags: ["salary", "prep"],
    })
    await linkRepository.create(user.id, {
      url: "https://example.com/b",
      title: "B",
      tags: ["prep"],
    })

    expect((await linkRepository.listByUser(user.id, "salary")).map((l) => l.title)).toEqual(["A"])
    expect((await linkRepository.listByUser(user.id, "prep")).map((l) => l.title).sort()).toEqual([
      "A",
      "B",
    ])
  })

  it("lists the distinct tags in use, sorted", async () => {
    const user = await makeUser()
    await linkRepository.create(user.id, {
      url: "https://example.com/a",
      title: "A",
      tags: ["salary", "Prep"],
    })
    await linkRepository.create(user.id, {
      url: "https://example.com/b",
      title: "B",
      tags: ["Prep", "rust"],
    })

    expect(await linkRepository.listTags(user.id)).toEqual(["Prep", "rust", "salary"])
  })

  describe("the undefined trap", () => {
    it("clears description on update rather than leaving it", async () => {
      const user = await makeUser()
      const link = await linkRepository.create(user.id, {
        url: "https://example.com",
        title: "A",
        description: "Some description",
        tags: ["x"],
      })
      expect(link.description).toBe("Some description")

      await linkRepository.update(user.id, link.id, {
        url: "https://example.com",
        title: "A",
        tags: ["x"],
      })

      expect((await linkRepository.findById(user.id, link.id))?.description).toBeNull()
    })

    it("replaces the whole tag list on update, including emptying it", async () => {
      const user = await makeUser()
      const link = await linkRepository.create(user.id, {
        url: "https://example.com",
        title: "A",
        tags: ["one", "two"],
      })

      await linkRepository.update(user.id, link.id, {
        url: "https://example.com",
        title: "A",
        tags: [],
      })

      expect((await linkRepository.findById(user.id, link.id))?.tags).toEqual([])
    })
  })

  describe("ownership", () => {
    it("does not list, read, update or delete another user's link", async () => {
      const owner = await makeUser()
      const other = await makeUser()
      const link = await linkRepository.create(owner.id, {
        url: "https://example.com",
        title: "A",
        tags: ["x"],
      })

      expect(await linkRepository.listByUser(other.id)).toHaveLength(0)
      expect(await linkRepository.listTags(other.id)).toEqual([])
      expect(await linkRepository.findById(other.id, link.id)).toBeNull()
      expect(
        await linkRepository.update(other.id, link.id, {
          url: "https://evil.example",
          title: "Hacked",
          tags: [],
        })
      ).toBeNull()
      expect(await linkRepository.remove(other.id, link.id)).toBe(false)

      expect((await linkRepository.findById(owner.id, link.id))?.title).toBe("A")
    })
  })
})
