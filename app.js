/* ================= INZAKI GROUP — Charcoal Business Portal =================
   app.js — compatible with current Supabase sales schema
   ========================================================================== */

const $=s=>document.querySelector(s), $$=s=>document.querySelectorAll(s);
const today=new Date().toISOString().slice(0,10);
$$('input[type=date]').forEach(x=>x.value=today);

let S={raw:[],batches:[],sales:[],expenses:[]};
let isAdmin=false;
const ADMIN_PAGES=['raw','batch','sales','expenses'];

const configOk=typeof SUPABASE_URL!=='undefined'&&SUPABASE_URL&&
  !SUPABASE_URL.includes('YOUR-PROJECT')&&
  typeof SUPABASE_ANON_KEY!=='undefined'&&SUPABASE_ANON_KEY&&
  !SUPABASE_ANON_KEY.includes('YOUR-ANON');

const sb=(configOk&&window.supabase)
  ?window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY)
  :null;

if(!configOk&&$('#configBanner'))
  $('#configBanner').classList.add('show');

const rp=n=>new Intl.NumberFormat('id-ID',{
  style:'currency',
  currency:'IDR',
  maximumFractionDigits:0
}).format(+n||0);

const kg=n=>(+n||0).toLocaleString('id-ID',{
  maximumFractionDigits:2
})+' kg';

const esc=x=>String(x??'').replace(/[&<>"']/g,m=>({
  '&':'&amp;',
  '<':'&lt;',
  '>':'&gt;',
  '"':'&quot;',
  "'":'&#39;'
}[m]));

const day=d=>new Date(String(d||'')+'T00:00:00');

const last7=d=>{
  let s=new Date();
  s.setHours(0,0,0,0);
  s.setDate(s.getDate()-6);
  return day(d)>=s;
};

const thisMonth=d=>{
  let n=new Date(),x=day(d);
  return x.getFullYear()===n.getFullYear() &&
         x.getMonth()===n.getMonth();
};

const signed=n=>`<span class="${(+n||0)<0?'neg':'pos'}">${rp(n)}</span>`;

const B=id=>S.batches.find(x=>String(x.id)===String(id));

const sold=id=>S.sales
  .filter(x=>String(x.batchId)===String(id))
  .reduce((a,x)=>a+x.qty,0);

const empty=n=>`<tr><td colspan="${n}" style="text-align:center;color:#929a93">Belum ada data</td></tr>`;

function requireAdmin(){
  if(!isAdmin){
    alert('Silakan login sebagai admin terlebih dahulu.');
    return false;
  }
  return true;
}

function validUuid(v){
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(String(v||''));
}

function landed(r){
  const q=+r.originalQty||+r.qty||+r.stock||1;
  return (+r.price||+r.purchasePrice||0)
    +((+r.transport||0)+(+r.other||0))/q;
}

function parseInvoice(v){
  const s=String(v||'');
  const m=s.match(/^INV-(\d{8})-(\d+)\|BATCH=(.*?)\|CUSTOMER=(.*)$/);

  return m
    ? {
        batchCode:m[3],
        customer:m[4],
        invoice:s
      }
    : {
        batchCode:'',
        customer:'',
        invoice:s
      };
}

function makeInvoice(date,batch,customer){
  const d=String(date||'').replaceAll('-','');

  return `INV-${d}-${Date.now().toString().slice(-6)}|BATCH=${batch?.code||''}|CUSTOMER=${customer||''}`;
}


/* ================= DB -> JS MAPPING ================= */

const mapRaw=r=>({
  id:r.id,
  date:r.date,
  name:r.name,
  qty:+(r.qty??r.stock??0),
  originalQty:+(r.original_qty??r.qty??r.stock??0),
  price:+(r.price??r.purchase_price??0),
  purchasePrice:+(r.purchase_price??r.price??0),
  transport:+(r.transport??0),
  other:+(r.other??0),
  supplier:r.supplier
});

const mapBatch=b=>({
  id:b.id,
  code:b.code,
  date:b.date,
  rawId:b.raw_id,
  rawName:b.raw_name,
  input:+b.input||0,
  output:+b.output||0,
  loss:+b.loss||0,
  lossPct:+b.loss_pct||0,
  totalHpp:+b.total_hpp||0,
  hppkg:+b.hpp_kg||0,
  labor:+b.labor||0,
  energy:+b.energy||0,
  other:+b.other||0,
  note:b.note
});

