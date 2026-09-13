import * as applicationRepository from "@/server/repositories/application-repository"
import * as companyRepository from "@/server/repositories/company-repository"
import type { ApplicationWithCompany } from "@/server/repositories/application-repository"
import { assertResumeVersionOwned } from "@/server/services/resume-service"
import type { CreateApplicationInput } from "@/server/validators/application-schemas"
import type { Application, ApplicationStatus } from "@prisma/client"

export class ApplicationNotFoundError extends Error {
  constructor() {
    super("Application not found")
  }
}

export class CompanyNotOwnedError extends Error {
  constructor() {
    super("Company not found")
  }
}

// Repository ownership scoping alone can't catch this: a write to the
// caller's own application row can still carry someone else's companyId,
// since every `where: { userId }` clause on the application still matches.
// This check must run before create/update writes to stop a cross-tenant
// foreign-key reference from being created.
async function assertCompanyOwned(userId: string, companyId: string): Promise<void> {
  const company = await companyRepository.findById(userId, companyId)
  if (!company) throw new CompanyNotOwnedError()
}

// The same hole one entity over: a resumeVersionId in the payload is an
// arbitrary client-supplied id, and linking someone else's file would have the
// UI render a link to it. Guarded only when one is supplied — an undefined
// value means "no resume", and unlinking is always allowed.
async function assertLinkedResumeVersionOwned(
  userId: string,
  resumeVersionId: string | undefined
): Promise<void> {
  if (resumeVersionId === undefined) return
  await assertResumeVersionOwned(userId, resumeVersionId)
}

export function listApplications(userId: string): Promise<ApplicationWithCompany[]> {
  return applicationRepository.listByUser(userId)
}

export function listApplicationsForCompany(
  userId: string,
  companyId: string
): Promise<ApplicationWithCompany[]> {
  return applicationRepository.listByCompany(userId, companyId)
}

export async function getApplication(
  userId: string,
  id: string
): Promise<ApplicationWithCompany> {
  const application = await applicationRepository.findById(userId, id)
  if (!application) throw new ApplicationNotFoundError()
  return application
}

export async function createApplication(
  userId: string,
  input: CreateApplicationInput
): Promise<Application> {
  await assertCompanyOwned(userId, input.companyId)
  await assertLinkedResumeVersionOwned(userId, input.resumeVersionId)
  return applicationRepository.create(userId, input)
}

export async function updateApplication(
  userId: string,
  id: string,
  input: CreateApplicationInput
): Promise<Application> {
  const existing = await applicationRepository.findById(userId, id)
  if (!existing) throw new ApplicationNotFoundError()

  await assertCompanyOwned(userId, input.companyId)
  await assertLinkedResumeVersionOwned(userId, input.resumeVersionId)

  const updated = await applicationRepository.update(userId, id, input)
  if (!updated) throw new ApplicationNotFoundError()
  return updated
}

export async function changeStatus(
  userId: string,
  id: string,
  status: ApplicationStatus
): Promise<Application> {
  const updated = await applicationRepository.updateStatus(userId, id, status)
  if (!updated) throw new ApplicationNotFoundError()
  return updated
}

export async function deleteApplication(userId: string, id: string): Promise<void> {
  const deleted = await applicationRepository.remove(userId, id)
  if (!deleted) throw new ApplicationNotFoundError()
}
