-- Hosted SQL/RLS regression probe. This is not a signed Auth/MFA browser test.
-- Synthetic rows and all fixture changes roll back before the JSON is returned.
begin;
do $$
declare
 v_owner uuid;v_admin uuid;v_agreement uuid;v_shop uuid:=gen_random_uuid();
 v_user uuid:=gen_random_uuid();v_app uuid:=gen_random_uuid();v_text uuid;v_pdf uuid;
 v_path text;v_checks jsonb:='[]';v_ok boolean;v_detail text;v_field text;
begin
 select m.user_id into v_owner from public.shop_members m join auth.mfa_factors f on f.user_id=m.user_id where f.factor_type='totp' and f.status='verified' limit 1;
 select r.user_id into v_admin from public.platform_roles r join auth.mfa_factors f on f.user_id=r.user_id where r.role='admin' and f.factor_type='totp' and f.status='verified' limit 1;
 select id into v_agreement from public.platform_policy_versions where policy_type='seller-agreement' and status='published' and approved_by is not null and effective_from<=now() order by version desc limit 1;
 if v_owner is null or v_admin is null or v_agreement is null then raise exception 'Verified seller, admin and effective agreement are required';end if;
 begin
  perform set_config('request.jwt.claims','{}',true);
  insert into public.shops(id,owner_id,name,slug,status) values(v_shop,v_owner,'Transactional Integrity Probe','probe-'||v_shop::text,'paused');
  insert into public.shop_members(shop_id,user_id,role) values(v_shop,v_owner,'owner');
  v_path:='shops/'||v_shop::text||'/policies/'||gen_random_uuid()::text||'.pdf';
  insert into storage.objects(bucket_id,name,owner_id,metadata) values('tidalis-policy-documents',v_path,v_owner::text,'{"size":100,"mimetype":"application/pdf"}');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_owner,'role','authenticated','aal','aal1')::text,true);
  execute 'set local role authenticated';
  v_ok:=true;v_detail:=null;
  begin select public.save_shop_policy_draft(v_shop,'refund','Synthetic working draft.',null) into v_text;exception when others then v_ok:=false;v_detail:=sqlerrm;end;
  v_checks:=v_checks||jsonb_build_array(jsonb_build_object('name','short_text_draft_aal1','passed',v_ok,'detail',v_detail));
  v_ok:=true;v_detail:=null;
  begin select public.save_shop_policy_document_draft(v_shop,'delivery',v_path,'Synthetic policy.pdf',100,null) into v_pdf;exception when others then v_ok:=false;v_detail:=sqlerrm;end;
  v_checks:=v_checks||jsonb_build_array(jsonb_build_object('name','pdf_draft_aal1','passed',v_ok,'detail',v_detail));
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_owner,'role','authenticated','aal','aal2')::text,true);
  if v_pdf is null then select public.save_shop_policy_document_draft(v_shop,'delivery',v_path,'Synthetic policy.pdf',100,null) into v_pdf;end if;
  v_ok:=true;v_detail:=null;
  begin perform public.submit_shop_policy_draft(v_pdf);exception when others then v_ok:=false;v_detail:=sqlerrm;end;
  v_checks:=v_checks||jsonb_build_array(jsonb_build_object('name','complete_pdf_submission','passed',v_ok,'detail',v_detail));
  execute 'reset role';
  update public.shop_policy_versions set status='published',reviewed_by=v_admin,reviewed_at=now(),published_at=now(),review_outcome='approved',review_note='Synthetic transactional audit approval.' where id=v_pdf;
  foreach v_field in array array['document_name','document_size','document_path','source_type'] loop
   v_ok:=false;v_detail:=null;
   begin
    if v_field='document_name' then update public.shop_policy_versions set document_name='Changed.pdf' where id=v_pdf;
    elsif v_field='document_size' then update public.shop_policy_versions set document_size=200 where id=v_pdf;
    elsif v_field='document_path' then update public.shop_policy_versions set document_path=v_path||'changed' where id=v_pdf;
    else update public.shop_policy_versions set source_type='text' where id=v_pdf;end if;
   exception when others then v_ok:=position('immutable' in sqlerrm)>0;v_detail:=case when not v_ok then sqlerrm end;end;
   v_checks:=v_checks||jsonb_build_array(jsonb_build_object('name','published_pdf_'||v_field||'_locked','passed',v_ok,'detail',v_detail));
  end loop;
  -- Only synthetic auth rows are used for the negative approval probe.
  perform set_config('request.jwt.claims','{}',true);
  insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data,created_at,updated_at) values(v_user,'probe-'||v_user::text||'@example.invalid',now(),'{}',now(),now());
  insert into public.seller_applications(id,user_id,shop_name,requested_slug,portfolio_url,description,status,agreement_version_id,agreement_accepted_at) values(v_app,v_user,'Synthetic Applicant','probe-app-'||left(v_app::text,8),'https://example.invalid/probe',repeat('x',50),'submitted',v_agreement,now());
  update auth.users set email_confirmed_at=null where id=v_user;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_admin,'role','authenticated','aal','aal2')::text,true);execute 'set local role authenticated';
  v_ok:=false;v_detail:=null;
  begin perform public.approve_seller_application(v_app);exception when others then v_ok:=position('email is not verified' in sqlerrm)>0;v_detail:=case when not v_ok then sqlerrm end;end;
  v_checks:=v_checks||jsonb_build_array(jsonb_build_object('name','unverified_applicant_denied','passed',v_ok,'detail',v_detail));
  execute 'reset role';
  raise exception using errcode='PT999',message='Rollback all audit fixtures';
 exception when sqlstate 'PT999' then null;
 end;
 perform set_config('tidalis.audit_results',v_checks::text,true);
end $$;
select current_setting('tidalis.audit_results')::jsonb as results;
rollback;
