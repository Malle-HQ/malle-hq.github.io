type Json = Record<string, unknown>
type RuntimeEnv = Env & { ADMIN_PASSWORD: string }

const TRIP_ID = 'malle-2027'
const TRIP_SLUG = 'malle-2027'
const editableByCrew = ['availabilities', 'locationOptions', 'liveEvents']

function cors(env: Env) {
  return {
    'Access-Control-Allow-Origin': env.WEB_ORIGIN,
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
    'Vary': 'Origin',
  }
}

function json(env: Env, body: unknown, status = 200) {
  return Response.json(body, { status, headers: cors(env) })
}

async function hash(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

async function secureEqual(left: string, right: string) {
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', new TextEncoder().encode(left)),
    crypto.subtle.digest('SHA-256', new TextEncoder().encode(right)),
  ])
  return crypto.subtle.timingSafeEqual(a, b)
}

function token() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

async function body(request: Request): Promise<Json> {
  const length = Number(request.headers.get('content-length') || 0)
  if (length > 1_000_000) throw new Error('PAYLOAD_TOO_LARGE')
  return request.json<Json>()
}

async function currentProfile(request: Request, env: Env) {
  const auth = request.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return null
  return env.DB.prepare('SELECT id, name, prefix, nickname, role, status, color, avatar_key, visible FROM profiles WHERE session_hash = ? AND trip_id = ?')
    .bind(await hash(auth.slice(7)), TRIP_ID).first()
}

async function requireProfile(request: Request, env: Env, adminOnly = false) {
  const profile = await currentProfile(request, env)
  if (!profile || (adminOnly && profile.role !== 'Harter Kern')) return null
  return profile
}

async function readTrip(env: Env) {
  const row = await env.DB.prepare('SELECT content FROM trips WHERE id = ?').bind(TRIP_ID).first<{ content: string }>()
  return row ? JSON.parse(row.content) as Json : null
}

async function writeTrip(env: Env, content: Json) {
  await env.DB.prepare('INSERT INTO trips (id, slug, content, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET content = excluded.content, updated_at = CURRENT_TIMESTAMP')
    .bind(TRIP_ID, TRIP_SLUG, JSON.stringify(content)).run()
}

async function state(request: Request, env: Env) {
  const content = await readTrip(env)
  const profile = await currentProfile(request, env)
  const profiles = await env.DB.prepare('SELECT id, name, prefix, nickname, role, status, color, avatar_key FROM profiles WHERE trip_id = ? AND visible = 1 ORDER BY created_at').bind(TRIP_ID).all()
  const participants = profiles.results.map(item => ({
    id: item.id,
    name: `${item.prefix || ''}${item.name}`,
    nickname: item.nickname,
    role: item.role,
    status: item.status,
    color: item.color,
    avatarUrl: item.avatar_key ? `/avatars/${item.id}` : null,
  }))
  return json(env, { content, participants, profile, isAdmin: profile?.role === 'Harter Kern' })
}

async function login(request: Request, env: RuntimeEnv) {
  const data = await body(request)
  if (typeof data.password !== 'string' || !await secureEqual(data.password, env.ADMIN_PASSWORD)) return json(env, { error: 'Das Passwort stimmt noch nicht.' }, 401)
  if (!await readTrip(env)) await writeTrip(env, {})
  const session = token()
  await env.DB.prepare(`INSERT INTO profiles (id, trip_id, name, prefix, nickname, role, status, color, session_hash)
    VALUES ('owner', ?, 'Malle-Fan', '', 'Reiseleitung', 'Harter Kern', 'Dabei', '#8f5bd7', ?)
    ON CONFLICT(id) DO UPDATE SET session_hash = excluded.session_hash, role = 'Harter Kern', updated_at = CURRENT_TIMESTAMP`)
    .bind(TRIP_ID, await hash(session)).run()
  return json(env, { token: session, role: 'Harter Kern' })
}

