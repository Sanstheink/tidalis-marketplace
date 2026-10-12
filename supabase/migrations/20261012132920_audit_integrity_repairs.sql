-- Repair confirmed hosted function drift without replaying historical migrations.
-- Preserve identifiers, business rows, policy versions and existing function grants.

create or replace function public.approve_seller_application(p_application_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_app public.seller_applications%rowtype; v_policy public.platform_policy_versions%rowtype;
  v_shop_id uuid;
begin
  if not public.is_platform_admin(auth.uid()) then raise exception 'Admin MFA required'; end if;
  select * into v_app from public.seller_applications where id=p_application_id for update;
  if not found or v_app.status not in ('submitted','under_review') or
     v_app.agreement_version_id is null or v_app.agreement_accepted_at is null then
    raise exception 'Seller application is not ready for approval';
  end if;
  if not exists(select 1 from auth.users
    where id=v_app.user_id and email_confirmed_at is not null) then
    raise exception 'Applicant email is not verified';
  end if;
  select * into v_policy from public.platform_policy_versions
    where policy_type='seller-agreement' and status='published'
      and approved_by is not null and effective_from<=now()
    order by version desc limit 1;
  if not found or v_policy.id<>v_app.agreement_version_id or
     not exists(select 1 from public.policy_acceptances
       where user_id=v_app.user_id and policy_version_id=v_app.agreement_version_id) then
    raise exception 'Applicant must reaccept the current Seller Agreement';
  end if;
  if exists(select 1 from public.shops where slug=v_app.requested_slug) then
    raise exception 'Shop URL is not available';
  end if;
  insert into public.shops(owner_id,name,slug,description,status)
    values(v_app.user_id,v_app.shop_name,v_app.requested_slug,v_app.description,'paused')
    returning id into v_shop_id;
  insert into public.shop_members(shop_id,user_id,role)
    values(v_shop_id,v_app.user_id,'owner');
  update public.seller_applications set status='approved',
    reviewed_by=auth.uid(),reviewed_at=now(),review_note=null,created_shop_id=v_shop_id
    where id=p_application_id;
  insert into public.audit_logs(actor_id,shop_id,action,target_table,target_id,metadata)
    values(auth.uid(),v_shop_id,'seller_approved','seller_applications',p_application_id,
      pg_catalog.jsonb_build_object('agreement_version_id',v_app.agreement_version_id));
  return v_shop_id;
end;
$$;

create or replace function public.save_shop_policy_draft(p_shop_id uuid,p_policy_type text,p_content text,p_draft_id uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_policy public.shop_policy_versions%rowtype;
  v_id uuid; v_version integer; v_status text;
begin
  if not public.tidalis_seller_routine_access(p_shop_id,array['owner','manager']) then
    raise exception 'Shop owner/manager MFA required';
  end if;
  select status into v_status from public.shops where id=p_shop_id;
  if v_status is null or v_status not in ('paused','active') then raise exception 'Shop is not eligible'; end if;
  if p_policy_type is null or p_policy_type not in ('refund','delivery','license','other') then
    raise exception 'Invalid shop policy type';
  end if;
  if length(trim(coalesce(p_content,''))) not between 1 and 30000 then
    raise exception 'Draft must contain 1-30000 characters; submit requires at least 200';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_shop_id::text),pg_catalog.hashtext(p_policy_type));
  if p_draft_id is not null then
    select * into v_policy from public.shop_policy_versions
      where id=p_draft_id and shop_id=p_shop_id and policy_type=p_policy_type for update;
    if not found or v_policy.status <> 'draft' then raise exception 'Draft no longer editable'; end if;
    if v_policy.source_type <> 'text' then raise exception 'This draft uses a PDF; upload a revised PDF instead'; end if;
    update public.shop_policy_versions set content=trim(p_content),review_note=null,
      review_outcome=null,reviewed_by=null,reviewed_at=null
      where id=v_policy.id returning id into v_id;
  else
    if exists(select 1 from public.shop_policy_versions where shop_id=p_shop_id
        and policy_type=p_policy_type and status in ('draft','under_review')) then
      raise exception 'Existing draft or under-review version; edit that version first';
    end if;
    select coalesce(max(version),0)+1 into v_version from public.shop_policy_versions
      where shop_id=p_shop_id and policy_type=p_policy_type;
    insert into public.shop_policy_versions(shop_id,policy_type,version,content,status,source_type)
      values(p_shop_id,p_policy_type,v_version,trim(p_content),'draft','text') returning id into v_id;
  end if;
  insert into public.audit_logs(actor_id,shop_id,action,target_table,target_id,metadata)
    values(auth.uid(),p_shop_id,'shop_policy_draft_saved','shop_policy_versions',v_id,
      pg_catalog.jsonb_build_object('policy_type',p_policy_type,'source_type','text'));
  return v_id;
