-- Tidalis Phase 5.7.1: PDF-backed shop policy drafts.
-- Run on a STAGING clone first, after migrations 001-006. Do not paste on
-- Production without review, backup, and independent access-control tests.
-- Does not seed shops, modify seller approvals, publish policies or process money.

alter table public.shop_policy_versions
  add column if not exists source_type text not null default 'text',
  add column if not exists document_path text,
  add column if not exists document_name text,
  add column if not exists document_size bigint;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='tidalis_shop_policy_source_type_check' and conrelid='public.shop_policy_versions'::regclass) then
    alter table public.shop_policy_versions add constraint tidalis_shop_policy_source_type_check
      check ((source_type='text' and document_path is null and document_name is null and document_size is null)
      or (source_type='pdf' and document_path is not null and document_name is not null and document_size between 1 and 8388608));
  end if;
end $$;
create unique index if not exists tidalis_shop_policy_document_unique
  on public.shop_policy_versions(document_path) where document_path is not null;

-- New bucket, PRIVATE even if a misconfigured one exists with this name.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('tidalis-policy-documents','tidalis-policy-documents',false,8388608,array['application/pdf']::text[])
on conflict(id) do update set public=false,file_size_limit=8388608,allowed_mime_types=array['application/pdf']::text[];

-- Storage RLS: owner/manager with Supabase AAL2 may upload; no client UPDATE,
-- DELETE or UPSERT permissions. Public may read a PDF ONLY when the exact path
-- is referenced by a published shop policy whose shop is active.
drop policy if exists tidalis_policy_pdf_upload on storage.objects;
create policy tidalis_policy_pdf_upload on storage.objects for insert to authenticated
with check (
  bucket_id='tidalis-policy-documents'
  and storage.objects.name ~ '^shops/[0-9a-f-]{36}/policies/[0-9a-f-]{36}\.pdf$'
  and owner_id=auth.uid()::text
  and case when storage.objects.name ~ '^shops/[0-9a-f-]{36}/policies/[0-9a-f-]{36}\.pdf$'
    then public.is_shop_member((storage.foldername(storage.objects.name))[2]::uuid,
      (select auth.uid()),array['owner','manager'])
    else false end
);

drop policy if exists tidalis_policy_pdf_read on storage.objects;
create policy tidalis_policy_pdf_read on storage.objects for select to anon,authenticated
using (
  bucket_id='tidalis-policy-documents'
  and (
    (storage.objects.name ~ '^shops/[0-9a-f-]{36}/policies/[0-9a-f-]{36}\.pdf$'
      and case when storage.objects.name ~ '^shops/[0-9a-f-]{36}/policies/[0-9a-f-]{36}\.pdf$'
        then public.is_shop_member((storage.foldername(storage.objects.name))[2]::uuid,
          (select auth.uid()),array['owner','manager'])
        else false end)
    or public.is_platform_admin((select auth.uid()))
    or exists (
      select 1 from public.shop_policy_versions pv
      join public.shops s on s.id=pv.shop_id
      where pv.document_path=storage.objects.name
        and pv.status='published' and pv.source_type='pdf' and s.status='active'
    )
  )
);

-- Strengthen the existing immutability trigger for new attachment fields.
create or replace function public.tidalis_lock_published_shop_policy()
returns trigger language plpgsql set search_path = '' as $$
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

-- Keep Phase 5.7 text behavior while giving a more specific failure for PDF
-- drafts; only an owner/manager with MFA can invoke this SECURITY DEFINER RPC.
create or replace function public.save_shop_policy_draft(
 p_shop_id uuid, p_policy_type text, p_content text, p_draft_id uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_policy public.shop_policy_versions%rowtype;
  v_id uuid; v_version integer; v_status text;
begin
  if not public.is_shop_member(p_shop_id,auth.uid(),array['owner','manager']) then
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

create or replace function public.save_shop_policy_document_draft(
 p_shop_id uuid, p_policy_type text, p_file_path text, p_document_name text,
 p_document_size bigint, p_draft_id uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_policy public.shop_policy_versions%rowtype;
  v_object storage.objects%rowtype; v_id uuid; v_version integer; v_status text;
begin
  if not public.is_shop_member(p_shop_id,auth.uid(),array['owner','manager']) then
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

-- A second enforcement point: do not publish a PDF whose object has disappeared.
-- This runs during the existing Admin review transaction, even if an old RPC
-- accidentally skips the attachment check.
create or replace function public.tidalis_validate_shop_policy_publication()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status='published' and old.status is distinct from 'published' and new.source_type='pdf'
    and not exists (
      select 1 from storage.objects so
      where so.bucket_id='tidalis-policy-documents'
        and so.name=new.document_path
        and (so.metadata->>'mimetype')='application/pdf'
        and (so.metadata->>'size')::bigint=new.document_size
    ) then
    raise exception 'Cannot publish a shop policy with a missing PDF document';
  end if;
  return new;
end;
$$;
drop trigger if exists tidalis_validate_shop_policy_publication on public.shop_policy_versions;
create trigger tidalis_validate_shop_policy_publication
before update on public.shop_policy_versions
for each row execute function public.tidalis_validate_shop_policy_publication();

-- PDF drafts must have an attached object; text drafts keep minimum-length rule.
create or replace function public.submit_shop_policy_draft(p_policy_version_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
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

revoke all on function public.save_shop_policy_document_draft(uuid,text,text,text,bigint,uuid) from public,anon;
grant execute on function public.save_shop_policy_document_draft(uuid,text,text,text,bigint,uuid) to authenticated;
-- Reaffirm original RPC grants without granting table writes.
revoke all on function public.save_shop_policy_draft(uuid,text,text,uuid) from public,anon;
revoke all on function public.submit_shop_policy_draft(uuid) from public,anon;
grant execute on function public.save_shop_policy_draft(uuid,text,text,uuid) to authenticated;
grant execute on function public.submit_shop_policy_draft(uuid) to authenticated;
