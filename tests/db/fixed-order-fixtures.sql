-- Synthetic fixtures for an EMPTY LOCAL database only; never apply remotely.
insert into public.shops(id,owner_id,name,slug,status) values
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Moonlit Test Studio','moonlit-test-studio','active'),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','Other Test Studio','other-test-studio','active');
insert into public.shop_members(shop_id,user_id,role) values
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','owner'),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','owner');
insert into public.platform_policy_versions(policy_type,version,title,content,status,effective_from,approved_by)
 select t,1,'Local test '||t,repeat('Synthetic local test policy. ',30),'published',now()-interval '1 day','10000000-0000-4000-8000-000000000004'
 from unnest(array['terms','privacy','seller-agreement','payment-refund','copyright']) t;
insert into public.shop_policy_versions(shop_id,policy_type,version,content,status,published_at,reviewed_by)
 select s.id,t,1,repeat('Synthetic local shop policy. ',25),'published',now(),'10000000-0000-4000-8000-000000000004'
 from public.shops s cross join unnest(array['refund','delivery','license']) t;
insert into public.shop_readiness_requests(shop_id,status,reviewed_by,reviewed_at)
 select id,'approved','10000000-0000-4000-8000-000000000004',now() from public.shops;
insert into public.seller_tax_profiles(shop_id,vat_status) select id,'not_registered' from public.shops;
insert into public.shop_work_types(id,shop_id,name) values
 ('40000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Digital artwork'),
 ('40000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','Illustration');
insert into public.products(id,shop_id,work_type_id,slug,name,description,product_type,pricing_mode,status,stock,is_exclusive,reviewed_by,published_at) values
 ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','moonlit-brushes','Moonlit Brush Set',repeat('Local test digital brushes. ',5),'digital_asset','fixed','draft',null,false,'10000000-0000-4000-8000-000000000004',now()),
 ('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','violet-exclusive','Violet Exclusive',repeat('Local test exclusive artwork. ',5),'ready_made','fixed','draft',1,true,'10000000-0000-4000-8000-000000000004',now()),
 ('30000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002','other-artwork','Other Artwork',repeat('Local test other-shop artwork. ',5),'ready_made','fixed','draft',3,false,'10000000-0000-4000-8000-000000000004',now()),
 ('30000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','test-commission','Test Commission',repeat('Local test commission description. ',5),'commission','quote','draft',null,false,'10000000-0000-4000-8000-000000000004',now());
insert into public.product_license_prices(product_id,usage_type,price_minor,terms)
 select p.id,t,case when t='personal' then 12675 else 25125 end,'Local test license for '||t||' use only.'
 from public.products p cross join unnest(array['personal','commercial']) t;
insert into public.product_files(product_id,file_path,is_delivery_file)
 select p.id,'shops/'||p.shop_id||'/products/'||p.id||'/previews/50000000-0000-4000-8000-000000000001.png',false from public.products p;
insert into public.product_files(product_id,file_path,is_delivery_file)
 select p.id,'shops/'||p.shop_id||'/products/'||p.id||'/deliverables/50000000-0000-4000-8000-000000000002.zip',true from public.products p where pricing_mode='fixed';

update public.products set status='published';
insert into public.products(id,shop_id,slug,name,product_type,pricing_mode,status) values
 ('30000000-0000-4000-8000-000000000005','20000000-0000-4000-8000-000000000001','unpublished-test','Unpublished Test','digital_asset','fixed','draft');
