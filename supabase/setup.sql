-- One public image bucket for the shared Diwali Polaroid wall.
-- Public buckets make image URLs readable by anyone who has a URL.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'diwali-photos',
  'diwali-photos',
  true,
  4194304,
  array['image/webp', 'image/jpeg']::text[]
)
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- The app signs each browser in anonymously before listing files.
-- That gives the wall permission to list shared objects without a login form.
drop policy if exists "diwali_wall_list_photos" on storage.objects;
create policy "diwali_wall_list_photos"
on storage.objects
for select
to authenticated
using (bucket_id = 'diwali-photos');

-- Each anonymous visitor can create one WebP or JPEG object, named after their anonymous user id.
-- No UPDATE or DELETE policy is created, so visitors cannot replace or remove photos.
drop policy if exists "diwali_wall_upload_one_photo" on storage.objects;
create policy "diwali_wall_upload_one_photo"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'diwali-photos'
  and name in (auth.uid()::text || '.webp', auth.uid()::text || '.jpg')
  and not exists (
    select 1
    from storage.objects as existing
    where existing.bucket_id = 'diwali-photos'
      and existing.name in (auth.uid()::text || '.webp', auth.uid()::text || '.jpg')
  )
  and (auth.jwt() ->> 'is_anonymous') = 'true'
);
