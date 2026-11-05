import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, STORAGE_BUCKET } from './config.js';

let client;
export function isSupabaseConfigured() {
  return Boolean(SUPABASE_URL.trim() && SUPABASE_PUBLISHABLE_KEY.trim());
}
export function getSupabaseClient() {
  if (!isSupabaseConfigured()) throw new Error('Supabase is not configured. Add the project URL and publishable key in supabase/config.js.');
  if (!client) client = createClient(SUPABASE_URL.trim(), SUPABASE_PUBLISHABLE_KEY.trim(), {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  return client;
}

export async function connectSupabase() {
  const supabase = getSupabaseClient();
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!session?.user?.id || session.user.is_anonymous) throw new Error('Please sign in with an email account to access your wardrobe.');
  return supabase;
}

export async function signOutSupabase() {
  const { error } = await getSupabaseClient().auth.signOut();
  if (error) throw error;
}

async function imageUrl(supabase, path) {
  if (!path) return '';
  const { data, error } = await supabase.storage.from(STORAGE_BUCKET).createSignedUrl(path, 60 * 60);
  if (error) throw error;
  return data.signedUrl;
}
// Smart uploads store a transparent cutout named "<id>.cutout.<ext>", or
// "<id>.cutout-fb.<ext>" when a back photo exists at "<id>.back.<ext>".
// Older uploads are plain "<id>.jpg" photos. No extra database column needed.
const CUTOUT_RE = /\.cutout(-fb)?\.(png|webp)$/;
export function backPathFor(path) {
  const m = path && path.match(CUTOUT_RE);
  return m && m[1] ? path.replace(CUTOUT_RE, '.back.$2') : '';
}
function mapRow(row, image, backImage = '') {
  const path = row.image_url || '';
  return { id: row.id, name: row.name, category: row.category, color: row.color || '', price: '', image, backImage, cutout: CUTOUT_RE.test(path), storagePath: path, backStoragePath: backPathFor(path), remote: true };
}
function extFor(blob) {
  return blob && blob.type === 'image/webp' ? 'webp' : blob && blob.type === 'image/png' ? 'png' : 'jpg';
}

export async function fetchWardrobeItems() {
  const supabase = await connectSupabase();
  const { data, error } = await supabase.from('clothing_items').select('id,name,category,color,image_url,created_at').order('created_at', { ascending: false });
  if (error) throw error;
  return Promise.all((data || []).map(async row => {
    const back = backPathFor(row.image_url);
    const [front, backUrl] = await Promise.all([imageUrl(supabase, row.image_url), back ? imageUrl(supabase, back).catch(() => '') : '']);
    return mapRow(row, front, backUrl);
  }));
}

export async function addWardrobeItem({ name, category, color, imageBlob, backBlob = null, cutout = false }) {
  const supabase = await connectSupabase();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!user) throw new Error('No signed-in Supabase user is available.');
  const id = crypto.randomUUID();
  const ext = extFor(imageBlob);
  const path = cutout ? `${user.id}/${id}.cutout${backBlob ? '-fb' : ''}.${ext}` : `${user.id}/${id}.${ext}`;
  const backPath = backBlob ? `${user.id}/${id}.back.${extFor(backBlob)}` : '';
  const uploads = [supabase.storage.from(STORAGE_BUCKET).upload(path, imageBlob, { contentType: imageBlob.type || 'image/jpeg', upsert: false })];
  if (backBlob) uploads.push(supabase.storage.from(STORAGE_BUCKET).upload(backPath, backBlob, { contentType: backBlob.type || 'image/jpeg', upsert: false }));
  const results = await Promise.all(uploads);
  const uploadError = results.find((r) => r.error)?.error;
  if (uploadError) {
    await supabase.storage.from(STORAGE_BUCKET).remove([path, backPath].filter(Boolean));
    throw uploadError;
  }
  const { data, error } = await supabase.from('clothing_items').insert({ user_id: user.id, name, category, color: color || null, image_url: path }).select('id,name,category,color,image_url,created_at').single();
  if (error) {
    await supabase.storage.from(STORAGE_BUCKET).remove([path, backPath].filter(Boolean));
    throw error;
  }
  const [front, back] = await Promise.all([imageUrl(supabase, path), backPath ? imageUrl(supabase, backPath) : '']);
  return mapRow(data, front, back);
}

export async function deleteWardrobeItem(item) {
  const supabase = await connectSupabase();
  const { error } = await supabase.from('clothing_items').delete().eq('id', item.id);
  if (error) throw error;
  const paths = [item.storagePath, item.backStoragePath].filter(Boolean);
  if (paths.length) {
    const { error: storageError } = await supabase.storage.from(STORAGE_BUCKET).remove(paths);
    if (storageError) console.warn('Wardrobe row deleted, but its storage image could not be removed.', storageError);
  }
}
