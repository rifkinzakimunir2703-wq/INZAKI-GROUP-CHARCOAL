/* INZAKI GROUP — upgrade.js: ilustrasi banner tiap halaman + kilau hero. Tidak menyentuh data/logika. */
(function(){
const nut=(x,y,r)=>`<g class="pb-f" style="animation-delay:${-(x%7)*.4}s"><circle cx="${x}" cy="${y}" r="${r}" fill="#7A5230"/><circle cx="${x}" cy="${y}" r="${r*.72}" fill="#F4F1E4"/><circle cx="${x}" cy="${y}" r="${r*.34}" fill="#CFE6D8"/></g>`;
const coin=(x,y,r)=>`<g class="pb-f" style="animation-delay:${-(x%5)*.5}s"><circle cx="${x}" cy="${y}" r="${r}" fill="#E3B94F" stroke="#B8871F" stroke-width="3"/><text x="${x}" y="${y+r*.3}" text-anchor="middle" font-family="Arial" font-weight="700" font-size="${r*.8}" fill="#7A5A12">Rp</text></g>`;
const ART={
 nuts:nut(205,56,26)+nut(250,62,22)+nut(228,24,20)+nut(276,30,16),
 coins:coin(212,50,24)+coin(258,60,20)+coin(244,22,15),
 bars:'<rect x="200" y="46" width="24" height="38" rx="5" fill="#8FD6A8"/><rect x="234" y="30" width="24" height="54" rx="5" fill="#3DB37B"/><rect x="268" y="12" width="24" height="72" rx="5" fill="#22C55E"/>',
 flame:'<g class="pb-f"><path d="M240 84c-26-4-36-26-18-48 3 12 10 14 14 9-3-14 4-28 16-36 0 16 24 26 24 52 0 14-14 23-36 23z" fill="#F5A524"/><path d="M242 84c-14-2-20-13-11-25 5 7 9 5 10 0 6 6 16 10 12 21-2 4-6 4-11 4z" fill="#F76E7E"/></g>'
};
const MAP={raw:'nuts',batch:'flame',finished:'nuts',sales:'coins',expenses:'coins',debts:'coins',finance:'coins',reports:'bars'};
for(const id in MAP){const b=document.querySelector('#'+id+'>.page-banner');if(b&&!b.querySelector('.pb-art'))b.insertAdjacentHTML('beforeend','<svg class="pb-art" viewBox="0 0 300 90" preserveAspectRatio="xMaxYMid meet" aria-hidden="true">'+ART[MAP[id]]+'</svg>')}
/* halaman yang sudah punya hero bergambar tidak perlu banner ganda */
['finance','deposits'].forEach(id=>{const p=document.getElementById(id);if(p&&p.querySelector('.hero'))p.querySelectorAll(':scope>.page-banner').forEach(b=>b.remove())});
/* kilau bintang di hero dashboard */
const hs=document.querySelector('#dashboard .hero svg');
if(hs)hs.insertAdjacentHTML('beforeend',Array.from({length:9},(_,i)=>`<circle class="pb-tw" cx="${380+i*58}" cy="${30+(i*37)%110}" r="${1.6+(i%3)*.7}" fill="#F8DC85" style="animation-delay:${-i*.5}s"/>`).join(''));
})();
