-- Run in the Supabase SQL Editor for the project configured in supabase/config.js.
-- The app uses Supabase email/password authentication. Enable the Email provider
-- under Authentication > Providers and configure email confirmations as desired.
create table if not exists public.clothing_items (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 name text not null,
 category text not null,
 color text,
 image_url text,
 created_at timestamptz not null default now()
);

create table if not exists public.outfits (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 name text not null default 'Untitled look',
 item_ids uuid[] not null default '{}',
 created_at timestamptz not null default now()
);

alter table public.clothing_items enable row level security;
alter table public.outfits enable row level security;

drop policy if exists "wardrobe users manage own clothing items" on public.clothing_items;
create policy "wardrobe users manage own clothing items" on public.clothing_items
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "wardrobe users manage own outfits" on public.outfits;
create policy "wardrobe users manage own outfits" on public.outfits
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('wardrobe-images', 'wardrobe-images', false)
on conflict (id) do nothing;

drop policy if exists "wardrobe users read own images" on storage.objects;
create policy "wardrobe users read own images" on storage.objects
  for select to authenticated
  using (bucket_id = 'wardrobe-images' and (storage.foldername(name))[1] = (select auth.uid()::text));

drop policy if exists "wardrobe users upload own images" on storage.objects;
create policy "wardrobe users upload own images" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'wardrobe-images' and (storage.foldername(name))[1] = (select auth.uid()::text));

drop policy if exists "wardrobe users delete own images" on storage.objects;
create policy "wardrobe users delete own images" on storage.objects
  for delete to authenticated
  using (bucket_id = 'wardrobe-images' and (storage.foldername(name))[1] = (select auth.uid()::text));