const mapSale=x=>{
  const p=parseInvoice(x.invoice_no);

  return {
    id:x.id,
    date:x.sale_date,
    batchId:null,
    batchCode:p.batchCode,
    customer:p.customer,
    customerId:x.customer_id,
    productId:x.product_id,
    qty:+x.quantity||0,
    price:+x.price_per_kg||0,
    discount:+x.discount||0,
    total:(+x.quantity||0)*(+x.price_per_kg||0)-(+x.discount||0),
    status:x.status,
    invoiceNo:x.invoice_no
  };
};

const mapExpense=x=>({
  id:x.id,
  date:x.date,
  cat:x.cat,
  desc:x.desc,
  amount:+x.amount||0
});


/* ================= LOAD ================= */

async function loadAll(){

  if(!sb)return;

  const [a,b,c,d]=await Promise.all([
    sb.from('raw_materials')
      .select('*')
      .order('created_at',{ascending:true}),

    sb.from('batches')
      .select('*')
      .order('id',{ascending:true}),

    sb.from('sales')
      .select('*')
      .order('created_at',{ascending:true}),

    sb.from('expenses')
      .select('*')
      .order('id',{ascending:true})
  ]);

  if(a.error)console.error('raw_materials:',a.error);
  if(b.error)console.error('batches:',b.error);
  if(c.error)console.error('sales:',c.error);
  if(d.error)console.error('expenses:',d.error);

  if(a.error||b.error||c.error||d.error){

    const err=a.error||b.error||c.error||d.error;

    alert('Gagal membaca database: '+err.message);

    return false;
  }

  S.raw=(a.data||[]).map(mapRaw);
  S.batches=(b.data||[]).map(mapBatch);
  S.sales=(c.data||[]).map(mapSale);
  S.expenses=(d.data||[]).map(mapExpense);

  return true;
}


/* ================= REALTIME ================= */

let refetchTimer=null;

function scheduleRefetch(){

  clearTimeout(refetchTimer);

  refetchTimer=setTimeout(async()=>{
    await loadAll();
    render();
  },400);
}

function subscribeRealtime(){

  if(!sb)return;

  sb.channel('inzaki-live')

    .on(
      'postgres_changes',
      {
        event:'*',
        schema:'public',
        table:'raw_materials'
      },
      scheduleRefetch
    )

    .on(
      'postgres_changes',
      {
        event:'*',
        schema:'public',
        table:'batches'
      },
      scheduleRefetch
    )

    .on(
      'postgres_changes',
      {
        event:'*',
        schema:'public',
        table:'sales'
      },
      scheduleRefetch
    )

    .on(
      'postgres_changes',
      {
        event:'*',
        schema:'public',
        table:'expenses'
      },
      scheduleRefetch
    )

    .subscribe();
}


/* ================= AUTH ================= */

function applyAdminVisibility(){

  $$('.admin-only')
    .forEach(el=>el.style.display=isAdmin?'':'none');
}

function applyAuthState(session){

  isAdmin=!!session;

  document.body.classList.toggle('is-admin',isAdmin);

  applyAdminVisibility();

  if($('#loginBtn'))
    $('#loginBtn').style.display=isAdmin?'none':'block';

  if($('#logoutBtn'))
    $('#logoutBtn').style.display=isAdmin?'block':'none';

  if($('#authStatus'))
    $('#authStatus').textContent=isAdmin
      ?('🟢 Admin — '+session.user.email)
      :'🔒 Mode Publik — lihat saja';
}

async function initAuth(){

  if(!sb)return;

  const {data:{session}}=await sb.auth.getSession();

  applyAuthState(session);

  sb.auth.onAuthStateChange((_event,s)=>{
    applyAuthState(s);
  });
}


/* ================= NAVIGATION ================= */

function go(p){

  if(ADMIN_PAGES.includes(p)&&!isAdmin)
    p='dashboard';

  $$('.page')
    .forEach(x=>x.classList.toggle('active',x.id===p));

  $$('nav button')
    .forEach(x=>x.classList.toggle(
      'active',
      x.dataset.page===p
    ));

  const title=
    p==='dashboard'?'Dashboard Global':
    p==='raw'?'Bahan Baku':
    p==='batch'?'Produksi Batch':
    p==='finished'?'Barang Jadi':
    p==='reports'?'Laba & Laporan':
    p[0].toUpperCase()+p.slice(1);

  if($('#title'))
    $('#title').textContent=title;

  if($('#modal'))
    $('#modal').classList.remove('show');
}

$$('nav button')
  .forEach(x=>x.onclick=()=>go(x.dataset.page));

if($('#quick'))
  $('#quick').onclick=()=>{
    if(requireAdmin())
      $('#modal').classList.add('show');
  };

$$('#modal [data-go]')
  .forEach(x=>x.onclick=()=>go(x.dataset.go));


/* ================= RAW MATERIAL ================= */

