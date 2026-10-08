-- Marketplace Tidalis / Phase 1 schema. Review on a staging project BEFORE applying.
-- Identity, Shop tenancy, catalog, policy versions, and seller approval.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  username text,
  created_at timestamptz not null default now()
);
create unique index if not exists profiles_username_unique on public.profiles(lower(username)) where username is not null;

create table if not exists public.platform_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','compliance','support')),
  created_at timestamptz not null default now(),
  primary key(user_id,role)
);

create table if not exists public.shops (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  name text not null check (length(trim(name)) between 3 and 100),
  slug text not null unique check(slug ~ '^[a-z0-9-]{3,50}$'),
  description text,
  status text not null default 'active' check(status in ('active','paused','suspended','closed')),
  created_at timestamptz not null default now()
);
create index if not exists shops_owner_idx on public.shops(owner_id);

create table if not exists public.shop_members (
  shop_id uuid not null references public.shops(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check(role in ('owner','manager','artist','support','finance')),
  joined_at timestamptz not null default now(),
  primary key(shop_id,user_id)
);
create index if not exists shop_members_user_idx on public.shop_members(user_id);

create table if not exists public.seller_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  shop_name text not null,
  requested_slug text not null check(requested_slug ~ '^[a-z0-9-]{3,50}$'),
  portfolio_url text not null,
  description text not null,
  status text not null default 'submitted' check(status in ('draft','submitted','under_review','needs_information','approved','rejected','withdrawn')),
  agreement_accepted_at timestamptz,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_shop_id uuid references public.shops(id),
  submitted_at timestamptz not null default now(),
  unique(user_id,requested_slug)
);

create or replace function public.is_platform_admin(p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.platform_roles where user_id=p_user_id and role='admin');
$$;
create or replace function public.is_shop_member(p_shop_id uuid,p_user_id uuid,p_roles text[] default array['owner','manager','artist','support','finance'])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.shop_members where shop_id=p_shop_id and user_id=p_user_id and role=any(p_roles));
$$;

create table if not exists public.shop_work_types (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id),
  name text not null check (length(trim(name)) between 2 and 80),
  created_at timestamptz not null default now(),
  unique(shop_id,name)
);
create table if not exists public.shop_policy_versions (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id),
  policy_type text not null check (policy_type in ('refund','delivery','license','other')),
  version integer not null check(version>=1),
  content text not null,
  status text not null default 'draft' check(status in ('draft','under_review','published','archived')),
  published_at timestamptz,
  reviewed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique(shop_id,policy_type,version)
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id),
  slug text not null,
  name text not null,
  description text not null default '',
  product_type text not null check(product_type in ('commission','ready_made','digital_asset')),
  pricing_mode text not null check(pricing_mode in ('fixed','quote')),
  work_type_id uuid references public.shop_work_types(id),
  status text not null default 'draft' check(status in ('draft','under_review','published','archived')),
  is_exclusive boolean not null default false,
  stock integer check(stock>=0),
  created_at timestamptz not null default now(),
  unique(shop_id,slug),
  check ((product_type = 'commission' and pricing_mode = 'quote') or (product_type in ('ready_made','digital_asset') and pricing_mode = 'fixed')),
  check (not is_exclusive or (stock is not null and stock>=0))
);
create index if not exists products_shop_idx on public.products(shop_id,status);

