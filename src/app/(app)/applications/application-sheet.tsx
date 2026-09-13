"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { ApplicationStatus, WorkMode } from "@prisma/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { CompanySelect, NEW_COMPANY } from "@/components/company-select"
import { NO_RESUME_VERSION, ResumeVersionSelect } from "@/components/resume-version-select"
import { STATUS_LABELS, STATUS_ORDER } from "@/components/status-badge"
import type { ApplicationWithCompany } from "@/server/repositories/application-repository"
import type { ResumeVersionWithResume } from "@/server/repositories/resume-repository"
import type { Company } from "@prisma/client"
import { createApplicationAction, updateApplicationAction } from "./actions"
import { resolveCompanyAction } from "./company-actions"

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p role="alert" className="text-destructive text-sm">
      {message}
    </p>
  )
}

type FormValues = {
  roleTitle: string
  status: ApplicationStatus
  jobUrl: string
  location: string
  workMode: string
  salaryMin: string
  salaryMax: string
  currency: string
  source: string
  appliedAt: string
  notes: string
}

export function ApplicationSheet({
  companies,
  versions = [],
  application,
  trigger,
}: {
  companies: Pick<Company, "id" | "name">[]
  versions?: ResumeVersionWithResume[]
  application?: ApplicationWithCompany
  // Base UI's `render` prop requires a ReactElement, not the wider ReactNode.
  trigger: React.ReactElement
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [companyId, setCompanyId] = useState(application?.companyId ?? "")
  const [newCompanyName, setNewCompanyName] = useState("")
  const [companyError, setCompanyError] = useState<string | null>(null)
  const [resumeVersionId, setResumeVersionId] = useState(application?.resumeVersionId ?? "")
  const [resumeError, setResumeError] = useState<string | null>(null)
  const isEdit = Boolean(application)

  const form = useForm<FormValues>({
    defaultValues: {
      roleTitle: application?.roleTitle ?? "",
      status: application?.status ?? "SAVED",
      jobUrl: application?.jobUrl ?? "",
      location: application?.location ?? "",
      workMode: application?.workMode ?? "",
      salaryMin: application?.salaryMin?.toString() ?? "",
      salaryMax: application?.salaryMax?.toString() ?? "",
      currency: application?.currency ?? "",
      source: application?.source ?? "",
      appliedAt: application?.appliedAt ? application.appliedAt.toISOString().slice(0, 10) : "",
      notes: application?.notes ?? "",
    },
  })

  function onSubmit(values: FormValues) {
    setCompanyError(null)
    setResumeError(null)
    startTransition(async () => {
      let resolvedCompanyId = companyId

      if (companyId === NEW_COMPANY) {
        const resolved = await resolveCompanyAction(newCompanyName)
        if ("error" in resolved) {
          setCompanyError(resolved.error)
          return
        }
        resolvedCompanyId = resolved.id
      }

      if (!resolvedCompanyId) {
        setCompanyError("Company is required")
        return
      }

      // "" rather than the sentinel: the schema turns an empty string into
      // undefined, so clearing the select saves as null instead of as "".
      const payload = { ...values, companyId: resolvedCompanyId, resumeVersionId }
      const result = isEdit
        ? await updateApplicationAction({ ...payload, id: application!.id })
        : await createApplicationAction(payload)

      if (result.success) {
        setOpen(false)
        router.refresh()
        toast.success(isEdit ? "Application updated" : "Application added")
        return
      }
      if (result.fieldErrors) {
        for (const [field, messages] of Object.entries(result.fieldErrors)) {
          if (!messages?.[0]) continue
          if (field === "companyId") setCompanyError(messages[0])
          else if (field === "resumeVersionId") setResumeError(messages[0])
          else form.setError(field as keyof FormValues, { message: messages[0] })
        }
      }
      if (result.formError) toast.error(result.formError)
    })
  }

  const errors = form.formState.errors

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={trigger} />
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEdit ? "Edit application" : "Add application"}</SheetTitle>
          <SheetDescription>
            {isEdit ? "Update this application." : "Track a role you have applied for."}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 px-4 pb-6">
          <div className="space-y-2">
            <Label>Company</Label>
            <CompanySelect
              companies={companies}
              value={companyId}
              newName={newCompanyName}
              onChangeValue={setCompanyId}
              onChangeNewName={setNewCompanyName}
            />
            {companyError ? (
              <p role="alert" className="text-destructive text-sm">
                {companyError}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="roleTitle">Role title</Label>
            <Input
              id="roleTitle"
              {...form.register("roleTitle", { required: "Role title is required" })}
            />
            <FieldError message={errors.roleTitle?.message} />
          </div>

          <div className="space-y-2">
            <Label>Status</Label>
            <Select
              value={form.watch("status")}
              onValueChange={(value: string) =>
                form.setValue("status", value as ApplicationStatus)
              }
            >
              <SelectTrigger aria-label="Status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_ORDER.map((status) => (
                  <SelectItem key={status} value={status}>
                    {STATUS_LABELS[status]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Resume</Label>
            <ResumeVersionSelect
              versions={versions}
              value={resumeVersionId}
              onChangeValue={(value: string) =>
                setResumeVersionId(value === NO_RESUME_VERSION ? "" : value)
              }
            />
            {resumeError ? (
              <p role="alert" className="text-destructive text-sm">
                {resumeError}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="jobUrl">Job URL</Label>
            <Input id="jobUrl" placeholder="https://…" {...form.register("jobUrl")} />
            <FieldError message={errors.jobUrl?.message} />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="location">Location</Label>
              <Input id="location" {...form.register("location")} />
              <FieldError message={errors.location?.message} />
            </div>
            <div className="space-y-2">
              <Label>Work mode</Label>
              <Select
                value={form.watch("workMode")}
                onValueChange={(value: string) => form.setValue("workMode", value)}
              >
                <SelectTrigger aria-label="Work mode">
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  {Object.keys(WorkMode).map((mode) => (
                    <SelectItem key={mode} value={mode}>
                      {mode.charAt(0) + mode.slice(1).toLowerCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="salaryMin">Salary min</Label>
              <Input id="salaryMin" inputMode="numeric" {...form.register("salaryMin")} />
              <FieldError message={errors.salaryMin?.message} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="salaryMax">Salary max</Label>
              <Input id="salaryMax" inputMode="numeric" {...form.register("salaryMax")} />
              <FieldError message={errors.salaryMax?.message} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="currency">Currency</Label>
              <Input id="currency" placeholder="INR" {...form.register("currency")} />
              <FieldError message={errors.currency?.message} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="appliedAt">Applied on</Label>
              <Input id="appliedAt" type="date" {...form.register("appliedAt")} />
              <FieldError message={errors.appliedAt?.message} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="source">Source</Label>
              <Input id="source" placeholder="LinkedIn" {...form.register("source")} />
              <FieldError message={errors.source?.message} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" rows={4} {...form.register("notes")} />
            <FieldError message={errors.notes?.message} />
          </div>

          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? "Saving…" : isEdit ? "Save changes" : "Add application"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  )
}
