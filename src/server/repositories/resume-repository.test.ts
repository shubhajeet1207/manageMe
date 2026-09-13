import { randomUUID } from "node:crypto"
import { afterEach, describe, expect, it } from "vitest"
import { prisma } from "@/lib/db/prisma"
import * as resumeRepository from "./resume-repository"

const createdUserIds: string[] = []

async function makeUser() {
  const user = await prisma.user.create({
    data: {
      name: "Resume Repo Test",
      email: `resume-repo-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
      hashedPassword: "hashed",
    },
  })
  createdUserIds.push(user.id)
  return user
}

function versionData(userId: string, resumeId: string, label = "October") {
  return {
    resumeId,
    label,
    originalFilename: "resume.pdf",
    storageKey: `resumes/${userId}/${randomUUID()}.pdf`,
    contentType: "application/pdf",
    sizeBytes: 1024,
  }
}

/** A user with a resume slot holding one version, which is current. */
async function makeUserWithResume(name = "Backend SWE") {
  const user = await makeUser()
  const resume = await resumeRepository.create(user.id, { name })
  const version = await resumeRepository.createVersionAndSetCurrent(
    user.id,
    versionData(user.id, resume.id)
  )
  if (!version) throw new Error("fixture: version was not created")
  return { user, resume, version }
}

async function makeCompany(userId: string) {
  return prisma.company.create({ data: { userId, name: `Acme ${randomUUID().slice(0, 8)}` } })
}

afterEach(async () => {
  if (createdUserIds.length === 0) return
  const ids = [...createdUserIds]
  createdUserIds.length = 0
  // Applications Restrict on resumeVersion, so they go before the versions
  // they point at — including an application of another user that a test
  // deliberately pointed at these versions.
  await prisma.application.deleteMany({
    where: { OR: [{ userId: { in: ids } }, { resumeVersion: { userId: { in: ids } } }] },
  })
  await prisma.resumeVersion.deleteMany({ where: { userId: { in: ids } } })
  await prisma.user.deleteMany({ where: { id: { in: ids } } })
})

describe("resume slots", () => {
  it("creates a resume slot and lists it for its owner", async () => {
    const user = await makeUser()
    const created = await resumeRepository.create(user.id, { name: "Backend SWE" })

    const list = await resumeRepository.listByUser(user.id)
    expect(list.map((r) => r.id)).toContain(created.id)
  })

  it("lists a slot with its version count and current version", async () => {
    const { user, resume, version } = await makeUserWithResume()

    const listed = (await resumeRepository.listByUser(user.id)).find((r) => r.id === resume.id)
    expect(listed?._count.versions).toBe(1)
    expect(listed?.currentVersion?.id).toBe(version.id)
  })

  it("finds a slot by id and by name for its owner", async () => {
    const user = await makeUser()
    const resume = await resumeRepository.create(user.id, { name: "Backend SWE" })

    expect((await resumeRepository.findById(user.id, resume.id))?.name).toBe("Backend SWE")
    expect((await resumeRepository.findByName(user.id, "Backend SWE"))?.id).toBe(resume.id)
  })

  it("updates a slot for its owner", async () => {
    const user = await makeUser()
    const resume = await resumeRepository.create(user.id, { name: "Backend SWE" })

    const updated = await resumeRepository.update(user.id, resume.id, {
      name: "Backend / Platform",
      notes: "Two pages",
    })
    expect(updated?.name).toBe("Backend / Platform")
    expect(updated?.notes).toBe("Two pages")
  })

  it("clears notes when they are removed", async () => {
    const user = await makeUser()
    const resume = await resumeRepository.create(user.id, { name: "Backend SWE", notes: "Two pages" })

    const updated = await resumeRepository.update(user.id, resume.id, { name: "Backend SWE" })
    // An undefined value means "leave unchanged" to Prisma, so this has to be
    // mapped to null explicitly or a cleared field would never clear.
    expect(updated?.notes).toBeNull()
  })

  it("deletes a slot and its versions for its owner", async () => {
    const { user, resume, version } = await makeUserWithResume()

    expect(await resumeRepository.remove(user.id, resume.id)).toBe(true)
    expect(await resumeRepository.findById(user.id, resume.id)).toBeNull()
    expect(await resumeRepository.findVersionById(user.id, version.id)).toBeNull()
  })
})

describe("resume versions", () => {
  it("adds a version and points the slot at it", async () => {
    const { user, resume, version } = await makeUserWithResume()

    const second = await resumeRepository.createVersionAndSetCurrent(
      user.id,
      versionData(user.id, resume.id, "November")
    )

    const reloaded = await resumeRepository.findById(user.id, resume.id)
    expect(reloaded?.currentVersionId).toBe(second?.id)
    // Uploading ADDS a version; it never replaces one.
    const versions = await resumeRepository.listVersions(user.id, resume.id)
    expect(versions).toHaveLength(2)
    expect(versions.map((v) => v.id)).toContain(version.id)
  })

  it("lists versions newest first", async () => {
    const { user, resume } = await makeUserWithResume()
    const second = await resumeRepository.createVersionAndSetCurrent(
      user.id,
      versionData(user.id, resume.id, "November")
    )

    const versions = await resumeRepository.listVersions(user.id, resume.id)
    expect(versions[0]?.id).toBe(second?.id)
  })

  it("lists every version a user owns with its slot, for the application select", async () => {
    const { user, resume, version } = await makeUserWithResume()

    const all = await resumeRepository.listAllVersions(user.id)
    expect(all.map((v) => v.id)).toEqual([version.id])
    expect(all[0]?.resume.id).toBe(resume.id)
  })

  it("sets an earlier version as current", async () => {
    const { user, resume, version } = await makeUserWithResume()
    await resumeRepository.createVersionAndSetCurrent(
      user.id,
      versionData(user.id, resume.id, "November")
    )

    expect(await resumeRepository.setCurrentVersion(user.id, resume.id, version.id)).toBe(true)
    expect((await resumeRepository.findById(user.id, resume.id))?.currentVersionId).toBe(version.id)
  })

  it("refuses to set a version current on a slot it does not belong to", async () => {
    const { user, resume, version } = await makeUserWithResume()
    const other = await resumeRepository.create(user.id, { name: "Data roles" })

    expect(await resumeRepository.setCurrentVersion(user.id, other.id, version.id)).toBe(false)
    expect((await resumeRepository.findById(user.id, other.id))?.currentVersionId).toBeNull()
    expect((await resumeRepository.findById(user.id, resume.id))?.currentVersionId).toBe(version.id)
  })

  it("finds a version scoped to its resume", async () => {
    const { user, resume, version } = await makeUserWithResume()
    const other = await resumeRepository.create(user.id, { name: "Data roles" })

    expect(await resumeRepository.findVersionInResume(user.id, resume.id, version.id)).not.toBeNull()
    expect(await resumeRepository.findVersionInResume(user.id, other.id, version.id)).toBeNull()
  })
})

describe("resume analytics", () => {
  it("folds applications to resume level in one grouped query", async () => {
    const { user, resume, version } = await makeUserWithResume()
    const company = await makeCompany(user.id)
    const second = await resumeRepository.createVersionAndSetCurrent(
      user.id,
      versionData(user.id, resume.id, "November")
    )

    await prisma.application.createMany({
      data: [
        { userId: user.id, companyId: company.id, roleTitle: "A", status: "INTERVIEW", resumeVersionId: version.id },
        { userId: user.id, companyId: company.id, roleTitle: "B", status: "OFFER", resumeVersionId: second!.id },
        { userId: user.id, companyId: company.id, roleTitle: "C", status: "ACCEPTED", resumeVersionId: second!.id },
        { userId: user.id, companyId: company.id, roleTitle: "D", status: "REJECTED", resumeVersionId: version.id },
        { userId: user.id, companyId: company.id, roleTitle: "E", status: "APPLIED", resumeVersionId: version.id },
        { userId: user.id, companyId: company.id, roleTitle: "F", status: "APPLIED" },
      ],
    })

    const stats = await resumeRepository.statsByResume(user.id)
    expect(stats.get(resume.id)).toEqual({
      applications: 5,
      atInterviewOrBeyond: 3,
      offers: 2,
      rejected: 1,
    })
  })

  it("counts applications that have no resume linked", async () => {
    const { user } = await makeUserWithResume()
    const company = await makeCompany(user.id)
    await prisma.application.create({
      data: { userId: user.id, companyId: company.id, roleTitle: "Unlinked" },
    })

    expect(await resumeRepository.countUnlinkedApplications(user.id)).toBe(1)
  })

  it("counts and lists the applications that used a resume", async () => {
    const { user, resume, version } = await makeUserWithResume()
    const company = await makeCompany(user.id)
    await prisma.application.create({
      data: {
        userId: user.id,
        companyId: company.id,
        roleTitle: "Engineer",
        resumeVersionId: version.id,
      },
    })

    expect(await resumeRepository.countApplicationsForResume(user.id, resume.id)).toBe(1)
    const used = await resumeRepository.listApplicationsForResume(user.id, resume.id)
    expect(used).toHaveLength(1)
    expect(used[0]?.company.id).toBe(company.id)
    expect(used[0]?.resumeVersion?.id).toBe(version.id)
  })
})

describe("ownership", () => {
  it("does not list another user's resumes", async () => {
    await makeUserWithResume()
    const other = await makeUser()

    expect(await resumeRepository.listByUser(other.id)).toHaveLength(0)
  })

  it("does not find another user's resume by id or by name", async () => {
    const owner = await makeUserWithResume()
    const other = await makeUser()

    expect(await resumeRepository.findById(other.id, owner.resume.id)).toBeNull()
    expect(await resumeRepository.findByName(other.id, "Backend SWE")).toBeNull()
  })

  it("does not update another user's resume, and leaves it unchanged", async () => {
    const owner = await makeUserWithResume()
    const other = await makeUser()

    expect(
      await resumeRepository.update(other.id, owner.resume.id, { name: "Hacked", notes: "Hacked" })
    ).toBeNull()

    const untouched = await resumeRepository.findById(owner.user.id, owner.resume.id)
    expect(untouched?.name).toBe("Backend SWE")
    expect(untouched?.notes).toBeNull()
  })

  it("does not delete another user's resume, and leaves it and its versions intact", async () => {
    const owner = await makeUserWithResume()
    const other = await makeUser()

    expect(await resumeRepository.remove(other.id, owner.resume.id)).toBe(false)
    expect(await resumeRepository.findById(owner.user.id, owner.resume.id)).not.toBeNull()
    expect(await resumeRepository.findVersionById(owner.user.id, owner.version.id)).not.toBeNull()
  })

  it("does not find another user's version", async () => {
    const owner = await makeUserWithResume()
    const other = await makeUser()

    expect(await resumeRepository.findVersionById(other.id, owner.version.id)).toBeNull()
    expect(await resumeRepository.findVersionInResume(other.id, owner.resume.id, owner.version.id))
      .toBeNull()
  })

  it("does not list another user's versions", async () => {
    const owner = await makeUserWithResume()
    const other = await makeUser()

    expect(await resumeRepository.listVersions(other.id, owner.resume.id)).toHaveLength(0)
    expect(await resumeRepository.listAllVersions(other.id)).toHaveLength(0)
  })

  it("does not add a version to another user's resume, and writes no row", async () => {
    const owner = await makeUserWithResume()
    const other = await makeUser()

    const created = await resumeRepository.createVersionAndSetCurrent(
      other.id,
      versionData(other.id, owner.resume.id, "Injected")
    )
    expect(created).toBeNull()

    // The transaction rolled back: no row, and the owner's pointer is untouched.
    expect(await resumeRepository.listVersions(owner.user.id, owner.resume.id)).toHaveLength(1)
    expect((await resumeRepository.findById(owner.user.id, owner.resume.id))?.currentVersionId).toBe(
      owner.version.id
    )
  })

  it("does not set another user's version as current on either resume", async () => {
    const owner = await makeUserWithResume()
    const other = await makeUserWithResume("Data roles")

    // Cross-user, same resume id: the repository scoping catches it.
    expect(
      await resumeRepository.setCurrentVersion(other.user.id, owner.resume.id, owner.version.id)
    ).toBe(false)
    // Cross-user, own resume id: the version is not theirs, so it is refused.
    expect(
      await resumeRepository.setCurrentVersion(other.user.id, other.resume.id, owner.version.id)
    ).toBe(false)

    expect((await resumeRepository.findById(owner.user.id, owner.resume.id))?.currentVersionId).toBe(
      owner.version.id
    )
    expect((await resumeRepository.findById(other.user.id, other.resume.id))?.currentVersionId).toBe(
      other.version.id
    )
  })

  it("does not count or list another user's resume usage", async () => {
    const owner = await makeUserWithResume()
    const other = await makeUser()
    const company = await makeCompany(owner.user.id)
    await prisma.application.create({
      data: {
        userId: owner.user.id,
        companyId: company.id,
        roleTitle: "Engineer",
        resumeVersionId: owner.version.id,
      },
    })

    expect(await resumeRepository.countApplicationsForResume(other.id, owner.resume.id)).toBe(0)
    expect(await resumeRepository.listApplicationsForResume(other.id, owner.resume.id)).toHaveLength(
      0
    )
    expect(await resumeRepository.statsByResume(other.id)).toEqual(new Map())
  })

  it("keeps another user's applications out of a resume's numbers", async () => {
    // The cross-entity hole, reproduced at the database level: this row is
    // written directly, bypassing the service guard, to prove the analytics
    // fold does not credit one user's resume with another user's application.
    const owner = await makeUserWithResume()
    const other = await makeUserWithResume("Data roles")
    const company = await makeCompany(other.user.id)
    await prisma.application.create({
      data: {
        userId: other.user.id,
        companyId: company.id,
        roleTitle: "Engineer",
        resumeVersionId: owner.version.id,
      },
    })

    expect(await resumeRepository.statsByResume(other.user.id)).toEqual(new Map())
    expect(await resumeRepository.countApplicationsForResume(owner.user.id, owner.resume.id)).toBe(0)
  })
})
