import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { configured, supabase } from './supabase';
import { SCHOOL_NAME, SCHOOL_LOGO_URL } from './config';
import './style.css';

function App(){
  const [page,setPage]=useState('home');
  const [msg,setMsg]=useState('');
  const [busy,setBusy]=useState(false);
  const [session,setSession]=useState(null);
  const [exam,setExam]=useState(null);
  const [questions,setQuestions]=useState([]);
  const [answers,setAnswers]=useState({});
  const [idx,setIdx]=useState(0);
  const [student,setStudent]=useState({name:'',class_name:'',code:''});
  const [remaining,setRemaining]=useState(0);
  const [result,setResult]=useState(null);
  const [adminEmail,setAdminEmail]=useState('');
  const [adminPassword,setAdminPassword]=useState('');
  const [exams,setExams]=useState([]);
  const [newExam,setNewExam]=useState({title:'',code:'',duration_minutes:60});
  const [editingExam,setEditingExam]=useState(null);
  const [draft,setDraft]=useState({type:'multiple_choice',prompt:'',options:['','','',''],correct_answer:'',points:1});
  const [draftImage,setDraftImage]=useState(null);
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
  useEffect(()=>{if(session){setPage('admin');loadExams();}},[session]);
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
async function addQuestion(e){
  e.preventDefault();
  if(!editingExam)return;
  setBusy(true);

  let imageUrl=null;

  if(draftImage){
    const fileExt=draftImage.name.split('.').pop();
    const fileName=`${editingExam.id}/${Date.now()}.${fileExt}`;

    const {data:uploadData,error:uploadError}=await supabase
      .storage
      .from('gambar-soal')
      .upload(fileName,draftImage);

    if(uploadError){
      setBusy(false);
      setMsg('Gagal mengunggah gambar: '+uploadError.message);
      return;
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
    prompt:draft.prompt,
    points:Number(draft.points),
    position:examQuestions.length+1,
    options:draft.type==='multiple_choice'?draft.options.filter(x=>x.trim()):null,
    correct_answer:['multiple_choice','short_answer'].includes(draft.type)?draft.correct_answer.trim():null,
    image_url:imageUrl
  };

  const {error}=await supabase.from('questions').insert(payload);

  setBusy(false);

  if(error){
    setMsg(error.message);
    return;
  }

  setDraft({type:'multiple_choice',prompt:'',options:['','','',''],correct_answer:'',points:1});
  setDraftImage(null);
  setMsg('Soal berhasil ditambahkan.');
  loadQuestions(editingExam.id);
}

  async function deleteQuestion(id){
    if(!confirm('Hapus soal ini?'))return;
    const {error}=await supabase.from('questions').delete().eq('id',id);
    if(error)setMsg(error.message);else loadQuestions(editingExam.id);
  }
  async function startExam(e){
    e.preventDefault();setBusy(true);setMsg('');
    try{
      const data=await call('student_start_exam',{
        p_code:student.code.trim().toUpperCase(),
        p_name:student.name.trim(),p_class:student.class_name.trim()
      });
      setExam(data.exam);setQuestions(data.questions);setAnswers(data.answers||{});
      setRemaining(data.remaining_seconds);setIdx(0);setResult(null);setPage('taking');
    }catch(err){setMsg(err.message||'Tidak dapat memulai ujian.');}
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
    setReviewAttempt(row);setReviewQuestions(qres.data||[]);setReviewAnswers(answerMap);
    setEssayScores(Object.fromEntries((qres.data||[]).filter(q=>q.type==='essay').map(q=>[
      q.id,String(answerMap[q.id]?.manual_score??'')
    ])));
    setPage('review');
  }
  async function saveReviewScores(){
    if(!reviewAttempt)return;
    const scores=[];
    for(const q of reviewQuestions.filter(item=>item.type==='essay')){
      const raw=essayScores[q.id]??'';
      const score=raw===''?0:Number(raw);
      if(!Number.isFinite(score)||score<0||score>Number(q.points)){
        setMsg(`Nilai soal uraian harus antara 0 sampai ${q.points} untuk setiap soal.`);
        return;
      }
      scores.push({question_id:q.id,score});
    }
    setBusy(true);setMsg('');
    const {data,error}=await supabase.rpc('admin_save_essay_grades',{
      p_attempt_id:reviewAttempt.id,p_scores:scores
    });
    setBusy(false);
    if(error){setMsg(error.message);return;}
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
          <Field label="Kode ujian"><input required value={student.code} onChange={e=>setStudent({...student,code:e.target.value.toUpperCase()})}/></Field>
          <button disabled={busy} className="primary wide">{busy?'Memproses...':'Mulai Ujian'}</button>
        </form>
      </section>
      <section className="panel soft"><span className="eyebrow">PENGELOLA</span><h2>Login Guru / Admin</h2><p>Masuk untuk membuat ujian, mengelola soal, dan melihat hasil.</p>
        <form onSubmit={signIn}>
          <Field label="Email administrator"><input type="email" required value={adminEmail} onChange={e=>setAdminEmail(e.target.value)}/></Field>
          <Field label="Kata sandi"><input type="password" required value={adminPassword} onChange={e=>setAdminPassword(e.target.value)}/></Field>
          <button disabled={busy} className="secondary wide">Masuk Dashboard</button>
        </form>
      </section>
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
              <button className="small" onClick={()=>{setEditingExam(e);loadQuestions(e.id);setPage('manage');}}>Soal</button>
              <button className="small" onClick={()=>openGrades(e)}>Hasil</button>
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
        <section className="panel"><h3>Tambah soal</h3><form onSubmit={addQuestion}>
          <Field label="Jenis soal"><select value={draft.type} onChange={e=>setDraft({...draft,type:e.target.value})}>
            <option value="multiple_choice">Pilihan ganda</option><option value="short_answer">Isian singkat</option><option value="essay">Uraian</option>
          </select></Field>
          <Field label="Pertanyaan"><textarea required rows="4" value={draft.prompt} onChange={e=>setDraft({...draft,prompt:e.target.value})}/></Field>

<Field label="Gambar soal (opsional)">
  <input
    type="file"
    accept="image/*"
    onChange={e=>setDraftImage(e.target.files?.[0]||null)}
  />
</Field>
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

          {draft.type==='multiple_choice'&&<>
            <Field label="Pilihan jawaban (isi minimal 2)">{draft.options.map((o,i)=><input key={i} className="optioninput" placeholder={`Pilihan ${String.fromCharCode(65+i)}`} value={o} onChange={e=>setDraft({...draft,options:draft.options.map((x,j)=>j===i?e.target.value:x)})}/>)}</Field>
            <Field label="Kunci jawaban (tulis persis seperti pilihan)"><input required value={draft.correct_answer} onChange={e=>setDraft({...draft,correct_answer:e.target.value})}/></Field>
          </>}
          {draft.type==='short_answer'&&<Field label="Kunci jawaban"><input required value={draft.correct_answer} onChange={e=>setDraft({...draft,correct_answer:e.target.value})}/></Field>}
          <Field label="Bobot nilai"><input type="number" min="0" step="0.5" value={draft.points} onChange={e=>setDraft({...draft,points:e.target.value})}/></Field>
          <button className="primary" disabled={busy}>Simpan soal</button>
        </form></section>
        <section className="panel"><h3>Soal tersimpan ({examQuestions.length})</h3>
          {examQuestions.map((q,i)=><div className="questionrow" key={q.id}>
            <div><b>{i+1}. {q.prompt}</b><small>{q.type==='multiple_choice'?'Pilihan ganda':q.type==='short_answer'?'Isian singkat':'Uraian'} · {q.points} poin</small></div>
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
          const isObjective=q.type==='multiple_choice'||q.type==='short_answer';
          const isCorrect=isObjective&&response.trim().toLowerCase()===String(q.correct_answer??'').trim().toLowerCase();
          return <div className="reviewquestion" key={q.id}>
            <h4>{i+1}. {q.prompt}</h4>
            <p className="muted">{q.type==='multiple_choice'?'Pilihan ganda':q.type==='short_answer'?'Isian singkat':'Uraian'} · Bobot {q.points} poin</p>
            <div className="answerbox"><b>Jawaban peserta:</b><p>{response.trim()?response:'Belum dijawab'}</p></div>
            {isObjective&&<>
              <p><b>Kunci jawaban:</b> {q.correct_answer||'—'}</p>
              <p><b>Hasil:</b> <span className={isCorrect?'correcttext':'wrongtext'}>{isCorrect?'Benar':'Salah / belum dijawab'}</span></p>
            </>}
            {q.type==='essay'&&<Field label={`Nilai uraian (maksimal ${q.points} poin)`}>
              <input type="number" min="0" max={q.points} step="0.5" value={essayScores[q.id]??''}
                onChange={e=>setEssayScores(s=>({...s,[q.id]:e.target.value}))}
                placeholder="Masukkan nilai, kosong berarti 0"/>
            </Field>}
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
<h3>{current.prompt}</h3>

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
            {(current.options||[]).map((o,i)=><label className={`choice ${answers[current.id]===o?'chosen':''}`} key={i}>
              <input type="radio" name={current.id} checked={answers[current.id]===o} onChange={()=>saveAnswer(current.id,o)}/><span>{String.fromCharCode(65+i)}.</span>{o}
            </label>)}
          </div>:<textarea rows="6" placeholder={current.type==='essay'?'Tuliskan jawaban uraian...':'Tuliskan jawaban...'} value={answers[current.id]||''} onChange={e=>saveAnswer(current.id,e.target.value)}/>}
          <div className="qactions"><button className="ghost" disabled={idx===0} onClick={()=>setIdx(idx-1)}>Sebelumnya</button><button className="secondary" disabled={idx===questions.length-1} onClick={()=>setIdx(idx+1)}>Berikutnya</button></div>
          <button className="primary wide submit" onClick={()=>finishExam(false)} disabled={busy}>Kumpulkan ujian</button>
        </section>
      </div>
    </>}

    {page==='done'&&<section className="panel centered">
      <div className="check">✓</div><h2>Ujian berhasil dikumpulkan</h2><p>Terima kasih, {student.name}. Jawaban Anda telah disimpan.</p>
      {result?.objective_score!=null&&<p>Nilai objektif: <b>{result.objective_score}</b></p>}
      <button className="primary" onClick={()=>{setPage('home');setStudent({name:'',class_name:'',code:''});setMsg('');}}>Kembali ke halaman awal</button>
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
