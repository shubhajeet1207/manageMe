import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next 16 logs every incoming request in dev, arguments included — so a
  // Server Action call is printed to the terminal payload and all. For
  // `createCredentialAction`/`updateCredentialAction` that payload IS the
  // vault: a stored password, in plain text, in the dev server's own output.
  // The same logging printed a user's ManageMe account password at signup.
  // This is not a style preference: it must stay off, in every environment
  // this config applies to, or a credential typed into the form is a
  // credential typed into the log.
  // Next 16 logs every incoming request in dev, arguments included — so a
  // Server Action call is printed to the terminal payload and all. For
  // `createCredentialAction`/`updateCredentialAction` that payload IS the
  // vault: a stored password, in plain text, in the dev server's own output.
  // The same logging printed a user's ManageMe account password at signup.
  // This is not a style preference: it must stay off, in every environment
  // this config applies to, or a credential typed into the form is a
  // credential typed into the log.
  logging: {
    incomingRequests: false,
  },
  experimental: {
    // Next 16 enforces TWO independent body-size limits before a request
    // reaches our code, and each is a separate footgun:
    //
    // - `serverActions.bodySizeLimit` governs the Server Actions body parser.
    //   Its default (1mb) rejects a real resume with an opaque framework
    //   error before validatePdfUpload ever runs.
    // - `proxyClientMaxBodySize` governs the proxy's cloned request stream,
    //   upstream of Server Actions entirely. Its default is exactly
    //   10485760 bytes (10MB) — see DEFAULT_BODY_CLONE_SIZE_LIMIT /
    //   getCloneableBody in next/dist/server/body-streams.js — and unlike the
    //   Server Actions limit, it does NOT reject an oversized request: it
    //   silently stops forwarding bytes past the limit (`p1.push(null)`),
    //   truncating the body. That produced a corrupt file on disk with a row
    //   in the database and no error anywhere.
    //
    // Both MUST stay set, and both MUST stay above MAX_UPLOAD_BYTES
    // (src/server/files/pdf.ts, currently 10MB) — a limit sitting at or below
    // that cap makes Next answer instead of our own
    // "This file is larger than 10MB" message (§4, §8.3). Raising one without
    // the other reintroduces exactly this bug. Matched to `serverActions` below.
    serverActions: {
      bodySizeLimit: "12mb",
    },
    proxyClientMaxBodySize: "12mb",
  },
};

export default nextConfig;
