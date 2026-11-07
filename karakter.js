/* ============================================================
   karakter.js — karakter presenter animasi (ikut di paket SCORM)
   Gambar vektor (SVG) buatan sendiri, bebas dipakai. Tiap karakter
   punya: mulut 3 bentuk (untuk lip-sync), mata berkedip, napas,
   dan 5 pose: diam, tunjuk, lambai, jempol, pikir.
   Dipakai course.js (paket) dan Builder (pilihan karakter).
   ============================================================ */
(function () {
  'use strict';

  var LIST = {
    raka: { name: 'Raka', desc: 'Teknisi — helm kuning, rompi oranye', skin: '#d9a273', skinDark: '#b97f52', hair: '#2a1c14', style: 'pendek', helmet: '#f5c518', shirt: '#2d4f7c', vest: '#ff7a1a', brows: 3.6 },
    sari: { name: 'Sari', desc: 'Pekerja — helm putih, kemeja denim', skin: '#efc29b', skinDark: '#cf9c73', hair: '#2b1b12', style: 'panjang', helmet: '#fbfbfa', shirt: '#4f7cac', vest: null, tape: true, lashes: true },
    nisa: { name: 'Nisa', desc: 'Pekerja berhijab — helm putih, rompi', skin: '#e6b48a', skinDark: '#c68e63', hair: '#2b1b12', style: 'hijab', hijab: '#27406b', helmet: '#fbfbfa', shirt: '#6a7f8f', vest: '#ff7a1a', lashes: true },
    budi: { name: 'Pak Budi', desc: 'Supervisor — helm putih, berkacamata', skin: '#c98f62', skinDark: '#a8714a', hair: '#3a3a3a', style: 'pendek', helmet: '#fbfbfa', shirt: '#1f6f5c', vest: '#d9f24a', brows: 4, mustache: true, glasses: true },
    dewi: { name: 'dr. Dewi', desc: 'Petugas kesehatan — jas putih', skin: '#f0c7a2', skinDark: '#d1a07a', hair: '#1f1611', style: 'sanggul', helmet: null, shirt: '#58b7b0', coat: '#ffffff', lashes: true, stetoskop: true },
  };

  // Karakter ilustrasi (gambar, bukan vektor): 6 pose x 3 bentuk mulut = 18 bingkai, mis. shendi-diam-0.webp
  var BASE = (document.currentScript && document.currentScript.src || '').replace(/[^\/]*$/, '');
  var FOTO_POSES = ['diam', 'tunjuk', 'lambai', 'jempol', 'pikir', 'serius'];
  // Nama disusun dari Safety · Health · Environment.
  LIST.safee = { name: 'Safee', desc: 'Safety officer — blazer & dasi hitam', foto: true };
  LIST.safri = { name: 'Safri', desc: 'Pekerja lapangan — helm putih, rompi oranye', foto: true };
  LIST.helen = { name: 'Helen', desc: 'Health — kemeja putih, rambut pirang', foto: true };
  LIST.vira = { name: 'Vira', desc: 'Environment — berhijab krem', foto: true };
  LIST.shendi = { name: 'Shendi', desc: 'Trainer — kemeja batik', foto: true };
  LIST.romi = { name: 'Romi', desc: 'Manajer — jas hitam, dasi biru', foto: true };
  LIST.sasha = { name: 'Sasha', desc: 'Staf — blazer sakura, berkacamata', foto: true };
  LIST.feri = { name: 'Feri', desc: 'Supervisor — jas bergaris, dasi navy', foto: true };
  LIST.ela = { name: 'Ela', desc: 'Staf — blus putih, rambut kepang', foto: true };
  LIST.meena = { name: 'Meena', desc: 'Staf — blazer pink, rambut pirang', foto: true };
  function fotoSvg(id, thumbOnly) {
    var o = ['<div class="kr kr-foto" data-who="' + id + '" aria-hidden="true">'];
    FOTO_POSES.forEach(function (p) { for (var m = 0; m < 3; m++) if (!thumbOnly || (p === 'diam' && m === 0)) o.push('<img src="' + BASE + id + '-' + p + '-' + m + '.webp" alt="" draggable="false" data-p="' + p + '" data-m="' + m + '">'); });
    o.push('</div>');
    return o.join('');
  }

  function shade(hex, k) {
    var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    var f = function (c) { return Math.max(0, Math.min(255, Math.round(k < 0 ? c * (1 + k) : c + (255 - c) * k))); };
    return '#' + ((1 << 24) + (f(r) << 16) + (f(g) << 8) + f(b)).toString(16).slice(1);
  }

  /** SVG lengkap satu karakter. */
  function svg(id, thumbOnly) {
    if (LIST[id] && LIST[id].foto) return fotoSvg(id, thumbOnly);
    var c = LIST[id] || LIST.raka;
    var line = 'rgba(40,25,15,.28)';
    var top = c.coat || c.shirt;
    var topDark = shade(top, -0.18);
    var o = [];
    o.push('<svg class="kr" viewBox="-40 0 320 300" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">');
    o.push('<g class="kr-body">');

    // rambut panjang di belakang bahu
    if (c.style === 'panjang') o.push('<path d="M70 92 Q58 160 70 214 Q88 222 104 208 L104 130 Z M170 92 Q182 160 170 214 Q152 222 136 208 L136 130 Z" fill="' + c.hair + '"/>');

    // lengan diam (dipakai pose diam & pikir di sisi kiri; dsb.)
    // badan
    o.push('<path d="M38 300 L42 214 Q46 170 92 160 L148 160 Q194 170 198 214 L202 300 Z" fill="' + top + '" stroke="' + line + '" stroke-width="1.5"/>');
    // leher & kerah
    if (c.style !== 'hijab') {
      o.push('<path d="M104 128 L136 128 L138 166 Q120 178 102 166 Z" fill="' + c.skinDark + '"/>');
      if (c.coat) {
        o.push('<path d="M100 162 L120 214 L140 162 L134 160 L120 192 L106 160 Z" fill="' + c.shirt + '"/>');
        o.push('<path d="M92 160 L120 230 L104 300 L80 300 L86 200 Z M148 160 L120 230 L136 300 L160 300 L154 200 Z" fill="' + shade(c.coat, -0.06) + '" stroke="' + line + '" stroke-width="1.2"/>');
      } else {
        o.push('<path d="M98 158 L120 182 L108 196 L90 166 Z M142 158 L120 182 L132 196 L150 166 Z" fill="' + topDark + '" stroke="' + line + '" stroke-width="1.2"/>');
        o.push('<path d="M120 182 L120 300" stroke="' + topDark + '" stroke-width="2"/>');
        o.push('<circle cx="120" cy="214" r="2.6" fill="' + topDark + '"/><circle cx="120" cy="246" r="2.6" fill="' + topDark + '"/>');
      }
    }
    // rompi
    if (c.vest) {
      o.push('<path d="M60 300 L63 206 Q68 174 100 164 L110 198 L108 300 Z M180 300 L177 206 Q172 174 140 164 L130 198 L132 300 Z" fill="' + c.vest + '" stroke="' + line + '" stroke-width="1.5"/>');
      o.push('<path d="M62 240 L108 240 L108 251 L62 251 Z M132 240 L178 240 L178 251 L132 251 Z M62 272 L108 272 L108 283 L62 283 Z M132 272 L178 272 L178 283 L132 283 Z" fill="#e9eef1" opacity=".95"/>');
    }
    if (c.tape) o.push('<path d="M48 250 L104 250 L104 259 L48 259 Z M136 250 L192 250 L192 259 L136 259 Z" fill="#e9eef1" opacity=".9"/><path d="M134 214 L160 214 L160 232 L134 232 Z" fill="' + topDark + '" opacity=".7"/>');
    if (c.stetoskop) o.push('<path d="M100 168 Q92 222 114 236 M140 168 Q148 222 126 236" fill="none" stroke="#3b4652" stroke-width="3.2" stroke-linecap="round"/><circle cx="120" cy="240" r="7" fill="#9aa6b2" stroke="#3b4652" stroke-width="2.4"/><rect x="146" y="206" width="30" height="12" rx="2" fill="#2f7fbf"/>');
    if (c.coat) o.push('<rect x="64" y="214" width="22" height="4" rx="2" fill="#2f7fbf" opacity=".8"/>');

    // ---------- pose (lengan)
    var sleeve = top, hand = c.skin;
    var armDown = function (side) {
      return side === 'L'
        ? '<path d="M44 206 Q30 252 32 300 L56 300 Q56 252 62 214 Z" fill="' + sleeve + '" stroke="' + line + '" stroke-width="1.5"/>'
        : '<path d="M196 206 Q210 252 208 300 L184 300 Q184 252 178 214 Z" fill="' + sleeve + '" stroke="' + line + '" stroke-width="1.5"/>';
    };
    o.push('<g class="pose pose-diam">' + armDown('L') + armDown('R') + '</g>');
    // tunjuk: tangan kiri (sisi kiri layar) menunjuk ke samping atas
    o.push('<g class="pose pose-tunjuk">' + armDown('R') +
      '<path d="M50 200 L6 170 Q-2 178 -2 186 L42 222 Z" fill="' + sleeve + '" stroke="' + line + '" stroke-width="1.5"/>' +
      '<g class="kr-finger"><circle cx="-4" cy="176" r="10" fill="' + hand + '" stroke="' + line + '" stroke-width="1.2"/>' +
      '<path d="M-10 170 L-30 160" stroke="' + hand + '" stroke-width="7" stroke-linecap="round"/>' +
      '<path d="M-2 168 Q-8 162 -14 166" stroke="' + c.skinDark + '" stroke-width="2" fill="none" stroke-linecap="round"/></g></g>');
    // lambai: tangan kanan diangkat di samping kepala, bergoyang
    o.push('<g class="pose pose-lambai">' + armDown('L') +
      '<path d="M184 198 L204 156 L222 162 L200 214 Z" fill="' + sleeve + '" stroke="' + line + '" stroke-width="1.5"/>' +
      '<g class="kr-wave"><path d="M213 160 L219 126" stroke="' + hand + '" stroke-width="15" stroke-linecap="round"/>' +
      '<ellipse cx="221" cy="112" rx="13" ry="15" fill="' + hand + '" stroke="' + line + '" stroke-width="1.2"/>' +
      '<path d="M211 102 L208 88 M218 98 L217 82 M225 98 L227 83 M231 104 L236 92" stroke="' + hand + '" stroke-width="6" stroke-linecap="round"/></g></g>');
    // jempol: kepalan di depan perut (di bawah ujung hijab)
    o.push('<g class="pose pose-jempol">' + armDown('L') +
      '<path d="M182 198 Q208 232 202 276 L182 280 Q184 238 170 210 Z" fill="' + sleeve + '" stroke="' + line + '" stroke-width="1.5"/>' +
      '<path d="M192 272 L164 262" stroke="' + sleeve + '" stroke-width="18" stroke-linecap="round"/>' +
      '<g class="kr-thumb"><rect x="140" y="248" width="26" height="24" rx="9" fill="' + hand + '" stroke="' + line + '" stroke-width="1.2"/>' +
      '<path d="M146 250 L146 226" stroke="' + hand + '" stroke-width="9" stroke-linecap="round"/>' +
      '<path d="M144 256 L164 256 M144 263 L164 263" stroke="' + c.skinDark + '" stroke-width="1.6"/></g></g>');
    // pikir: tangan di dagu
    o.push('<g class="pose pose-pikir">' + armDown('L') +
      '<path d="M184 198 Q200 230 186 250 L168 244 Q180 226 172 208 Z" fill="' + sleeve + '" stroke="' + line + '" stroke-width="1.5"/>' +
      '<path d="M176 246 L150 160" stroke="' + sleeve + '" stroke-width="16" stroke-linecap="round"/>' +
      '<ellipse cx="146" cy="150" rx="11" ry="10" fill="' + hand + '" stroke="' + line + '" stroke-width="1.2"/></g>');

    // ---------- kepala
    o.push('<g class="kr-head">');
    if (c.style === 'hijab') {
      o.push('<path d="M64 104 Q60 36 120 34 Q180 36 176 104 Q180 150 164 174 L196 214 Q120 236 44 214 L76 174 Q60 150 64 104 Z" fill="' + c.hijab + '" stroke="' + line + '" stroke-width="1.5"/>');
      o.push('<path d="M76 178 Q120 206 164 178" fill="none" stroke="' + shade(c.hijab, -0.25) + '" stroke-width="2"/>');
    }
    if (c.style === 'sanggul') o.push('<circle cx="120" cy="46" r="17" fill="' + c.hair + '"/>');
    // telinga
    if (c.style !== 'hijab') o.push('<circle cx="78" cy="104" r="8.5" fill="' + c.skinDark + '"/><circle cx="162" cy="104" r="8.5" fill="' + c.skinDark + '"/>');
    // wajah
    o.push('<ellipse cx="120" cy="101" rx="' + (c.style === 'hijab' ? 40 : 43) + '" ry="' + (c.style === 'hijab' ? 46 : 49) + '" fill="' + c.skin + '" stroke="' + line + '" stroke-width="1.5"/>');
    // rambut depan
    if (c.style === 'pendek') o.push('<path d="M78 96 Q76 70 92 64 L96 90 Q88 88 82 98 Z M162 96 Q164 70 148 64 L144 90 Q152 88 158 98 Z" fill="' + c.hair + '"/>');
    if (c.style === 'panjang') o.push('<path d="M77 100 Q74 66 100 60 Q92 76 94 92 Q84 92 80 104 Z M163 100 Q166 66 140 60 Q148 76 146 92 Q156 92 160 104 Z" fill="' + c.hair + '"/>');
    if (c.style === 'sanggul') o.push('<path d="M77 100 Q72 54 120 52 Q168 54 163 100 Q156 76 136 70 Q120 82 96 72 Q84 80 77 100 Z" fill="' + c.hair + '"/>');
    // pipi
    o.push('<ellipse cx="97" cy="121" rx="8" ry="4.5" fill="#ff8f86" opacity=".33"/><ellipse cx="143" cy="121" rx="8" ry="4.5" fill="#ff8f86" opacity=".33"/>');
    // alis
    var bw = c.brows || 2.6;
    o.push('<g class="kr-brows"><path d="M95 89 Q104 84 112 88" fill="none" stroke="' + c.hair + '" stroke-width="' + bw + '" stroke-linecap="round"/><path d="M128 88 Q136 84 145 89" fill="none" stroke="' + c.hair + '" stroke-width="' + bw + '" stroke-linecap="round"/></g>');
    // mata
    o.push('<g class="kr-eyes"><ellipse cx="104" cy="103" rx="5.6" ry="7.2" fill="#24170f"/><ellipse cx="136" cy="103" rx="5.6" ry="7.2" fill="#24170f"/>' +
      '<circle cx="106" cy="100" r="2" fill="#fff"/><circle cx="138" cy="100" r="2" fill="#fff"/>' +
      (c.lashes ? '<path d="M97 99 L94 96 M143 99 L146 96" stroke="#24170f" stroke-width="2" stroke-linecap="round"/>' : '') + '</g>');
    if (c.glasses) o.push('<g fill="none" stroke="#2b2b2b" stroke-width="2.6"><rect x="91" y="93" width="26" height="20" rx="7"/><rect x="123" y="93" width="26" height="20" rx="7"/><path d="M117 101 L123 101 M91 100 L80 98 M149 100 L160 98"/></g>');
    // hidung
    o.push('<path d="M120 108 Q116 117 121 119" fill="none" stroke="' + c.skinDark + '" stroke-width="2.4" stroke-linecap="round"/>');
    if (c.mustache) o.push('<path d="M106 124 Q113 119 120 123 Q127 119 134 124 Q127 127 120 125 Q113 127 106 124 Z" fill="' + c.hair + '"/>');
    // mulut (3 bentuk: m0 tertutup, m1 setengah, m2 terbuka)
    o.push('<g class="kr-mouth">' +
      '<path class="m0" d="M110 128 Q120 136 130 128" fill="none" stroke="#7a3328" stroke-width="3" stroke-linecap="round"/>' +
      '<path class="m1" d="M109 127 Q120 139 131 127 Q120 131 109 127 Z" fill="#6b241d" stroke="#6b241d" stroke-width="1.5" stroke-linejoin="round"/>' +
      '<g class="m2"><path d="M107 125 Q120 147 133 125 Q120 129 107 125 Z" fill="#6b241d" stroke="#6b241d" stroke-width="1.5" stroke-linejoin="round"/><ellipse cx="120" cy="137" rx="6" ry="3.4" fill="#e3746f"/></g>' +
      '</g>');
    // helm
    if (c.helmet) {
      var hd = shade(c.helmet, -0.14);
      o.push('<path d="M70 90 Q68 30 120 26 Q172 30 170 90 Z" fill="' + c.helmet + '" stroke="' + line + '" stroke-width="1.5"/>');
      o.push('<path d="M113 27 Q120 25 127 27 L130 90 L110 90 Z" fill="' + hd + '"/>');
      o.push('<path d="M56 88 Q120 76 184 88 L186 98 Q120 88 54 98 Z" fill="' + hd + '" stroke="' + line + '" stroke-width="1.5"/>');
      o.push('<path d="M84 46 Q92 36 104 34" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".55"/>');
    }
    o.push('</g>'); // kr-head
    o.push('</g></svg>');
    return o.join('');
  }

  window.StudioKarakter = { list: LIST, svg: svg };
})();
