-- 0.5.10 emergency schema rollback. Prefer an APP rollback while retaining this compatible migration.
-- This transaction aborts without discarding history if closed applications reuse a slug.
-- It restores the original work-type policies and readiness contract (including their known defects).
-- Restore the previous application version together with this schema, then investigate.
begin;
alter table public.seller_applications add constraint seller_applications_user_id_requested_slug_key unique(user_id,requested_slug);
drop trigger tidalis_seller_intake_gate on public.seller_applications;
drop function public.tidalis_require_seller_intake();
drop function public.set_seller_intake_open(boolean);
drop function public.search_public_products(text,text,text,integer,integer,uuid);
drop table public.marketplace_settings;
alter policy work_types_write on public.shop_work_types with check(public.is_shop_member(shop_id,(select auth.uid()),array['owner','manager']));
alter policy work_types_update on public.shop_work_types using(public.is_shop_member(shop_id,(select auth.uid()),array['owner','manager'])) with check(public.is_shop_member(shop_id,(select auth.uid()),array['owner','manager']));
CREATE OR REPLACE FUNCTION public.tidalis_shop_readiness_blockers(p_shop_id uuid)
 RETURNS text[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_status text; v_reasons text[] := array[]::text[]; v_type text;
  v_product_id uuid; v_has_ready_product boolean:=false;
begin
  if not (public.tidalis_seller_routine_access(p_shop_id) or public.is_platform_admin(auth.uid())) then
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
$function$
;
-- Trigger EXECUTE privileges stay restricted; application flows don't need direct execution.
commit;
