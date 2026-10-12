-- Public catalog reads the currency along with prices. Hosted installations
-- use a column allowlist, so newly added columns need explicit access.
-- Existing product/shop RLS still controls which rows are visible.
grant select(currency) on public.products to anon,authenticated;
notify pgrst,'reload schema';