function rawPreview(){

  const f=$('#rawForm');

  if(!f)return;

  const q=+f.qty.value||0;
  const p=+f.price.value||0;
  const t=+f.transport.value||0;
  const o=+f.other.value||0;

  if($('#rawTotal'))
    $('#rawTotal').textContent=rp(q*p+t+o);
}

['qty','price','transport','other']
.forEach(n=>{

  const el=document.querySelector(
    `#rawForm [name="${n}"]`
  );

  if(el)
    el.addEventListener('input',rawPreview);
});

rawPreview();

if($('#rawForm'))
$('#rawForm').onsubmit=async e=>{

  e.preventDefault();

  if(!requireAdmin())return;

  const x=Object.fromEntries(new FormData(e.target));
  const q=+x.qty;

  if(q<=0)
    return alert('Qty bahan baku harus lebih dari 0.');

  const payload={
    date:x.date,
    name:x.name,
    qty:q,
    original_qty:q,
    price:+x.price||0,
    transport:+x.transport||0,
    other:+x.other||0,
    supplier:x.supplier||null
  };

  const {data,error}=await sb
    .from('raw_materials')
    .insert(payload)
    .select()
    .single();

  if(error)
    return alert(
      'Gagal simpan bahan baku: '+error.message
    );

  S.raw.push(mapRaw(data));

  render();

  e.target.reset();
  e.target.date.value=today;

  rawPreview();

  alert('Bahan baku berhasil dicatat.');
};


/* ================= BATCH ================= */

if($('#batchForm'))
$('#batchForm').onsubmit=async e=>{

  e.preventDefault();

  if(!requireAdmin())return;

  const x=Object.fromEntries(new FormData(e.target));

  const r=S.raw.find(
    z=>String(z.id)===String(x.rawId)
  );

  const input=+x.inputQty;
  const output=+x.outputQty;

  if(!r||input<=0||input>r.qty)
    return alert('Stok bahan baku tidak mencukupi.');

  if(output<=0||output>input)
    return alert(
      'Hasil produksi harus lebih dari 0 dan tidak boleh melebihi input.'
    );

  const material=input*landed(r);

  const total=
    material+
    (+x.labor||0)+
    (+x.energy||0)+
    (+x.other||0);

  const loss=input-output;

  const year=String(x.date).slice(0,4);

  const n=
    S.batches.filter(
      z=>String(z.code).startsWith(`BCH-${year}-`)
    ).length+1;

  const payload={
    code:`BCH-${year}-${String(n).padStart(3,'0')}`,
    date:x.date,
    raw_id:r.id,
    raw_name:r.name,
    input,
    output,
    loss,
    loss_pct:loss/input*100,
    total_hpp:total,
    hpp_kg:total/output,
    labor:+x.labor||0,
    energy:+x.energy||0,
    other:+x.other||0,
    note:x.note||null
  };

  const {data,error}=await sb
    .from('batches')
    .insert(payload)
    .select()
    .single();

  if(error)
    return alert(
      'Gagal simpan batch: '+error.message
    );

  const newQty=r.qty-input;

  const {error:e2}=await sb
    .from('raw_materials')
    .update({qty:newQty})
    .eq('id',r.id);

  if(e2)
    return alert(
      'Batch tersimpan, tetapi stok bahan gagal diperbarui: '+e2.message
    );

  r.qty=newQty;

  S.batches.push(mapBatch(data));

  render();

  e.target.reset();
  e.target.date.value=today;

  alert('Batch produksi berhasil dibuat.');
};


/* ================= SALES ================= */

