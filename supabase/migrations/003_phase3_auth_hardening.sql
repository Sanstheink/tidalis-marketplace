-- Marketplace Tidalis / Phase 3 (STAGING FIRST)
-- Apply only AFTER 001_identity_catalog.sql and 002_finance_tax.sql.
-- Never run as an authenticated browser user. Review in Supabase SQL editor.

-- MFA is enforced inside the database for all existing RLS policies that
-- call these helpers. Checking an admin/seller role in a React page is NOT enough.
-- Do not use SECURITY DEFINER helpers as general-purpose role lookup for arbitrary UUIDs.
create or replace function public.is_platform_admin(p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
 select p_user_id = auth.uid()
 and coalesce(auth.jwt()->>'aal','aal1') = 'aal2'
 and exists(select 1 from public.platform_roles where user_id=p_user_id and role='admin');
$$;
create or replace function public.is_shop_member(
 p_shop_id uuid,p_user_id uuid,
 p_roles text[] default array['owner','manager','artist','support','finance'])
returns boolean language sql stable security definer set search_path = '' as $$
 select p_user_id = auth.uid()
 and coalesce(auth.jwt()->>'aal','aal1') = 'aal2'
 and exists(select 1 from public.shop_members where shop_id=p_shop_id and user_id=p_user_id and role=any(p_roles));
$$;

-- Email / username identities are display identifiers, not sources of authorization.
-- Normalize public username from untrusted metadata, leaving invalid values NULL.
create or replace function public.on_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_username text;
begin
 v_username := lower(trim(coalesce(new.raw_user_meta_data->>'username','')));
 if v_username !~ '^[a-z0-9_]{3,30}$' then v_username := null; end if;
 insert into public.profiles(id,display_name,username)
 values(new.id,coalesce(nullif(trim(new.raw_user_meta_data->>'username'),''),new.email),v_username)
 on conflict (id) do nothing;
 return new;
end;
$$;

-- Reject unapproved seller applications through service account or forged form inputs.
-- Important: legal agreement is still an externally reviewed prerequisite.
create or replace function public.approve_seller_application(p_application_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_app public.seller_applications%rowtype; v_shop_id uuid;
begin
 if not public.is_platform_admin(auth.uid()) then raise exception 'Not authorized'; end if;
 if coalesce(auth.jwt()->>'aal','aal1') <> 'aal2' then raise exception 'MFA required'; end if;
 select * into v_app from public.seller_applications where id=p_application_id for update;
 if not found or v_app.status <> 'submitted' or v_app.agreement_accepted_at is null then
   raise exception 'Application is not eligible for approval';
 end if;
 if not exists(select 1 from public.platform_policy_versions p
   where p.policy_type='seller-agreement' and p.status='published'
   and (p.effective_from is null or p.effective_from<=now())) then
   raise exception 'Seller agreement is not published';
 end if;
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

-- Platform roles and shop_members are intentionally READ ONLY to the browser.
-- Admin bootstrap uses trusted SQL editor + verified auth.users UUID only.
-- Caution: SQL editor bypasses RLS; NEVER paste secrets or privileged SQL into a public route.
