/**
 * Endpoint de debug DÉSACTIVÉ en production.
 * Si NODE_ENV !== 'development', renvoie 404.
 */
export async function GET () {
  if (process.env.NODE_ENV === 'production') {
    return new Response('Not found', { status: 404 })
  }
  return new Response(JSON.stringify({ ok: true, env: 'dev' }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}