async function saveState(request: Request, env: Env) {
  const profile = await requireProfile(request, env)
  if (!profile) return json(env, { error: 'Bitte erneut anmelden.' }, 401)
  const incoming = await body(request)
  const current = await readTrip(env) || {}
  const next = profile.role === 'Harter Kern'
    ? { ...current, ...incoming }
    : editableByCrew.reduce<Json>((result, key) => ({ ...result, [key]: incoming[key] }), { ...current })
  delete next.participants
  delete next.invitations
  delete next.myProfile
  await writeTrip(env, next)
  return json(env, { ok: true, content: next })
}

async function createInvitation(request: Request, env: Env) {
  if (!await requireProfile(request, env, true)) return json(env, { error: 'Nur der Harte Kern darf Einladungen erstellen.' }, 403)
  const data = await body(request)
  const recipient = typeof data.recipient === 'string' && data.recipient.trim() ? data.recipient.trim().slice(0, 80) : 'Offene Einladung'
  const role = data.role === 'Harter Kern' ? 'Harter Kern' : 'Crewmitglied'
  const code = `MALLE-${token().slice(0, 8).toUpperCase()}`
  await env.DB.prepare('INSERT INTO invitations (id, trip_id, code_hash, recipient, role) VALUES (?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), TRIP_ID, await hash(code), recipient, role).run()
  return json(env, { code, recipient, role })
}

async function acceptInvitation(request: Request, env: Env) {
  const data = await body(request)
  if (typeof data.code !== 'string' || typeof data.name !== 'string' || !data.name.trim()) return json(env, { error: 'Code und Name fehlen.' }, 400)
  const invitation = await env.DB.prepare('SELECT id, recipient, role, used_at FROM invitations WHERE code_hash = ? AND trip_id = ?')
    .bind(await hash(data.code.trim().toUpperCase()), TRIP_ID).first()
  if (!invitation || invitation.used_at) return json(env, { error: 'Dieser Code ist ungültig oder wurde schon verwendet.' }, 400)
  const session = token()
  const profileId = crypto.randomUUID()
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO profiles (id, trip_id, name, prefix, nickname, role, status, color, session_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(profileId, TRIP_ID, data.name.trim().slice(0, 60), typeof data.prefix === 'string' ? data.prefix.slice(0, 30) : '', typeof data.nickname === 'string' ? data.nickname.slice(0, 80) : '', invitation.role, ['Dabei','Vielleicht','Abgesagt'].includes(String(data.status)) ? data.status : 'Dabei', typeof data.color === 'string' ? data.color : '#8f5bd7', await hash(session)),
    env.DB.prepare('UPDATE invitations SET used_at = CURRENT_TIMESTAMP WHERE id = ?').bind(invitation.id),
  ])
  return json(env, { token: session, role: invitation.role, profileId })
}

