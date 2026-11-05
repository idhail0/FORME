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
function mapRow(row, image) {
  return { id: row.id, name: row.name, category: row.category, color: row.color || '', price: '', image, storagePath: row.image_url || '', remote: true };
}

export async function fetchWardrobeItems() {
  const supabase = await connectSupabase();
  const { data, error } = await supabase.from('clothing_items').select('id,name,category,color,image_url,created_at').order('created_at', { ascending: false });
  if (error) throw error;
  return Promise.all((data || []).map(async row => mapRow(row, await imageUrl(supabase, row.image_url))));
}

export async function addWardrobeItem({ name, category, color, imageBlob }) {
  const supabase = await connectSupabase();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!user) throw new Error('No signed-in Supabase user is available.');
  const id = crypto.randomUUID();
  const path = user.id + '/' + id + '.jpg';
  const { error: uploadError } = await supabase.storage.from(STORAGE_BUCKET).upload(path, imageBlob, { contentType: 'image/jpeg', upsert: false });
  if (uploadError) throw uploadError;
  const { data, error } = await supabase.from('clothing_items').insert({ user_id: user.id, name, category, color: color || null, image_url: path }).select('id,name,category,color,image_url,created_at').single();
  if (error) {
    await supabase.storage.from(STORAGE_BUCKET).remove([path]);
    throw error;
  }
  return mapRow(data, await imageUrl(supabase, path));
}

export async function deleteWardrobeItem(item) {
  const supabase = await connectSupabase();
  const { error } = await supabase.from('clothing_items').delete().eq('id', item.id);
  if (error) throw error;
  if (item.storagePath) {
    const { error: storageError } = await supabase.storage.from(STORAGE_BUCKET).remove([item.storagePath]);
    if (storageError) console.warn('Wardrobe row deleted, but its storage image could not be removed.', storageError);
  }
}
