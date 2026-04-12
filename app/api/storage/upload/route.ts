import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const bucket   = req.headers.get('x-bucket')   || 'invoices'
    const fileName = req.headers.get('x-file-name') || `upload-${Date.now()}`
    const mimeType = req.headers.get('Content-Type')|| 'application/octet-stream'

    // Lire le body comme ArrayBuffer
    const arrayBuffer = await req.arrayBuffer()
    const buffer      = new Uint8Array(arrayBuffer)

    // Upload vers Supabase Storage
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(fileName, buffer, {
        contentType  : mimeType,
        upsert       : true,
      })

    if(error){
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Récupérer l'URL publique
    const { data: urlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(data.path)

    return NextResponse.json({ url: urlData.publicUrl, path: data.path })

  } catch(e: any){
    return NextResponse.json({ error: e.message || 'Upload failed' }, { status: 500 })
  }
}
