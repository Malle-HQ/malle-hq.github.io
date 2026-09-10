import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse } from '@simplewebauthn/server'
import type { AuthenticationResponseJSON, Base64URLString, RegistrationResponseJSON, WebAuthnCredential } from '@simplewebauthn/server'

type Json = Record<string, unknown>
type RuntimeEnv = Env & { ADMIN_PASSWORD: string; ONESIGNAL_APP_ID?: string; ONESIGNAL_API_KEY?: string }

const TRIP_ID = 'malle-2027'
const TRIP_SLUG = 'malle-2027'
const RP_ID = 'malle-hq.github.io'
const EXPECTED_ORIGIN = 'https://malle-hq.github.io'
const editableByCrew = ['availabilities', 'locationOptions', 'liveEvents']
const travelKeys = ['title', 'destination', 'startDate', 'endDate', 'accommodation', 'accommodationDetails', 'travel', 'travelDetails', 'flightPlan', 'meetingPoint', 'meetingPointDetails', 'importantInfo', 'importantInfoDetails', 'planningMeeting', 'notes']

const pushLines = {
  chat: [
    (name: string) => `Bierbert funkt dazwischen: ${name} hat im Chat was zu melden 🍻`,
    (name: string) => `Kurze Thekenmeldung: ${name} hat in den Chat geschrieben 💬`,
    (name: string) => `Bierbert ruft: Nachricht von ${name}! Rein da und nachlesen 🌴`,
  ],
  highlight: [
    (name: string, detail: string) => `Beweismaterial eingetroffen! ${name} hat „${detail}“ hochgeladen 📸`,
    (name: string, detail: string) => `Bierbert meldet ein neues Highlight von ${name}: „${detail}“ 🌞`,
    (name: string, detail: string) => `Fotoalarm! ${name} sorgt mit „${detail}“ für Gesprächsstoff 🍹`,
  ],
  travel: [
    () => 'Bierbert meldet Planänderung! Schau lieber kurz ins Malle HQ ✈️',
    () => 'Achtung, Crew: Bei den Reisedaten hat sich etwas getan 🌴',
    () => 'Bierbert hat neue Reiseinfos erspäht. Einmal nachsehen, bitte! 🍻',
  ],
}

function randomLine(lines: Array<(...values: string[]) => string>, ...values: string[]) {
  const random = crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32
  return lines[Math.floor(random * lines.length)](...values)
}

async function sendPush(env: RuntimeEnv, kind: keyof typeof pushLines, actorId: string, actorName: string, detail = '') {
  if (!env.ONESIGNAL_APP_ID || !env.ONESIGNAL_API_KEY) return
  const content = randomLine(pushLines[kind], actorName, detail)
  const response = await fetch('https://api.onesignal.com/notifications', {
    method: 'POST',
    headers: { 'Authorization': `Key ${env.ONESIGNAL_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      app_id: env.ONESIGNAL_APP_ID,
      headings: { de: 'Bierbert meldet sich 🍻', en: 'Bierbert meldet sich 🍻' },
      contents: { de: content, en: content },
      filters: [{ field: 'tag', key: 'profile_id', relation: '!=', value: actorId }],
      url: kind === 'chat' ? `${env.WEB_ORIGIN}/#chat` : kind === 'highlight' ? `${env.WEB_ORIGIN}/#highlights` : env.WEB_ORIGIN,
      chrome_web_icon: `${env.WEB_ORIGIN}/app-icon-192.png`,
    }),
  })
  if (!response.ok) console.error(JSON.stringify({ event: 'push_failed', kind, status: response.status, body: await response.text() }))
}

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

function bytesToHex(bytes: Uint8Array) {
  return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

function hexToBytes(value: string) {
  return new Uint8Array(value.match(/.{2}/g)?.map(byte => Number.parseInt(byte, 16)) || [])
}

function bytesToBase64Url(bytes: Uint8Array) {
  let value = ''
  for (const byte of bytes) value += String.fromCharCode(byte)
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlToBytes(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const decoded = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='))
  return Uint8Array.from(decoded, character => character.charCodeAt(0))
}

async function passwordDigest(password: string, saltHex: string) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: hexToBytes(saltHex), iterations: 100_000 }, material, 256)
  return bytesToHex(new Uint8Array(bits))
}