async function updateProfile(request: Request, env: Env) {
  const profile = await requireProfile(request, env)
  if (!profile) return json(env, { error: 'Bitte erneut anmelden.' }, 401)
  const data = await body(request)
  if (typeof data.name !== 'string' || !data.name.trim()) return json(env, { error: 'Der Name fehlt.' }, 400)
  await env.DB.prepare('UPDATE profiles SET name = ?, prefix = ?, nickname = ?, status = ?, color = ?, visible = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .bind(data.name.trim().slice(0, 60), typeof data.prefix === 'string' ? data.prefix.slice(0, 30) : '', typeof data.nickname === 'string' ? data.nickname.slice(0, 80) : profile.nickname, ['Dabei','Vielleicht','Abgesagt'].includes(String(data.status)) ? data.status : profile.status, typeof data.color === 'string' ? data.color : profile.color, data.visible === false ? 0 : 1, profile.id).run()
  return json(env, { ok: true })
}

async function uploadAvatar(request: Request, env: Env) {
  const profile = await requireProfile(request, env)
  if (!profile) return json(env, { error: 'Bitte erneut anmelden.' }, 401)
  const type = request.headers.get('content-type') || ''
  const length = Number(request.headers.get('content-length') || 0)
  if (!['image/jpeg','image/png','image/webp'].includes(type) || length > 5_000_000) return json(env, { error: 'Bitte JPG, PNG oder WebP bis 5 MB wählen.' }, 400)
  const key = `${TRIP_ID}/${profile.id}`
  await env.PROFILE_IMAGES.put(key, request.body, { httpMetadata: { contentType: type } })
  await env.DB.prepare('UPDATE profiles SET avatar_key = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(key, profile.id).run()
  return json(env, { avatarUrl: `/avatars/${profile.id}` })
}

async function avatar(pathname: string, env: Env) {
  const id = pathname.split('/').pop()
  const profile = await env.DB.prepare('SELECT avatar_key FROM profiles WHERE id = ? AND trip_id = ?').bind(id, TRIP_ID).first<{ avatar_key: string | null }>()
  if (!profile?.avatar_key) return new Response('Not found', { status: 404, headers: cors(env) })
  const object = await env.PROFILE_IMAGES.get(profile.avatar_key)
  if (!object) return new Response('Not found', { status: 404, headers: cors(env) })
  const headers = new Headers(cors(env))
  object.writeHttpMetadata(headers)
  headers.set('Cache-Control', 'public, max-age=300')
  return new Response(object.body, { headers })
}

async function extras(request: Request, env: Env) {
  if (!await requireProfile(request, env)) return json(env, { chat: [], highlights: [], pastTrips: [], authenticated: false })
  const [chat, highlights, pastTrips] = await Promise.all([
    env.DB.prepare(`SELECT m.id, m.message, m.created_at, p.name, p.prefix, p.color
      FROM chat_messages m JOIN profiles p ON p.id = m.profile_id WHERE m.trip_id = ? ORDER BY m.created_at DESC LIMIT 100`).bind(TRIP_ID).all(),
    env.DB.prepare(`SELECT h.id, h.title, h.created_at, p.name, p.prefix
      FROM highlights h JOIN profiles p ON p.id = h.profile_id WHERE h.trip_id = ? ORDER BY h.created_at DESC LIMIT 100`).bind(TRIP_ID).all(),
    env.DB.prepare('SELECT id, title, destination, start_date, end_date, note FROM past_trips ORDER BY start_date DESC').all(),
  ])
  return json(env, {
    authenticated: true,
    chat: chat.results.map(item => ({ ...item, author: `${item.prefix || ''}${item.name}` })),
    highlights: highlights.results.map(item => ({ ...item, author: `${item.prefix || ''}${item.name}`, imageUrl: `/highlights/${item.id}` })),
    pastTrips: pastTrips.results,
  })
}

async function addChat(request: Request, env: Env) {
  const profile = await requireProfile(request, env)
  if (!profile) return json(env, { error: 'Bitte zuerst beitreten oder anmelden.' }, 401)
  const data = await body(request)
  if (typeof data.message !== 'string' || !data.message.trim()) return json(env, { error: 'Die Nachricht ist leer.' }, 400)
  await env.DB.prepare('INSERT INTO chat_messages (id, trip_id, profile_id, message) VALUES (?, ?, ?, ?)')
    .bind(crypto.randomUUID(), TRIP_ID, profile.id, data.message.trim().slice(0, 1000)).run()
  return json(env, { ok: true }, 201)
}

async function addHighlight(request: Request, env: Env) {
  const profile = await requireProfile(request, env)
  if (!profile) return json(env, { error: 'Bitte zuerst beitreten oder anmelden.' }, 401)
  const url = new URL(request.url)
  const title = (url.searchParams.get('title') || '').trim().slice(0, 100)
  const type = request.headers.get('content-type') || ''
  const length = Number(request.headers.get('content-length') || 0)
  if (!title) return json(env, { error: 'Bitte einen Titel eingeben.' }, 400)
  if (!['image/jpeg','image/png','image/webp'].includes(type) || length > 8_000_000) return json(env, { error: 'Bitte JPG, PNG oder WebP bis 8 MB wählen.' }, 400)
  const id = crypto.randomUUID()
  const key = `${TRIP_ID}/highlights/${id}`
  await env.PROFILE_IMAGES.put(key, request.body, { httpMetadata: { contentType: type } })
  await env.DB.prepare('INSERT INTO highlights (id, trip_id, profile_id, title, image_key) VALUES (?, ?, ?, ?, ?)')
    .bind(id, TRIP_ID, profile.id, title).run()
  return json(env, { ok: true }, 201)
}

async function highlightImage(pathname: string, env: Env) {
  const id = pathname.split('/').pop()
  const highlight = await env.DB.prepare('SELECT image_key FROM highlights WHERE id = ? AND trip_id = ?').bind(id, TRIP_ID).first<{ image_key: string }>()
  if (!highlight) return new Response('Not found', { status: 404, headers: cors(env) })
  const object = await env.PROFILE_IMAGES.get(highlight.image_key)
  if (!object) return new Response('Not found', { status: 404, headers: cors(env) })
  const headers = new Headers(cors(env))
  object.writeHttpMetadata(headers)
  headers.set('Cache-Control', 'public, max-age=300')
  return new Response(object.body, { headers })
}

async function addPastTrip(request: Request, env: Env) {
  const profile = await requireProfile(request, env, true)
  if (!profile) return json(env, { error: 'Nur der Harte Kern darf Reisen archivieren.' }, 403)
  const data = await body(request)
  if (![data.title, data.destination, data.startDate, data.endDate].every(value => typeof value === 'string' && value.trim())) return json(env, { error: 'Bitte alle Reisedaten ausfüllen.' }, 400)
  await env.DB.prepare('INSERT INTO past_trips (id, title, destination, start_date, end_date, note, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), String(data.title).slice(0, 100), String(data.destination).slice(0, 100), data.startDate, data.endDate, typeof data.note === 'string' ? data.note.slice(0, 1000) : '', profile.id).run()
  return json(env, { ok: true }, 201)
}

export default {
  async fetch(request, env): Promise<Response> {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(env) })
    const { pathname } = new URL(request.url)
    try {
      if (request.method === 'GET' && pathname === '/state') return state(request, env)
      if (request.method === 'POST' && pathname === '/login') return login(request, env as RuntimeEnv)
      if (request.method === 'PUT' && pathname === '/state') return saveState(request, env)
      if (request.method === 'POST' && pathname === '/invitations') return createInvitation(request, env)
      if (request.method === 'POST' && pathname === '/invitations/accept') return acceptInvitation(request, env)
      if (request.method === 'PATCH' && pathname === '/profile') return updateProfile(request, env)
      if (request.method === 'PUT' && pathname === '/profile/avatar') return uploadAvatar(request, env)
      if (request.method === 'GET' && pathname.startsWith('/avatars/')) return avatar(pathname, env)
      if (request.method === 'GET' && pathname === '/extras') return extras(request, env)
      if (request.method === 'POST' && pathname === '/chat') return addChat(request, env)
      if (request.method === 'POST' && pathname === '/highlights') return addHighlight(request, env)
      if (request.method === 'GET' && pathname.startsWith('/highlights/')) return highlightImage(pathname, env)
      if (request.method === 'POST' && pathname === '/past-trips') return addPastTrip(request, env)
      return json(env, { error: 'Nicht gefunden.' }, 404)
    } catch (error) {
      console.error(JSON.stringify({ event: 'request_failed', pathname, message: error instanceof Error ? error.message : 'unknown' }))
      return json(env, { error: error instanceof Error && error.message === 'PAYLOAD_TOO_LARGE' ? 'Die Daten sind zu groß.' : 'Das hat nicht geklappt. Bitte noch einmal versuchen.' }, 500)
    }
  },
} satisfies ExportedHandler<Env>
