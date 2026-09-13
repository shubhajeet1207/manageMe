import { prisma } from "@/lib/db/prisma"
import type { Application, ApplicationStatus, Company } from "@prisma/client"
import type { CreateApplicationInput } from "@/server/validators/application-schemas"

export type ApplicationWithCompany = Application & { company: Company }

export function listByUser(userId: string): Promise<ApplicationWithCompany[]> {
  return prisma.application.findMany({
    where: { userId },
    include: { company: true },
    orderBy: { updatedAt: "desc" },
  })
}

export function listByCompany(
  userId: string,
  companyId: string
): Promise<ApplicationWithCompany[]> {
  return prisma.application.findMany({
    where: { userId, companyId },
    include: { company: true },
    orderBy: { updatedAt: "desc" },
  })
}

export function findById(userId: string, id: string): Promise<ApplicationWithCompany | null> {
  return prisma.application.findFirst({ where: { id, userId }, include: { company: true } })
}

export function create(userId: string, data: CreateApplicationInput): Promise<Application> {
  return prisma.application.create({ data: { ...data, userId } })
}

export async function update(
  userId: string,
  id: string,
  data: CreateApplicationInput
): Promise<Application | null> {
  // Every optional field gets `?? null` rather than being passed through as
  // part of `data`: Prisma treats `undefined` as "leave unchanged", so a
  // cleared field (jobUrl, location, workMode, salaryMin, salaryMax,
  // currency, source, appliedAt, notes, resumeVersionId) would silently
  // never clear — same trap as resume-repository.ts's `update`.
  const { count } = await prisma.application.updateMany({
    where: { id, userId },
    data: {
      companyId: data.companyId,
      roleTitle: data.roleTitle,
      status: data.status,
      jobUrl: data.jobUrl ?? null,
      location: data.location ?? null,
      workMode: data.workMode ?? null,
      salaryMin: data.salaryMin ?? null,
      salaryMax: data.salaryMax ?? null,
      currency: data.currency ?? null,
      source: data.source ?? null,
      appliedAt: data.appliedAt ?? null,
      notes: data.notes ?? null,
      resumeVersionId: data.resumeVersionId ?? null,
    },
  })
  if (count === 0) return null
  return prisma.application.findFirst({ where: { id, userId } })
}

export async function updateStatus(
  userId: string,
  id: string,
  status: ApplicationStatus
): Promise<Application | null> {
  const { count } = await prisma.application.updateMany({ where: { id, userId }, data: { status } })
  if (count === 0) return null
  return prisma.application.findFirst({ where: { id, userId } })
}

export async function remove(userId: string, id: string): Promise<boolean> {
  const { count } = await prisma.application.deleteMany({ where: { id, userId } })
  return count > 0
}