function validLoginName(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9._-]{3,30}$/.test(value.trim())
}

function validPassword(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 8 && value.length <= 100
}

async function body(request: Request): Promise<Json> {
  const length = Number(request.headers.get('content-length') || 0)
  if (length > 1_000_000) throw new Error('PAYLOAD_TOO_LARGE')
  return request.json<Json>()
}

async function currentProfile(request: Request, env: Env) {
  const auth = request.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return null
  const sessionHash = await hash(auth.slice(7))
  return env.DB.prepare('SELECT DISTINCT p.id, p.name, p.prefix, p.nickname, p.role, p.status, p.color, p.avatar_key, p.visible, p.flies FROM profiles p LEFT JOIN sessions s ON s.profile_id = p.id WHERE (p.session_hash = ? OR s.session_hash = ?) AND p.trip_id = ?')
    .bind(sessionHash, sessionHash, TRIP_ID).first()
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
  const [profiles, achievements] = await Promise.all([
    env.DB.prepare('SELECT id, name, prefix, nickname, role, status, color, avatar_key, flies FROM profiles WHERE trip_id = ? AND visible = 1 ORDER BY created_at').bind(TRIP_ID).all(),
    env.DB.prepare('SELECT a.id, a.profile_id, a.title, a.icon FROM achievements a JOIN profiles p ON p.id = a.profile_id WHERE p.trip_id = ? ORDER BY a.created_at DESC').bind(TRIP_ID).all(),
  ])
  const participants = profiles.results.map(item => ({
    id: item.id,
    name: `${item.prefix || ''}${item.name}`,
    nickname: item.nickname,
    role: item.role,
    status: item.status,
    color: item.color,
    avatarUrl: item.avatar_key ? `/avatars/${item.id}` : null,
    flies: Boolean(item.flies),
    achievements: achievements.results.filter(badge => badge.profile_id === item.id).map(badge => ({ id: badge.id, title: badge.title, icon: badge.icon })),
  }))
  const owner = await env.DB.prepare("SELECT password_hash FROM profiles WHERE id = 'owner'").first<{ password_hash: string | null }>()
  const accountProfiles = profile?.role === 'Harter Kern' ? (await env.DB.prepare('SELECT id, name, prefix, role, visible FROM profiles WHERE trip_id = ? ORDER BY name').bind(TRIP_ID).all()).results.map(item => ({ id: item.id, name: `${item.prefix || ''}${item.name}`, role: item.role, visible: Boolean(item.visible) })) : []
  return json(env, { content, participants, profile, accountProfiles, isAdmin: profile?.role === 'Harter Kern', setupRequired: !owner?.password_hash })
}

async function login(request: Request, env: RuntimeEnv) {
  const data = await body(request)
  if (!validLoginName(data.loginName) || !validPassword(data.password)) return json(env, { error: 'Login-Name oder Passwort stimmen nicht.' }, 401)
  const profile = await env.DB.prepare('SELECT id, role, password_hash, password_salt FROM profiles WHERE login_name = ? COLLATE NOCASE AND trip_id = ?')
    .bind(data.loginName.trim(), TRIP_ID).first<{ id: string; role: string; password_hash: string | null; password_salt: string | null }>()
  if (!profile?.password_hash || !profile.password_salt) return json(env, { error: 'Login-Name oder Passwort stimmen nicht.' }, 401)
  const candidate = await passwordDigest(data.password, profile.password_salt)
  if (!await secureEqual(candidate, profile.password_hash)) return json(env, { error: 'Login-Name oder Passwort stimmen nicht.' }, 401)
  const session = token()
  await env.DB.prepare('INSERT INTO sessions (session_hash, profile_id) VALUES (?, ?)').bind(await hash(session), profile.id).run()
  return json(env, { token: session, role: profile.role })
}

