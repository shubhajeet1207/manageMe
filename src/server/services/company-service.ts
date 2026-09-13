import * as companyRepository from "@/server/repositories/company-repository"
import type { CompanyWithCount } from "@/server/repositories/company-repository"
import type { CreateCompanyInput } from "@/server/validators/company-schemas"
import type { Company } from "@prisma/client"

export class CompanyNameTakenError extends Error {
  constructor() {
    super("You already have a company with this name")
  }
}

export class CompanyNotFoundError extends Error {
  constructor() {
    super("Company not found")
  }
}

/** Deliberately says "Company not found": it must not confirm that a company
 *  it refused actually exists, because a not-yours answer and a not-there
 *  answer are the same answer (§12.2). */
export class CompanyNotOwnedError extends Error {
  constructor() {
    super("Company not found")
    this.name = "CompanyNotOwnedError"
  }
}

/**
 * The cross-entity guard for every write that carries a client-supplied
 * `companyId` — applications and documents both.
 *
 * Repository ownership scoping alone cannot catch this: the row being written
 * is the caller's OWN, carrying the caller's own `userId`, so every
 * `where: { userId }` clause on the write still matches. The foreign id in the
 * payload is arbitrary client input and nothing but an explicit lookup will
 * refuse it.
 *
 * Call it on create and update whenever `companyId` is present; skip it when it
 * is undefined, because unlinking is always allowed.
 */
export async function assertCompanyOwned(userId: string, companyId: string): Promise<void> {
  const company = await companyRepository.findById(userId, companyId)
  if (!company) throw new CompanyNotOwnedError()
}

export class CompanyHasApplicationsError extends Error {
  constructor(public readonly count: number) {
    super(
      `This company has ${count} application${count === 1 ? "" : "s"}. Delete or reassign them first.`
    )
  }
}

export function listCompanies(userId: string): Promise<CompanyWithCount[]> {
  return companyRepository.listByUser(userId)
}

export async function getCompany(userId: string, id: string): Promise<Company> {
  const company = await companyRepository.findById(userId, id)
  if (!company) throw new CompanyNotFoundError()
  return company
}

export async function createCompany(
  userId: string,
  input: CreateCompanyInput
): Promise<Company> {
  const existing = await companyRepository.findByName(userId, input.name)
  if (existing) throw new CompanyNameTakenError()
  return companyRepository.create(userId, input)
}

export async function updateCompany(
  userId: string,
  id: string,
  input: CreateCompanyInput
): Promise<Company> {
  const clash = await companyRepository.findByName(userId, input.name)
  if (clash && clash.id !== id) throw new CompanyNameTakenError()

  const updated = await companyRepository.update(userId, id, input)
  if (!updated) throw new CompanyNotFoundError()
  return updated
}

export async function deleteCompany(userId: string, id: string): Promise<void> {
  const count = await companyRepository.countApplications(userId, id)
  if (count > 0) throw new CompanyHasApplicationsError(count)

  const deleted = await companyRepository.remove(userId, id)
  if (!deleted) throw new CompanyNotFoundError()
}

export async function findOrCreateByName(userId: string, name: string): Promise<Company> {
  const existing = await companyRepository.findByName(userId, name)
  if (existing) return existing
  return companyRepository.create(userId, { name })
}
