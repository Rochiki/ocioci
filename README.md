# Studio SCORM

Aplikasi web **open-source berbahasa Indonesia** untuk membuat kursus e-learning interaktif dan mengekspornya menjadi paket **SCORM 1.2 / 2004**, serta memutar paket SCORM apa pun langsung di browser.

- **Builder** — 8 jenis slide, impor PowerPoint/PDF/Word/gambar/video/HTML, pratinjau langsung (HP & laptop), tema warna, logo, sampul, sertifikat.
- **Narasi suara gratis** — suara perangkat (langsung jalan), rekam suara sendiri, atau MP3 suara natural (Gadis/Ardi).
- **Player** — unggah `.zip` SCORM dari tool mana pun (Articulate, iSpring, Adapt, dll.) dan putar dengan status, nilai, dan log SCORM.

> **Tanpa folder.** Semua file berada langsung di root repository, jadi bisa diunggah ke GitHub lewat browser (pilih semua file → seret) tanpa takut struktur rusak.

---

## 1. Pasang di GitHub Pages (±5 menit)

1. Buat repository baru (Public), mis. `SCORMKU`.
2. Klik **Add file → Upload files**.
3. Ekstrak zip, buka foldernya, **pilih semua file (Ctrl+A)**, seret ke halaman unggah (atau *choose your files* → pilih semua). Klik **Commit changes**.
4. **Settings → Pages → Source: Deploy from a branch → `main` / `(root)` → Save.**
5. Tunggu 1–2 menit, buka `https://NAMA-ANDA.github.io/NAMA-REPO/` lalu tekan **Ctrl+F5**.

**Memperbarui versi lama:** unggah semua file baru ke repo yang sama (file bernama sama otomatis tertimpa), lalu hapus file lama yang sudah tidak ada di daftar di bawah. **Jangan mengganti nama file apa pun** — halaman saling memanggil berdasarkan nama.

---

## 2. Jenis slide

| Jenis | Isi | Dilaporkan ke LMS |
|---|---|---|
| **Materi** | Teks + gambar/GIF, 4 tata letak (atas, kiri, kanan, gambar latar) | dilihat |
| **Gambar / GIF** | Foto, infografis, GIF animasi + keterangan | dilihat |
| **Video** | Unggah MP4/WebM/MOV, atau link YouTube/Vimeo/Google Drive. Opsi *wajib ditonton sampai habis* (tidak bisa dilompati) | ditonton |
| **HTML / Embed** | Tempel kode embed (Canva, Genially, Google Slides, Forms, Padlet…), file `.html`, atau **mini-website `.zip`** (index.html + gambar/CSS/JS) | dilihat |
| **Kartu balik** | Istilah di depan, penjelasan di belakang, gambar opsional | dibalik semua (opsional) |
| **Gambar interaktif** | Mode **Cari bahaya** (titik tersembunyi, peserta mengetuk bagian berbahaya) atau **Jelajah** (titik terlihat) | ditemukan |
| **Kuis** | Pilihan ganda, banyak jawaban benar, benar/salah; umpan balik; acak pilihan | **dinilai** + jawaban per soal |
| **Urutkan langkah** | Peserta menyusun urutan (seret atau tombol panah) — cocok untuk prosedur/LOTO | **dinilai** |

Fitur kursus: menu daftar isi, navigasi **bebas** atau **harus berurutan**, teks narasi (CC), transisi slide, konfeti saat lulus, **sertifikat** yang bisa dicetak/disimpan PDF, resume (lanjut dari posisi terakhir), tampilan responsif HP.

## 3. Impor file

| File | Hasil |
|---|---|
| **PowerPoint (.pptx)** | 1 slide per halaman: judul, poin (teks **tebal** ikut), tabel, gambar terbesar **sesuai potongan (crop) di PowerPoint**, video tertanam; ukuran huruf PowerPoint dipakai sebagai ukuran minimal; **catatan pembicara → naskah narasi** |
| **PDF** | 1 slide gambar per halaman — tampilan persis seperti aslinya (opsi: teks halaman jadi naskah narasi) |
| **Word (.docx)** | 1 slide per judul (Heading 1/2), poin & gambar ikut |
| **Gambar / GIF** (banyak sekaligus) | 1 slide gambar per file |
| **Video** | slide video |
| **.html / .zip** | slide HTML |

Tips: ingin tampilan PowerPoint **persis sama** (font, animasi diam)? Di PowerPoint pilih *File → Simpan Sebagai → PDF*, lalu impor PDF-nya. File `.ppt` lama: simpan dulu sebagai `.pptx`.

Bisa juga **menyeret file ke mana saja** di layar Builder.

**Potong gambar:** setiap gambar di Builder punya tombol **Potong** (bebas, 16:9, 4:3, kotak, tegak, putar 90°). Gambar asli tetap disimpan, jadi bisa **Kembalikan gambar asli** kapan saja.

**Ukuran teks:** tab **Gaya → Ukuran teks bawaan**, atau per slide di bagian **Tampilan**. Pilihan **Pas layar** memperbesar teks slide materi sampai memenuhi layar peserta — mirip AutoFit di PowerPoint.

