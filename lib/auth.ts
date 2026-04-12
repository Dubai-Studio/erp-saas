import { createClient } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'

export async function getUserFromRequest(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null

  const token = authHeader.substring(7)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  )

  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return null
  return user
}
