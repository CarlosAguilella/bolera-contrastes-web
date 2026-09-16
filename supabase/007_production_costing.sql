create table if not exists public.ingredients (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  base_unit text not null default 'unidad' check (base_unit in ('g', 'ml', 'unidad')),
  pack_quantity numeric(12,3) not null check (pack_quantity > 0),
  pack_price_cents integer not null check (pack_price_cents >= 0),
  purchase_vat_percent numeric(5,2) not null default 10 check (purchase_vat_percent >= 0 and purchase_vat_percent <= 100),
  stock_quantity numeric(12,3) not null default 0 check (stock_quantity >= 0),
  minimum_stock_quantity numeric(12,3) not null default 0 check (minimum_stock_quantity >= 0),
  supplier text,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.product_recipes (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null unique references public.products(id) on delete cascade,
  yield_quantity numeric(12,3) not null default 1 check (yield_quantity > 0),
  direct_cost_cents integer not null default 0 check (direct_cost_cents >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.product_recipes(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id) on delete restrict,
  quantity numeric(12,3) not null check (quantity > 0),
  waste_percent numeric(5,2) not null default 0 check (waste_percent >= 0 and waste_percent <= 100),
  created_at timestamptz not null default timezone('utc', now()),
  unique(recipe_id, ingredient_id)
);

create table if not exists public.costing_settings (
  id boolean primary key default true check (id),
  sales_vat_percent numeric(5,2) not null default 10 check (sales_vat_percent >= 0 and sales_vat_percent <= 100),
  target_margin_percent numeric(5,2) not null default 70 check (target_margin_percent >= 0 and target_margin_percent < 100),
  overhead_per_serving_cents integer not null default 0 check (overhead_per_serving_cents >= 0),
  labour_per_serving_cents integer not null default 0 check (labour_per_serving_cents >= 0),
  updated_at timestamptz not null default timezone('utc', now())
);

insert into public.costing_settings (id) values (true) on conflict (id) do nothing;

create index if not exists recipe_ingredients_recipe_idx on public.recipe_ingredients(recipe_id);
create index if not exists recipe_ingredients_ingredient_idx on public.recipe_ingredients(ingredient_id);

drop trigger if exists ingredients_updated_at on public.ingredients;
create trigger ingredients_updated_at before update on public.ingredients for each row execute function public.set_updated_at();
drop trigger if exists product_recipes_updated_at on public.product_recipes;
create trigger product_recipes_updated_at before update on public.product_recipes for each row execute function public.set_updated_at();
drop trigger if exists costing_settings_updated_at on public.costing_settings;
create trigger costing_settings_updated_at before update on public.costing_settings for each row execute function public.set_updated_at();

alter table public.ingredients enable row level security;
alter table public.product_recipes enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.costing_settings enable row level security;
grant select, insert, update, delete on public.ingredients, public.product_recipes, public.recipe_ingredients, public.costing_settings to service_role;
