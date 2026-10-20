import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { redirect } from "next/navigation"
import {
  ArrowRight,
  BarChart3,
  BriefcaseBusiness,
  Check,
  FileStack,
  ListChecks,
  ShieldCheck,
} from "lucide-react"
import { RetroWindow } from "@/components/retro-window"
import { Sparkles } from "@/components/sparkles"
import { Wordmark } from "@/components/wordmark"
import { buttonVariants } from "@/components/ui/button"
import { auth } from "@/lib/auth/auth"
import { cn } from "@/lib/utils"

export const metadata: Metadata = {
  title: "ManageMe — Your career workspace",
  description:
    "Track applications, resumes, documents, tasks, and career progress in one private workspace.",
}

const features = [
  {
    icon: BriefcaseBusiness,
    title: "A pipeline you can act on",
    description:
      "Move every role from saved to accepted, with company context and the exact resume you sent attached.",
  },
  {
    icon: FileStack,
    title: "Your career files, connected",
    description:
      "Keep resume versions and important documents beside the applications where they matter.",
  },
  {
    icon: ListChecks,
    title: "Follow-through built in",
    description:
      "Turn loose thoughts into tasks and projects, then work from one focused list instead of scattered notes.",
  },
  {
    icon: BarChart3,
    title: "Progress without guesswork",
    description:
      "See your live pipeline and honest conversion history without rebuilding a spreadsheet every week.",
  },
]

const outcomes = [
  "Know what needs a follow-up",
  "Open the exact file you submitted",
  "Keep job-search work out of your head",
]

