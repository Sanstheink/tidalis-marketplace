-- Live SQL/RLS policy probes, NOT a real signed GoTrue login/MFA test.
-- Run as the database migration owner. All fixtures and state changes roll back
-- inside a subtransaction before the final test report is returned.
-- Uses EXISTING verified accounts solely as SQL/RLS subjects; no credentials,
-- auth users or MFA factors are created or edited by this probe.
do $$
declare
  v_owner uuid; v_buyer uuid; v_shop uuid:=gen_random_uuid();
  v_foreign_shop uuid:=gen_random_uuid(); v_product uuid:=gen_random_uuid();
  v_invoice uuid:=gen_random_uuid(); v_policy uuid; v_first uuid; v_second uuid;
  v_slug text:='audit-'||left(v_shop::text,8); v_denied boolean; v_rows bigint;
  v_result jsonb; v_checks jsonb:='[]'::jsonb; v_aal text; v_role text;
begin
  select m.user_id into v_owner from public.shop_members m
    join auth.mfa_factors f on f.user_id=m.user_id
    where f.factor_type='totp' and f.status='verified' limit 1;
  select id into v_policy from public.platform_policy_versions
    where policy_type='seller-agreement' and status='published'
      and approved_by is not null and effective_from<=now() order by version desc limit 1;
  select u.id into v_buyer from auth.users u where u.email_confirmed_at is not null
    and not exists(select 1 from public.seller_applications a where a.user_id=u.id and a.status in ('submitted','under_review','needs_information'))
    order by (u.id=v_owner),u.id limit 1;
  if v_owner is null or v_buyer is null or v_policy is null then raise exception 'Verified accounts, enrolled member and effective agreement are required for this probe'; end if;
  begin
    insert into public.shops(id,owner_id,name,slug,status) values
      (v_shop,v_owner,'Transactional Audit Shop',v_slug,'paused'),
      (v_foreign_shop,v_buyer,'Foreign Audit Shop',v_slug||'-other','paused');
    insert into public.shop_members(shop_id,user_id,role) values(v_shop,v_owner,'owner');
    insert into public.products(id,shop_id,slug,name,description,product_type,pricing_mode,status)
      values(v_product,v_shop,'draft-test','Audit Draft',repeat('x',40),'commission','quote','draft');
    insert into public.shop_work_types(shop_id,name) values(v_shop,'Audit Artwork');
    insert into public.seller_invoices(id,shop_id,invoice_number,period_from,period_to,total_minor)
      values(v_invoice,v_shop,'AUDIT-'||v_invoice::text,current_date,current_date,10000);

    perform set_config('request.jwt.claims','{"role":"anon","aal":"aal1"}',true);
    execute 'set local role anon';
    select seller_intake_open into v_denied from public.marketplace_settings;
    if v_denied is distinct from false then raise exception 'Intake must stay closed outside fixtures'; end if;
    v_checks:=v_checks||'"anon can read closed intake"'::jsonb;
    v_denied:=false;
    begin perform public.set_seller_intake_open(true); exception when insufficient_privilege then v_denied:=true; end;
    if not v_denied then raise exception 'Anon invoked intake mutation'; end if;
    v_checks:=v_checks||'"anon cannot invoke intake mutation"'::jsonb;
    execute 'reset role';

    perform set_config('request.jwt.claims',jsonb_build_object('sub',v_buyer,'role','authenticated','aal','aal1')::text,true);
    execute 'set local role authenticated';
    v_denied:=false;
    begin update public.marketplace_settings set seller_intake_open=true; exception when insufficient_privilege then v_denied:=true; end;
    if not v_denied then raise exception 'Buyer bypassed intake mutation grants'; end if;
    v_checks:=v_checks||'"buyer cannot bypass intake by table update"'::jsonb;
    v_denied:=false;
    begin perform public.submit_seller_application('Audit Applicant',v_slug||'-apply','https://example.invalid/audit',repeat('x',50),v_policy);
    exception when others then if sqlerrm not like '%applications are currently closed%' then raise; end if; v_denied:=true; end;
    if not v_denied then raise exception 'Closed intake accepted valid direct RPC'; end if;
    v_checks:=v_checks||'"valid direct submit RPC is blocked while closed"'::jsonb;
    execute 'reset role';

    perform set_config('request.jwt.claims',jsonb_build_object('sub',v_owner,'role','authenticated','aal','aal1')::text,true);
    execute 'set local role authenticated';
    select count(*) into v_rows from public.products where id=v_product;
    if v_rows<>1 then raise exception 'Enrolled AAL1 owner cannot read own fixture draft'; end if;
    v_checks:=v_checks||'"enrolled AAL1 owner reads own draft"'::jsonb;
    select count(*) into v_rows from public.shops where id=v_foreign_shop;
    if v_rows<>0 then raise exception 'Owner read foreign paused shop'; end if;
    v_checks:=v_checks||'"owner cannot read foreign paused shop"'::jsonb;
    select count(*) into v_rows from public.seller_invoices where id=v_invoice;
    if v_rows<>0 then raise exception 'AAL1 read invoice'; end if;
    v_checks:=v_checks||'"AAL1 cannot read invoice"'::jsonb;
    execute 'reset role';
    perform set_config('request.jwt.claims',jsonb_build_object('sub',v_owner,'role','authenticated','aal','aal2')::text,true);
    execute 'set local role authenticated';
    select count(*) into v_rows from public.seller_invoices where id=v_invoice;
    if v_rows<>1 then raise exception 'AAL2 owner lost historical invoice access'; end if;
    v_checks:=v_checks||'"AAL2 owner retains invoice access"'::jsonb;
    execute 'reset role';update public.shops set status='suspended' where id=v_shop;
    foreach v_aal in array array['aal1','aal2'] loop
      perform set_config('request.jwt.claims',jsonb_build_object('sub',v_owner,'role','authenticated','aal',v_aal)::text,true);
      execute 'set local role authenticated';v_denied:=false;
      begin insert into public.shop_work_types(shop_id,name) values(v_shop,'Must Not Insert'); exception when insufficient_privilege then v_denied:=true; end;
      if not v_denied then raise exception '% inserted a work type into suspended shop',v_aal; end if;
      v_checks:=v_checks||jsonb_build_array(v_aal||' suspended work-type insert denied');
      update public.shop_work_types set name='Must Not Change' where shop_id=v_shop;get diagnostics v_rows=row_count;
      if v_rows<>0 then raise exception '% changed a suspended work type',v_aal; end if;
      v_checks:=v_checks||jsonb_build_array(v_aal||' suspended work-type update denied');execute 'reset role';
    end loop;
    update public.shops set status='paused' where id=v_shop;
    foreach v_role in array array['support','finance'] loop
      update public.shop_members set role=v_role where shop_id=v_shop and user_id=v_owner;
      perform set_config('request.jwt.claims',jsonb_build_object('sub',v_owner,'role','authenticated','aal','aal1')::text,true);
      execute 'set local role authenticated';v_denied:=false;
      begin perform public.tidalis_shop_readiness_blockers(v_shop);
      exception when others then if sqlerrm<>'MFA and shop access required' then raise; end if;v_denied:=true;end;
      if not v_denied then raise exception 'Readiness role guard allowed %',v_role;end if;
      v_checks:=v_checks||jsonb_build_array(v_role||' readiness is denied at outer guard');execute 'reset role';
    end loop;
    update public.shop_members set role='owner' where shop_id=v_shop and user_id=v_owner;
    perform set_config('request.jwt.claims',jsonb_build_object('sub',v_owner,'role','authenticated','aal','aal1')::text,true);
    execute 'set local role authenticated';perform public.tidalis_shop_readiness_blockers(v_shop);
    v_checks:=v_checks||'"owner readiness aggregate completes"'::jsonb;execute 'reset role';

    -- This change is uncommitted and is rolled back with the fixture subtransaction.
    update public.marketplace_settings set seller_intake_open=true;
    perform set_config('request.jwt.claims',jsonb_build_object('sub',v_buyer,'role','authenticated','aal','aal1')::text,true);
    execute 'set local role authenticated';
    v_first:=public.submit_seller_application('Audit Applicant',v_slug||'-apply','https://example.invalid/audit',repeat('x',50),v_policy);
    v_checks:=v_checks||'"valid submit succeeds when the fixture intake is open"'::jsonb;
    v_denied:=false;
    begin perform public.submit_seller_application('Audit Applicant',v_slug||'-apply','https://example.invalid/audit',repeat('x',50),v_policy);
    exception when others then if sqlerrm<>'An application is already being reviewed' then raise;end if;v_denied:=true;end;
    if not v_denied then raise exception 'Duplicate open RPC application accepted';end if;
    v_checks:=v_checks||'"duplicate open application RPC denied"'::jsonb;execute 'reset role';
    update public.seller_applications set status='rejected' where id=v_first;
    execute 'set local role authenticated';
    v_second:=public.submit_seller_application('Audit Applicant',v_slug||'-apply','https://example.invalid/audit',repeat('x',50),v_policy);
    select count(*) into v_rows from public.seller_applications where id in(v_first,v_second);
    if v_rows<>2 or v_first=v_second then raise exception 'Rejected-slug reapplication lost history';end if;
    v_checks:=v_checks||'"rejected slug reused with both records preserved"'::jsonb;execute 'reset role';
    v_denied:=false;
    begin insert into public.seller_applications(user_id,shop_name,requested_slug,portfolio_url,description,status)
      values(v_buyer,'Duplicate Audit',v_slug||'-duplicate','https://example.invalid/audit',repeat('x',50),'under_review');
    exception when unique_violation then v_denied:=true;end;
    if not v_denied then raise exception 'Open-application partial unique index not enforced';end if;
    v_checks:=v_checks||'"partial unique index independently rejects a second open row"'::jsonb;
    update public.seller_applications set status='needs_information' where id=v_second;
    update public.marketplace_settings set seller_intake_open=false;
    execute 'set local role authenticated';v_denied:=false;
    begin perform public.resubmit_seller_application(v_second,'Audit Applicant',v_slug||'-apply','https://example.invalid/audit',repeat('x',50),v_policy);
    exception when others then if sqlerrm not like '%applications are currently closed%' then raise;end if;v_denied:=true;end;
    if not v_denied then raise exception 'Closed intake accepted resubmit';end if;
    v_checks:=v_checks||'"closed intake blocks direct resubmit"'::jsonb;execute 'reset role';

    insert into public.products(shop_id,slug,name,description,product_type,pricing_mode,status,created_at)
      select v_shop,'audit-catalog-'||i,case when i=70 then 'Live Needle 100%_Artwork' else 'Live Artwork '||i end,
        repeat('x',40),'commission','quote','draft',now()-(i||' hours')::interval from generate_series(1,70) i;
    insert into public.product_license_prices(product_id,usage_type,price_minor,terms)
      select p.id,l.usage_type,substring(p.slug from 15)::integer*100+l.extra,repeat('x',30)
      from public.products p cross join (values('personal',0),('commercial',10000)) l(usage_type,extra)
      where p.shop_id=v_shop and p.slug like 'audit-catalog-%';
    update public.products set status='published' where shop_id=v_shop and slug like 'audit-catalog-%';
    update public.shops set status='active' where id=v_shop;
    perform set_config('request.jwt.claims','{"role":"anon","aal":"aal1"}',true);execute 'set local role anon';
    v_result:=public.search_public_products('','all','featured',3,24,v_shop);
    if (v_result->>'total')::integer<>70 or jsonb_array_length(v_result->'items')<>22 then raise exception 'Live full-catalog pagination failed';end if;
    v_checks:=v_checks||'"live catalog pages all 70 fixture rows"'::jsonb;
    v_result:=public.search_public_products('Live Needle','all','featured',1,24,v_shop);
    if (v_result->>'total')::integer<>1 or v_result#>>'{items,0,slug}'<>'audit-catalog-70' then raise exception 'Older product search failed';end if;
    v_checks:=v_checks||'"live search finds a product outside the former first 60"'::jsonb;
    v_result:=public.search_public_products('','all','low',1,24,v_shop);
    if v_result#>>'{items,0,slug}'<>'audit-catalog-1' then raise exception 'Live ascending sort failed';end if;
    v_result:=public.search_public_products('','all','high',1,24,v_shop);
    if v_result#>>'{items,0,slug}'<>'audit-catalog-70' then raise exception 'Live descending sort failed';end if;
    v_checks:=v_checks||'"live price sorting occurs before pagination"'::jsonb;
    v_result:=public.search_public_products('100%_Artwork','all','featured',1,24,v_shop);
    if (v_result->>'total')::integer<>1 then raise exception 'Live literal wildcard search failed';end if;
    v_checks:=v_checks||'"live search escapes LIKE wildcard characters"'::jsonb;
    v_result:=public.search_public_products('','digital_asset','featured',1,24,v_shop);
    if (v_result->>'total')::integer<>0 then raise exception 'Draft/mode filter failed';end if;
    v_checks:=v_checks||'"live catalog excludes drafts and other modes"'::jsonb;
    execute 'reset role';update public.shops set status='paused' where id=v_shop;execute 'set local role anon';
    v_result:=public.search_public_products('','all','featured',1,24,v_shop);
    if (v_result->>'total')::integer<>0 then raise exception 'Paused fixture shop remained public';end if;
    v_checks:=v_checks||'"pausing fixture shop hides all published rows"'::jsonb;execute 'reset role';
    raise exception 'Rollback successful test fixtures' using errcode='P9001';
  exception when sqlstate 'P9001' then null;end;
  perform set_config('tidalis.live_test_result',jsonb_build_object('passed',jsonb_array_length(v_checks),'cases',v_checks,
    'fixtures_rolled_back',not exists(select 1 from public.seller_applications where id in(v_first,v_second))
      and not exists(select 1 from public.shops where id in(v_shop,v_foreign_shop))
      and not exists(select 1 from public.seller_invoices where id=v_invoice),
    'seller_intake_open',(select seller_intake_open from public.marketplace_settings))::text,true);
end;
$$;
select current_setting('tidalis.live_test_result')::jsonb as test_report;