async function logout(request: Request, env: Env) {
  const auth = request.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return json(env, { ok: true })
  const sessionHash = await hash(auth.slice(7))
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE session_hash = ?').bind(sessionHash),
    env.DB.prepare('UPDATE profiles SET session_hash = ? WHERE session_hash = ?').bind(`logged-out-${crypto.randomUUID()}`, sessionHash),
  ])
  return json(env, { ok: true })
}

async function changePassword(request: Request, env: Env) {
  const profile = await requireProfile(request, env)
  if (!profile) return json(env, { error: 'Bitte erneut anmelden.' }, 401)
  const data = await body(request)
  if (!validPassword(data.currentPassword) || !validPassword(data.newPassword)) return json(env, { error: 'Das neue Passwort muss mindestens 8 Zeichen lang sein.' }, 400)
  const credentials = await env.DB.prepare('SELECT password_hash, password_salt FROM profiles WHERE id = ?').bind(profile.id).first<{ password_hash: string; password_salt: string }>()
  if (!credentials || !await secureEqual(await passwordDigest(data.currentPassword, credentials.password_salt), credentials.password_hash)) return json(env, { error: 'Das bisherige Passwort stimmt nicht.' }, 401)
  const salt = bytesToHex(crypto.getRandomValues(new Uint8Array(16)))
  const passwordHash = await passwordDigest(data.newPassword, salt)
  const auth = request.headers.get('authorization')!
  const sessionHash = await hash(auth.slice(7))
  await env.DB.batch([
    env.DB.prepare('UPDATE profiles SET password_hash = ?, password_salt = ?, session_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(passwordHash, salt, `changed-${crypto.randomUUID()}`, profile.id),
    env.DB.prepare('DELETE FROM sessions WHERE profile_id = ?').bind(profile.id),
    env.DB.prepare('INSERT INTO sessions (session_hash, profile_id) VALUES (?, ?)').bind(sessionHash, profile.id),
  ])
  return json(env, { ok: true })
}

async function createPasswordReset(request: Request, env: Env) {
  const admin = await requireProfile(request, env, true)
  if (!admin) return json(env, { error: 'Nur der Harte Kern darf Wiederherstellungscodes erstellen.' }, 403)
  const data = await body(request)
  const target = await env.DB.prepare('SELECT id, name, prefix FROM profiles WHERE id = ? AND trip_id = ?').bind(data.profileId, TRIP_ID).first()
  if (!target) return json(env, { error: 'Dieses Profil wurde nicht gefunden.' }, 404)
  const code = `MALLE-PW-${token().slice(0, 10).toUpperCase()}`
  await env.DB.batch([
    env.DB.prepare('UPDATE password_reset_codes SET used_at = CURRENT_TIMESTAMP WHERE profile_id = ? AND used_at IS NULL').bind(target.id),
    env.DB.prepare('INSERT INTO password_reset_codes (id, profile_id, code_hash, expires_at, created_by) VALUES (?, ?, ?, ?, ?)').bind(crypto.randomUUID(), target.id, await hash(code), Date.now() + 24 * 60 * 60 * 1000, admin.id),
  ])
  return json(env, { code, profileId: target.id, profileName: `${target.prefix || ''}${target.name}`, expiresInHours: 24 }, 201)
}

async function deleteProfile(request: Request, pathname: string, env: Env) {
  const admin = await requireProfile(request, env, true)
  if (!admin) return json(env, { error: 'Nur der Harte Kern darf Profile löschen.' }, 403)
  const profileId = decodeURIComponent(pathname.split('/').pop() || '')
  const target = await env.DB.prepare('SELECT id, role, avatar_key FROM profiles WHERE id = ? AND trip_id = ?').bind(profileId, TRIP_ID).first<{ id: string; role: string; avatar_key: string | null }>()
  if (!target) return json(env, { error: 'Dieses Profil wurde nicht gefunden.' }, 404)
  if (target.role === 'Harter Kern') {
    const coreCount = await env.DB.prepare("SELECT COUNT(*) AS count FROM profiles WHERE trip_id = ? AND role = 'Harter Kern'").bind(TRIP_ID).first<{ count: number }>()
    if (Number(coreCount?.count || 0) <= 1) return json(env, { error: 'Das letzte Harter-Kern-Profil kann nicht gelöscht werden. Lege zuerst einen neuen Harten Kern an.' }, 409)
  }
  await env.DB.prepare('DELETE FROM profiles WHERE id = ? AND trip_id = ?').bind(profileId, TRIP_ID).run()
  if (target.avatar_key) await env.PROFILE_IMAGES.delete(target.avatar_key)
  return json(env, { ok: true, selfDeleted: target.id === admin.id })
}

async function redeemPasswordReset(request: Request, env: Env) {
  const data = await body(request)
  if (typeof data.code !== 'string' || !validPassword(data.newPassword)) return json(env, { error: 'Code fehlt oder das neue Passwort ist zu kurz.' }, 400)
  const reset = await env.DB.prepare('SELECT id, profile_id, expires_at, used_at FROM password_reset_codes WHERE code_hash = ?').bind(await hash(data.code.trim().toUpperCase())).first<{ id: string; profile_id: string; expires_at: number; used_at: string | null }>()
  if (!reset || reset.used_at || reset.expires_at < Date.now()) return json(env, { error: 'Dieser Code ist ungültig, abgelaufen oder wurde schon benutzt.' }, 400)
  const profile = await env.DB.prepare('SELECT role FROM profiles WHERE id = ? AND trip_id = ?').bind(reset.profile_id, TRIP_ID).first<{ role: string }>()
  if (!profile) return json(env, { error: 'Das Profil wurde nicht gefunden.' }, 404)
  const salt = bytesToHex(crypto.getRandomValues(new Uint8Array(16)))
  const passwordHash = await passwordDigest(data.newPassword, salt)
  const session = token()
  await env.DB.batch([
    env.DB.prepare('UPDATE profiles SET password_hash = ?, password_salt = ?, session_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(passwordHash, salt, `reset-${crypto.randomUUID()}`, reset.profile_id),
    env.DB.prepare('DELETE FROM sessions WHERE profile_id = ?').bind(reset.profile_id),
    env.DB.prepare('INSERT INTO sessions (session_hash, profile_id) VALUES (?, ?)').bind(await hash(session), reset.profile_id),
    env.DB.prepare('UPDATE password_reset_codes SET used_at = CURRENT_TIMESTAMP WHERE id = ?').bind(reset.id),
  ])
  return json(env, { token: session, role: profile.role })
}

async function setupOwner(request: Request, env: RuntimeEnv) {
  const data = await body(request)
  if (!validLoginName(data.loginName)) return json(env, { error: 'Der Login-Name braucht 3–30 Zeichen: Buchstaben, Zahlen, Punkt, Minus oder Unterstrich.' }, 400)
  if (!validPassword(data.password)) return json(env, { error: 'Das Passwort muss mindestens 8 Zeichen lang sein.' }, 400)
  if (typeof data.setupCode !== 'string' || !await secureEqual(data.setupCode, env.ADMIN_PASSWORD)) return json(env, { error: 'Der einmalige Einrichtungscode stimmt nicht.' }, 401)
  const existing = await env.DB.prepare("SELECT password_hash FROM profiles WHERE id = 'owner'").first<{ password_hash: string | null }>()
  if (existing?.password_hash) return json(env, { error: 'Der erste Zugang wurde bereits eingerichtet.' }, 409)
  if (!await readTrip(env)) await writeTrip(env, {})
  const salt = bytesToHex(crypto.getRandomValues(new Uint8Array(16)))
  const passwordHash = await passwordDigest(data.password, salt)
  const session = token()
  const name = typeof data.displayName === 'string' && data.displayName.trim() ? data.displayName.trim().slice(0, 60) : data.loginName.trim()
  await env.DB.prepare(`INSERT INTO profiles (id, trip_id, name, prefix, nickname, role, status, color, visible, login_name, password_hash, password_salt, session_hash)
    VALUES ('owner', ?, ?, '', 'Entwicklung & Reiseleitung', 'Harter Kern', 'Dabei', '#8f5bd7', 0, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, visible = 0, login_name = excluded.login_name, password_hash = excluded.password_hash, password_salt = excluded.password_salt, session_hash = excluded.session_hash, role = 'Harter Kern', updated_at = CURRENT_TIMESTAMP`)
    .bind(TRIP_ID, name, data.loginName.trim(), passwordHash, salt, await hash(session)).run()
  return json(env, { token: session, role: 'Harter Kern' }, 201)
}

async function saveState(request: Request, env: RuntimeEnv, ctx: ExecutionContext) {
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
  const changed = profile.role === 'Harter Kern' && travelKeys.some(key => JSON.stringify(current[key]) !== JSON.stringify(next[key]))
  if (changed) ctx.waitUntil(sendPush(env, 'travel', String(profile.id), `${profile.prefix || ''}${profile.name}`))
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

async function checkInvitation(request: Request, env: Env) {
  const data = await body(request)
  if (typeof data.code !== 'string') return json(env, { error: 'Bitte gib einen Einladungscode ein.' }, 400)
  const invitation = await env.DB.prepare('SELECT recipient, role, used_at FROM invitations WHERE code_hash = ? AND trip_id = ?')
    .bind(await hash(data.code.trim().toUpperCase()), TRIP_ID).first<{ recipient: string; role: string; used_at: string | null }>()
  if (!invitation || invitation.used_at) return json(env, { error: 'Dieser Code ist ungültig oder wurde schon verwendet.' }, 400)
  return json(env, { valid: true, recipient: invitation.recipient, role: invitation.role })
}

async function acceptInvitation(request: Request, env: Env) {
  const data = await body(request)
  if (typeof data.code !== 'string' || typeof data.name !== 'string' || !data.name.trim()) return json(env, { error: 'Code und Name fehlen.' }, 400)
  if (!validLoginName(data.loginName)) return json(env, { error: 'Der Login-Name braucht 3–30 Zeichen: Buchstaben, Zahlen, Punkt, Minus oder Unterstrich.' }, 400)
  if (!validPassword(data.password)) return json(env, { error: 'Das Passwort muss mindestens 8 Zeichen lang sein.' }, 400)
  const nameTaken = await env.DB.prepare('SELECT id FROM profiles WHERE login_name = ? COLLATE NOCASE').bind(data.loginName.trim()).first()
  if (nameTaken) return json(env, { error: 'Dieser Login-Name ist schon vergeben.' }, 409)
  const invitation = await env.DB.prepare('SELECT id, recipient, role, used_at FROM invitations WHERE code_hash = ? AND trip_id = ?')
    .bind(await hash(data.code.trim().toUpperCase()), TRIP_ID).first()
  if (!invitation || invitation.used_at) return json(env, { error: 'Dieser Code ist ungültig oder wurde schon verwendet.' }, 400)
  const session = token()
  const profileId = crypto.randomUUID()
  const salt = bytesToHex(crypto.getRandomValues(new Uint8Array(16)))
  const passwordHash = await passwordDigest(data.password, salt)
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO profiles (id, trip_id, name, prefix, nickname, role, status, color, flies, login_name, password_hash, password_salt, session_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(profileId, TRIP_ID, data.name.trim().slice(0, 60), typeof data.prefix === 'string' ? data.prefix.slice(0, 30) : '', typeof data.nickname === 'string' ? data.nickname.slice(0, 80) : '', invitation.role, ['Dabei','Vielleicht','Abgesagt'].includes(String(data.status)) ? data.status : 'Dabei', typeof data.color === 'string' ? data.color : '#8f5bd7', data.flies === true ? 1 : 0, data.loginName.trim(), passwordHash, salt, await hash(session)),
    env.DB.prepare('UPDATE invitations SET used_at = CURRENT_TIMESTAMP WHERE id = ?').bind(invitation.id),
  ])
  return json(env, { token: session, role: invitation.role, profileId })
}

async function updateProfile(request: Request, env: Env) {
  const profile = await requireProfile(request, env)
  if (!profile) return json(env, { error: 'Bitte erneut anmelden.' }, 401)
  const data = await body(request)
  if (typeof data.name !== 'string' || !data.name.trim()) return json(env, { error: 'Der Name fehlt.' }, 400)
  await env.DB.prepare('UPDATE profiles SET name = ?, prefix = ?, nickname = ?, status = ?, color = ?, visible = ?, flies = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .bind(data.name.trim().slice(0, 60), typeof data.prefix === 'string' ? data.prefix.slice(0, 30) : '', typeof data.nickname === 'string' ? data.nickname.slice(0, 80) : profile.nickname, ['Dabei','Vielleicht','Abgesagt'].includes(String(data.status)) ? data.status : profile.status, typeof data.color === 'string' ? data.color : profile.color, data.visible === false ? 0 : 1, data.flies === true ? 1 : 0, profile.id).run()
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

async function passkeyRegistrationOptions(request: Request, env: Env) {
  const profile = await requireProfile(request, env)
  if (!profile) return json(env, { error: 'Bitte zuerst anmelden.' }, 401)
  const credentials = await env.DB.prepare('SELECT id, transports FROM passkey_credentials WHERE profile_id = ?').bind(profile.id).all()
  const options = await generateRegistrationOptions({
    rpName: 'Malle HQ', rpID: RP_ID, userID: new TextEncoder().encode(String(profile.id)), userName: String(profile.name), userDisplayName: `${profile.prefix || ''}${profile.name}`,
    attestationType: 'none', authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
    excludeCredentials: credentials.results.map(item => ({ id: String(item.id) as Base64URLString, transports: JSON.parse(String(item.transports || '[]')) })),
  })
  await env.DB.prepare('INSERT INTO passkey_challenges (profile_id, challenge, kind, expires_at) VALUES (?, ?, ?, ?) ON CONFLICT(profile_id) DO UPDATE SET challenge = excluded.challenge, kind = excluded.kind, expires_at = excluded.expires_at')
    .bind(profile.id, options.challenge, 'register', Date.now() + 300_000).run()
  return json(env, options)
}

async function passkeyRegistrationVerify(request: Request, env: Env) {
  const profile = await requireProfile(request, env)
  if (!profile) return json(env, { error: 'Bitte zuerst anmelden.' }, 401)
  const challenge = await env.DB.prepare("SELECT challenge, expires_at FROM passkey_challenges WHERE profile_id = ? AND kind = 'register'").bind(profile.id).first<{ challenge: string; expires_at: number }>()
  if (!challenge || challenge.expires_at < Date.now()) return json(env, { error: 'Die Passkey-Anfrage ist abgelaufen.' }, 400)
  const data = await body(request)
  const verification = await verifyRegistrationResponse({ response: data.response as unknown as RegistrationResponseJSON, expectedChallenge: challenge.challenge, expectedOrigin: EXPECTED_ORIGIN, expectedRPID: RP_ID, requireUserVerification: true })
  if (!verification.verified) return json(env, { error: 'Der Passkey konnte nicht bestätigt werden.' }, 400)
  const credential = verification.registrationInfo.credential
  await env.DB.batch([
    env.DB.prepare('INSERT INTO passkey_credentials (id, profile_id, public_key, counter, transports) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET public_key = excluded.public_key, counter = excluded.counter, transports = excluded.transports')
      .bind(credential.id, profile.id, bytesToBase64Url(credential.publicKey), credential.counter, JSON.stringify(credential.transports || [])),
    env.DB.prepare('DELETE FROM passkey_challenges WHERE profile_id = ?').bind(profile.id),
  ])
  return json(env, { ok: true })
}

async function passkeyAuthenticationOptions(request: Request, env: Env) {
  const data = await body(request)
  if (!validLoginName(data.loginName)) return json(env, { error: 'Bitte zuerst deinen Login-Namen eingeben.' }, 400)
  const profile = await env.DB.prepare('SELECT id FROM profiles WHERE login_name = ? COLLATE NOCASE AND trip_id = ?').bind(data.loginName.trim(), TRIP_ID).first<{ id: string }>()
  if (!profile) return json(env, { error: 'Für diesen Login wurde kein Passkey gefunden.' }, 404)
  const credentials = await env.DB.prepare('SELECT id, transports FROM passkey_credentials WHERE profile_id = ?').bind(profile.id).all()
  if (!credentials.results.length) return json(env, { error: 'Für diesen Login wurde noch kein Passkey eingerichtet.' }, 404)
  const options = await generateAuthenticationOptions({ rpID: RP_ID, userVerification: 'required', allowCredentials: credentials.results.map(item => ({ id: String(item.id) as Base64URLString, transports: JSON.parse(String(item.transports || '[]')) })) })
  await env.DB.prepare('INSERT INTO passkey_challenges (profile_id, challenge, kind, expires_at) VALUES (?, ?, ?, ?) ON CONFLICT(profile_id) DO UPDATE SET challenge = excluded.challenge, kind = excluded.kind, expires_at = excluded.expires_at')
    .bind(profile.id, options.challenge, 'authenticate', Date.now() + 300_000).run()
  return json(env, { options, profileId: profile.id })
}

async function passkeyAuthenticationVerify(request: Request, env: Env) {
  const data = await body(request)
  if (typeof data.profileId !== 'string') return json(env, { error: 'Passkey-Anmeldung ungültig.' }, 400)
  const [profile, challenge] = await Promise.all([
    env.DB.prepare('SELECT id, role FROM profiles WHERE id = ? AND trip_id = ?').bind(data.profileId, TRIP_ID).first<{ id: string; role: string }>(),
    env.DB.prepare("SELECT challenge, expires_at FROM passkey_challenges WHERE profile_id = ? AND kind = 'authenticate'").bind(data.profileId).first<{ challenge: string; expires_at: number }>(),
  ])
  if (!profile || !challenge || challenge.expires_at < Date.now()) return json(env, { error: 'Die Passkey-Anfrage ist abgelaufen.' }, 400)
  const response = data.response as unknown as AuthenticationResponseJSON
  const stored = await env.DB.prepare('SELECT id, public_key, counter, transports FROM passkey_credentials WHERE id = ? AND profile_id = ?').bind(response.id, profile.id).first<{ id: string; public_key: string; counter: number; transports: string }>()
  if (!stored) return json(env, { error: 'Dieser Passkey ist nicht bekannt.' }, 401)
  const credential: WebAuthnCredential = { id: stored.id as Base64URLString, publicKey: base64UrlToBytes(stored.public_key), counter: stored.counter, transports: JSON.parse(stored.transports || '[]') }
  const verification = await verifyAuthenticationResponse({ response, expectedChallenge: challenge.challenge, expectedOrigin: EXPECTED_ORIGIN, expectedRPID: RP_ID, credential, requireUserVerification: true })
  if (!verification.verified) return json(env, { error: 'Passkey-Anmeldung fehlgeschlagen.' }, 401)
  const session = token()
  await env.DB.batch([
    env.DB.prepare('UPDATE passkey_credentials SET counter = ? WHERE id = ?').bind(verification.authenticationInfo.newCounter, stored.id),
    env.DB.prepare('INSERT INTO sessions (session_hash, profile_id) VALUES (?, ?)').bind(await hash(session), profile.id),
    env.DB.prepare('DELETE FROM passkey_challenges WHERE profile_id = ?').bind(profile.id),
  ])
  return json(env, { token: session, role: profile.role })
}

async function addAchievement(request: Request, env: Env) {
  const admin = await requireProfile(request, env, true)
  if (!admin) return json(env, { error: 'Nur der Harte Kern darf Auszeichnungen verleihen.' }, 403)
  const data = await body(request)
  if (typeof data.profileId !== 'string' || typeof data.title !== 'string' || !data.title.trim()) return json(env, { error: 'Profil oder Titel fehlt.' }, 400)
  const id = crypto.randomUUID()
  await env.DB.prepare('INSERT INTO achievements (id, profile_id, title, icon, awarded_by) SELECT ?, id, ?, ?, ? FROM profiles WHERE id = ? AND trip_id = ?')
    .bind(id, data.title.trim().slice(0, 60), typeof data.icon === 'string' ? data.icon.slice(0, 8) : '🏆', admin.id, data.profileId, TRIP_ID).run()
  return json(env, { id }, 201)
}

async function addChat(request: Request, env: RuntimeEnv, ctx: ExecutionContext) {
  const profile = await requireProfile(request, env)
  if (!profile) return json(env, { error: 'Bitte zuerst beitreten oder anmelden.' }, 401)
  const data = await body(request)
  if (typeof data.message !== 'string' || !data.message.trim()) return json(env, { error: 'Die Nachricht ist leer.' }, 400)
  await env.DB.prepare('INSERT INTO chat_messages (id, trip_id, profile_id, message) VALUES (?, ?, ?, ?)')
    .bind(crypto.randomUUID(), TRIP_ID, profile.id, data.message.trim().slice(0, 1000)).run()
  ctx.waitUntil(sendPush(env, 'chat', String(profile.id), `${profile.prefix || ''}${profile.name}`))
  return json(env, { ok: true }, 201)
}

async function addHighlight(request: Request, env: RuntimeEnv, ctx: ExecutionContext) {
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
  ctx.waitUntil(sendPush(env, 'highlight', String(profile.id), `${profile.prefix || ''}${profile.name}`, title))
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
  async fetch(request, env, ctx): Promise<Response> {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(env) })
    const { pathname } = new URL(request.url)
    try {
      if (request.method === 'GET' && pathname === '/state') return state(request, env)
      if (request.method === 'POST' && pathname === '/login') return login(request, env as RuntimeEnv)
      if (request.method === 'POST' && pathname === '/logout') return logout(request, env)
      if (request.method === 'POST' && pathname === '/password/change') return changePassword(request, env)
      if (request.method === 'POST' && pathname === '/password-resets') return createPasswordReset(request, env)
      if (request.method === 'POST' && pathname === '/password-resets/redeem') return redeemPasswordReset(request, env)
      if (request.method === 'DELETE' && pathname.startsWith('/profiles/')) return deleteProfile(request, pathname, env)
      if (request.method === 'POST' && pathname === '/passkeys/register/options') return passkeyRegistrationOptions(request, env)
      if (request.method === 'POST' && pathname === '/passkeys/register/verify') return passkeyRegistrationVerify(request, env)
      if (request.method === 'POST' && pathname === '/passkeys/authenticate/options') return passkeyAuthenticationOptions(request, env)
      if (request.method === 'POST' && pathname === '/passkeys/authenticate/verify') return passkeyAuthenticationVerify(request, env)
      if (request.method === 'POST' && pathname === '/setup-owner') return setupOwner(request, env as RuntimeEnv)
      if (request.method === 'PUT' && pathname === '/state') return saveState(request, env as RuntimeEnv, ctx)
      if (request.method === 'POST' && pathname === '/invitations') return createInvitation(request, env)
      if (request.method === 'POST' && pathname === '/invitations/check') return checkInvitation(request, env)
      if (request.method === 'POST' && pathname === '/invitations/accept') return acceptInvitation(request, env)
      if (request.method === 'PATCH' && pathname === '/profile') return updateProfile(request, env)
      if (request.method === 'POST' && pathname === '/achievements') return addAchievement(request, env)
      if (request.method === 'PUT' && pathname === '/profile/avatar') return uploadAvatar(request, env)
      if (request.method === 'GET' && pathname.startsWith('/avatars/')) return avatar(pathname, env)
      if (request.method === 'GET' && pathname === '/extras') return extras(request, env)
      if (request.method === 'POST' && pathname === '/chat') return addChat(request, env as RuntimeEnv, ctx)
      if (request.method === 'POST' && pathname === '/highlights') return addHighlight(request, env as RuntimeEnv, ctx)
      if (request.method === 'GET' && pathname.startsWith('/highlights/')) return highlightImage(pathname, env)
      if (request.method === 'POST' && pathname === '/past-trips') return addPastTrip(request, env)
      return json(env, { error: 'Nicht gefunden.' }, 404)
    } catch (error) {
      console.error(JSON.stringify({ event: 'request_failed', pathname, message: error instanceof Error ? error.message : 'unknown' }))
      return json(env, { error: error instanceof Error && error.message === 'PAYLOAD_TOO_LARGE' ? 'Die Daten sind zu groß.' : 'Das hat nicht geklappt. Bitte noch einmal versuchen.' }, 500)
    }
  },
} satisfies ExportedHandler<Env>