export default async function Home() {
  const session = await auth()
  if (session) redirect("/dashboard")

  return (
    <div className="bg-background min-h-dvh overflow-hidden">
      <header className="border-card-border bg-surface sticky top-0 z-20 border-b-2">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8">
          <Link href="/" aria-label="ManageMe home">
            <Wordmark />
          </Link>
          <nav aria-label="Primary" className="flex items-center gap-2">
            <a
              href="#features"
              className="text-muted-foreground hover:text-foreground hidden px-3 py-2 text-sm font-medium transition-colors sm:inline-flex"
            >
              Features
            </a>
            <Link href="/login" className={buttonVariants({ variant: "ghost", size: "sm" })}>
              Log in
            </Link>
            <Link href="/signup" className={buttonVariants({ size: "sm" })}>
              Get started
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="relative isolate">
          <Sparkles className="-z-10" />
          <div className="mx-auto grid max-w-7xl items-center gap-14 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-[0.88fr_1.12fr] lg:gap-12 lg:py-28">
            <div className="max-w-2xl">
              <div className="bg-window-tan text-ink eyebrow inline-flex items-center gap-2 border-2 border-[#201a3a] px-3 py-1 font-bold shadow-[2px_2px_0_#201a3a]">
                <span className="bg-stage-accepted size-2 rounded-full border border-[#201a3a]" />
                One calm place for the whole search
              </div>
              <h1 className="mt-6 text-4xl leading-[1.05] text-balance sm:text-5xl lg:text-6xl">
                Run your career like a system, not a scatter of tabs.
              </h1>
              <p className="text-muted-foreground mt-6 max-w-xl text-base leading-7 sm:text-lg">
                ManageMe brings applications, resumes, documents, tasks, and progress into one
                private workspace—so the next right move is always clear.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href="/signup" className={buttonVariants({ size: "lg" })}>
                  Create your workspace
                  <ArrowRight />
                </Link>
                <Link href="/login" className={buttonVariants({ variant: "outline", size: "lg" })}>
                  I already have an account
                </Link>
              </div>
              <ul className="text-muted-foreground mt-8 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                {outcomes.map((outcome) => (
                  <li key={outcome} className="flex items-center gap-2">
                    <span className="bg-lozenge-accepted text-lozenge-accepted-fg border-card-border flex size-5 items-center justify-center rounded-full border-2">
                      <Check className="size-3.5" strokeWidth={2.5} />
                    </span>
                    {outcome}
                  </li>
                ))}
              </ul>
            </div>

            <div className="relative mx-auto w-full max-w-3xl lg:max-w-none">
              <RetroWindow
                title="career-workspace.png"
                tone="coral"
                className="relative overflow-hidden"
                bodyClassName="bg-ink p-2 sm:p-3"
              >
                <Image
                  src="/images/career-workspace.png"
                  alt="A focused career workspace showing an application list and progress timeline"
                  width={1536}
                  height={1024}
                  className="h-auto w-full"
                  sizes="(max-width: 1024px) 100vw, 58vw"
                  preload
                />
              </RetroWindow>
            </div>
          </div>
        </section>

        <section id="features" className="border-card-border bg-surface scroll-mt-20 border-y-2">
          <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-24">
            <div className="max-w-2xl">
              <p className="eyebrow text-primary font-bold">
                Built for follow-through
              </p>
              <h2 className="font-heading mt-3 text-3xl font-normal text-balance sm:text-4xl">
                Everything around an opportunity stays together.
              </h2>
              <p className="text-muted-foreground mt-4 leading-7">
                ManageMe keeps the details connected without turning your job search into a
                second job.
              </p>
            </div>

            <div className="border-card-border bg-card-border shadow-overlay mt-12 grid gap-[2px] overflow-hidden border-2 sm:grid-cols-2">
              {features.map(({ icon: Icon, title, description }) => (
                <article key={title} className="bg-card p-6 sm:p-8">
                  <span className="bg-window-orange text-ink flex size-10 items-center justify-center border-2 border-[#201a3a] shadow-[2px_2px_0_#201a3a]">
                    <Icon className="size-5" />
                  </span>
                  <h3 className="font-heading mt-5 text-xl font-normal">{title}</h3>
                  <p className="text-muted-foreground mt-2 text-sm leading-6">{description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-24">
          <div className="bg-card border-card-border shadow-overlay grid overflow-hidden border-2 lg:grid-cols-[0.8fr_1.2fr]">
            <div className="bg-window-lavender border-card-border relative flex items-center justify-center overflow-hidden border-b-2 p-10 sm:p-14 lg:border-r-2 lg:border-b-0">
              <div className="bg-card border-card-border shadow-overlay relative flex size-28 items-center justify-center border-2">
                <ShieldCheck className="text-primary size-14" strokeWidth={1.5} />
              </div>
            </div>
            <div className="p-8 sm:p-12">
              <p className="eyebrow text-primary font-bold">
                Private by design
              </p>
              <h2 className="font-heading mt-3 text-2xl font-normal sm:text-3xl">
                Your search is personal. Your workspace should be too.
              </h2>
              <p className="text-muted-foreground mt-4 max-w-2xl leading-7">
                Account-scoped data, protected file access, encrypted stored credentials, and
                opt-in product analytics keep control where it belongs—with you.
              </p>
            </div>
          </div>
        </section>

        <section className="bg-ink text-paper relative overflow-hidden px-5 py-20 sm:px-8">
          <Sparkles />
          <div className="relative mx-auto flex max-w-3xl flex-col items-center text-center">
            <p className="eyebrow font-bold text-[#f2b755]">
              Make the next move obvious
            </p>
            <h2 className="font-heading mt-4 text-3xl font-normal text-balance sm:text-4xl">
              Give your career work one reliable home.
            </h2>
            <p className="mt-4 max-w-xl text-sm leading-6 text-[#f4dccb] sm:text-base">
              Start with the applications already on your mind. ManageMe will help you keep the
              rest connected.
            </p>
            <Link
              href="/signup"
              className={cn(
                buttonVariants({ size: "lg" }),
                "mt-8 border-[#fff4e7] shadow-[3px_3px_0_#fff4e7] hover:shadow-[1px_1px_0_#fff4e7]"
              )}
            >
              Get started
              <ArrowRight />
            </Link>
          </div>
        </section>
      </main>

      <footer className="bg-surface border-card-border border-t-2">
        <div className="text-muted-foreground mx-auto flex max-w-7xl flex-col gap-4 px-5 py-8 text-xs sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <Wordmark />
          <p>Applications, files, and follow-through—in one place.</p>
        </div>
      </footer>
    </div>
  )
}