create table if not exists public.product_license_prices (
  product_id uuid not null references public.products(id) on delete cascade,
  usage_type text not null check(usage_type in ('personal','commercial')),
  price_minor bigint not null check(price_minor>=0),
  terms text not null default '',
  primary key(product_id,usage_type)
);
create table if not exists public.product_files (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  file_path text not null,
  version integer not null default 1,
  is_delivery_file boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.platform_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null, message text not null, image_path text,
  show_ribbon boolean not null default true,
  show_popup boolean not null default false,
  priority integer not null default 0,
  version integer not null default 1,
  status text not null default 'draft' check(status in ('draft','published','archived')),
  starts_at timestamptz, ends_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists public.platform_policy_versions (
  id uuid primary key default gen_random_uuid(),
  policy_type text not null,
  version integer not null,
  title text not null,
  content text not null,
  status text not null default 'draft' check(status in ('draft','under_review','published','archived')),
  effective_from timestamptz,
  approved_by uuid references auth.users(id),
  unique(policy_type,version)
);
create table if not exists public.policy_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  policy_version_id uuid not null references public.platform_policy_versions(id),
  accepted_at timestamptz not null default now(),
  unique(user_id,policy_version_id)
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id),
  shop_id uuid references public.shops(id),
  action text not null,
  target_table text not null,
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Signup trigger copies *display name only*. The username requires separate review/update.
create or replace function public.on_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id,display_name)
  values(new.id,coalesce(new.raw_user_meta_data->>'username',new.email))
  on conflict(id) do nothing;
  return new;
end;
$$;
drop trigger if exists tidalis_auth_user_created on auth.users;
create trigger tidalis_auth_user_created after insert on auth.users for each row execute procedure public.on_new_user();

-- All tables exposed to authenticated API clients have RLS; no role-granting self-service.
alter table public.profiles enable row level security;
alter table public.platform_roles enable row level security;
alter table public.shops enable row level security;
alter table public.shop_members enable row level security;
alter table public.seller_applications enable row level security;
alter table public.shop_work_types enable row level security;
alter table public.shop_policy_versions enable row level security;
alter table public.products enable row level security;
alter table public.product_license_prices enable row level security;
alter table public.product_files enable row level security;
alter table public.platform_announcements enable row level security;
alter table public.platform_policy_versions enable row level security;
alter table public.policy_acceptances enable row level security;
alter table public.audit_logs enable row level security;

create policy profiles_self_select on public.profiles for select to authenticated using(id=(select auth.uid()) or public.is_platform_admin((select auth.uid())));
create policy profiles_self_update on public.profiles for update to authenticated using(id=(select auth.uid())) with check(id=(select auth.uid()));
create policy platform_role_read on public.platform_roles for select to authenticated using(user_id=(select auth.uid()) or public.is_platform_admin((select auth.uid())));
create policy shops_public_read on public.shops for select to anon,authenticated using(status='active' or public.is_platform_admin((select auth.uid())) or public.is_shop_member(id,(select auth.uid())));
create policy shop_members_read on public.shop_members for select to authenticated using(user_id=(select auth.uid()) or public.is_platform_admin((select auth.uid())) or public.is_shop_member(shop_id,(select auth.uid()),array['owner','manager']));
create policy applications_read on public.seller_applications for select to authenticated using(user_id=(select auth.uid()) or public.is_platform_admin((select auth.uid())));
create policy applications_create on public.seller_applications for insert to authenticated with check(user_id=(select auth.uid()) and status='submitted' and agreement_accepted_at is not null and exists(select 1 from public.platform_policy_versions v where v.policy_type='seller-agreement' and v.status='published' and (v.effective_from is null or v.effective_from<=now())));
create policy work_types_read on public.shop_work_types for select to anon,authenticated using(exists(select 1 from public.shops s where s.id=shop_id and s.status='active') or public.is_shop_member(shop_id,(select auth.uid())) or public.is_platform_admin((select auth.uid())));
create policy work_types_write on public.shop_work_types for insert to authenticated with check(public.is_shop_member(shop_id,(select auth.uid()),array['owner','manager']));
create policy work_types_update on public.shop_work_types for update to authenticated using(public.is_shop_member(shop_id,(select auth.uid()),array['owner','manager'])) with check(public.is_shop_member(shop_id,(select auth.uid()),array['owner','manager']));
create policy policies_read on public.shop_policy_versions for select to anon,authenticated using(status='published' or public.is_shop_member(shop_id,(select auth.uid())) or public.is_platform_admin((select auth.uid())));
create policy products_read on public.products for select to anon,authenticated using((status='published' and exists(select 1 from public.shops s where s.id=shop_id and s.status='active')) or public.is_shop_member(shop_id,(select auth.uid())) or public.is_platform_admin((select auth.uid())));
-- Product writes will use a transactional, authorized RPC. No direct client product writes in this phase.
create policy license_prices_read on public.product_license_prices for select to anon,authenticated using(exists(select 1 from public.products p where p.id=product_id and ((p.status='published' and exists(select 1 from public.shops s where s.id=p.shop_id and s.status='active')) or public.is_shop_member(p.shop_id,(select auth.uid())) or public.is_platform_admin((select auth.uid())))));
create policy product_files_seller_read on public.product_files for select to authenticated using(exists(select 1 from public.products p where p.id=product_id and (public.is_shop_member(p.shop_id,(select auth.uid())) or public.is_platform_admin((select auth.uid())))));
create policy announcements_public_read on public.platform_announcements for select to anon,authenticated using(status='published' and (starts_at is null or starts_at<=now()) and (ends_at is null or ends_at>now()) or public.is_platform_admin((select auth.uid())));
create policy platform_policies_public_read on public.platform_policy_versions for select to anon,authenticated using((status='published' and (effective_from is null or effective_from<=now())) or public.is_platform_admin((select auth.uid())));
create policy acceptances_self_read on public.policy_acceptances for select to authenticated using(user_id=(select auth.uid()) or public.is_platform_admin((select auth.uid())));
create policy audit_admin_read on public.audit_logs for select to authenticated using(public.is_platform_admin((select auth.uid())));

