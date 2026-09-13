import type { Metadata } from "next"
import { Inter } from "next/font/google"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"
import "./globals.css"

// Atlassian Sans is proprietary, so Jira's typography is reproduced with Inter —
// the same grotesque-with-a-tall-x-height brief, and the closest freely
// licensable face to it. ADS's own font.family.body fallback stack sits behind
// it in globals.css, so a failed font fetch still lands on the stack Atlassian
// would have fallen back to.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
})

export const metadata: Metadata = {
  title: "ManageMe",
  description: "Career & productivity management platform",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
