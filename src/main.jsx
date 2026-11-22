import React, { useEffect, useState } from 'react';
import 'mathlive';
import 'mathlive/static.css';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { createRoot } from 'react-dom/client';
import { configured, supabase } from './supabase';
import { SCHOOL_NAME, SCHOOL_LOGO_URL } from './config';
import './style.css';

function MathText({text}){
  const value=String(text||'');

  const parts=value.split(
    /(\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\])/g
  );

  return (
    <span style={{whiteSpace:'pre-wrap'}}>
      {parts.map((part,i)=>{
        const isInline=part.startsWith('\\(')&&part.endsWith('\\)');
        const isBlock=part.startsWith('\\[')&&part.endsWith('\\]');

        if(!isInline&&!isBlock){
          return <React.Fragment key={i}>{part}</React.Fragment>;
        }

        const formula=part.slice(2,-2);

        return (
          <span
            key={i}
            style={{
              display:isBlock?'block':'inline-block',
              margin:isBlock?'8px 0':'0 3px',
              verticalAlign:'middle'
            }}
            dangerouslySetInnerHTML={{
              __html:katex.renderToString(formula,{
                throwOnError:false,
                displayMode:isBlock,
                strict:'ignore'
              })
            }}
          />
        );
      })}
    </span>
  );
}