-- Atomic, auditable shop approval. ONLY an existing platform admin may invoke successfully.
create or replace function public.approve_seller_application(p_application_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_app public.seller_applications%rowtype; v_shop_id uuid;
begin
  if not public.is_platform_admin(auth.uid()) then raise exception 'Not authorized'; end if;
  select * into v_app from public.seller_applications where id=p_application_id for update;
  if not found or v_app.status<>'submitted' then raise exception 'Application not available for approval'; end if;
  insert into public.shops(owner_id,name,slug,description,status)
  values(v_app.user_id,v_app.shop_name,v_app.requested_slug,v_app.description,'active') returning id into v_shop_id;
  insert into public.shop_members(shop_id,user_id,role) values(v_shop_id,v_app.user_id,'owner');
  update public.seller_applications set status='approved',reviewed_by=auth.uid(),reviewed_at=now(),created_shop_id=v_shop_id where id=p_application_id;
  insert into public.audit_logs(actor_id,shop_id,action,target_table,target_id)
  values(auth.uid(),v_shop_id,'seller_approved','seller_applications',p_application_id);
  return v_shop_id;
end;
$$;
revoke all on function public.approve_seller_application(uuid) from public,anon;
grant execute on function public.approve_seller_application(uuid) to authenticated;

-- Admin role BOOTSTRAP must be assigned manually by a trusted operator in SQL editor,
-- after verifying the target auth.users UUID. Never offer an admin signup checkbox.
-- insert into public.platform_roles(user_id,role) values ('YOUR_VERIFIED_AUTH_USER_UUID','admin');

-- Explicit SQL grants: authorization remains further limited by RLS policies above.
grant select on public.profiles,public.platform_roles,public.shops,public.shop_members,
  public.seller_applications,public.shop_work_types,public.shop_policy_versions,
  public.products,public.product_license_prices,public.product_files,
  public.platform_announcements,public.platform_policy_versions,public.policy_acceptances,
  public.audit_logs to authenticated;
grant select on public.shops,public.shop_work_types,public.shop_policy_versions,
  public.products,public.product_license_prices,public.platform_announcements,
  public.platform_policy_versions to anon;
grant insert on public.seller_applications,public.shop_work_types to authenticated;
grant update on public.profiles,public.shop_work_types to authenticated;