if($('#salesForm'))
$('#salesForm').onsubmit=async e=>{

  e.preventDefault();

  if(!requireAdmin())return;

  const x=Object.fromEntries(new FormData(e.target));

  const b=B(x.batchId);
  const qty=+x.qty;
  const price=+x.price;

  if(!b)
    return alert('Batch tidak ditemukan.');

  if(qty<=0)
    return alert(
      'Qty penjualan harus lebih dari 0.'
    );

  const remaining=
    b.output-sold(b.id);

  if(qty>remaining)
    return alert(
      `Stok batch tidak mencukupi. Sisa: ${kg(remaining)}`
    );

  if(price<0)
    return alert('Harga jual tidak valid.');


  /*
    Struktur sales Supabase sekarang:

    id             uuid
    invoice_no     text
    customer_id    uuid
    product_id     uuid
    sale_date      date
    quantity       numeric
    price_per_kg   numeric
    discount       numeric
    status         text

    Form aplikasi menyediakan nama pelanggan,
    bukan UUID customer_id.

    Karena itu nama pelanggan TIDAK dimasukkan
    ke customer_id.
  */

  const invoiceNo=
    makeInvoice(
      x.date,
      b,
      x.customer
    );

  const payload={
    invoice_no:invoiceNo,
    sale_date:x.date,
    quantity:qty,
    price_per_kg:price,
    discount:0,
    status:x.status||'Lunas'
  };


  /*
    Hanya kirim customer_id/product_id
    jika benar-benar UUID.
  */

  if(validUuid(x.customerId))
    payload.customer_id=x.customerId;

  if(validUuid(x.productId))
    payload.product_id=x.productId;


  const {data,error}=await sb
    .from('sales')
    .insert(payload)
    .select()
    .single();

  if(error){

    const msg=String(error.message||'');

    if(
      /customer_id|product_id|not-null|null value/i
      .test(msg)
    ){

      return alert(
        'Penjualan gagal karena kolom customer_id/product_id pada tabel sales wajib diisi. '+
        'Kolom tersebut membutuhkan UUID, bukan nama pelanggan seperti "Sukabumi".'
      );
    }

    return alert(
      'Gagal simpan penjualan: '+msg
    );
  }

  S.sales.push(mapSale(data));

  render();

  e.target.reset();
  e.target.date.value=today;

  alert('Penjualan berhasil dicatat.');
};


/* ================= EXPENSES ================= */

if($('#expenseForm'))
$('#expenseForm').onsubmit=async e=>{

  e.preventDefault();

  if(!requireAdmin())return;

  const x=Object.fromEntries(
    new FormData(e.target)
  );

  const payload={
    date:x.date,
    cat:x.cat,
    desc:x.desc,
    amount:+x.amount||0
  };

  const {data,error}=await sb
    .from('expenses')
    .insert(payload)
    .select()
    .single();

  if(error)
    return alert(
      'Gagal simpan pengeluaran: '+error.message
    );

  S.expenses.push(mapExpense(data));

  render();

  e.target.reset();
  e.target.date.value=today;

  alert('Pengeluaran berhasil dicatat.');
};


/* ================= BACKUP ================= */

if($('#backup'))
$('#backup').onclick=()=>{

  const a=document.createElement('a');

  a.href=URL.createObjectURL(
    new Blob(
      [JSON.stringify(S,null,2)],
      {type:'application/json'}
    )
  );

  a.download='inzaki-charcoal-backup.json';

  a.click();
};


/* ================= RESET ================= */

if($('#reset'))
$('#reset').onclick=async()=>{

  if(!requireAdmin())return;

  if(!confirm(
    'Hapus SEMUA data dari server untuk semua orang? Tindakan ini tidak bisa dibatalkan.'
  ))
    return;

  const jobs=[
    sb.from('sales')
      .delete()
      .not('id','is',null),

    sb.from('batches')
      .delete()
      .not('id','is',null),

    sb.from('raw_materials')
      .delete()
      .not('id','is',null),

    sb.from('expenses')
      .delete()
      .not('id','is',null)
  ];

  const rs=await Promise.all(jobs);

  const err=rs.find(x=>x.error);

  if(err)
    return alert(
      'Gagal menghapus sebagian data: '+
      err.error.message
    );

  await loadAll();
  render();
};

document.addEventListener(
  'change',
  e=>{
    if(e.target?.id==='chartYear')
      drawCharts();
  }
);


/* ================= LOGIN ================= */

if($('#loginBtn'))
$('#loginBtn').onclick=()=>{

  $('#loginError').textContent='';

  $('#loginModal').classList.add('show');
};

if($('#loginCancel'))
$('#loginCancel').onclick=()=>
  $('#loginModal').classList.remove('show');

if($('#loginForm'))
$('#loginForm').onsubmit=async e=>{

  e.preventDefault();

  if(!sb){

    $('#loginError').textContent=
      'Supabase belum dikonfigurasi.';

    return;
  }

  const x=Object.fromEntries(
    new FormData(e.target)
  );

  $('#loginError').textContent='Masuk...';

  const {error}=
    await sb.auth.signInWithPassword({
      email:x.email,
      password:x.password
    });

  if(error){

    $('#loginError').textContent=
      'Login gagal: '+error.message;

    return;
  }

  $('#loginError').textContent='';

  $('#loginModal').classList.remove('show');

  e.target.reset();
};

if($('#logoutBtn'))
$('#logoutBtn').onclick=async()=>{

  if(sb)
    await sb.auth.signOut();

  go('dashboard');
};


/* ================= INIT ================= */

(async function init(){

  if(!sb){

    render();

    return;
  }

  await initAuth();

  await loadAll();

  render();

  subscribeRealtime();

})();
