import {
  atom,
  Badge,
  Button,
  Callout,
  Checkbox,
  EmptyState,
  host,
  IconButton,
  Input,
  List,
  ListItem,
  plugin,
  read,
  Row,
  Select,
  set,
  Spinner,
  Stack,
  Text,
  type PanelContext
} from 'orca'
import type { Issue, Project } from './protocol'

const connected = atom<boolean | null>(null)
const urlDraft = atom('')
const tokenDraft = atom('')
const loading = atom(false)
const busy = atom(false)
const error = atom<string | null>(null)
const notice = atom<string | null>(null)
const issues = atom<Issue[]>([])
const projects = atom<Project[]>([])
const selectedIssue = atom<string | null>(null)
// Remembered across restarts: the project you start issues in rarely changes.
const projectId = atom<string>('projectId', '', { persist: 'storage' })
const mineOnly = atom<boolean>('mineOnly', true, { persist: 'storage' })

async function refresh(): Promise<void> {
  set(loading, true)
  set(error, null)
  const [issueResult, projectResult] = await Promise.all([
    plugin.request('youtrack.issues', { mineOnly: read(mineOnly) }),
    plugin.request('youtrack.projects', undefined)
  ])
  set(loading, false)
  if (issueResult.ok) {
    set(issues, issueResult.issues)
  } else {
    set(error, issueResult.error)
    if (issueResult.auth) {
      set(connected, false)
    }
  }
  if (projectResult.ok) {
    set(projects, projectResult.projects)
  } else {
    set(error, projectResult.error)
  }
}

async function connect(): Promise<void> {
  const apiUrl = read(urlDraft).trim()
  const token = read(tokenDraft).trim()
  if (!apiUrl || !token) {
    return
  }
  set(busy, true)
  const result = await plugin.request('youtrack.connect', { apiUrl, token })
  set(busy, false)
  if (!result.ok) {
    set(error, result.error)
    return
  }
  set(tokenDraft, '')
  set(error, null)
  set(notice, `Signed in as ${result.login}.`)
  set(connected, true)
  await refresh()
}

async function signOut(): Promise<void> {
  await plugin.request('youtrack.clearToken', undefined)
  set(connected, false)
  set(issues, [])
  set(notice, null)
}

async function start(issue: Issue): Promise<void> {
  const project = read(projects).find((p) => p.id === read(projectId))
  if (!project) {
    set(error, 'Pick the project to start the issue in.')
    return
  }
  set(busy, true)
  set(error, null)
  const result = await plugin.request('youtrack.start', {
    issueId: issue.id,
    projectId: project.id,
    hostId: project.hostId
  })
  set(busy, false)
  if (result.ok) {
    set(notice, `Started ${issue.id} in ${project.name}.`)
  } else {
    set(error, result.error)
  }
}

export function setup(_ctx: PanelContext): void {
  void plugin.request('youtrack.status', undefined).then(({ apiUrl, hasToken }) => {
    set(urlDraft, apiUrl)
    set(connected, Boolean(apiUrl) && hasToken)
    if (apiUrl && hasToken) {
      void refresh()
    }
  })
}

function ConnectForm() {
  const ready = read(urlDraft).trim() && read(tokenDraft).trim()
  return (
    <Stack gap="sm">
      <Callout tone="accent" title="Connect YouTrack" icon="plug">
        Enter your YouTrack address and a permanent token (Profile, Account Security, Tokens). The
        address goes in Orca's settings, the token in your OS keyring.
      </Callout>
      <Input
        label="YouTrack URL"
        placeholder="https://youtrack.example.com"
        value={read(urlDraft)}
        onChange={(value) => set(urlDraft, value)}
      />
      <Input
        label="Permanent token"
        type="password"
        placeholder="perm:..."
        value={read(tokenDraft)}
        onChange={(value) => set(tokenDraft, value)}
        onSubmit={() => void connect()}
      />
      <Button variant="solid" disabled={read(busy) || !ready} onPress={() => void connect()}>
        {read(busy) ? 'Checking...' : 'Connect'}
      </Button>
    </Stack>
  )
}

function IssueDetail({ issue }: { issue: Issue }) {
  return (
    <Row gap="xs" wrap>
      <Button
        variant="solid"
        icon="play"
        disabled={read(busy) || !read(projectId)}
        onPress={() => void start(issue)}
      >
        Start {issue.id}
      </Button>
      <Button
        variant="outline"
        icon="open-external"
        onPress={() => void host.call('shell.openExternal', { url: issue.url })}
      >
        Open
      </Button>
    </Row>
  )
}

function IssueList() {
  const list = read(issues)
  if (read(loading) && list.length === 0) {
    return <Spinner label="Loading issues" />
  }
  if (list.length === 0) {
    return <EmptyState icon="check" title="No issues" description="Nothing matches your query." />
  }
  const selected = read(selectedIssue)
  return (
    <List label="Issues">
      {list.map((issue) => (
        <ListItem
          key={issue.id}
          title={`${issue.id}  ${issue.summary}`}
          description={[issue.state, issue.project].filter(Boolean).join(' · ')}
          current={issue.id === selected}
          onPress={() => set(selectedIssue, issue.id === selected ? null : issue.id)}
        >
          {issue.id === selected ? <IssueDetail issue={issue} /> : null}
        </ListItem>
      ))}
    </List>
  )
}

export default function Panel() {
  const state = read(connected)
  const err = read(error)
  const info = read(notice)
  return (
    <Stack gap="md">
      {err ? <Callout tone="danger" title="YouTrack" icon="error">{err}</Callout> : null}
      {info ? <Text tone="success">{info}</Text> : null}
      {state === null ? <Spinner label="Loading" /> : null}
      {state === false ? <ConnectForm /> : null}
      {state ? (
        <Stack gap="sm">
          <Row justify="between">
            <Badge tone="accent">{read(issues).length} issues</Badge>
            <Row gap="xs">
              <IconButton
                icon="refresh"
                label="Refresh"
                disabled={read(loading)}
                onPress={() => void refresh()}
              />
              <IconButton icon="close" label="Forget token" onPress={() => void signOut()} />
            </Row>
          </Row>
          <Checkbox
            label="Assigned to me"
            checked={read(mineOnly)}
            onChange={(checked) => {
              set(mineOnly, checked)
              set(selectedIssue, null)
              void refresh()
            }}
          />
          <Select
            label="Start in project"
            placeholder="Pick a project"
            value={read(projectId)}
            options={read(projects).map((p) => ({ value: p.id, label: p.name }))}
            onChange={(value) => set(projectId, value)}
          />
          <IssueList />
        </Stack>
      ) : null}
    </Stack>
  )
}
