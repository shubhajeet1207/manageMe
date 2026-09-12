import { prisma } from "@/lib/db/prisma"
import type { Company } from "@prisma/client"
import type { CreateCompanyInput } from "@/server/validators/company-schemas"

export type CompanyWithCount = Company & { _count: { applications: number } }

export function listByUser(userId: string): Promise<CompanyWithCount[]> {
  return prisma.company.findMany({
    where: { userId },
    include: { _count: { select: { applications: true } } },
    orderBy: { name: "asc" },
  })
}

export function findById(userId: string, id: string): Promise<Company | null> {
  return prisma.company.findFirst({ where: { id, userId } })
}

export function findByName(userId: string, name: string): Promise<Company | null> {
  return prisma.company.findFirst({ where: { userId, name } })
}

export function create(userId: string, data: CreateCompanyInput): Promise<Company> {
  return prisma.company.create({ data: { ...data, userId } })
}

export async function update(
  userId: string,
  id: string,
  data: CreateCompanyInput
): Promise<Company | null> {
  const { count } = await prisma.company.updateMany({ where: { id, userId }, data })
  if (count === 0) return null
  return prisma.company.findFirst({ where: { id, userId } })
}

export async function remove(userId: string, id: string): Promise<boolean> {
  const { count } = await prisma.company.deleteMany({ where: { id, userId } })
  return count > 0
}

export function countApplications(userId: string, id: string): Promise<number> {
  return prisma.application.count({ where: { userId, companyId: id } })
}
