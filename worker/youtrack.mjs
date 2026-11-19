// YouTrack REST client. Kept apart from Orca's API so it can move to `taskSources` when that ships.

export class YouTrackError extends Error {
  /** @param {string} message @param {number} [status] */
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

/** Accepts the web address or the API root: `https://host` and `https://host/api/` both give `https://host/api`. */
export const normalizeApi = (apiUrl) => {
  const trimmed = apiUrl.trim().replace(/\/+$/, '')
  return /\/api$/.test(trimmed) ? trimmed : `${trimmed}/api`
}

/** The web root for issue links: the API URL without its trailing `/api`. */
export const webRoot = (apiUrl) => normalizeApi(apiUrl).replace(/\/api$/, '')

/**
 * @param {{ apiUrl: string, token: string }} config
 * @param {string} path
 * @param {Record<string, string | number>} [params]
 */
async function get(config, path, params = {}) {
  const url = new URL(`${normalizeApi(config.apiUrl)}/${path}`)
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value))
  }
  let response
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${config.token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(15000)
    })
  } catch (error) {
    throw new YouTrackError(`Cannot reach ${url.host}: ${error.message}`)
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    const detail = body?.error_description ?? body?.error ?? response.statusText
    throw new YouTrackError(`YouTrack answered ${response.status}: ${detail}`, response.status)
  }
  return response.json()
}

/** @param {{ apiUrl: string, token: string }} config */
export async function currentUser(config) {
  return get(config, 'users/me', { fields: 'login,name' })
}

/** @param {{ apiUrl: string, token: string }} config @param {string} query */
export async function searchIssues(config, query) {
  const issues = await get(config, 'issues', {
    query,
    fields: 'idReadable,summary,project(shortName),customFields(name,value(name))',
    $top: 50
  })
  const web = webRoot(config.apiUrl)
  return issues.map((issue) => ({
    id: issue.idReadable,
    summary: issue.summary ?? '',
    // State is a custom field in YouTrack, not a top-level one.
    state: issue.customFields?.find((field) => field.name === 'State')?.value?.name ?? null,
    project: issue.project?.shortName ?? null,
    url: `${web}/issue/${issue.idReadable}`
  }))
}

/** @param {{ apiUrl: string, token: string }} config @param {string} id */
export async function getIssue(config, id) {
  const issue = await get(config, `issues/${encodeURIComponent(id)}`, {
    fields: 'idReadable,summary,description'
  })
  return {
    id: issue.idReadable,
    summary: issue.summary ?? '',
    description: issue.description ?? '',
    url: `${webRoot(config.apiUrl)}/issue/${issue.idReadable}`
  }
}
