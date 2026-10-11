-- Tidalis 0.5.10. Incremental migration over 001–010; no historical migration replay.
-- Intake starts CLOSED. No example legal text, accounts, payment data or MFA factors.

create table public.marketplace_settings (
  singleton boolean primary key default true check (singleton),
  seller_intake_open boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);
alter table public.marketplace_settings enable row level security;
insert into public.marketplace_settings(singleton,seller_intake_open) values(true,false);
revoke all on public.marketplace_settings from public,anon,authenticated;
grant select(singleton,seller_intake_open) on public.marketplace_settings to anon,authenticated;
create policy marketplace_settings_read on public.marketplace_settings
  for select to anon,authenticated using (true);

create function public.set_seller_intake_open(p_open boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_platform_admin(auth.uid()) then raise exception 'Admin MFA required'; end if;
  if p_open is null then raise exception 'Intake state required'; end if;
  if p_open and not exists (
    select 1 from public.platform_policy_versions
    where policy_type='seller-agreement' and status='published'
      and approved_by is not null and effective_from<=now()
  ) then raise exception 'Publish an approved Seller Agreement before opening intake'; end if;
  update public.marketplace_settings
    set seller_intake_open=p_open,updated_at=now(),updated_by=auth.uid()
    where singleton=true;
  if not found then raise exception 'Intake configuration unavailable'; end if;
  insert into public.audit_logs(actor_id,action,target_table,metadata)
    values(auth.uid(),'seller_intake_changed','marketplace_settings',
      pg_catalog.jsonb_build_object('seller_intake_open',p_open));
end;
$$;
revoke all on function public.set_seller_intake_open(boolean) from public,anon;
grant execute on function public.set_seller_intake_open(boolean) to authenticated;

-- This applies to BOTH submit and resubmit RPCs, and future insertion paths.
-- A share lock serializes submissions against an administrator closing intake.
create function public.tidalis_require_seller_intake()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_open boolean;
begin
  if new.status='submitted' then
    select seller_intake_open into v_open from public.marketplace_settings
      where singleton=true for share;
    if v_open is distinct from true then raise exception 'Seller applications are currently closed'; end if;
    if not exists(select 1 from auth.users where id=new.user_id and email_confirmed_at is not null) then
      raise exception 'Verify email first';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.tidalis_require_seller_intake() from public,anon,authenticated;
create trigger tidalis_seller_intake_gate
  before insert or update of status on public.seller_applications
  for each row execute function public.tidalis_require_seller_intake();

-- Keep one OPEN application per user, but preserve rejected/withdrawn history.
create unique index if not exists seller_one_open_application_per_user
  on public.seller_applications(user_id)
  where status in ('submitted','under_review','needs_information');
alter table public.seller_applications
  drop constraint if exists seller_applications_user_id_requested_slug_key;

-- Permissive policies combine with OR. The original AAL2 policies must also
-- reject suspended/closed shops; the new routine policies alone cannot do it.
alter policy work_types_write on public.shop_work_types with check (
  public.is_shop_member(shop_id,(select auth.uid()),array['owner','manager'])
  and exists(select 1 from public.shops s where s.id=shop_id and s.status in ('active','paused'))
);
alter policy work_types_update on public.shop_work_types using (
  public.is_shop_member(shop_id,(select auth.uid()),array['owner','manager'])
  and exists(select 1 from public.shops s where s.id=shop_id and s.status in ('active','paused'))
) with check (
  public.is_shop_member(shop_id,(select auth.uid()),array['owner','manager'])
  and exists(select 1 from public.shops s where s.id=shop_id and s.status in ('active','paused'))
);

-- Public columns only. SECURITY INVOKER retains RLS even for direct API calls.
-- Search, ordering and pagination cover the entire published catalogue.
create function public.search_public_products(
  p_search text default '', p_type text default 'all', p_sort text default 'featured',
  p_page integer default 1, p_page_size integer default 24, p_shop_id uuid default null
)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with params as (
    select '%' || pg_catalog.replace(pg_catalog.replace(pg_catalog.replace(
      left(btrim(coalesce(p_search,'')),80), E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%' as pattern,
      least(10000,greatest(1,coalesce(p_page,1))) as page,
      least(24,greatest(1,coalesce(p_page_size,24))) as page_size
  ), matching as materialized (
    select p.id,p.created_at,l.min_price,
      pg_catalog.jsonb_build_object(
        'id',p.id,'slug',p.slug,'name',p.name,'description',p.description,
        'product_type',p.product_type,'pricing_mode',p.pricing_mode,
        'is_exclusive',p.is_exclusive,'stock',p.stock,'shop_id',p.shop_id,
        'shop',pg_catalog.jsonb_build_object('id',s.id,'slug',s.slug,'name',s.name,'status',s.status),
        'work_type',pg_catalog.jsonb_build_object('name',wt.name),
        'product_license_prices',l.licenses
      ) as item
    from public.products p join public.shops s on s.id=p.shop_id
    left join public.shop_work_types wt on wt.id=p.work_type_id and wt.shop_id=p.shop_id
    cross join lateral (
      select min(lp.price_minor) as min_price,
        pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'usage_type',lp.usage_type,'price_minor',lp.price_minor,'terms',lp.terms
        ) order by lp.usage_type) as licenses
      from public.product_license_prices lp
      where lp.product_id=p.id and lp.usage_type in ('personal','commercial') and lp.price_minor>=0
    ) l cross join params
    where p.status='published' and s.status='active' and l.min_price is not null
      and (coalesce(p_type,'all')='all' or p.product_type=p_type)
      and (p_shop_id is null or p.shop_id=p_shop_id)
      and (p.name ilike params.pattern or s.name ilike params.pattern or wt.name ilike params.pattern)
  ), page_rows as (
    select item,row_number() over(order by
      case when p_sort='low' then min_price end asc,
      case when p_sort='high' then min_price end desc,
      created_at desc,id desc) as position
    from matching order by
      case when p_sort='low' then min_price end asc,
      case when p_sort='high' then min_price end desc,
      created_at desc,id desc
    limit (select page_size from params)
    offset (select (page-1)*page_size from params)
  )
  select pg_catalog.jsonb_build_object(
    'items',coalesce((select pg_catalog.jsonb_agg(item order by position) from page_rows),'[]'::jsonb),
    'total',(select count(*) from matching),'page',(select page from params),
    'pageSize',(select page_size from params)
  );
$$;
revoke all on function public.search_public_products(text,text,text,integer,integer,uuid) from public;
grant execute on function public.search_public_products(text,text,text,integer,integer,uuid) to anon,authenticated;

-- Trigger functions aren't callable application RPCs. Triggers continue to run.
revoke all on function public.on_new_user() from public,anon,authenticated;
revoke all on function public.tidalis_lock_published_policy() from public,anon,authenticated;
revoke all on function public.tidalis_lock_platform_document() from public,anon,authenticated;

-- Match the aggregate role contract to its product-blocker calls.
create or replace function public.tidalis_shop_readiness_blockers(p_shop_id uuid)
returns text[] language plpgsql security definer set search_path = '' as $$
declare v_status text; v_reasons text[] := array[]::text[]; v_type text;
  v_product_id uuid; v_has_ready_product boolean:=false;
begin
  if not (public.tidalis_seller_routine_access(p_shop_id,array['owner','manager','artist']) or public.is_platform_admin(auth.uid())) then
    raise exception 'MFA and shop access required';
  end if;
  select status into v_status from public.shops where id=p_shop_id;
  if v_status is null or v_status not in ('paused','active') then
    return array['shop_not_eligible']::text[];
  end if;
  if not exists (select 1 from public.seller_applications a
    where a.created_shop_id=p_shop_id and a.status='approved') then
    v_reasons := array_append(v_reasons,'seller_approval_missing');
  end if;
  foreach v_type in array array['terms','privacy','seller-agreement','payment-refund','copyright'] loop
    if not exists (select 1 from public.platform_policy_versions p
      where p.policy_type=v_type and p.status='published'
        and (p.effective_from is null or p.effective_from<=now())) then
      v_reasons := array_append(v_reasons,'platform_policy_'||v_type);
    end if;
  end loop;
  foreach v_type in array array['refund','delivery','license'] loop
    if not exists(select 1 from public.shop_policy_versions p
      where p.shop_id=p_shop_id and p.policy_type=v_type and p.status='published'
        and (p.source_type='text' or (p.source_type='pdf' and exists(
          select 1 from storage.objects o
          where o.bucket_id='tidalis-policy-documents' and o.name=p.document_path)))) then
      v_reasons := array_append(v_reasons,'shop_policy_'||v_type);
    end if;
  end loop;
  for v_product_id in select p.id from public.products p
    where p.shop_id=p_shop_id and p.status in ('draft','under_review','published') loop
    if array_length(public.tidalis_product_publish_blockers(v_product_id),1) is null then
      v_has_ready_product:=true;exit;
    end if;
  end loop;
  if not v_has_ready_product then
    v_reasons := array_append(v_reasons,'ready_product_missing');
  end if;
  -- Re-opening must not restore already-published but now broken product listings.
  for v_product_id in select p.id from public.products p
    where p.shop_id=p_shop_id and p.status='published' loop
    if array_length(public.tidalis_product_publish_blockers(v_product_id),1)>0 then
      v_reasons := array_append(v_reasons,'published_product_incomplete');
      exit;
    end if;
  end loop;
  return v_reasons;
end;
$$;
