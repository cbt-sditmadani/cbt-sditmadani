# CBT Sekolah — Starter Project

Starter CBT online berbasis Vite + Supabase.

## Fitur pada tahap awal
- Login administrator dengan email/password Supabase Auth.
- Membuat ujian, kode ujian, durasi, dan status aktif.
- Menambahkan soal pilihan ganda, isian singkat, dan uraian.
- Siswa masuk menggunakan nama, kelas, dan kode ujian.
- Timer, navigasi soal, penyimpanan jawaban, dan pengumpulan ujian.
- Nilai otomatis untuk pilihan ganda dan isian singkat (jawaban isian harus sama setelah dinormalisasi); uraian diperiksa guru.
- Hasil ujian dapat dilihat administrator.

## Sebelum dipakai sungguhan
Ini starter tahap pertama, bukan layanan yang sudah online. Anda harus membuat proyek Supabase dan memasang aplikasi di hosting. Jangan membagikan `service_role` key kepada siapa pun atau memasukkannya ke frontend.
Supabase free tier dan Vercel free tier memiliki batas serta ketentuan yang dapat berubah. Periksa batas terbaru sebelum ujian dengan banyak peserta.

## 1. Siapkan layanan gratis
1. Buat akun di https://supabase.com dan buat project.
2. Buka SQL Editor, lalu jalankan seluruh isi `supabase/schema.sql`.
3. Buka Project Settings > API. Salin Project URL dan `anon`/publishable key.
4. Buat akun administrator di Authentication > Users (Add user).
5. Di SQL Editor, jalankan:
   `insert into public.admins(user_id) values ('UUID_USER_ADMIN');`
   Ganti dengan UUID pengguna admin dari Authentication > Users.

## 2. Jalankan aplikasi di komputer
Perlu Node.js versi LTS.
1. Ekstrak ZIP.
2. Di folder proyek, salin `.env.example` menjadi `.env`.
3. Isi `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY`.
4. Buka terminal di folder proyek, jalankan:
   `npm install`
   `npm run dev`
5. Buka alamat lokal yang tampil di terminal.

## 3. Pasang online melalui Vercel
1. Unggah folder proyek ke repository GitHub.
2. Masuk ke https://vercel.com, impor repository tersebut.
3. Tambahkan Environment Variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Klik Deploy. Vercel akan memberi alamat web `*.vercel.app`.
5. Tes dari HP menggunakan mode siswa dan admin.

## 4. Pengaturan sekolah
Edit `src/config.js`, isi nama sekolah dan (opsional) URL logo.
Untuk penggunaan resmi, gunakan HTTPS, kata sandi admin kuat, backup database, dan uji coba dengan beberapa akun siswa terlebih dahulu.

## Catatan penting
- Kode ujian bukan pengganti identitas siswa. Guru tetap perlu memeriksa nama/kelas dan daftar peserta.
- Siswa harus memiliki koneksi internet yang stabil. Jawaban disimpan ke server saat dikirim; aplikasi menampilkan status penyimpanan.
- Pengumpulan akhir mengunci sesi. Untuk mencegah kecurangan sepenuhnya diperlukan pengawasan; browser biasa tidak dapat mengunci perangkat siswa.
- Jangan gunakan data pribadi sensitif siswa yang tidak diperlukan.
