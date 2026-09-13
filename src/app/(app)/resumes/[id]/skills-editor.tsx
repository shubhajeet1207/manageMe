"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { MAX_RESUME_SKILLS, MAX_SKILL_LENGTH } from "@/server/validators/resume-schemas"
import { setResumeSkillsAction } from "../actions"
import { skillChipClassName } from "../skill-chip"

export function SkillsEditor({ resumeId, skills }: { resumeId: string; skills: string[] }) {
  const router = useRouter()
  const [value, setValue] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  // What the user sees between pressing Enter and the write coming back.
  // Without it every tag costs a round trip before it appears, which makes
  // typing a handful of them feel broken. It is dropped only when a write
  // fails: on success it is exactly what the server now holds, so following
  // `skills` again would gain nothing and would flicker on the way.
  const [written, setWritten] = useState<string[] | null>(null)
  const queued = useRef<string[] | null>(null)
  const writing = useRef(false)

  const current = written ?? skills

  function save(next: string[]) {
    setError(null)
    setWritten(next)

    // Every write replaces the whole list, so two in flight at once is a lost
    // tag waiting to happen: the older response lands second and undoes the
    // newer one. One at a time, and a tag typed while one is in flight waits
    // its turn — carrying everything typed before it, since each write sends
    // the entire list.
    queued.current = next
    if (writing.current) return
    writing.current = true

    startTransition(async () => {
      try {
        let target = queued.current
        while (target) {
          queued.current = null
          const result = await setResumeSkillsAction({ resumeId, skills: target })
          if (!result.success) {
            setWritten(null)
            const fieldError = result.fieldErrors?.skills?.[0]
            if (fieldError) setError(fieldError)
            else toast.error(result.formError ?? "Something went wrong. Please try again.")
            return
          }
          target = queued.current
        }
        router.refresh()
      } finally {
        queued.current = null
        writing.current = false
      }
    })
  }

  function onAdd(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const next = value.trim()
    if (next === "") return

    // The schema deduplicates case-insensitively rather than refusing, so a
    // clashing tag would be accepted and then quietly not appear. Refusing it
    // here is the only place the user can be told why.
    const clash = current.find((skill) => skill.toLocaleLowerCase() === next.toLocaleLowerCase())
    if (clash) {
      setError(
        clash === next
          ? `“${clash}” is already on this resume.`
          : `“${clash}” is already on this resume — skills match without case, so “${next}” would be the same tag.`
      )
      return
    }

    if (current.length >= MAX_RESUME_SKILLS) {
      setError(
        `This resume already lists ${MAX_RESUME_SKILLS} skills, which is the most it can carry.`
      )
      return
    }

    setValue("")
    save([...current, next])
  }

  function onRemove(skill: string) {
    save(current.filter((existing) => existing !== skill))
  }

  return (
    <div className="border-card-border bg-card space-y-3 rounded-lg border p-3">
      <form onSubmit={onAdd} className="flex flex-wrap items-center gap-2">
        <Input
          value={value}
          maxLength={MAX_SKILL_LENGTH}
          aria-label="Add a skill"
          aria-invalid={error ? true : undefined}
          placeholder="Kubernetes"
          className="w-full sm:w-64"
          onChange={(event) => {
            setValue(event.target.value)
            setError(null)
          }}
        />
        {/* Never disabled while a write is in flight: a disabled default button
            takes implicit form submission with it, so Enter would silently do
            nothing for as long as the previous tag was still saving — which is
            exactly when the next one is being typed. `save` queues instead. */}
        <Button type="submit" variant="outline" size="sm">
          Add
        </Button>
        <span className="text-muted-foreground text-xs">Press Enter to add.</span>
      </form>

      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}

      {current.length === 0 ? (
        <p className="text-muted-foreground max-w-2xl text-sm">
          Nothing listed yet. Add the handful this resume actually leads with — they show
          beside it in the library, which is how you tell two slots apart when you are
          picking one to send.
        </p>
      ) : (
        <ul className="flex flex-wrap gap-1.5" aria-busy={isPending}>
          {current.map((skill) => (
            <li key={skill} className={skillChipClassName}>
              {skill}
              <button
                type="button"
                onClick={() => onRemove(skill)}
                aria-label={`Remove ${skill}`}
                className="text-subtlest hover:text-foreground focus-visible:ring-ring -mr-1 rounded-full p-0.5 transition-colors outline-none focus-visible:ring-2"
              >
                <XIcon className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