end;
$$;

create or replace function public.save_shop_policy_document_draft(p_shop_id uuid,p_policy_type text,p_file_path text,p_document_name text,p_document_size bigint,p_draft_id uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_policy public.shop_policy_versions%rowtype;
  v_object storage.objects%rowtype; v_id uuid; v_version integer; v_status text;
begin
  if not public.tidalis_seller_routine_access(p_shop_id,array['owner','manager']) then
    raise exception 'Shop owner/manager MFA required'; end if;
  select status into v_status from public.shops where id=p_shop_id;
  if v_status is null or v_status not in ('paused','active') then raise exception 'Shop is not eligible'; end if;
  if p_policy_type is null or p_policy_type not in ('refund','delivery','license','other') then
    raise exception 'Invalid shop policy type'; end if;
  if p_file_path is null or p_file_path !~ ('^shops/'||p_shop_id::text||'/policies/[0-9a-f-]{36}\.pdf$') then
    raise exception 'Invalid policy PDF path'; end if;
  if p_document_name is null or length(trim(p_document_name)) not between 5 and 160
     or lower(p_document_name) !~ '\.pdf$' or position('/' in p_document_name)>0 or position(chr(92) in p_document_name)>0 or p_document_name ~ '[[:cntrl:]]'
     or p_document_size is null or p_document_size not between 1 and 8388608 then
    raise exception 'Invalid PDF file name or size'; end if;
  select * into v_object from storage.objects where bucket_id='tidalis-policy-documents'
    and name=p_file_path and owner_id=auth.uid()::text;
  if not found or (v_object.metadata->>'mimetype') is distinct from 'application/pdf'
    or (v_object.metadata->>'size')::bigint is distinct from p_document_size then
    raise exception 'Private PDF upload is missing, invalid, or has a different owner/size'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_shop_id::text),pg_catalog.hashtext(p_policy_type));
  if p_draft_id is not null then
    select * into v_policy from public.shop_policy_versions where id=p_draft_id
      and shop_id=p_shop_id and policy_type=p_policy_type for update;
    if not found or v_policy.status <> 'draft' or v_policy.source_type <> 'pdf' then
      raise exception 'This PDF draft is no longer editable'; end if;
    update public.shop_policy_versions set document_path=p_file_path,
      document_name=trim(p_document_name),document_size=p_document_size,
      review_note=null,review_outcome=null,reviewed_by=null,reviewed_at=null
      where id=v_policy.id returning id into v_id;
  else
    if exists(select 1 from public.shop_policy_versions where shop_id=p_shop_id
        and policy_type=p_policy_type and status in ('draft','under_review')) then
      raise exception 'Existing draft or under-review version; edit that version first'; end if;
    select coalesce(max(version),0)+1 into v_version from public.shop_policy_versions
      where shop_id=p_shop_id and policy_type=p_policy_type;
    insert into public.shop_policy_versions(shop_id,policy_type,version,content,status,
      source_type,document_path,document_name,document_size)
      values(p_shop_id,p_policy_type,v_version,'[PDF attached: see document]','draft',
        'pdf',p_file_path,trim(p_document_name),p_document_size) returning id into v_id;
  end if;
  insert into public.audit_logs(actor_id,shop_id,action,target_table,target_id,metadata)
    values(auth.uid(),p_shop_id,'shop_policy_pdf_draft_saved','shop_policy_versions',v_id,
      pg_catalog.jsonb_build_object('policy_type',p_policy_type,'source_type','pdf',
        'document_name',p_document_name,'document_size',p_document_size));
  return v_id;
