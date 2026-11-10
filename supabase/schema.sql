-- CBT Sekolah: schema dan fungsi aman untuk peserta ujian.
create extension if not exists pgcrypto;

create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.exams (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  code text not null unique,
  duration_minutes int not null default 60 check(duration_minutes between 1 and 300),
  is_active boolean not null default false,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  type text not null check(type in ('multiple_choice','short_answer','essay')),
  prompt text not null,
  options jsonb,
  correct_answer text,
  points numeric(7,2) not null default 1 check(points >= 0),
  position int not null default 1
);
create table if not exists public.attempts (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  student_name text not null,
  class_name text not null,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  status text not null default 'in_progress' check(status in ('in_progress','submitted')),
  objective_score numeric(8,2),
  manual_score numeric(8,2)
);
create table if not exists public.answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.attempts(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  answer_text text not null default '',
  unique(attempt_id,question_id)
);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.admins where user_id=auth.uid()); $$;

alter table public.admins enable row level security;
alter table public.exams enable row level security;
alter table public.questions enable row level security;
alter table public.attempts enable row level security;
alter table public.answers enable row level security;

create policy "admins read own admin row" on public.admins for select to authenticated using(user_id=auth.uid());
create policy "admins manage exams" on public.exams for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy "admins manage questions" on public.questions for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy "admins read attempts" on public.attempts for select to authenticated using(public.is_admin());
create policy "admins grade attempts" on public.attempts for update to authenticated using(public.is_admin()) with check(public.is_admin());
create policy "admins read answers" on public.answers for select to authenticated using(public.is_admin());

-- Peserta tidak diberi akses SELECT langsung ke tabel soal/kunci. Akses hanya melalui RPC berikut.
create or replace function public.student_start_exam(p_code text,p_name text,p_class text)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare e public.exams%rowtype; a public.attempts%rowtype; q jsonb; seconds_left int;
begin
  if length(trim(coalesce(p_name,'')))<2 or length(trim(coalesce(p_class,'')))<1 then raise exception 'Nama dan kelas wajib diisi.'; end if;
  select * into e from public.exams where code=upper(trim(p_code)) and is_active=true;
  if not found then raise exception 'Kode ujian tidak ditemukan atau ujian belum aktif.'; end if;
  insert into public.attempts(exam_id,student_name,class_name) values(e.id,trim(p_name),trim(p_class)) returning * into a;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'type',type,'prompt',prompt,'options',options,'points',points,'position',position) order by position),'[]'::jsonb)
    into q from public.questions where exam_id=e.id;
  if jsonb_array_length(q)=0 then raise exception 'Soal ujian belum tersedia.'; end if;
  seconds_left:=e.duration_minutes*60;
  return jsonb_build_object('exam',jsonb_build_object('id',e.id,'title',e.title,'attempt_id',a.id),'questions',q,'answers','{}'::jsonb,'remaining_seconds',seconds_left);
end; $$;

create or replace function public.student_save_answer(p_attempt_id uuid,p_question_id uuid,p_answer text)
returns boolean language plpgsql security definer set search_path=public
as $$
declare a public.attempts%rowtype;
begin
 select * into a from public.attempts where id=p_attempt_id;
 if not found or a.status<>'in_progress' then raise exception 'Sesi ujian tidak valid atau sudah dikumpulkan.'; end if;
 if now()>a.started_at + (select duration_minutes from public.exams where id=a.exam_id)*interval '1 minute' then raise exception 'Waktu ujian telah habis.'; end if;
 if not exists(select 1 from public.questions where id=p_question_id and exam_id=a.exam_id) then raise exception 'Soal tidak valid.'; end if;
 insert into public.answers(attempt_id,question_id,answer_text) values(p_attempt_id,p_question_id,coalesce(p_answer,''))
 on conflict(attempt_id,question_id) do update set answer_text=excluded.answer_text;
 return true;
end; $$;

create or replace function public.student_finish_exam(p_attempt_id uuid)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare a public.attempts%rowtype; score numeric(8,2); max_points numeric(8,2);
begin
 select * into a from public.attempts where id=p_attempt_id for update;
 if not found then raise exception 'Sesi ujian tidak ditemukan.'; end if;
 if a.status='submitted' then return jsonb_build_object('status','submitted','objective_score',a.objective_score); end if;
 if now()>a.started_at+(select duration_minutes from public.exams where id=a.exam_id)*interval '1 minute' then
   -- Tetap izinkan submit setelah waktu berakhir; timer di server tetap menjadi acuan.
   null;
 end if;
 select coalesce(sum(case when q.type in ('multiple_choice','short_answer') and lower(trim(coalesce(ans.answer_text,'')))=lower(trim(coalesce(q.correct_answer,''))) then q.points else 0 end),0),
        coalesce(sum(case when q.type in ('multiple_choice','short_answer') then q.points else 0 end),0)
 into score,max_points
 from public.questions q left join public.answers ans on ans.question_id=q.id and ans.attempt_id=a.id where q.exam_id=a.exam_id;
 update public.attempts set status='submitted',submitted_at=now(),
   objective_score=case when max_points>0 then round(score/max_points*100,2) else null end
 where id=a.id;
 return jsonb_build_object('status','submitted','objective_score',case when max_points>0 then round(score/max_points*100,2) else null end);
end; $$;

revoke all on function public.student_start_exam(text,text,text) from public;
revoke all on function public.student_save_answer(uuid,uuid,text) from public;
revoke all on function public.student_finish_exam(uuid) from public;
grant execute on function public.student_start_exam(text,text,text) to anon,authenticated;
grant execute on function public.student_save_answer(uuid,uuid,text) to anon,authenticated;
grant execute on function public.student_finish_exam(uuid) to anon,authenticated;

-- Batasi akses langsung tabel: peserta anon tidak mendapat privilege tabel.
revoke all on public.admins,public.exams,public.questions,public.attempts,public.answers from anon;
grant select,insert,update,delete on public.exams,public.questions to authenticated;
grant select,update on public.attempts to authenticated;
grant select on public.answers to authenticated;
grant select on public.admins to authenticated;
