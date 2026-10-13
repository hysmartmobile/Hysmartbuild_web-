-- v5.9: allow private, signed-upload field evidence (photos, voice notes and video clips).
-- Existing site_report_photos records remain valid; this is an additive compatibility migration.
alter table public.site_report_photos
  drop constraint if exists site_report_photos_mime_type_check;
alter table public.site_report_photos
  add constraint site_report_photos_mime_type_check
  check (mime_type in (
    'image/jpeg','image/png','image/webp',
    'audio/webm','audio/ogg','audio/mp4',
    'video/webm','video/mp4','video/quicktime'
  ));
alter table public.site_report_photos
  drop constraint if exists site_report_photos_file_size_check;
alter table public.site_report_photos
  add constraint site_report_photos_file_size_check
  check (file_size > 0 and file_size <= 104857600);

update storage.buckets
set public = false,
    file_size_limit = 104857600,
    allowed_mime_types = array[
      'image/jpeg','image/png','image/webp',
      'audio/webm','audio/ogg','audio/mp4',
      'video/webm','video/mp4','video/quicktime'
    ]
where id = 'site-report-photos';

-- Fail migration rather than silently pretending media storage is configured.
do $$
begin
  if not exists (select 1 from storage.buckets where id = 'site-report-photos') then
    raise exception 'Required private site-report-photos storage bucket is missing; apply the base daily reports migration first';
  end if;
end $$;
