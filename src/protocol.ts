// The panel <-> worker contract: src/panel.tsx and worker/main.mjs both read it.
export {}

export type Issue = {
  id: string
  summary: string
  state: string | null
  project: string | null
  url: string
}

export type Project = { id: string; name: string; hostId: string | null }

/** Handlers answer with `error` instead of throwing so the panel can show YouTrack's message. */
export type Result<T> = ({ ok: true } & T) | { ok: false; error: string; auth?: boolean }

declare module 'orca' {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- declaration merging needs an interface
  interface PluginRequests {
    'youtrack.status': { input: undefined; output: { apiUrl: string; hasToken: boolean } }
    'youtrack.connect': {
      input: { apiUrl: string; token: string }
      output: Result<{ login: string }>
    }
    'youtrack.clearToken': { input: undefined; output: { ok: true } }
    'youtrack.issues': { input: { mineOnly: boolean }; output: Result<{ issues: Issue[] }> }
    'youtrack.projects': { input: undefined; output: Result<{ projects: Project[] }> }
    'youtrack.start': {
      input: { issueId: string; projectId: string; hostId: string | null }
      output: Result<{ workspaceId: string }>
    }
  }
}
