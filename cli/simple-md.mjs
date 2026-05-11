#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, extname, isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const markdownExtensions = new Set(['.md', '.markdown', '.mdown', '.mkd'])
const cliDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(cliDir, '..')

const args = process.argv.slice(2)

if (args.includes('--help') || args.includes('-h')) {
  printHelp()
  process.exit(0)
}

const targets = []
const errors = []

for (const arg of args) {
  if (arg.startsWith('-')) {
    errors.push(`Unknown option: ${arg}`)
    continue
  }

  const target = isAbsolute(arg) ? arg : resolve(process.cwd(), arg)

  if (!existsSync(target)) {
    errors.push(`Not found: ${arg}`)
    continue
  }

  const stats = statSync(target)

  if (stats.isDirectory()) {
    targets.push(target)
    continue
  }

  if (stats.isFile() && markdownExtensions.has(extname(target).toLowerCase())) {
    targets.push(target)
    continue
  }

  errors.push(`Not a folder or Markdown file: ${arg}`)
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(`simple-md: ${error}`)
  }
  console.error('Try `simple-md --help` for usage.')
  process.exit(1)
}

const appCommand = findAppCommand()

if (!appCommand) {
  console.error('simple-md: could not find the Simple MD desktop app.')
  console.error('Set SIMPLE_MD_APP_PATH to the app executable or install Simple MD in /Applications.')
  process.exit(1)
}

const child = spawn(appCommand.command, [...appCommand.args, ...targets], {
  detached: true,
  stdio: 'ignore',
})

child.on('error', (error) => {
  console.error(`simple-md: ${error.message}`)
  process.exit(1)
})

child.unref()

function printHelp() {
  console.log(`Usage: simple-md [folder-or-markdown-file ...]

Open folders and Markdown files in Simple MD.

Examples:
  simple-md .
  simple-md notes README.md
  SIMPLE_MD_APP_PATH="/Applications/Simple MD.app/Contents/MacOS/simple_md" simple-md docs
`)
}

function findAppCommand() {
  const candidates = [
    process.env.SIMPLE_MD_APP_PATH,
    '/Applications/Simple MD.app/Contents/MacOS/simple_md',
    `${homedir()}/Applications/Simple MD.app/Contents/MacOS/simple_md`,
    resolve(repoRoot, 'src-tauri/target/debug/simple_md'),
    resolve(repoRoot, 'src-tauri/target/release/simple_md'),
  ].filter(Boolean)

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return { command: candidate, args: [] }
    }
  }

  if (process.platform === 'darwin') {
    return { command: 'open', args: ['-a', 'Simple MD'] }
  }

  return null
}
