import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { isModeratorRequest, getModeratorZone } from '@/lib/moderator-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// PATCH — activate / deactivate an agent.  { active: boolean }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isModeratorRequest(req)) {
    return NextResponse.json({ error: 'Moderator login required.' }, { status: 401 })
  }
  const { id } = await params
  const zone = getModeratorZone(req)
  const supabase = svc()

  const body = (await req.json().catch(() => null)) as { active?: unknown } | null
  if (!body || typeof body.active !== 'boolean') {
    return NextResponse.json({ error: 'active (boolean) is required.' }, { status: 400 })
  }

  // Confirm the agent is in this moderator's zone before writing.
  const { data: agent } = await supabase
    .from('delivery_agents').select('id, zone').eq('id', id).maybeSingle()
  if (!agent || agent.zone !== zone) {
    return NextResponse.json({ error: 'Agent not found in your zone.' }, { status: 404 })
  }

  const { data: updated, error } = await supabase
    .from('delivery_agents')
    .update({ active: body.active })
    .eq('id', id)
    .select('id, active')
    .single()
  if (error) {
    console.error('[YFF moderator/agents PATCH] failed:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ agent: updated })
}
