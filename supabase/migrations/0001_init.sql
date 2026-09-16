create extension if not exists pgcrypto;

create table public.designers (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  name text not null check (char_length(name) between 1 and 80),
  naver_booking_url text not null check (naver_booking_url ~ '^https://'),
  created_at timestamptz not null default now()
);

create table public.consultation_cards (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  designer_response_token text unique not null,
  designer_id uuid not null references public.designers(id),

  selfie_storage_path text,
  selfie_deleted_at timestamptz,
  survey jsonb not null,
  requested_style_id text not null,

  generation_status text not null default 'pending'
    check (generation_status in ('pending', 'pending_review', 'succeeded', 'failed')),
  generation_error text,
  generated_images jsonb not null default '[]'::jsonb,

  status text not null default 'pending'
    check (status in ('pending', 'designer_responded')),
  designer_verdict text
    check (designer_verdict in ('possible', 'conditional', 'difficult')),
  designer_notes text check (char_length(designer_notes) <= 2000),
  designer_responded_at timestamptz,

  naver_clicked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index consultation_cards_designer_id_created_at_idx
  on public.consultation_cards (designer_id, created_at desc);

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger consultation_cards_set_updated_at
before update on public.consultation_cards
for each row execute function public.set_updated_at();

alter table public.designers enable row level security;
alter table public.consultation_cards enable row level security;

revoke all on table public.designers from anon, authenticated;
revoke all on table public.consultation_cards from anon, authenticated;
grant usage on schema public to service_role;
grant select, insert, update, delete on table public.designers to service_role;
grant select, insert, update, delete on table public.consultation_cards to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('selfies', 'selfies', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('generated', 'generated', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into public.designers (slug, name, naver_booking_url)
values ('demo-salon', '데모 디자이너', 'https://m.booking.naver.com/')
on conflict (slug) do nothing;