## 4. Suara / narasi (semuanya gratis)

Tab **Suara** → pilih **mesin suara MP3**, lalu tombol **Buat MP3 natural** (per slide) atau **Buat MP3 untuk semua slide**:

1. **Suara AI di browser** *(bawaan, tanpa server)* — suara Bahasa Indonesia dari model [Piper](https://huggingface.co/rhasspy/piper-voices) (lisensi MIT) yang dijalankan **langsung di browser**. Tidak perlu daftar akun atau server. Pertama kali, browser mengunduh model ±90 MB (pakai Wi-Fi), lalu tersimpan untuk pemakaian berikutnya. Teks tidak dikirim ke mana pun. Butuh akses internet ke `cdn.jsdelivr.net` dan `huggingface.co` untuk unduhan pertama.
2. **Microsoft Gadis / Ardi** *(eksperimental)* — suara Neural Microsoft dihubungi langsung dari browser. Bila Microsoft menolak sambungan, aplikasi otomatis beralih ke Suara AI di browser.
3. **Server sendiri** — Gadis/Ardi lewat server kecil (`main.py`) di **Hugging Face Spaces** (gratis):
   1. Unduh `main.py`, `requirements.txt`, `Dockerfile` (tab Suara, atau dari repo ini).
   2. Daftar di [huggingface.co](https://huggingface.co/join) → [New Space](https://huggingface.co/new-space) → SDK **Docker → Blank**, hardware **CPU basic (Free)**, **Public** → Create.
   3. Di Space: **Files → Add file → Upload files** → 3 file tadi → Commit. Tunggu status **Running**.
   4. Tempel alamat Space di tab Suara → **Cek**.

Pilihan lain: **Rekam suara** sendiri di setiap slide, atau **Unggah audio**. Slide tanpa MP3 dibacakan **suara perangkat peserta** (bisa dimatikan) — kualitasnya tergantung HP/laptop peserta, jadi sebaiknya semua slide diberi MP3.

> **Catatan jujur:** jalur Microsoft (langsung maupun lewat `edge-tts`) memakai layanan suara Microsoft Edge yang **tidak resmi** — gratis dan bagus, tetapi tanpa jaminan. Audio disimpan sebagai MP3 di dalam paket, jadi kursus yang sudah jadi tetap bersuara walau layanan berubah.

## 4b. Karakter presenter animasi

Tab **Gaya → Karakter presenter**: nyalakan, lalu pilih karakter bawaan (Raka, Sari, Nisa, Pak Budi, dr. Dewi — gambar vektor buatan sendiri, bebas dipakai; dan enam karakter ilustrasi dengan 6 ekspresi — diam, menunjuk, melambai, jempol, berpikir, serius/tegas: **Safee, Safri, Helen, Vira, Shendi, Romi**; nama disusun dari Safety · Health · Environment) atau **Karakter sendiri** (unggah PNG transparan/GIF; opsional gambar kedua dengan mulut terbuka untuk gerak bibir).

- Karakter berkedip, bernapas, dan **bibirnya bergerak mengikuti narasi** (paling pas dengan MP3).
- Pose per slide (bagian **Tampilan** di tiap slide): Otomatis, Menunjuk, Melambai, Jempol, Berpikir, Diam, Sembunyikan. Mode Otomatis: melambai di awal, menunjuk materi, berpikir saat kuis, jempol bila jawaban benar.
- Posisi kanan/kiri bawah, ukuran kecil/sedang/besar. Peserta bisa mengetuk karakter untuk memutar narasi. Teks tidak akan tertutup karakter.

Kamus pelafalan (K3 → "K tiga", APD → "A P D", dll.) ada di `tts.js` → `PRONUNCIATION`.

**Layar penuh untuk gambar / video / HTML:** slide media baru otomatis tampil memenuhi halaman (tanpa judul, keterangan, dan margin; karakter presenter disembunyikan). Matikan per slide lewat saklar "Layar penuh", atau nyalakan untuk semua slide lama lewat Atur → Tampilan media. Nama file bawaan seperti `index.html` atau `video.mp4` tidak dipakai sebagai judul.

## 5. Daftar file

| File | Fungsi |
|---|---|
| `index.html` | Beranda |
| `builder.html`, `builder.js` | Aplikasi Builder |
| `editors.js` | Formulir tiap jenis slide |
| `importers.js` | Impor PPTX, PDF, DOCX, gambar, video, HTML/ZIP |
| `tts.js` | Suara perangkat, perekam mikrofon, Suara AI di browser (Piper), Microsoft langsung, klien server MP3 |
| `crop.js` | Potong & putar gambar (juga dipakai saat impor PowerPoint) |
| `ui.js` | Komponen antarmuka (ikon, dialog, notifikasi) |
| `app.css` | Tampilan aplikasi (terang & gelap) |
| `preview.html` | Pratinjau langsung di Builder |
| `player.html`, `player.js`, `sw.js` | SCORM Player (`sw.js` wajib sejajar `player.html`) |
| `package-store.js`, `scorm-runtime.js` | Ekstrak `.zip` & API LMS (SCORM 1.2 dan 2004) |
| `packager.js`, `manifest.js` | Merakit paket `.zip` + `imsmanifest.xml` |
| `safee-*.webp`, `safri-*.webp`, `helen-*.webp`, `vira-*.webp`, `shendi-*.webp`, `romi-*.webp` (18 gambar per karakter) | Bingkai karakter ilustrasi (6 pose × 3 bentuk mulut). Ikut ke paket SCORM hanya bila karakternya dipilih. Pose "Serius / tegas" otomatis dipakai pada slide yang memuat kata bahaya/peringatan/dilarang |
| `lipsync.js` | Gerak bibir: membaca irama suara MP3 + vokal dari teks narasi (a/o = mulut lebar, i/u/e = setengah, m/b/p dan jeda = tertutup). Jalur mulut dihitung di Builder saat pratinjau/ekspor dan disimpan di paket; tanpa jalur, dihitung dari teks + durasi audio. Suara perangkat peserta: mulut mengikuti batas kata |
| `paket-index.html`, `course.js`, `course.css`, `scorm-api.js`, `karakter.js`, `lipsync.js` | **Template** yang disalin ke setiap paket SCORM (`paket-index.html` menjadi `index.html` di dalam zip) |
| `store.js`, `util.js` | Penyimpanan IndexedDB & fungsi bantu |
| `jszip.min.js` | JSZip 3.10 (MIT/GPLv3) |
| `pdf.min.mjs`, `pdf.worker.min.mjs` | PDF.js 5 (Apache-2.0) untuk impor PDF |
| `contoh-apd.json` | Proyek contoh "Pengenalan APD" |
| `pengenalan-alat-pelindung-diri-apd-scorm12.zip` / `…scorm2004.zip` | Paket contoh untuk mencoba Player / LMS |
| `main.py`, `requirements.txt`, `Dockerfile` | Server suara MP3 (Hugging Face / Render / VPS) |
| `*.test.mjs`, `test_main.py`, `build-sample.mjs`, `package.json` | Pengujian otomatis (tidak dipakai saat aplikasi berjalan) |
| `.nojekyll` | Memberi tahu GitHub Pages agar menyajikan file apa adanya (opsional) |

## 6. Cara kerja singkat

- **Builder** menyimpan proyek di IndexedDB browser (gambar/video sebagai Blob). **Ekspor proyek** (tab Atur) menghasilkan `.json` untuk cadangan/pindah perangkat.
- **Unduh SCORM** merakit zip di browser: `index.html`, `assets/` (mesin kursus), `media/`, `html-NN/` (slide HTML), dan `imsmanifest.xml`. Folder di *dalam zip* dibuat otomatis — Anda tidak perlu membuat folder apa pun.
- **Player** mengekstrak zip ke Cache Storage, lalu service worker (`sw.js`) menyajikannya seperti web server, sehingga link relatif di dalam paket berfungsi. API LMS (`window.API` / `window.API_1484_11`) disediakan `scorm-runtime.js`.
- Yang dilaporkan ke LMS: status (incomplete/completed/passed/failed), nilai, posisi terakhir (bookmark), `suspend_data`, waktu, dan **interaksi** per soal (choice, true-false, sequencing).

## 7. Menguji di LMS

1. Uji cepat: Builder → **Coba di Player**, buka *Log komunikasi SCORM* untuk melihat setiap data yang dikirim.
2. **Moodle:** Tambah aktivitas → **Paket SCORM** → unggah `.zip`. Cek *Laporan* untuk nilai & jawaban.
3. Bila ragu memilih versi: **SCORM 1.2** paling luas dukungannya.

## 8. Batasan & keamanan

- Konten paket berjalan di domain yang sama dengan aplikasi (wajib agar bisa memanggil API LMS). Putar hanya paket dari sumber tepercaya; untuk layanan publik, pasang Player di repo/domain terpisah.
- Video dari link (YouTube dsb.) butuh internet saat kursus dibuka dan tidak bisa dipaksa "wajib ditonton".
- Ukuran paket: usahakan < 100–200 MB (batas unggah LMS). Kompres video dulu bila perlu.
- Proyek tersimpan di browser perangkat yang dipakai; membersihkan data browser akan menghapusnya — rajin **Ekspor proyek**.
- SCORM 2004 *sequencing* lanjutan (prasyarat antar-SCO) tidak diimplementasikan; navigasi di dalam kursus diatur oleh mesin kursus sendiri.

## 9. Pengembang

```bash
npm install
npm test               # tes manifest, runtime SCORM, packager
npm run build:sample   # membuat ulang 2 paket contoh
npm run dev            # server lokal di http://localhost:5173
pip install -r requirements.txt pytest httpx && pytest -q   # tes server suara
```

Lisensi: [MIT](LICENSE). JSZip © Stuart Knightley (MIT/GPLv3). PDF.js © Mozilla (Apache-2.0).
