"use client"

import { useTheme } from "next-themes"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const THEMES = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
]

export function AppearanceForm() {
  const { theme, setTheme } = useTheme()

  return (
    <div className="space-y-2">
      <Label>Theme</Label>
      <Select value={theme ?? "system"} onValueChange={setTheme}>
        <SelectTrigger aria-label="Theme" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {THEMES.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-muted-foreground text-sm">
        System follows whatever your device is set to.
      </p>
    </div>
  )
}
