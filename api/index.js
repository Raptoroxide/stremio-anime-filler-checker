// Vercel serverless function — the single entry point for every route.
//
// This project intentionally uses one function file plus the rewrites declared
// in vercel.json, so that /manifest.json, /stream/..., /subtitles/...,
// /health, /check, /badge.vtt and / are all served by the same warm instance
// (better cache locality). Do not start an HTTP listener here — that is what
// dev-server.mjs is for during local development.

import { createApp } from '../src/server.js'

const app = createApp({ env: process.env })

export default async function handler (req, res) {
  await app.handle(req, res)
}
