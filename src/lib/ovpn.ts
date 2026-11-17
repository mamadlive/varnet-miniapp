export interface OpenVpnProfileInput {
  username: string
  password: string
  /** Static public IP or hostname of the provisioned node. */
  remoteHost: string
  remotePort?: number
  protocol?: 'udp' | 'tcp'
  /** Optional CA bundle. Embedded as `<ca>` when the backend provides one. */
  caCertificate?: string
}

const DEFAULT_REMOTE_PORT = 1194

/** Credentials/config values must never be able to inject extra directives. */
function singleLine(value: string, fallback: string): string {
  const cleaned = value.replace(/[\r\n]+/g, ' ').trim()
  return cleaned || fallback
}

function safeHost(value: string): string {
  return value.replace(/[^a-zA-Z0-9.:-]/g, '') || 'vpn.invalid'
}

/**
 * Build a self-contained OpenVPN client profile.
 *
 * The RADIUS username/password are embedded in the `<auth-user-pass>` inline
 * block, so the downloaded file connects without a separate credentials prompt.
 */
export function buildOpenVpnProfile(input: OpenVpnProfileInput): string {
  const username = singleLine(input.username, 'user')
  const password = singleLine(input.password, 'pass')
  const host = safeHost(input.remoteHost)
  const port =
    Number.isInteger(input.remotePort) && input.remotePort! > 0 && input.remotePort! <= 65_535
      ? input.remotePort!
      : DEFAULT_REMOTE_PORT
  const protocol = input.protocol === 'tcp' ? 'tcp' : 'udp'
  const ca = input.caCertificate?.trim()

  const lines = [
    '# VarNet static-IP profile',
    `# Account: ${username}`,
    'client',
    'dev tun',
    `proto ${protocol}`,
    `remote ${host} ${port}`,
    'resolv-retry infinite',
    'nobind',
    'persist-key',
    'persist-tun',
    'remote-cert-tls server',
    'auth-nocache',
    'verb 3',
    '<auth-user-pass>',
    username,
    password,
    '</auth-user-pass>',
  ]

  if (ca) lines.push('<ca>', ca, '</ca>')

  return `${lines.join('\n')}\n`
}

function profileFilename(username: string): string {
  const safe = username.replace(/[^a-zA-Z0-9_-]/g, '') || 'varnet'
  return `varnet-${safe}.ovpn`
}

/** Hand arbitrary config text to the browser as a file download. */
export function downloadTextFile(
  content: string,
  filename: string,
  mimeType = 'text/plain;charset=utf-8',
): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')

  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()

  // Revoke after the browser has started reading the blob.
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

/** True when the admin-delivered note is already an OpenVPN client profile. */
export function looksLikeOpenVpnProfile(text: string): boolean {
  return /\bclient\b/i.test(text) && /\bremote\s+\S+/i.test(text)
}

/** Generate the profile and hand it to the browser as a file download. */
export function downloadOpenVpnProfile(input: OpenVpnProfileInput): void {
  const profile = buildOpenVpnProfile(input)
  downloadTextFile(profile, profileFilename(input.username), 'application/x-openvpn-profile')
}
