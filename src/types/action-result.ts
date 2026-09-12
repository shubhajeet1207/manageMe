export type ActionResult =
  | { success: true }
  | {
      success: false
      fieldErrors?: Record<string, string[] | undefined>
      formError?: string
    }
