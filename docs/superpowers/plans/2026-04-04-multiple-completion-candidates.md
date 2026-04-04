# Multiple Completion Candidates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add support for generating multiple AI completion candidates and cycling through them with keyboard shortcuts.

**Architecture:** Modify `CompletionEngine` to request `n` completions, update `SuggestWidget` to hold a candidates array with next/prev cycling, and register two new commands in `main.ts`.

**Tech Stack:** TypeScript, Obsidian API, OpenAI-compatible API

---

### Task 1: Add `completionCount` setting

**Files:**
- Modify: `src/settings.ts`

Add `completionCount: number` to `CopilotSettings` and `DEFAULT_SETTINGS`, and add a slider in the settings UI.

### Task 2: Update `CompletionEngine` to return multiple candidates

**Files:**
- Modify: `src/completion.ts`

Change `getCompletion` to `getCompletions`, pass `n: settings.completionCount`, parse all choices into `string[]`, and implement fallback to `n=1` if the API rejects multi-choice.

### Task 3: Update `SuggestWidget` for candidate cycling

**Files:**
- Modify: `src/ui/suggest.ts`

Change `show` to accept `candidates: string[]`. Add `next()` and `prev()` methods. Update the hint element to show current index and total count when >1.

### Task 4: Register cycling commands and integrate in `main.ts`

**Files:**
- Modify: `src/main.ts`

Add `next-completion` (default `Alt+]`) and `prev-completion` (default `Alt+[`) commands. Update `requestCompletion` to call `getCompletions` and pass the array to `suggestWidget.show`.

### Task 5: Build and test

**Files:**
- All

Run `npm run build`, then `npm run deploy` to test in Obsidian.
