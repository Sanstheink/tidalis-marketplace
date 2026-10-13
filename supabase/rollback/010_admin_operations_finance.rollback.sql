-- Safe rollback of Phase 5.9 RPC entrypoints. Run only with trusted operator privileges.
-- Deploy previous web commit FIRST, then optionally run this SQL.
-- Intentionally does NOT drop finance documents, ledger references, audit history or saved announcements.
begin;
revoke execute on function public.tidalis_save_announcement(uuid,text,text,text,boolean,boolean,integer,timestamptz,timestamptz) from authenticated;
revoke execute on function public.tidalis_change_announcement_status(uuid,text) from authenticated;
revoke execute on function public.tidalis_issue_platform_document(uuid,text,text,bigint,bigint) from authenticated;
revoke execute on function public.tidalis_void_platform_document(uuid,text) from authenticated;
commit;
