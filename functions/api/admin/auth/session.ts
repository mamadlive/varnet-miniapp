/**
 * Cloudflare Pages Function — GET /api/admin/auth/session
 *
 * Validates the Bearer admin token stored by the desktop login page (or the
 * Mini App `initData`) and returns the current admin profile. The panel guard
 * calls this before rendering to reject expired sessions.
 */

import {
  authenticateAdmin,
  failure,
  jsonResponse,
  type PagesContext,
} from '../_shared'

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const auth = await authenticateAdmin(context.request, context.env)
  if (!auth.ok) return failure(auth.status, auth.code, auth.message)

  return jsonResponse({
    success: true,
    data: {
      admin: {
        telegramId: auth.user.id,
        firstName: auth.user.first_name || 'مدیر',
        lastName: auth.user.last_name ?? undefined,
        username: auth.user.username ?? undefined,
        role: 'admin',
      },
    },
  })
}
