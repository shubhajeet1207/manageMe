"use client"

import { useState } from "react"
import { XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { tagChipClassName } from "@/components/tag-chip"

/**
 * The chip interaction from the resume skills editor, as a CONTROLLED FIELD —
 * shared by the document vault and the link library.
 *
 * The skills editor is an autosaving section that queues its own writes; this
 * is a value inside a form submitted once, so it owns no transitions and no
 * server call. The two share the chip treatment (`tag-chip.tsx`) and nothing
 * else, which is the honest split: rebuilding either around the other's
 * contract would be unrelated work with a real regression risk.
 */
export function TagInput({
  id,
  value,
  onChange,
  maxTags,
  maxLength,
  suggestions = [],
  placeholder = "research",
  disabled = false,
}: {
  id?: string
  value: string[]
  onChange: (next: string[]) => void
  maxTags: number
  maxLength: number
  suggestions?: string[]
  placeholder?: string
  disabled?: boolean
}) {
  const [draft, setDraft] = useState("")
  const [error, setError] = useState<string | null>(null)

  const full = value.length >= maxTags

  function has(tag: string): boolean {
    return value.some((existing) => existing.toLocaleLowerCase() === tag.toLocaleLowerCase())
  }

  function add(raw: string) {
    const next = raw.trim()
    if (next === "") return

    // The schema deduplicates case-insensitively rather than refusing, so a
    // clashing tag would be accepted and then quietly not appear. Refusing it
    // here is the only place the user can be told why.
    const clash = value.find(
      (existing) => existing.toLocaleLowerCase() === next.toLocaleLowerCase()
    )
    if (clash) {
      setError(
        clash === next
          ? `“${clash}” is already added.`
          : `“${clash}” is already added — tags match without case.`
      )
      return
    }

    if (full) {
      setError(`Add at most ${maxTags} tags.`)
      return
    }

    setDraft("")
    setError(null)
    onChange([...value, next])
  }

  const unused = suggestions.filter((tag) => !has(tag))

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          id={id}
          value={draft}
          maxLength={maxLength}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          placeholder={placeholder}
          className="min-w-0 flex-1"
          onChange={(event) => {
            setDraft(event.target.value)
            setError(null)
          }}
          onKeyDown={(event) => {
            // Enter inside a form would submit it with a half-typed tag still
            // sitting in the box, which is never what was meant.
            if (event.key !== "Enter") return
            event.preventDefault()
            add(draft)
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => add(draft)}
        >
          Add
        </Button>
      </div>

      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}

      {value.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {value.map((tag) => (
            <li key={tag} className={tagChipClassName}>
              {tag}
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChange(value.filter((existing) => existing !== tag))}
                aria-label={`Remove ${tag}`}
                className="text-subtlest hover:text-foreground focus-visible:ring-ring -mr-1 rounded-full p-0.5 transition-colors outline-none focus-visible:ring-2 disabled:opacity-50"
              >
                <XIcon className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-xs">Press Enter to add a tag.</p>
      )}

      {unused.length > 0 && !full ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-muted-foreground text-xs">Common:</span>
          {unused.map((tag) => (
            <Button
              key={tag}
              type="button"
              variant="ghost"
              size="xs"
              disabled={disabled}
              onClick={() => add(tag)}
            >
              {tag}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
