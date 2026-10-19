import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Household } from './types'

export type SaveResult = 'ok' | 'conflict'

export interface ReadRequest {
  kind: 'receipt' | 'recipe' | 'ideas' | 'translate'
  images?: string[]
  url?: string
  text?: string
  context?: unknown
}

export interface Backend {
  online: boolean
  load(): Promise<Household | null>
  save(h: Household, expectedVersion: number): Promise<SaveResult>
  subscribe(onChange: () => void): () => void
  uploadPhoto(file: Blob): Promise<string>
  read<T>(req: ReadRequest): Promise<T>
}

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const KEY = import.meta.env.VITE_SUPABASE_KEY as string | undefined

export const supabase: SupabaseClient | null = URL && KEY ? createClient(URL, KEY) : null

/** Everything in one shared row, saved only if nobody else saved in between. */
class SupabaseBackend implements Backend {
  online = true
  private db: SupabaseClient
  constructor(db: SupabaseClient) {
    this.db = db
  }

  async load() {
    const { data, error } = await this.db.from('household').select('data, version').eq('id', 1).maybeSingle()
    if (error) throw error
    if (!data) return null
    return { ...(data.data as Household), version: data.version as number }
  }

  async save(h: Household, expectedVersion: number): Promise<SaveResult> {
    const body = { ...h, version: expectedVersion + 1 }
    if (expectedVersion === 0) {
      const { error } = await this.db.from('household').insert({ id: 1, data: body, version: 1 })
      if (error) return error.code === '23505' ? 'conflict' : Promise.reject(error)
      return 'ok'
    }
    const { data, error } = await this.db
      .from('household')
      .update({ data: body, version: expectedVersion + 1, updated_at: new Date().toISOString() })
      .eq('id', 1)
      .eq('version', expectedVersion)
      .select('version')
    if (error) throw error
    return data && data.length ? 'ok' : 'conflict'
  }

  subscribe(onChange: () => void) {
    const ch = this.db
      .channel('household')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'household' }, () => onChange())
      .subscribe()
    const onFocus = () => document.visibilityState === 'visible' && onChange()
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      this.db.removeChannel(ch)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }

  async uploadPhoto(file: Blob) {
    const path = `${crypto.randomUUID()}.jpg`
    const { error } = await this.db.storage.from('photos').upload(path, file, { contentType: 'image/jpeg' })
    if (error) throw error
    return this.db.storage.from('photos').getPublicUrl(path).data.publicUrl
  }

  async read<T>(req: ReadRequest): Promise<T> {
    const { data, error } = await this.db.functions.invoke('read', { body: req })
    if (error) {
      const ctx = (error as { context?: Response }).context
      const detail = ctx && typeof ctx.json === 'function' ? await ctx.json().catch(() => null) : null
      throw new Error(detail?.error ?? error.message)
    }
    if (data?.error) throw new Error(data.error)
    return data as T
  }
}

/** For trying the app on one device without any setup. */
class LocalBackend implements Backend {
  online = false
  private key = 'meal-planner-household'

  async load() {
    const raw = localStorage.getItem(this.key)
    return raw ? (JSON.parse(raw) as Household) : null
  }

  async save(h: Household, expectedVersion: number): Promise<SaveResult> {
    const cur = await this.load()
    if ((cur?.version ?? 0) !== expectedVersion) return 'conflict'
    localStorage.setItem(this.key, JSON.stringify({ ...h, version: expectedVersion + 1 }))
    return 'ok'
  }

  subscribe(onChange: () => void) {
    const fn = (e: StorageEvent) => e.key === this.key && onChange()
    window.addEventListener('storage', fn)
    return () => window.removeEventListener('storage', fn)
  }

  async uploadPhoto(file: Blob) {
    return await new Promise<string>((resolve) => {
      const r = new FileReader()
      r.onload = () => resolve(r.result as string)
      r.readAsDataURL(file)
    })
  }

  async read<T>(): Promise<T> {
    throw new Error('Reading photos and links works once the app is online.')
  }
}

export const backend: Backend = supabase ? new SupabaseBackend(supabase) : new LocalBackend()

/** Shrink a photo before upload: phones take 4000px images, 1280px is plenty. */
export async function compressImage(file: File | Blob, max = 1280, quality = 0.8): Promise<Blob> {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bmp.width * scale)
  canvas.height = Math.round(bmp.height * scale)
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  return await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/jpeg', quality))
}

export async function toBase64(blob: Blob): Promise<string> {
  const url = await new Promise<string>((resolve) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.readAsDataURL(blob)
  })
  return url.split(',')[1]
}
