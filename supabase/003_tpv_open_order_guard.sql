create unique index if not exists pos_orders_one_active_table_idx
on public.pos_orders(table_id)
where status in ('open', 'sent');