end;
$$;

create or replace function public.submit_shop_policy_draft(p_policy_version_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_policy public.shop_policy_versions%rowtype;
begin
  select * into v_policy from public.shop_policy_versions where id=p_policy_version_id for update;
  if not found or not public.is_shop_member(v_policy.shop_id,auth.uid(),array['owner','manager']) then
    raise exception 'Shop owner/manager MFA required'; end if;
  if v_policy.status <> 'draft' then raise exception 'Only drafts can be submitted'; end if;
  if v_policy.source_type='text' and length(trim(v_policy.content))<200 then
    raise exception 'Text policy is incomplete'; end if;
  if v_policy.source_type='pdf' and not exists (
    select 1 from storage.objects so where so.bucket_id='tidalis-policy-documents'
      and so.name=v_policy.document_path) then raise exception 'PDF document is missing'; end if;
  if not exists(select 1 from public.shops where id=v_policy.shop_id and status in ('paused','active')) then
    raise exception 'Shop is not eligible'; end if;
  update public.shop_policy_versions set status='under_review',submitted_at=now(),
    review_note=null,review_outcome=null where id=v_policy.id;
  insert into public.audit_logs(actor_id,shop_id,action,target_table,target_id,metadata)
    values(auth.uid(),v_policy.shop_id,'shop_policy_submitted','shop_policy_versions',v_policy.id,
      pg_catalog.jsonb_build_object('policy_type',v_policy.policy_type,'version',v_policy.version,
        'source_type',v_policy.source_type));
end;
$$;

create or replace function public.tidalis_lock_published_shop_policy()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if old.status in ('published','archived') and (
    new.shop_id is distinct from old.shop_id
    or new.policy_type is distinct from old.policy_type
    or new.version is distinct from old.version
    or new.content is distinct from old.content
    or new.source_type is distinct from old.source_type
    or new.document_path is distinct from old.document_path
    or new.document_name is distinct from old.document_name
    or new.document_size is distinct from old.document_size
    or new.published_at is distinct from old.published_at
    or new.reviewed_by is distinct from old.reviewed_by
    or new.reviewed_at is distinct from old.reviewed_at
    or new.review_note is distinct from old.review_note
    or new.review_outcome is distinct from old.review_outcome
    or new.submitted_at is distinct from old.submitted_at
    or new.created_at is distinct from old.created_at
    or (old.status = 'archived' and new.status is distinct from old.status)
    or (old.status = 'published' and new.status not in ('published','archived'))
  ) then
    raise exception 'Published shop policy versions are immutable';
  end if;
  return new;
end;
$$;

-- Cover the 44 unindexed foreign keys reported by the hosted advisor. Existing
-- partial/unique indexes remain; unused indexes are not removed from history.
create index if not exists "idx_audit_logs_actor_id" on public."audit_logs" ("actor_id");
create index if not exists "idx_audit_logs_shop_id" on public."audit_logs" ("shop_id");
create index if not exists "idx_commission_adjustments_commission_entry_id" on public."commission_adjustments" ("commission_entry_id");
create index if not exists "idx_commission_brief_versions_author_id" on public."commission_brief_versions" ("author_id");
create index if not exists "idx_commission_entries_fee_rule_id" on public."commission_entries" ("fee_rule_id");
create index if not exists "idx_commission_entries_shop_id" on public."commission_entries" ("shop_id");
create index if not exists "idx_commission_fee_rules_shop_id" on public."commission_fee_rules" ("shop_id");
create index if not exists "idx_download_entitlements_buyer_id" on public."download_entitlements" ("buyer_id");
create index if not exists "idx_financial_documents_issued_by" on public."financial_documents" ("issued_by");
create index if not exists "idx_financial_documents_tax_profile_version_id" on public."financial_documents" ("tax_profile_version_id");
create index if not exists "idx_marketplace_settings_updated_by" on public."marketplace_settings" ("updated_by");
create index if not exists "idx_order_items_order_id" on public."order_items" ("order_id");
create index if not exists "idx_order_items_product_id" on public."order_items" ("product_id");
create index if not exists "idx_payment_transactions_confirmed_by" on public."payment_transactions" ("confirmed_by");
create index if not exists "idx_payment_transactions_shop_id" on public."payment_transactions" ("shop_id");
create index if not exists "idx_platform_announcements_created_by" on public."platform_announcements" ("created_by");
create index if not exists "idx_platform_announcements_updated_by" on public."platform_announcements" ("updated_by");
create index if not exists "idx_platform_billing_documents_issued_by" on public."platform_billing_documents" ("issued_by");
create index if not exists "idx_platform_billing_documents_voided_by" on public."platform_billing_documents" ("voided_by");
create index if not exists "idx_platform_fee_payments_confirmed_by" on public."platform_fee_payments" ("confirmed_by");
create index if not exists "idx_platform_fee_payments_invoice_id" on public."platform_fee_payments" ("invoice_id");
create index if not exists "idx_platform_issuer_profile_approved_by" on public."platform_issuer_profile" ("approved_by");
create index if not exists "idx_platform_policy_versions_approved_by" on public."platform_policy_versions" ("approved_by");
create index if not exists "idx_policy_acceptances_policy_version_id" on public."policy_acceptances" ("policy_version_id");
create index if not exists "idx_product_files_product_id" on public."product_files" ("product_id");
create index if not exists "idx_products_reviewed_by" on public."products" ("reviewed_by");
create index if not exists "idx_products_work_type_id" on public."products" ("work_type_id");
create index if not exists "idx_refund_requests_buyer_id" on public."refund_requests" ("buyer_id");
create index if not exists "idx_refund_requests_shop_id" on public."refund_requests" ("shop_id");
create index if not exists "idx_seller_applications_created_shop_id" on public."seller_applications" ("created_shop_id");
create index if not exists "idx_seller_applications_reviewed_by" on public."seller_applications" ("reviewed_by");
create index if not exists "idx_seller_invoices_shop_id" on public."seller_invoices" ("shop_id");
create index if not exists "idx_seller_tax_profiles_current_version_id" on public."seller_tax_profiles" ("current_version_id");
create index if not exists "idx_shop_policy_versions_reviewed_by" on public."shop_policy_versions" ("reviewed_by");
create index if not exists "idx_shop_readiness_requests_reviewed_by" on public."shop_readiness_requests" ("reviewed_by");
create index if not exists "idx_tax_profile_change_requests_base_version_id" on public."tax_profile_change_requests" ("base_version_id");
create index if not exists "idx_tax_profile_change_requests_reviewed_by" on public."tax_profile_change_requests" ("reviewed_by");
create index if not exists "idx_tax_profile_change_requests_shop_id" on public."tax_profile_change_requests" ("shop_id");
create index if not exists "idx_tax_profile_change_requests_submitted_by" on public."tax_profile_change_requests" ("submitted_by");
create index if not exists "idx_tax_profile_versions_approved_by" on public."tax_profile_versions" ("approved_by");
create index if not exists "idx_tax_profile_versions_tax_profile_id" on public."tax_profile_versions" ("tax_profile_id");
create index if not exists "idx_vat_verification_requests_reviewed_by" on public."vat_verification_requests" ("reviewed_by");
create index if not exists "idx_vat_verification_requests_shop_id" on public."vat_verification_requests" ("shop_id");
create index if not exists "idx_vat_verification_requests_submitted_by" on public."vat_verification_requests" ("submitted_by");

notify pgrst,'reload schema';