function App(){
  const [page,setPage]=useState('home');
  const [msg,setMsg]=useState('');
  const [busy,setBusy]=useState(false);
  const [session,setSession]=useState(null);
  const [exam,setExam]=useState(null);
  const [questions,setQuestions]=useState([]);
  const [answers,setAnswers]=useState({});
  const [matchingSelected,setMatchingSelected]=useState(null);
  const [idx,setIdx]=useState(0);
  const [student,setStudent]=useState({name:'',class_name:'',birth_date:'',exam_number:'',code:''});
  const [remaining,setRemaining]=useState(0);
  const [result,setResult]=useState(null);
  const [adminEmail,setAdminEmail]=useState('');
  const [adminPassword,setAdminPassword]=useState('');
  const [exams,setExams]=useState([]);
  const [newExam,setNewExam]=useState({title:'',code:'',duration_minutes:60});
  const [editingExam,setEditingExam]=useState(null);
  const [mathFormula,setMathFormula]=useState('');
  const [draft,setDraft]=useState({
  type:'multiple_choice',
  prompt:'',
  options:['','','',''],
  correct_answer:'',
  correct_answers:[],
  matching_pairs:[
    {left:'',right:''},
    {left:'',right:''},
    {left:'',right:''},
    {left:'',right:''}
  ],
  matching_distractor:'',
  points:1
});
  const [draftImage,setDraftImage]=useState(null);
  const [editingQuestion,setEditingQuestion]=useState(null);
  const [examQuestions,setExamQuestions]=useState([]);
  const [gradeRows,setGradeRows]=useState([]);
  const [reviewAttempt,setReviewAttempt]=useState(null);
  const [reviewQuestions,setReviewQuestions]=useState([]);
  const [reviewAnswers,setReviewAnswers]=useState({});
  const [essayScores,setEssayScores]=useState({});

  useEffect(()=>{
    if(!supabase)return;
    supabase.auth.getSession().then(({data})=>setSession(data.session));
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s));
    return ()=>subscription.unsubscribe();
  },[]);
  useEffect(()=>{
  if(session){
    loadExams();

    setPage(currentPage =>
      currentPage==='home' ? 'admin' : currentPage
    );
  }
},[session]);
  useEffect(()=>{
    if(page!=='taking')return;
    const timer=setInterval(()=>setRemaining(v=>{
      if(v<=1){clearInterval(timer);finishExam(true);return 0;}
      return v-1;
    }),1000);
    return ()=>clearInterval(timer);
  },[page]);

  const current=questions[idx];
  const fmt=s=>`${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
  async function call(fn,args){
    const {data,error}=await supabase.rpc(fn,args);
    if(error)throw error;
    return data;
  }
  async function signIn(e){
    e.preventDefault();setBusy(true);setMsg('');
    const {error}=await supabase.auth.signInWithPassword({email:adminEmail,password:adminPassword});
    setBusy(false);if(error)setMsg(error.message);
  }
  async function logout(){await supabase.auth.signOut();setPage('home');}
  async function loadExams(){
    const {data,error}=await supabase.from('exams').select('*').order('created_at',{ascending:false});
    if(error){setMsg(error.message);return;}setExams(data||[]);
  }
  async function createExam(e){
    e.preventDefault();setBusy(true);setMsg('');
    const {data,error}=await supabase.from('exams').insert({...newExam,code:newExam.code.trim().toUpperCase(),created_by:session.user.id}).select().single();
    setBusy(false);if(error){setMsg(error.message);return;}
    setNewExam({title:'',code:'',duration_minutes:60});setEditingExam(data);setPage('manage');loadQuestions(data.id);
  }
  async function loadQuestions(id){
    const {data,error}=await supabase.from('questions').select('*').eq('exam_id',id).order('position');
    if(error){setMsg(error.message);return;}setExamQuestions(data||[]);
  }
  async function toggleExam(e){
    const {error}=await supabase.from('exams').update({is_active:!e.is_active}).eq('id',e.id);
    if(error)setMsg(error.message);else loadExams();
  }

async function editExamTitle(e){
  const newTitle=window.prompt(
    'Masukkan nama mata pelajaran/ujian yang benar:',
    e.title
  );

  if(newTitle===null)return;

  const title=newTitle.trim();

  if(!title){
    setMsg('Nama mata pelajaran tidak boleh kosong.');
    return;
  }

  if(title===e.title)return;

  setBusy(true);
  setMsg('');

  const {data,error}=await supabase
    .from('exams')
    .update({title})
    .eq('id',e.id)
    .select()
    .single();

  setBusy(false);

  if(error){
    setMsg('Gagal memperbarui nama mata pelajaran: '+error.message);
    return;
  }

  setExams(prev=>prev.map(item=>
    item.id===e.id?data:item
  ));

  setEditingExam(current=>
    current?.id===e.id?data:current
  );

  setMsg('Nama mata pelajaran berhasil diperbarui.');
}

async function addQuestion(e){
  e.preventDefault();
  if(!editingExam)return;

  // Validasi umum
  if(!draft.prompt.trim()){
    setMsg('Pertanyaan soal wajib diisi.');
    return;
  }

  if(Number(draft.points)<=0){
    setMsg('Poin soal harus lebih dari 0.');
    return;
  }

  // Validasi pilihan ganda
  if(draft.type==='multiple_choice'){
    const options=draft.options.filter(x=>x.trim());

    if(options.length<2){
      setMsg('Isi minimal dua pilihan jawaban.');
      return;
    }

    if(!draft.correct_answer.trim() ||
       !options.includes(draft.correct_answer.trim())){
      setMsg('Kunci jawaban harus sama dengan salah satu pilihan.');
      return;
    }
  }

  // Validasi pilihan ganda kompleks
  if(draft.type==='multiple_choice_complex'){
    if(draft.options.some(x=>!x.trim())){
      setMsg('Semua pilihan jawaban harus diisi.');
      return;
    }

    if(draft.correct_answers.length===0){
      setMsg('Centang minimal satu jawaban yang benar.');
      return;
    }
  }

    // Validasi menjodohkan
  if(draft.type==='matching'){
    if(draft.matching_pairs.length<2 ||
       draft.matching_pairs.some(p=>!p.left.trim()||!p.right.trim())){
      setMsg('Isi minimal dua pasangan secara lengkap.');
      return;
    }

    const rightAnswers=draft.matching_pairs.map(p=>p.right.trim());
    const distractor=draft.matching_distractor.trim();

    if(!distractor){
      setMsg('Jawaban pengecoh wajib diisi.');
      return;
    }

    if(new Set(rightAnswers).size!==rightAnswers.length){
      setMsg('Setiap jawaban pasangan harus berbeda.');
      return;
    }

    if(rightAnswers.includes(distractor)){
      setMsg('Jawaban pengecoh tidak boleh sama dengan jawaban benar.');
      return;
    }
  }

  if(draft.type==='short_answer'&&!draft.correct_answer.trim()){
    setMsg('Kunci jawaban wajib diisi.');
    return;
  }

  setBusy(true);

  try{
    let imageUrl=editingQuestion?.image_url??null;

    if(draftImage){
      const fileExt=draftImage.name.split('.').pop();
      const fileName=`${editingExam.id}/${Date.now()}.${fileExt}`;

      const {data:uploadData,error:uploadError}=await supabase
        .storage
        .from('gambar-soal')
        .upload(fileName,draftImage);

      if(uploadError){
        throw new Error('Gagal mengunggah gambar: '+uploadError.message);
      }

      const {data:urlData}=supabase
        .storage
        .from('gambar-soal')
        .getPublicUrl(uploadData.path);

      imageUrl=urlData.publicUrl;
    }

    const payload={
      exam_id:editingExam.id,
      type:draft.type,
      prompt:draft.prompt.trim(),
      points:Number(draft.points),
      matching_distractor:draft.type==='matching'
        ?draft.matching_distractor.trim()
        :null,
      position:editingQuestion
        ?editingQuestion.position
        :examQuestions.length+1,
      options:
        ['multiple_choice','multiple_choice_complex'].includes(draft.type)
          ?draft.options.map(x=>x.trim())
          :draft.type==='matching'
            ?draft.matching_pairs.map(p=>({
                left:p.left.trim(),
                right:p.right.trim()
              }))
            :null,
      correct_answer:
        draft.type==='multiple_choice'
          ?draft.correct_answer.trim()
          :draft.type==='multiple_choice_complex'
            ?JSON.stringify(draft.correct_answers)
            :draft.type==='matching'
              ?JSON.stringify(draft.matching_pairs.map((p,i)=>i))
              :draft.type==='short_answer'
                ?draft.correct_answer.trim()
                :null,
      image_url:imageUrl
    };

    const {error}=editingQuestion
      ?await supabase.from('questions').update(payload).eq('id',editingQuestion.id)
      :await supabase.from('questions').insert(payload);

    if(error)throw error;

    const wasEditing=Boolean(editingQuestion);

    setDraft({
      type:'multiple_choice',
      prompt:'',
      options:['','','',''],
      correct_answer:'',
      correct_answers:[],
      matching_pairs:[
        {left:'',right:''},
        {left:'',right:''},
        {left:'',right:''},
        {left:'',right:''}
      ],
      points:1
    });

    setDraftImage(null);
    setEditingQuestion(null);
    setMsg(wasEditing
      ?'Perubahan soal berhasil disimpan.'
      :'Soal berhasil ditambahkan.');

    loadQuestions(editingExam.id);

  }catch(err){
    setMsg(err.message||'Terjadi kesalahan saat menyimpan soal.');
  }

  setBusy(false);
}

function editQuestion(q){
  setEditingQuestion(q); 
  setDraft({
    type:q.type,
    prompt:q.prompt||'',
    options:Array.isArray(q.options)&&q.options.every(x=>typeof x==='string')
      ?q.options
      :['','','',''],
    correct_answer:q.correct_answer||'',
    correct_answers:q.correct_answer&&q.type==='multiple_choice_complex'
      ?JSON.parse(q.correct_answer)
      :[],
    matching_pairs:q.type==='matching'&&Array.isArray(q.options)
      ?q.options
      :[
        {left:'',right:''},
        {left:'',right:''},
        {left:'',right:''},
        {left:'',right:''}
      ],
    matching_distractor:q.matching_distractor||'',
    points:q.points??1
  });
  setDraftImage(null);
  setMsg('Sedang mengedit soal. Silakan perbaiki, lalu simpan perubahan.');
  window.scrollTo({top:0,behavior:'smooth'});
}
async function deleteQuestion(id){
    if(!confirm('Hapus soal ini?'))return;
    const {error}=await supabase.from('questions').delete().eq('id',id);
    if(error)setMsg(error.message);else loadQuestions(editingExam.id);
  }
  
async function startExam(e){
  e.preventDefault();
  setBusy(true);
  setMsg('');

  try{
    const data=await call('student_start_exam',{
      p_code:student.code.trim().toUpperCase(),
      p_name:student.name.trim(),
      p_class:student.class_name.trim(),
      p_birth_date:student.birth_date,
      p_exam_number:student.exam_number.trim()
    });

    // Acak pilihan jawaban untuk soal menjodohkan
const shuffledQuestions=(data.questions||[]).map(question=>{
  if(question.type!=='matching' ||
     !Array.isArray(question.options)){
    return question;
  }

  const rightChoices=[
    ...question.options.map((pair,index)=>({
      text:pair.right,
      right_index:index
    })),
    {
      text:question.matching_distractor,
      right_index:-1
    }
  ];

  // Pengacakan Fisher-Yates
  for(let i=rightChoices.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [rightChoices[i],rightChoices[j]]=
      [rightChoices[j],rightChoices[i]];
  }

  return {
    ...question,
    matching_choices:rightChoices
  };
});

    setExam(data.exam);
    setQuestions(shuffledQuestions);
    setAnswers(data.answers||{});
    setRemaining(data.remaining_seconds);
    setIdx(0);
    setResult(null);
    setPage('taking');

  }catch(err){
    setMsg(err.message||'Tidak dapat memulai ujian.');
  }

  setBusy(false);
}

  async function saveAnswer(qid,value){
    setAnswers(a=>({...a,[qid]:value}));
    try{await call('student_save_answer',{p_attempt_id:exam.attempt_id,p_question_id:qid,p_answer:value});}
    catch(err){setMsg('Jawaban belum tersimpan: '+err.message);}
  }
  async function finishExam(auto=false){
    if(!exam?.attempt_id)return;
    if(!auto&&!confirm('Yakin ingin mengumpulkan ujian?'))return;
    setBusy(true);
    try{
      const data=await call('student_finish_exam',{p_attempt_id:exam.attempt_id});
      setResult(data);setPage('done');
    }catch(err){setMsg(err.message||'Gagal mengumpulkan ujian.');}
    setBusy(false);
  }
  async function openGrades(e){
    setEditingExam(e);
    const {data,error}=await supabase.from('attempts').select('*').eq('exam_id',e.id).order('started_at',{ascending:false});
    if(error){setMsg(error.message);return;}
    setGradeRows(data||[]);setPage('grades');
    }
async function deleteAttempt(r){
  const confirmed=window.confirm(
    `Yakin ingin menghapus hasil ujian peserta ${r.student_name} dari kelas ${r.class_name}?`
  );

  if(!confirmed)return;

  setBusy(true);

  const {data,error}=await supabase
    .from('attempts')
    .delete()
    .eq('id',r.id)
    .select('id');

  setBusy(false);

  if(error){
    setMsg('Gagal menghapus hasil ujian: '+error.message);
    return;
  }

  if(!data||data.length===0){
    setMsg('Data belum terhapus. Kemungkinan izin DELETE pada tabel attempts belum tersedia.');
    return;
  }

  setMsg(`Hasil ujian ${r.student_name} berhasil dihapus.`);
  await openGrades(editingExam);
}
async function deleteExam(e){
  const confirmed=window.confirm(
    `Yakin ingin menghapus ujian "${e.title}" beserta seluruh soal, peserta, jawaban, dan nilainya?`
  );

  if(!confirmed)return;

  const {error}=await supabase
    .from('exams')
    .delete()
    .eq('id',e.id);

  if(error){
    setMsg('Gagal menghapus ujian: '+error.message);
    return;
  }

  setMsg('Ujian berhasil dihapus beserta seluruh datanya.');
  setGradeRows([]);
  setEditingExam(null);
  setPage('admin');
}

   async function openAttemptReview(row){
    setBusy(true);setMsg('');
    const [qres,ares]=await Promise.all([
      supabase.from('questions').select('id,type,prompt,options,correct_answer,points,position').eq('exam_id',editingExam.id).order('position'),
      supabase.from('answers').select('id,question_id,answer_text,manual_score').eq('attempt_id',row.id)
    ]);
    setBusy(false);
    if(qres.error||ares.error){setMsg(qres.error?.message||ares.error?.message||'Gagal memuat jawaban.');return;}
    const answerMap=Object.fromEntries((ares.data||[]).map(a=>[a.question_id,a]));
setReviewAttempt(row);
setReviewQuestions(qres.data||[]);
setReviewAnswers(answerMap);

setEssayScores(Object.fromEntries(
  (qres.data||[])
    .filter(q=>q.type==='essay'||q.type==='short_answer')
    .map(q=>[
      q.id,
      String(answerMap[q.id]?.manual_score??'')
    ])
));
        setPage('review');
  }

async function saveReviewScores(){
  if(!reviewAttempt)return;

  const scores=[];

  for(const q of reviewQuestions.filter(
    item=>item.type==='essay'||item.type==='short_answer'
  )){
    const raw=essayScores[q.id]??'';
    const score=raw===''?0:Number(raw);

    if(!Number.isFinite(score)||score<0||score>Number(q.points)){
      setMsg(`Nilai manual harus antara 0 sampai ${q.points} untuk setiap soal.`);
      return;
    }

    scores.push({
      question_id:q.id,
      score
    });
  }

  setBusy(true);
  setMsg('');

  const {data,error}=await supabase.rpc('admin_save_essay_grades',{
    p_attempt_id:reviewAttempt.id,
    p_scores:scores
  });

  setBusy(false);

  if(error){
    setMsg(error.message);
    return;
  }

  setMsg(`Penilaian berhasil disimpan. Nilai akhir: ${data?.final_score??'—'}`);

  await openGrades(editingExam);
}


function exportGradesCSV(){
  if(!gradeRows.length){
    setMsg('Belum ada data peserta yang dapat diekspor.');
    return;
  }

  const columns=[
    'Nama',
    'Kelas',
    'Waktu mulai',
    'Status ujian',
    'Nilai objektif (%)',
    'Total poin uraian',
    'Nilai akhir'
  ];

  const rows=gradeRows.map(r=>[
    r.student_name??'',
    r.class_name??'',
    r.started_at?new Date(r.started_at).toLocaleString('id-ID'):'',
    r.status??'',
    r.objective_score??'',
    r.manual_score??'',
    r.final_score??''
  ]);

  const csv=[columns,...rows].map(row=>
    row.map(value=>`"${String(value).replace(/"/g,'""')}"`).join(';')
  ).join('\r\n');

  const blob=new Blob(['\ufeff',csv],{
    type:'text/csv;charset=utf-8;'
  });

  const url=URL.createObjectURL(blob);
  const link=document.createElement('a');

  const safeName=(editingExam?.title||'rekap-nilai')
    .replace(/[\\/:*?"<>|]/g,'_');

  link.href=url;
  link.download=`Rekap_Nilai_${safeName}.csv`;

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
  setMsg('File rekap nilai berhasil disiapkan untuk diunduh.');
}
  const answered=Object.keys(answers).filter(k=>String(answers[k]??'').trim()!=='').length;

  if(!configured)return <main className="shell"><Header/><div className="panel"><h2>Konfigurasi belum diisi</h2><p>Isi URL dan anon key Supabase pada file <code>.env</code>, lalu jalankan ulang aplikasi. Petunjuk lengkap ada di README.md.</p></div></main>;

  return <main className="shell">
    <Header/>
    {msg&&<div className="notice" role="status">{msg}<button className="x" onClick={()=>setMsg('')}>×</button></div>}

    {page==='home'&&<div className="grid two">
      <section className="panel"><span className="eyebrow">PESERTA DIDIK</span><h2>Masuk Ujian</h2><p>Masukkan identitas dan kode ujian dari guru.</p>
   <form onSubmit={startExam}>
  <Field label="Nama lengkap"><input required value={student.name} onChange={e=>setStudent({...student,name:e.target.value})}/></Field>
  <Field label="Kelas"><input required placeholder="Contoh: VI A" value={student.class_name} onChange={e=>setStudent({...student,class_name:e.target.value})}/></Field>
  <Field label="Tanggal lahir"><input type="date" required value={student.birth_date} onChange={e=>setStudent({...student,birth_date:e.target.value})}/></Field>
  <Field label="Nomor ujian"><input required value={student.exam_number} onChange={e=>setStudent({...student,exam_number:e.target.value})}/></Field>
  <Field label="Kode ujian"><input required value={student.code} onChange={e=>setStudent({...student,code:e.target.value.toUpperCase()})}/></Field>
  <button disabled={busy} className="primary wide">{busy?'Memproses...':'Mulai Ujian'}</button>
</form>
      </section>
      <details className="panel soft">
  <summary>Login untuk Guru/Admin</summary>
  <section>
    <span className="eyebrow">PENGELOLA</span>
    <h2>Login Guru / Admin</h2>
    <p>Masuk untuk membuat ujian, mengelola soal, dan melihat hasil.</p>
    <form onSubmit={signIn}>
      <Field label="Email administrator"><input type="email" required value={adminEmail} onChange={e=>setAdminEmail(e.target.value)}/></Field>
      <Field label="Kata sandi"><input type="password" required value={adminPassword} onChange={e=>setAdminPassword(e.target.value)}/></Field>
      <button disabled={busy} className="secondary wide">Masuk Dashboard</button>
    </form>
  </section>
</details>
    </div>}

    {page==='admin'&&<>
      <div className="toolbar"><div><span className="eyebrow">DASHBOARD</span><h2>Kelola Ujian</h2></div><button className="ghost" onClick={logout}>Keluar</button></div>
      <div className="grid two">
        <section className="panel"><h3>Buat ujian baru</h3><form onSubmit={createExam}>
          <Field label="Nama ujian"><input required value={newExam.title} onChange={e=>setNewExam({...newExam,title:e.target.value})}/></Field>
          <Field label="Kode ujian"><input required value={newExam.code} onChange={e=>setNewExam({...newExam,code:e.target.value.toUpperCase()})}/></Field>
          <Field label="Durasi (menit)"><input type="number" min="1" max="300" required value={newExam.duration_minutes} onChange={e=>setNewExam({...newExam,duration_minutes:e.target.value})}/></Field>
          <button className="primary" disabled={busy}>Buat ujian</button>
        </form></section>
        <section className="panel"><h3>Daftar ujian</h3>
          {exams.length===0?<p>Belum ada ujian.</p>:exams.map(e=><div className="examrow" key={e.id}>
            <div><b>{e.title}</b><small>Kode: {e.code} · {e.duration_minutes} menit · {e.is_active?'Aktif':'Nonaktif'}</small></div>
            <div className="actions">
  	     <button
    		className="small"
    		disabled={busy}
    		onClick={()=>editExamTitle(e)}
  	     >
    		Edit Mata Pelajaran
  	     </button>

  	     <button
    		className="small"
    		onClick={()=>{setEditingExam(e);loadQuestions(e.id);setPage('manage');}}
  	     >
    		Soal
  	     </button>

  	     <button
    		className="small"
    		onClick={()=>openGrades(e)}
  	     >
    		Hasil
  	     </button>
              <button className="small" onClick={()=>toggleExam(e)}>{e.is_active?'Tutup':'Aktifkan'}</button>
{!e.is_active&&<button className="small" onClick={()=>deleteExam(e)}>Hapus</button>}
            </div>
          </div>)}
        </section>
      </div>
    </>}

    {page==='manage'&&editingExam&&<>
      <div className="toolbar"><div><span className="eyebrow">PENGELOLAAN SOAL</span><h2>{editingExam.title}</h2><p>Kode ujian: <b>{editingExam.code}</b></p></div><button className="ghost" onClick={()=>setPage('admin')}>← Dashboard</button></div>
      <div className="grid two">
        <section className="panel"><h3>{editingQuestion?'Edit soal':'Tambah soal'}</h3><form onSubmit={addQuestion}>
          
<Field label="Jenis soal">
  <select
    value={draft.type}
    onChange={e=>setDraft({
  ...draft,
  type:e.target.value,
  options:['','','',''],
  correct_answer:'',
  correct_answers:[],
  matching_pairs:[  
    {left:'',right:''},
    {left:'',right:''},
    {left:'',right:''},
    {left:'',right:''}
  ],
  matching_distractor:'',
})}
  >
    <option value="multiple_choice">Pilihan ganda</option>
    <option value="multiple_choice_complex">Pilihan ganda kompleks</option>
    <option value="matching">Menjodohkan</option>
    <option value="short_answer">Isian singkat</option>
    <option value="essay">Uraian</option>
  </select>
</Field>

{draft.type==='multiple_choice'&&<>
  <Field label="Pilihan jawaban">
    {draft.options.map((o,i)=>
      <input
        key={i}
        className="optioninput"
        placeholder={`Pilihan ${String.fromCharCode(65+i)}`}
        value={o}
        onChange={e=>setDraft({
          ...draft,
          options:draft.options.map((x,j)=>j===i?e.target.value:x)
        })}
      />
    )}
  </Field>
  <Field label="Kunci jawaban (tulis persis seperti pilihan)">
    <input
      required
      value={draft.correct_answer}
      onChange={e=>setDraft({...draft,correct_answer:e.target.value})}
    />
  </Field>
</>}

{draft.type==='multiple_choice_complex'&&<>
  <Field label="Pilihan jawaban">
    {draft.options.map((o,i)=>
      <input
        key={i}
        className="optioninput"
        placeholder={`Pilihan ${String.fromCharCode(65+i)}`}
        value={o}
        onChange={e=>setDraft({
          ...draft,
          options:draft.options.map((x,j)=>j===i?e.target.value:x)
        })}
      />
    )}
  </Field>
  <strong>Centang semua pilihan yang benar:</strong>
  {draft.options.map((o,i)=>(
    <label key={i} style={{display:'block',margin:'8px 0'}}>
      <input
        type="checkbox"
        disabled={!o.trim()}
        checked={draft.correct_answers.includes(i)}
        onChange={e=>setDraft({
          ...draft,
          correct_answers:e.target.checked
            ?[...draft.correct_answers,i]
            :draft.correct_answers.filter(x=>x!==i)
        })}
      />
      {' '}{String.fromCharCode(65+i)}. {o||'(Belum diisi)'}
    </label>
  ))}
</>}

{draft.type==='matching'&&<>
  <strong>Isi pernyataan dan pasangan jawaban yang benar:</strong>
  {draft.matching_pairs.map((pair,i)=>(
    <div key={i} style={{border:'1px solid #ddd',padding:10,marginBottom:10,borderRadius:8}}>
      <strong>Pasangan {i+1}</strong>
      <Field label="Pernyataan">
        <input
          required
          value={pair.left}
          onChange={e=>setDraft({
            ...draft,
            matching_pairs:draft.matching_pairs.map((p,j)=>j===i?{...p,left:e.target.value}:p)
          })}
        />
      </Field>
      <Field label="Jawaban yang benar">
        <input
          required
          value={pair.right}
          onChange={e=>setDraft({
            ...draft,
            matching_pairs:draft.matching_pairs.map((p,j)=>j===i?{...p,right:e.target.value}:p)
          })}
        />
      </Field>
      <button
        type="button"
        className="small"
        disabled={draft.matching_pairs.length<=2}
        onClick={()=>setDraft({
          ...draft,
          matching_pairs:draft.matching_pairs.filter((p,j)=>j!==i)
        })}
      >
        Hapus pasangan
      </button>
    </div>
  ))}
  <button
    type="button"
    className="small"
    onClick={()=>setDraft({
      ...draft,
      matching_pairs:[...draft.matching_pairs,{left:'',right:''}]
    })}
  >
    Tambah pasangan
  </button>
  <Field label="Jawaban pengecoh">
    <input
      required
      placeholder="Contoh: 7 sisi"
      value={draft.matching_distractor||''}
      onChange={e=>setDraft({
        ...draft,
        matching_distractor:e.target.value
      })}
    />
  </Field>
</>}

{draft.type==='short_answer'&&
  <Field label="Kunci jawaban">
    <input
      required
      value={draft.correct_answer}
      onChange={e=>setDraft({...draft,correct_answer:e.target.value})}
    />
  </Field>
}
          
<Field label="Pertanyaan">
  <textarea
    id="question-prompt"
    required
    rows="4"
    value={draft.prompt}
    onChange={e=>setDraft({...draft,prompt:e.target.value})}
  />
</Field>

<Field label="Editor rumus matematika">
  <math-field
    id="math-editor"
    virtual-keyboard-mode="onfocus"
    style={{
      display:'block',
      width:'100%',
      minHeight:'65px',
      padding:'12px',
      border:'1px solid #ccc',
      borderRadius:'8px',
      fontSize:'22px'
    }}
  ></math-field>

  <div style={{
    display:'grid',
    gridTemplateColumns:'repeat(4,1fr)',
    gap:'8px',
    marginTop:'10px'
  }}>
    {[
      {label:'x²',value:'^2'},
      {label:'x³',value:'^3'},
      {label:'√',value:'\\sqrt{#0}'},
      {label:'∛',value:'\\sqrt[3]{#0}'},
      {label:'a/b',value:'\\frac{#0}{#1}'},
      {label:'×',value:'\\times'},
      {label:'÷',value:'\\div'},
      {label:'±',value:'\\pm'},
      {label:'π',value:'\\pi'},
      {label:'=',value:'='},
      {label:'(',value:'('},
      {label:')',value:')'},
      {label:'≠',value:'\\ne'},
      {label:'≤',value:'\\le'},
      {label:'≥',value:'\\ge'}
    ].map(item=>(
      <button
        key={item.label}
        type="button"
        onClick={()=>{
          const editor=document.getElementById('math-editor');
          if(!editor)return;
          editor.focus();
          editor.insert(item.value);
        }}
        style={{
          padding:'10px',
          fontSize:'18px',
          cursor:'pointer'
        }}
      >
        {item.label}
      </button>
    ))}
  </div>

  <button
    type="button"
    onClick={()=>{
      const editor=document.getElementById('math-editor');
      const formula=editor?.value;
      if(!formula)return;

      setDraft(d=>({
        ...d,
        prompt:d.prompt+' \\('+formula+'\\)'
      }));

      editor.value='';
    }}
  >
    Sisipkan ke Soal
  </button>
</Field>

<Field label="Gambar soal (opsional)">
  <input
    type="file"
    accept="image/*"
    onChange={e=>setDraftImage(e.target.files?.[0]||null)}
  />
</Field>
{!draftImage&&editingQuestion?.image_url&&(
  <div style={{marginBottom:12}}>
    <p>Gambar soal saat ini:</p>
    <img
      src={editingQuestion.image_url}
      alt="Gambar soal"
      style={{
        maxWidth:'100%',
        maxHeight:200,
        objectFit:'contain'
      }}
    />
  </div>
)}
{draftImage&&(
  <div style={{marginBottom:12}}>
    <p>Pratinjau gambar:</p>
    <img
      src={URL.createObjectURL(draftImage)}
      alt="Pratinjau soal"
      style={{maxWidth:'100%',maxHeight:200,objectFit:'contain'}}
    />
    <button type="button" className="small" onClick={()=>{
      setDraftImage(null);
    }}>
      Hapus gambar
    </button>
  </div>
)}
          <Field label="Bobot nilai"><input type="number" min="0" step="0.5" value={draft.points} onChange={e=>setDraft({...draft,points:e.target.value})}/></Field>
          <button className="primary" disabled={busy}>
  {busy?'Menyimpan...':editingQuestion?'Simpan Perubahan':'Tambah Soal'}
</button>
        </form></section>
        <section className="panel"><h3>Soal tersimpan ({examQuestions.length})</h3>
          {examQuestions.map((q,i)=><div className="questionrow" key={q.id}>
            <div><b>
  {i+1}. <MathText text={q.prompt}/>
</b><small>{q.type==='multiple_choice'?'Pilihan ganda':
q.type==='multiple_choice_complex'?'Pilihan ganda kompleks':
q.type==='matching'?'Menjodohkan':
q.type==='short_answer'?'Isian singkat':
q.type==='essay'?'Uraian':'Jenis soal tidak dikenal'} · {q.points} poin</small></div>
            <button className="small" onClick={()=>editQuestion(q)}>Edit</button>
<button className="danger small" onClick={()=>deleteQuestion(q.id)}>Hapus</button>
          </div>)}
        </section>
      </div>
    </>}

    {page==='grades'&&<>
      <div className="toolbar">
  <div>
    <span className="eyebrow">HASIL UJIAN</span>
    <h2>{editingExam?.title}</h2>
  </div>
  <div className="actions">
    <button className="secondary" onClick={exportGradesCSV} disabled={!gradeRows.length}>
      Ekspor ke Excel (CSV)
    </button>
    <button className="ghost" onClick={()=>setPage('admin')}>
      ← Dashboard
    </button>
  </div>
</div>
      <section className="panel">
        <div className="tablewrap"><table><thead><tr>
          <th>Nama</th><th>Kelas</th><th>Mulai</th><th>Status</th><th>Nilai objektif</th><th>Total poin uraian</th><th>Nilai akhir</th><th>Aksi</th>
        </tr></thead><tbody>
          {gradeRows.map(r=><tr key={r.id}>
            <td>{r.student_name}</td><td>{r.class_name}</td><td>{new Date(r.started_at).toLocaleString('id-ID')}</td>
            <td>{r.status}</td><td>{r.objective_score??'—'}</td><td>{r.manual_score??'—'}</td><td>{r.final_score??'Belum dinilai'}</td>
            <td>
              <button className="small" disabled={r.status!=='submitted'} onClick={()=>openAttemptReview(r)}>Lihat Jawaban / Nilai</button>
              <button className="small" onClick={()=>deleteAttempt(r)}>Hapus</button>
            </td>
          </tr>)}
        </tbody></table></div>
        <p className="muted">Nilai objektif ditampilkan dalam persen untuk bagian pilihan ganda dan isian singkat. Nilai akhir dihitung setelah guru menyimpan penilaian uraian.</p>
      </section>
    </>}

    {page==='review'&&reviewAttempt&&<>
      <div className="toolbar">
        <div><span className="eyebrow">PEMERIKSAAN JAWABAN</span><h2>{reviewAttempt.student_name} · {reviewAttempt.class_name}</h2><p>Ujian: <b>{editingExam?.title}</b></p></div>
        <button className="ghost" onClick={()=>openGrades(editingExam)}>← Kembali ke hasil</button>
      </div>
      <section className="panel">
        <h3>Jawaban peserta dan penilaian</h3>
        {reviewQuestions.map((q,i)=>{
          const answer=reviewAnswers[q.id];
          const response=answer?.answer_text??'';
	  const complexSelected=(()=>{
  if(q.type!=='multiple_choice_complex') return [];
  try {
    return JSON.parse(response||'[]');
  } catch {
    return [];
  }
})();
const complexCorrect=(()=>{
  if(q.type!=='multiple_choice_complex') return [];
  try {
    return JSON.parse(q.correct_answer||'[]');
  } catch {
    return [];
  }
})();
const matchingSelected=(()=>{
  if(q.type!=='matching') return {};
  try {
    return JSON.parse(response||'{}');
  } catch {
    return {};
  }
})();
          const isObjective=['multiple_choice','multiple_choice_complex','matching'].includes(q.type);

const isCorrect=
  (q.type==='multiple_choice'||q.type==='short_answer') &&
  response.trim().toLowerCase()===String(q.correct_answer??'').trim().toLowerCase();

const complexIsCorrect=
  q.type==='multiple_choice_complex' &&
  complexSelected.length===complexCorrect.length &&
  complexSelected.every(v=>complexCorrect.includes(v)) &&
  complexCorrect.every(v=>complexSelected.includes(v));
  const complexCorrectCount=complexSelected.filter(
  v=>complexCorrect.includes(v)
).length;
const matchingCorrectCount=
  q.type==='matching'
    ? Object.entries(matchingSelected).filter(
        ([leftIndex,rightIndex])=>
          Number(leftIndex)===Number(rightIndex)
      ).length
    : 0;

// Status setiap pasangan
const matchingRowStatus=(leftIndex)=>{
  const selectedValue=matchingSelected[leftIndex];

  if(selectedValue===undefined || selectedValue===null){
    return 'Belum dijawab';
  }

  if(Number(selectedValue)===-1){
    return 'Salah';
  }

  return Number(selectedValue)===Number(leftIndex)
    ? 'Benar'
    : 'Salah';
};

const matchingScore=
  q.type==='matching'
    ? (
        q.options?.length
          ? matchingCorrectCount/q.options.length*Number(q.points||0)
          : 0
      )
    : 0;

const matchingStatus=
  matchingCorrectCount===q.options?.length
    ? 'Benar'
    : matchingCorrectCount===0
      ? 'Salah'
      : 'Sebagian benar';
const complexScore=q.type==='multiple_choice_complex'
  ? (
      complexCorrect.length>0
        ? Math.min(
            complexCorrectCount,
            complexCorrect.length
          ) / complexCorrect.length * Number(q.points||0)
        : 0
    )
  : 0;
 const complexStatus=
  complexScore<=0
    ? 'Salah'
    : complexIsCorrect
      ? 'Benar'
      : 'Sebagian benar';

const complexStatusClass=
  complexScore<=0
    ? 'wrongtext'
    : complexIsCorrect
      ? 'correcttext'
      : 'partialtext';
          return <div className="reviewquestion" key={q.id}>
            <h4>{i+1}. {q.prompt}</h4>
            <p className="muted">
  		{q.type==='multiple_choice'?'Pilihan ganda':
   		q.type==='multiple_choice_complex'?'Pilihan ganda kompleks':
   		q.type==='matching'?'Menjodohkan':
   		q.type==='short_answer'?'Isian singkat':
   		q.type==='essay'?'Uraian':'Jenis soal tidak dikenal'}
  	    	{' · Bobot '}{q.points} poin
	    </p>
            
<div className="answerbox">
  <b>Jawaban peserta:</b>
  {q.type==='multiple_choice_complex' ? (
    complexSelected.length ? (
      <ul>
        {complexSelected.map((selectedIndex,i)=>(
          <li key={i}>
            {q.options?.[selectedIndex]??'Pilihan tidak ditemukan'}
          </li>
        ))}
      </ul>
    ) : <p>Belum dijawab</p>
  ) : q.type==='matching' ? (
    <ul>
      {q.options?.map((pair,i)=>(
        <li key={i}>
          <strong>{pair.left}</strong> → {' '}
          {matchingSelected[i]===undefined ||
           matchingSelected[i]===null ? (
            <span>Belum dijawab</span>
          ) : Number(matchingSelected[i])===-1 ? (
            <>
              {q.matching_distractor||'Pilihan pengecoh'}
              {' '}
              <span className="wrongtext">(Salah)</span>
            </>
          ) : (
            <>
              {q.options?.[Number(matchingSelected[i])]?.right
                ?? 'Pasangan tidak ditemukan'}
              {' '}
              <span className={
                matchingRowStatus(i)==='Benar'
                  ? 'correcttext'
                  : 'wrongtext'
              }>
                ({matchingRowStatus(i)})
              </span>
            </>
          )}
        </li>
      ))}
    </ul>
  ) : (
    <p>{response.trim()?response:'Belum dijawab'}</p>
  )}
</div>

{q.type==='short_answer' && (
  <div className="answerbox">
    <b>Kunci Jawaban:</b>
    <p>
      {q.correct_answer?.trim()
        ? q.correct_answer
        : 'Kunci jawaban belum diisi'}
    </p>
  </div>
)}


            {isObjective&&<>
<p><b>Kunci jawaban:</b></p>

{q.type==='multiple_choice_complex' ? (
  <ul>
    {complexCorrect.map((correctIndex,i)=>(
      <li key={i}>
        {q.options?.[correctIndex]??'Pilihan tidak ditemukan'}
      </li>
    ))}
  </ul>
) : q.type==='matching' ? (
  <ul>
    {q.options?.map((pair,i)=>(
      <li key={i}>
        {pair.left} → {pair.right}
      </li>
    ))}
  </ul>
) : (
  <p>{q.correct_answer||'—'}</p>
)}
 <p><b>Hasil:</b>
  <span className={
    (isCorrect||complexIsCorrect||
      (q.type==='matching'&&matchingStatus==='Benar'))
      ?'correcttext'
      :'wrongtext'
  }>
    {(isCorrect||complexIsCorrect||
      (q.type==='matching'&&matchingStatus==='Benar'))
      ?'Benar'
      :'Belum benar sepenuhnya'}
  </span>
</p>

{q.type==='matching'&&(
  <p>
    <b>Status:</b>{' '}
    <span className={
      matchingStatus==='Benar'
        ?'correcttext'
        :matchingStatus==='Sebagian benar'
          ?'partialtext'
          :'wrongtext'
    }>
      {matchingStatus}
    </span>
    <br/>
    <b>Perolehan poin:</b>{' '}
    {matchingScore.toFixed(2)} dari {q.points} poin
  </p>
)}
 {q.type==='multiple_choice_complex'&&(
  <p>
    <b>Status:</b>{' '}
    <span className={complexStatusClass}>
      {complexStatus}
    </span>
    <br/>
    <b>Perolehan poin:</b>{' '}
    {complexScore.toFixed(2)} dari {q.points} poin
  </p>
)}
            </>}
            
{(q.type==='essay'||q.type==='short_answer')&&(
  <Field label={`Nilai manual ${q.type==='essay'?'uraian':'isian singkat'} (maksimal ${q.points} poin)`}>
    <input
      type="number"
      min="0"
      max={q.points}
      step="0.5"
      value={essayScores[q.id]??''}
      onChange={e=>setEssayScores(s=>({
        ...s,
        [q.id]:e.target.value
      }))}
      placeholder="Masukkan nilai, kosong berarti 0"
    />
  </Field>
)}

          </div>;
        })}
        <button className="primary" disabled={busy} onClick={saveReviewScores}>{busy?'Menyimpan...':'Simpan Penilaian dan Hitung Nilai Akhir'}</button>
      </section>
    </>}

    {page==='taking'&&current&&<>
      <div className="examhead"><div><span className="eyebrow">{exam.title}</span><h2>{student.name} · {student.class_name}</h2></div><div className="timer"><small>SISA WAKTU</small><b>{fmt(remaining)}</b></div></div>
      <div className="examlayout">
        <aside className="panel navpanel"><b>Nomor soal</b><div className="numbergrid">
          {questions.map((q,i)=><button key={q.id} className={`number ${i===idx?'selected':''} ${String(answers[q.id]??'').trim()!==''?'answered':''}`} onClick={()=>setIdx(i)}>{i+1}</button>)}
        </div><small>{answered} dari {questions.length} terjawab</small></aside>
        <section className="panel questionpanel">
          
<div className="qmeta">SOAL {idx+1} DARI {questions.length} · {current.points} POIN</div>
<h3 style={{whiteSpace:'pre-line'}}>
  <MathText text={current.prompt}/>
</h3>

{current.image_url&&(
  <div style={{margin:'16px 0'}}>
    <img
      src={current.image_url}
      alt="Gambar soal"
      style={{
        maxWidth:'100%',
        maxHeight:400,
        objectFit:'contain',
        display:'block',
        borderRadius:8
      }}
    />
  </div>
)}
       
{current.type==='multiple_choice'?<div className="choices">
  {(current.options||[]).map((o,i)=>
    <label className={`choice ${answers[current.id]===o?'chosen':''}`} key={i}>
      <input
        type="radio"
        name={current.id}
        checked={answers[current.id]===o}
        onChange={()=>saveAnswer(current.id,o)}
      />
      <span>{String.fromCharCode(65+i)}.</span>{o}
    </label>
  )}
</div>:current.type==='multiple_choice_complex'?<div className="choices">
  <p><strong>Pilih semua jawaban yang benar.</strong></p>
  {(current.options||[]).map((o,i)=>
    <label className="choice" key={i}>
      <input
        type="checkbox"
        checked={(()=>{
          try{return JSON.parse(answers[current.id]||'[]').includes(i);}
          catch{return false;}
        })()}
        onChange={e=>{
          let selected=[];
          try{selected=JSON.parse(answers[current.id]||'[]');}
          catch{selected=[];}
          const next=e.target.checked
            ?[...selected,i]
            :selected.filter(x=>x!==i);
          saveAnswer(current.id,JSON.stringify(next));
        }}
      />
      <span>{String.fromCharCode(65+i)}.</span>{o}
    </label>
  )}
</div>
:current.type==='matching'?(()=>{
  let selected={};

  try{
    selected=JSON.parse(answers[current.id]||'{}');
  }catch{
    selected={};
  }

  const choices=current.matching_choices||[];
  
  const linePaths=Object.entries(selected).map(([leftIndex,rightIndex])=>{
  const rightPosition=choices.findIndex(
    choice=>String(choice.right_index)===String(rightIndex)
  );

  if(rightPosition<0)return null;

  const y1=35.5+(Number(leftIndex)*63);
  const y2=35.5+(rightPosition*63);

  return (
    <path
      key={leftIndex}
      d={`M 48 ${y1} C 50 ${y1}, 50 ${y2}, 52 ${y2}`}
      stroke="#0ea5e9"
      strokeWidth="0.5"
      fill="none"
    />
  );
});

  const chooseLeft=(index)=>{
    setMatchingSelected(index);
  };

  const chooseRight=(rightIndex)=>{
    if(matchingSelected===null)return;

    const next={...selected};
    const oldValue=next[matchingSelected];

    if(oldValue!==undefined &&
       String(oldValue)===String(rightIndex)){
      delete next[matchingSelected];
    }else{
      Object.keys(next).forEach(key=>{
        if(String(next[key])===String(rightIndex)){
          delete next[key];
        }
      });

      next[matchingSelected]=rightIndex;
    }

    saveAnswer(current.id,JSON.stringify(next));
    setMatchingSelected(null);
  };

  return (
    <div className="choices">
      <p><strong>Klik pernyataan, kemudian klik jawaban yang sesuai.</strong></p>

      <div style={{
  display:'grid',
  gridTemplateColumns:'1fr 1fr',
  gap:40,
  position:'relative'
}}>

  <svg
    viewBox={`0 0 100 ${63*choices.length}`}
    preserveAspectRatio="none"
    style={{
      position:'absolute',
      top:18,
      left:0,
      width:'100%',
      height:63*choices.length,
      pointerEvents:'none',
      zIndex:2
    }}
  >
    {linePaths}
  </svg>
        <div>
          <strong>Pernyataan</strong>
          {(current.options||[]).map((pair,i)=>(
            <button
              type="button"
              key={i}
              onClick={()=>chooseLeft(i)}
              style={{
                display:'block',
                width:'100%',
                minHeight:55,
                marginTop:8,
                border:'2px solid',
                borderColor:matchingSelected===i?'#2563eb':
                  selected[i]!==undefined?'#16a34a':'#ddd',
                background:matchingSelected===i?'#eff6ff':
                  selected[i]!==undefined?'#f0fdf4':'white',
                borderRadius:8,
                padding:10,
                textAlign:'left',
                color:'#222'
              }}
            >
              {i+1}. {pair.left}
              {selected[i]!==undefined?' ✓':''}
            </button>
          ))}
        </div>

        <div>
          <strong>Pilihan jawaban</strong>
          {choices.map((choice,i)=>{
            const used=Object.values(selected).some(
              value=>String(value)===String(choice.right_index)
            );

            return (
              <button
                type="button"
                key={i}
                onClick={()=>chooseRight(choice.right_index)}
                style={{
                  display:'block',
                  width:'100%',
                  minHeight:55,
                  marginTop:8,
                  border:'2px solid',
                  borderColor:used?'#16a34a':'#ddd',
                  background:used?'#f0fdf4':'white',
                  borderRadius:8,
                  padding:10,
                  textAlign:'left',
                  color:'#222'
                }}
              >
                {String.fromCharCode(65+i)}. {choice.text}
                {used?' ✓':''}
              </button>
            );
          })}
        </div>
      </div>

      <p style={{fontSize:13,color:'#666'}}>
        Pilihan jawaban yang sudah digunakan tidak dapat dipasangkan kembali.
        Klik pernyataan lain untuk melanjutkan.
      </p>
    </div>
  );
})():<textarea
  rows="6"
  placeholder={current.type==='essay'?'Tuliskan jawaban uraian...':'Tuliskan jawaban...'}
  value={answers[current.id]||''}
  onChange={e=>saveAnswer(current.id,e.target.value)}
/>}

          <div className="qactions"><button
  className="ghost"
  disabled={idx===0}
  onClick={()=>{
    setMatchingSelected(null);
    setIdx(idx-1);
  }}
>
  Sebelumnya
</button>

<button
  className="secondary"
  disabled={idx===questions.length-1}
  onClick={()=>{
    setMatchingSelected(null);
    setIdx(idx+1);
  }}
>
  Berikutnya
</button></div>
          <button className="primary wide submit" onClick={()=>finishExam(false)} disabled={busy}>Kumpulkan ujian</button>
        </section>
      </div>
    </>}

    {page==='done'&&<section className="panel centered">
  <div className="check">✓</div>
  <h2>Ujian berhasil dikumpulkan</h2>
  <p>Terima kasih, {student.name}. Jawaban Anda telah disimpan.</p>
  <button className="primary" onClick={()=>{setPage('home');setStudent({
  name:'',
  class_name:'',
  birth_date:'',
  exam_number:'',
  code:''
});setMsg('');}}>
    Kembali ke halaman awal
  </button>
</section>}
     
    <footer>
  © {new Date().getFullYear()} Hak Cipta Dilindungi.
  <br/>
  Dikembangkan oleh Irham Solehidin, S.Mat.
</footer>
  </main>;
}
function Header(){
  return <header className="brand">
    {SCHOOL_LOGO_URL?<img src={SCHOOL_LOGO_URL} alt="Logo sekolah"/>:<div className="brandmark">CBT</div>}
    <div><b>{SCHOOL_NAME}</b><small>Computer Based Test · Ujian Online</small></div>
  </header>;
}
function Field({label,children}){return <label className="field"><span>{label}</span>{children}</label>;}
createRoot(document.getElementById('root')).render(<App/>);
