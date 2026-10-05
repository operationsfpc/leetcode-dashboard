export const SUPABASE_SCHEMA_SQL = `
create table if not exists lc_colleges (
  id          bigint generated always as identity primary key,
  name        text not null unique,
  access_code text,
  view_token  text,
  created_at  timestamptz not null default now(),
  show_video  boolean not null default true,
  sync_mode   text default 'on',
  sync_from   text,
  sync_to     text,
  refresh_mode text default 'on',
  refresh_from text,
  refresh_to   text
);

create table if not exists lc_students (
  id             bigint generated always as identity primary key,
  college_id     bigint not null references lc_colleges(id) on delete cascade,
  name           text not null,
  username       text not null,
  profile_url    text,
  ranking        integer,
  contest_rating integer,
  solved_easy    integer default 0,
  solved_medium  integer default 0,
  solved_hard    integer default 0,
  solved_total   integer default 0,
  found          integer default 1,
  sync_status    text default 'pending',
  sync_error     text,
  last_synced_at timestamptz,
  baseline_ranking integer,
  baseline_easy    integer,
  baseline_medium  integer,
  baseline_hard    integer,
  baseline_total   integer,
  baseline_at      timestamptz,
  created_at     timestamptz not null default now(),
  register_number text,
  email          text,
  department     text,
  section        text,
  year           text,
  campus         text,
  unique (college_id, username)
);
create index if not exists idx_lc_students_college on lc_students(college_id);
create index if not exists idx_lc_students_filters on lc_students(college_id, section, department, campus);

create table if not exists lc_monthly_activity (
  student_id  bigint not null references lc_students(id) on delete cascade,
  ym          text not null,
  submissions integer not null default 0,
  college_id  bigint,
  primary key (student_id, ym)
);
create index if not exists idx_lc_ma_student on lc_monthly_activity(student_id);
create index if not exists idx_lc_ma_college_ym on lc_monthly_activity(college_id, ym);

create table if not exists lc_stat_snapshots (
  id            bigint generated always as identity primary key,
  student_id    bigint not null references lc_students(id) on delete cascade,
  taken_at      timestamptz not null default now(),
  solved_easy   integer, solved_medium integer, solved_hard integer, solved_total integer
);
create index if not exists idx_lc_snapshots_student on lc_stat_snapshots(student_id);

create table if not exists lc_practice_problems (
  id          bigint generated always as identity primary key,
  college_id  bigint not null references lc_colleges(id) on delete cascade,
  title       text not null,
  slug        text not null,
  url         text not null,
  difficulty  text,
  topic       text,
  domain      text,
  video_url   text,
  due_date    text,
  created_at  timestamptz not null default now(),
  unique (college_id, slug)
);
create index if not exists idx_lc_problems_college on lc_practice_problems(college_id);

create table if not exists lc_practice_completions (
  student_id       bigint not null references lc_students(id) on delete cascade,
  problem_id       bigint not null references lc_practice_problems(id) on delete cascade,
  completed_at     timestamptz not null default now(),
  solved_timestamp bigint,
  primary key (student_id, problem_id)
);
create index if not exists idx_lc_pc_student on lc_practice_completions(student_id);
create index if not exists idx_lc_pc_problem on lc_practice_completions(problem_id);

create table if not exists lc_practice_order (
  college_id bigint not null references lc_colleges(id) on delete cascade,
  kind       text not null,
  name       text not null,
  position   integer not null,
  primary key (college_id, kind, name)
);

create table if not exists lc_app_settings (
  key   text primary key,
  value text
);
`;
