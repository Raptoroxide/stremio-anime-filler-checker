#!/usr/bin/env node
// Tiny local development server. Production runs on Vercel (see api/index.js);
// this file only exists so `npm start` works without any extra tooling.

import http from 'node:http'
import { createApp } from './src/server.js'

const PORT = Number(process.env.PORT || 3000)
const HOST = process.env.HOST || '0.0.0.0'

const app = createApp({ env: process.env })

const server = http.createServer((req, res) => {
  app.handle(req, res).catch((err) => {
    console.error('[dev] unhandled route error:', err && err.message)
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ error: 'internal_error' }))
    }
  })
})

server.listen(PORT, HOST, () => {
  console.log('Anime Filler Checker (local dev server)')
  console.log(`  Landing page : http://localhost:${PORT}/`)
  console.log(`  Manifest URL : http://localhost:${PORT}/manifest.json`)
  console.log(`  Health check : http://localhost:${PORT}/health`)
  console.log('Press Ctrl+C to stop.')
})
