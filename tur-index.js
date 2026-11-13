// ============================================================
// tur-index.js — tur pengenalan di beranda
// ============================================================
import { initTour } from './tur.js';

initTour({ page: 'beranda', steps: [
  { judul: 'Halo! 👋', teks: 'Studio SCORM punya 3 alat — semuanya gratis, tanpa daftar akun, dan data Anda tidak keluar dari perangkat ini.' },
  { el: 'a.btn[href="builder.html"]', judul: '1 · Builder', teks: 'Membuat materi e-learning: slide, kuis, narasi suara, karakter presenter — lalu unduh sebagai file SCORM untuk LMS.' },
  { el: 'a.btn[href="player.html"]', judul: '2 · Player', teks: 'Memutar & mencoba file SCORM tanpa perlu LMS.' },
  { el: 'a.btn[href="html-builder.html"]', judul: '3 · HTML Creator', teks: 'Tempel kode HTML apa pun, tambahkan musik & efek suara, unduh sebagai satu file.' },
] });
