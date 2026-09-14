import { defineConfig } from "vitest/config"
import { config } from "dotenv"
import path from "path"

// No-ops when there is no .env file (CI), and dotenv never overwrites a variable
// the environment already carries, so a workflow's DATABASE_URL wins.
config()

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "next.config.test.ts"],
    // The first test in any DB-touching file absorbs Neon connection warm-up and
    // has measured 4990-8489ms against a remote (us-west-2) database, straddling
    // vitest's 5000ms default.
    testTimeout: 30_000,

    // CONCURRENCY — deliberately left at vitest's default, and deliberately not
    // set in this file at all.
    //
    // The lever, when the suite needs one, is the VITEST_MAX_WORKERS environment
    // variable, which vitest reads ITSELF: its `resolveConfig` applies
    // `Number.parseInt(process.env.VITEST_MAX_WORKERS)` AFTER resolving whatever
    // this file said, so a `maxWorkers` key here is overwritten by it — dead
    // config that reads like a limit and limits nothing. Note it is an integer
    // count and NOT a share of the cores: through that variable
    // `parseInt("50%")` is 50, i.e. fifty workers, the opposite of turning
    // concurrency down.
    //
    // Concurrency IS the lever for serialization-conflict flakiness — see the
    // comment block around SERIALIZATION_ATTEMPTS in
    // src/server/repositories/application-repository.ts, which says the next
    // move is to reduce write pressure rather than to raise the retry budget.
    // But the suite is green today at the default worker count: in CI the
    // database is a service container one hop away, and locally the retry budget
    // already absorbs it. Capping it here would roughly double the wall clock of
    // a four-minute suite to buy a margin nothing has asked for, and would make
    // this file, not the repository, the place the next person looks for that
    // trade-off.
    //
    // (`poolOptions.threads.maxThreads` would be the wrong shape for that cap
    // whatever the pool is — `maxWorkers` is the pool-agnostic knob. And vitest
    // 4's runtime default pool is `threads`, not `forks`: `resolved.pool ??=
    // "threads"` in its resolveConfig, despite the stale `@default 'forks'` its
    // .d.ts still carries.)

    coverage: {
      // v8's own counters — no source instrumentation, so the run is not slowed
      // and what is measured is the code that actually executed.
      provider: "v8",
      // text-summary for the CI log, lcov for anything that ingests coverage,
      // html for reading it locally. Not "text": a per-file table of ~200 files
      // buries the totals it is printed for.
      reporter: ["text-summary", "html", "lcov"],
      reportsDirectory: "./coverage",
      // Without an explicit include, v8 reports only files a test imported, so
      // an untested module reads as absent rather than as 0% and the total
      // flatters itself. Scoped to .ts on purpose: .tsx is React components and
      // pages, which this suite does not render — Playwright covers those, and
      // counting them here would report a number about the wrong test suite.
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/*.d.ts", "src/generated/**"],
      // No thresholds. A threshold set from a number nobody has measured either
      // fails CI on its first run or is chosen low enough to never fail, and
      // both teach the team to ignore it. Measure first (`pnpm test
      // --coverage`), then set thresholds at or just below the real figure so
      // the gate means "do not regress".
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
