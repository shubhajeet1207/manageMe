import { randomBytes } from "node:crypto"
import { afterEach, describe, expect, it } from "vitest"
import { prisma } from "@/lib/db/prisma"
import * as credentialRepository from "./credential-repository"

const createdUserIds: string[] = []

async function makeUser() {
  const user = await prisma.user.create({
    data: {
      name: "Credential Repo Test",
      email: `cred-repo-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
      hashedPassword: "hashed",
    },
  })
  createdUserIds.push(user.id)
  return user
}

function sealed(keyId = "aaaaaaaaaaaaaaaa") {
  return {
    ciphertext: new Uint8Array(randomBytes(24)),
    nonce: new Uint8Array(randomBytes(12)),
    authTag: new Uint8Array(randomBytes(16)),
    keyId,
  }
}

afterEach(async () => {
  if (createdUserIds.length === 0) return
  const ids = [...createdUserIds]
  createdUserIds.length = 0
  await prisma.user.deleteMany({ where: { id: { in: ids } } })
})

describe("credentialRepository", () => {
  it("creates a credential and lists it for its owner", async () => {
    const user = await makeUser()
    const created = await credentialRepository.create(
      user.id,
      { label: "Workday — Acme", username: "me@example.com" },
      sealed()
    )

    const list = await credentialRepository.listByUser(user.id)
    expect(list.map((c) => c.id)).toContain(created.id)
    expect(list[0].username).toBe("me@example.com")
  })

  it("finds a credential by label for its owner", async () => {
    const user = await makeUser()
    await credentialRepository.create(user.id, { label: "Workday" }, sealed())
    expect(await credentialRepository.findByLabel(user.id, "Workday")).not.toBeNull()
  })

  describe("the secret columns never leave the database on a read path", () => {
    it("omits all three from a list row", async () => {
      const user = await makeUser()
      await credentialRepository.create(user.id, { label: "Workday" }, sealed())

      const [row] = await credentialRepository.listByUser(user.id)
      const keys = Object.keys(row)
      expect(keys).not.toContain("secretCiphertext")
      expect(keys).not.toContain("secretNonce")
      expect(keys).not.toContain("secretAuthTag")
    })

    it("omits all three from a findById row", async () => {
      const user = await makeUser()
      const created = await credentialRepository.create(user.id, { label: "Workday" }, sealed())

      const row = await credentialRepository.findById(user.id, created.id)
      const keys = Object.keys(row ?? {})
      expect(keys).not.toContain("secretCiphertext")
      expect(keys).not.toContain("secretNonce")
      expect(keys).not.toContain("secretAuthTag")
    })

    it("omits all three from the row a create returns", async () => {
      const user = await makeUser()
      const created = await credentialRepository.create(user.id, { label: "Workday" }, sealed())
      const keys = Object.keys(created)
      expect(keys).not.toContain("secretCiphertext")
      expect(keys).not.toContain("secretNonce")
      expect(keys).not.toContain("secretAuthTag")
    })

    it("re-includes them only through findSealedById", async () => {
      const user = await makeUser()
      const box = sealed()
      const created = await credentialRepository.create(user.id, { label: "Workday" }, box)

      const row = await credentialRepository.findSealedById(user.id, created.id)
      expect(Buffer.from(row!.secretCiphertext)).toEqual(Buffer.from(box.ciphertext))
      expect(Buffer.from(row!.secretNonce)).toEqual(Buffer.from(box.nonce))
      expect(Buffer.from(row!.secretAuthTag)).toEqual(Buffer.from(box.authTag))
    })

    it("does not hand another user's sealed row over", async () => {
      const owner = await makeUser()
      const other = await makeUser()
      const created = await credentialRepository.create(owner.id, { label: "Workday" }, sealed())

      expect(await credentialRepository.findSealedById(other.id, created.id)).toBeNull()
    })
  })

  describe("the update path", () => {
    it("clears siteUrl, username and notes rather than leaving them", async () => {
      const user = await makeUser()
      const created = await credentialRepository.create(
        user.id,
        {
          label: "Workday",
          siteUrl: "https://acme.example",
          username: "me@example.com",
          notes: "A note",
        },
        sealed()
      )

      await credentialRepository.update(user.id, created.id, { label: "Workday" })

      const after = await credentialRepository.findById(user.id, created.id)
      expect(after?.siteUrl).toBeNull()
      expect(after?.username).toBeNull()
      expect(after?.notes).toBeNull()
    })

    it("leaves the secret columns byte-identical when only the label changes", async () => {
      const user = await makeUser()
      const created = await credentialRepository.create(user.id, { label: "Workday" }, sealed())
      const before = await credentialRepository.findSealedById(user.id, created.id)

      await credentialRepository.update(user.id, created.id, { label: "Workday — Acme" })

      const after = await credentialRepository.findSealedById(user.id, created.id)
      expect(after?.label).toBe("Workday — Acme")
      expect(Buffer.from(after!.secretCiphertext)).toEqual(Buffer.from(before!.secretCiphertext))
      expect(Buffer.from(after!.secretNonce)).toEqual(Buffer.from(before!.secretNonce))
      expect(Buffer.from(after!.secretAuthTag)).toEqual(Buffer.from(before!.secretAuthTag))
      expect(after?.secretUpdatedAt.getTime()).toBe(before!.secretUpdatedAt.getTime())
    })

    it("writes the three columns and moves secretUpdatedAt when a new secret is supplied", async () => {
      const user = await makeUser()
      const created = await credentialRepository.create(user.id, { label: "Workday" }, sealed())
      const before = await credentialRepository.findSealedById(user.id, created.id)

      const replacement = sealed("bbbbbbbbbbbbbbbb")
      await credentialRepository.update(user.id, created.id, { label: "Workday" }, replacement)

      const after = await credentialRepository.findSealedById(user.id, created.id)
      expect(Buffer.from(after!.secretCiphertext)).toEqual(Buffer.from(replacement.ciphertext))
      expect(Buffer.from(after!.secretNonce)).toEqual(Buffer.from(replacement.nonce))
      expect(Buffer.from(after!.secretNonce)).not.toEqual(Buffer.from(before!.secretNonce))
      expect(after?.keyId).toBe("bbbbbbbbbbbbbbbb")
      expect(after!.secretUpdatedAt.getTime()).toBeGreaterThanOrEqual(
        before!.secretUpdatedAt.getTime()
      )
    })
  })

  describe("rotation", () => {
    it("counts the rows still encrypted under another key", async () => {
      const user = await makeUser()
      await credentialRepository.create(user.id, { label: "Old one" }, sealed("aaaaaaaaaaaaaaaa"))
      await credentialRepository.create(user.id, { label: "New one" }, sealed("bbbbbbbbbbbbbbbb"))

      expect(await credentialRepository.countWithOtherKeyId(user.id, "bbbbbbbbbbbbbbbb")).toBe(1)
      expect(await credentialRepository.countWithOtherKeyId(user.id, "aaaaaaaaaaaaaaaa")).toBe(1)
    })

    it("lists sealed rows for the re-encryption walk", async () => {
      const user = await makeUser()
      await credentialRepository.create(user.id, { label: "A" }, sealed("aaaaaaaaaaaaaaaa"))

      const rows = await credentialRepository.listSealedByUser(user.id)
      expect(rows).toHaveLength(1)
      expect(rows[0].secretCiphertext).toBeDefined()
    })

    it("replaces a row's sealed secret without touching its label", async () => {
      const user = await makeUser()
      const created = await credentialRepository.create(user.id, { label: "A" }, sealed("aaaa1111"))

      const next = sealed("bbbb2222")
      expect(await credentialRepository.replaceSealed(user.id, created.id, next)).toBe(true)

      const after = await credentialRepository.findSealedById(user.id, created.id)
      expect(after?.label).toBe("A")
      expect(after?.keyId).toBe("bbbb2222")
      expect(Buffer.from(after!.secretNonce)).toEqual(Buffer.from(next.nonce))
    })
  })

  describe("ownership", () => {
    it("does not list, read, update or delete another user's credential", async () => {
      const owner = await makeUser()
      const other = await makeUser()
      const created = await credentialRepository.create(owner.id, { label: "Workday" }, sealed())

      expect(await credentialRepository.listByUser(other.id)).toHaveLength(0)
      expect(await credentialRepository.findById(other.id, created.id)).toBeNull()
      expect(await credentialRepository.findByLabel(other.id, "Workday")).toBeNull()
      expect(
        await credentialRepository.update(other.id, created.id, { label: "Hacked" })
      ).toBeNull()
      expect(await credentialRepository.replaceSealed(other.id, created.id, sealed("cccc"))).toBe(
        false
      )
      expect(await credentialRepository.remove(other.id, created.id)).toBe(false)

      expect((await credentialRepository.findById(owner.id, created.id))?.label).toBe("Workday")
    })
  })
})
