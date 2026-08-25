const BM={
 base:()=>document.documentElement.dataset.base||'./',cache:{},
 async json(path){if(this.cache[path])return this.cache[path];const r=await fetch(this.base()+path);if(!r.ok)throw new Error(path);return this.cache[path]=await r.json()},
 async jsonOptional(path,fallback){try{return await this.json(path)}catch{return fallback}},
 normalize(s=''){return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()},
 money(n){if(n==null)return '—';return new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(n)},
 number(n){if(n==null)return '—';return new Intl.NumberFormat('es-ES').format(n)},
 getProfile(){try{return JSON.parse(localStorage.getItem('bm_profile')||'null')}catch{return null}},
 setProfile(p){localStorage.setItem('bm_profile',JSON.stringify(p));this.refreshProfileUI()},
 getPrefs(){try{return JSON.parse(localStorage.getItem('bm_prefs')||'{}')}catch{return {}}},
 setPrefs(p){localStorage.setItem('bm_prefs',JSON.stringify(p))},
 refreshProfileUI(){const p=this.getProfile();document.querySelectorAll('[data-municipality-label]').forEach(el=>el.textContent=p?.name||'Seleccionar municipio')},
 statusClass(s){return s==='open'?'ok':s==='announced'||s==='reference'||s==='verified'?'info':s==='pending_review'?'warn':s==='closed'||s==='resolved'?'closed':s==='resolution'?'warn':'info'},
 statusText(s){return ({open:'Abierta',announced:'Anunciada',closed:'Cerrada',resolved:'Resuelta',resolution:'En resolución',reference:'Referencia',pending_review:'Detectada · revisar',verified:'Verificado',framework:'Marco general'})[s]||s},
 populationBand(pop){if(pop==null)return 'Población pendiente';if(pop<=500)return '≤ 500 habitantes';if(pop<=1000)return '501–1.000 habitantes';if(pop<=5000)return '1.001–5.000 habitantes';if(pop<=20000)return '5.001–20.000 habitantes';if(pop<=50000)return '20.001–50.000 habitantes';return '> 50.000 habitantes'},
 costLabel(p){if(p.cost_min!=null||p.cost_max!=null)return `${this.money(p.cost_min)}–${this.money(p.cost_max)}`;return p.cost_band||'Coste por definir'},
 async opportunities(){if(this.cache.__opps)return this.cache.__opps;const curated=await this.json('data/catalog/oportunidades.json');const gen=await this.jsonOptional('data/generated/oportunidades_bdns.json',{items:[]});return this.cache.__opps=[...curated,...((Array.isArray(gen)?gen:gen.items)||[])]},
 async obligations(){if(this.cache.__obls)return this.cache.__obls;const curated=await this.json('data/catalog/obligaciones.json');const gen=await this.jsonOptional('data/generated/normativa_boe.json',{items:[]});return this.cache.__obls=[...curated,...((Array.isArray(gen)?gen:gen.items)||[])]},
 async support(){return this.cache.__support||(this.cache.__support=await this.json('data/catalog/apoyo.json'))},
 matchOpportunity(o,p){
   if(!p)return {label:'Selecciona localidad',level:'unknown',checks:[]};let checks=[],fail=false,unknown=0,route=null;const selectedType=p.entity_type||'municipality';
   // Una entidad de población sin personalidad local se analiza por defecto a través de su ayuntamiento matriz.
   const type=selectedType==='population_entity'?'municipality':selectedType;
   if(selectedType==='population_entity'&&p.parent_municipality){checks.push(['pass',`Vía Ayuntamiento de ${p.parent_municipality}`]);route='parent_municipality'}
   if(o.beneficiary_types?.includes('specific')){const ids=[p.id,p.parent_municipality_id].filter(Boolean);const ok=o.specific_entities?.some(id=>ids.includes(id));checks.push([ok?'pass':'fail','Entidad específica']);if(!ok)fail=true}
   else if(o.beneficiary_types?.length){
     let ok=o.beneficiary_types.includes(type)||(o.beneficiary_types.includes('local_entity')&&(type==='municipality'||type==='eatim'));
     if(!ok&&selectedType==='eatim'&&p.parent_municipality&&o.beneficiary_types.includes('municipality')){checks.push(['unknown',`Posible vía Ayuntamiento de ${p.parent_municipality}`]);unknown++;route='parent_municipality'}
     else {checks.push([ok?'pass':'fail','Tipo de beneficiario']);if(!ok)fail=true}
   }else{checks.push(['unknown','Beneficiario']);unknown++}
   if(o.population_rules?.length){let pop;if(route==='parent_municipality'||selectedType==='population_entity')pop=p.municipal_population;else pop=p.population;pop=pop??this.getPrefs().population;if(pop==null){checks.push(['unknown',route==='parent_municipality'?'Población del municipio matriz':'Población']);unknown++}else for(const rule of o.population_rules){let ok=true;if(rule.max!=null)ok=pop<=rule.max;if(rule.min!=null)ok=ok&&pop>=rule.min;checks.push([ok?'pass':'fail',`${route==='parent_municipality'?'Población municipio matriz':'Población'} ${rule.max?'≤ '+this.number(rule.max):''}`]);if(!ok)fail=true}}
   if(o.territories?.length){const vals=[p.autonomous_region,p.province,p.name,p.parent_municipality];const ok=o.territories.some(t=>vals.some(v=>this.normalize(v)===this.normalize(t)));checks.push([ok?'pass':'fail','Territorio']);if(!ok)fail=true}
   else if(o.scope&&['España','España / despliegues estatales y autonómicos'].includes(o.scope))checks.push(['pass','Ámbito nacional']);else if(!o.scope||o.scope==='Por determinar'){checks.push(['unknown','Ámbito territorial']);unknown++}
   if(fail)return {label:'No parece aplicable',level:'fail',checks,route};if(o.review_status==='pending'||o.status==='pending_review')return {label:'Candidato · comprobar',level:'unknown',checks,route};if(unknown)return {label:route==='parent_municipality'?'Revisar vía municipio matriz':'Buen encaje aparente · comprobar',level:'unknown',checks,route};return {label:'Encaje aparente alto',level:'pass',checks,route}
 },
 supportFor(p,all){if(!p)return all.filter(x=>x.coverage==='España');const provincial=all.filter(x=>x.province&&this.normalize(x.province)===this.normalize(p.province));const generic=all.filter(x=>x.coverage==='España');return [...provincial,...generic]},
 projectScore(p,profile){let s=0;const prefs=this.getPrefs();const priorities=prefs.priorities||[];for(const t of p.tags||[])if(priorities.includes(t)||priorities.includes(p.category))s+=3;if(profile?.population!=null&&profile.population<=5000)s+=1;if(['baja','media'].includes(p.complexity))s+=1;return s},
 async placeManifest(){return this.cache.__placeManifest||(this.cache.__placeManifest=await this.json('data/localidades/manifest.json'))},
 placeTokens(q=''){const stop=new Set(['el','la','los','las','de','del','da','do','das','dos','a','o','en','y','i','l']);return this.normalize(q).split(/\s+/).filter(t=>t&&t.length>=2&&!stop.has(t))},
 async featuredPlaces(){const d=await this.jsonOptional('data/localidades/featured.json',{items:[]});return d.items||[]},
 async searchPlaces(q=''){const toks=this.placeTokens(q);if(!toks.length)return this.featuredPlaces();const manifest=await this.placeManifest();const keys=[...new Set(toks.map(t=>t.slice(0,manifest.shard_prefix_length||2)))];let items=[];for(const key of keys){if(!manifest.shards?.[key])continue;const d=await this.jsonOptional(`data/localidades/shards/${key}.json`,{items:[]});items.push(...(d.items||[]))}const seen=new Set();items=items.filter(x=>{if(seen.has(x.id))return false;seen.add(x.id);const h=this.normalize(`${x.name||''} ${x.parent_municipality||''} ${x.province||''} ${x.autonomous_region||''}`);return toks.every(t=>h.includes(t))});items.sort((a,b)=>{const an=this.normalize(a.name),bn=this.normalize(b.name),q0=toks[0]||'';const ae=an===this.normalize(q),be=bn===this.normalize(q);if(ae!==be)return ae?-1:1;const ap=an.startsWith(q0),bp=bn.startsWith(q0);if(ap!==bp)return ap?-1:1;return a.name.localeCompare(b.name,'es')});return items.slice(0,60)},
 async loadPlace(id){if(!id)return null;const current=this.getProfile();if(current?.id===id&&!current?._lite)return current;let pc=/^\d{5}/.test(id)?id.slice(0,2):null;if(!pc){const map=await this.jsonOptional('data/localidades/id-map.json',{});pc=map[id]}if(!pc)return null;const d=await this.jsonOptional(`data/localidades/provinces/${pc}.json`,{items:[]});return (d.items||[]).find(x=>x.id===id)||null},
 async openSelector(){const ov=document.querySelector('#municipality-overlay');if(!ov)return;ov.classList.add('open');const input=ov.querySelector('input');input.focus();if(!ov.querySelector('.catalog-health')){const h=document.createElement('div');h.className='catalog-health';ov.querySelector('.municipality-results')?.before(h)}try{const m=await this.placeManifest();const h=ov.querySelector('.catalog-health');if(h){const total=m.total_entities||0;h.className='catalog-health '+(total<1000?'catalog-demo':'catalog-full');h.innerHTML=total<1000?`<strong>Catálogo de demostración: ${this.number(total)} localidades.</strong> Ejecuta <code>ACTUALIZAR_LOCALIDADES.bat</code> para cargar España completa.`:`<strong>Catálogo nacional activo:</strong> ${this.number(total)} localidades indexadas · búsqueda por fragmentos.`}}catch{}if(!ov.dataset.ready){ov.dataset.ready='1';await renderMunicipalities(ov,input.value||'')}},
 closeSelector(){document.querySelector('#municipality-overlay')?.classList.remove('open')},
 async services(){return this.cache.__services||(this.cache.__services=await this.json('data/catalog/servicios_comunes.json'))},
 async playbooks(){return this.cache.__playbooks||(this.cache.__playbooks=await this.json('data/catalog/playbooks.json'))},
 async signals(){if(this.cache.__signals)return this.cache.__signals;const curated=await this.json('data/catalog/observatorio.json');const gen=await this.jsonOptional('data/generated/novedades_diarias.json',{items:[]});return this.cache.__signals=[...curated,...((gen&&gen.items)||[])]},
 async dailyNews(){return this.jsonOptional('data/generated/novedades_diarias.json',{items:[],watched_pages:[],errors:[]})},
 getCapacity(){try{return JSON.parse(localStorage.getItem('bm_capacity')||'{}')}catch{return {}}},
 setCapacity(x){localStorage.setItem('bm_capacity',JSON.stringify(x||{}))},
 getWorkspace(){try{return JSON.parse(localStorage.getItem('bm_workspace')||'[]')}catch{return []}},
 setWorkspace(items){localStorage.setItem('bm_workspace',JSON.stringify(items||[]));document.querySelectorAll('[data-workspace-count]').forEach(x=>x.textContent=(items||[]).length)},
 isSaved(type,id){return this.getWorkspace().some(x=>x.type===type&&x.id===id)},
 saveItem(item){let w=this.getWorkspace();const i=w.findIndex(x=>x.type===item.type&&x.id===item.id);if(i>=0)w.splice(i,1);else w.unshift({...item,saved_at:new Date().toISOString()});this.setWorkspace(w);return i<0},
 daysUntil(date){if(!date)return null;const d=new Date(String(date).slice(0,10)+'T23:59:59');if(Number.isNaN(+d))return null;return Math.ceil((d-Date.now())/86400000)},
 opportunityScore(o,p){const m=this.matchOpportunity(o,p);if(m.level==='fail')return -99;let s=m.level==='pass'?8:2;const prefs=this.getPrefs(),priorities=prefs.priorities||[];for(const t of o.topics||[])if(priorities.includes(t))s+=4;const days=this.daysUntil(o.deadline);if(o.status==='open')s+=6;if(days!=null&&days>=0&&days<=30)s+=4;else if(days!=null&&days>30&&days<=90)s+=2;if(o.review_status==='pending'||o.status==='pending_review')s-=3;return s},
 projectFitScore(project,p){let s=this.projectScore(project,p);const c=this.getCapacity();if(c.technical==='low'&&project.complexity==='alta')s-=3;if(c.technical==='high'&&project.complexity==='alta')s+=1;if(c.investment==='low'&&['€€€','€€€€'].includes(project.cost_band))s-=3;if(c.investment==='medium'&&project.cost_band==='€€€€')s-=2;return s},
 async relatedServices(tags=[]){const ss=await this.services();const n=new Set((tags||[]).map(x=>this.normalize(x)));return ss.filter(s=>(s.topics||[]).some(t=>n.has(this.normalize(t))))},
 async indicatorSources(){return this.cache.__indicatorSources||(this.cache.__indicatorSources=await this.json('data/catalog/indicadores_fuentes.json'))},
 async territorialDataset(){return this.cache.__territorial||(this.cache.__territorial=await this.jsonOptional('data/generated/indicadores_territoriales.json',{items:[]}))},
 async incomeDataset(){return this.cache.__income||(this.cache.__income=await this.jsonOptional('data/generated/renta_ine.json',{items:[]}))},
 async territorialBenchmark(){return this.cache.__benchmark||(this.cache.__benchmark=await this.jsonOptional('data/generated/benchmark_territorial.json',{groups:{},peers:{}}))},
 municipalCode(profile){if(!profile)return null;if(profile.entity_type==='municipality')return profile.ine_code||(/^[0-9]{5}$/.test(profile.id||'')?profile.id:null);return profile.parent_municipality_id||profile.ine_code||null},
 async metricsFor(profile){const code=this.municipalCode(profile);if(!code)return {ine_code:null};const [t,r]=await Promise.all([this.territorialDataset(),this.incomeDataset()]);const a=(t.items||[]).find(x=>x.ine_code===code)||{};const b=(r.items||[]).find(x=>x.ine_code===code)||{};return {...a,...b,ine_code:code}},
 async territorialSignals(metrics){const rules=await this.json('data/catalog/reglas_inteligencia.json');const out=[];for(const rule of rules.signals||[]){const v=metrics?.[rule.metric];if(typeof v!=='number')continue;const w=rule.when||{};let ok=true;if(w.lt!=null)ok=ok&&v<w.lt;if(w.lte!=null)ok=ok&&v<=w.lte;if(w.gt!=null)ok=ok&&v>w.gt;if(w.gte!=null)ok=ok&&v>=w.gte;if(w.eq!=null)ok=ok&&v===w.eq;if(ok)out.push({...rule,value:v})}return out},
 benchmarkBand(pop){if(pop==null)return 'unknown';if(pop<=500)return 'le500';if(pop<=1000)return '501_1000';if(pop<=5000)return '1001_5000';if(pop<=20000)return '5001_20000';if(pop<=50000)return '20001_50000';return 'gt50000'},
 async peerContext(profile,metrics){const b=await this.territorialBenchmark();const pop=metrics?.population??profile?.municipal_population??profile?.population;const key=this.benchmarkBand(pop);return {group:key,benchmark:b.groups?.[key]||null,national:b.groups?.national||null,peers:b.peers?.[this.municipalCode(profile)]||[],method:b.method}},
 metricFormat(id,v){if(v==null)return 'Sin dato';const f={population:x=>this.number(x)+' hab.',population_change:x=>(x>0?'+':'')+Number(x).toLocaleString('es-ES',{maximumFractionDigits:1})+' %',density:x=>Number(x).toLocaleString('es-ES',{maximumFractionDigits:1})+' hab/km²',mean_age:x=>Number(x).toLocaleString('es-ES',{maximumFractionDigits:1})+' años',over65:x=>Number(x).toLocaleString('es-ES',{maximumFractionDigits:1})+' %',broadband100:x=>Number(x).toLocaleString('es-ES',{maximumFractionDigits:1})+' %',pharmacies:x=>this.number(x),primary_schools:x=>this.number(x),highway_minutes:x=>Number(x).toLocaleString('es-ES',{maximumFractionDigits:0})+' min',hospital_minutes:x=>Number(x).toLocaleString('es-ES',{maximumFractionDigits:0})+' min',income_per_person:x=>this.money(x)+'/persona'};return (f[id]||((x)=>String(x)))(v)},
 async strategicPortfolio(profile){const [projects,metrics]=await Promise.all([this.json('data/catalog/proyectos.json'),this.metricsFor(profile)]);const signals=await this.territorialSignals(metrics);const tags=[...new Set(signals.flatMap(s=>s.tags||[]))];const prefs=this.getPrefs();const priorities=[...new Set([...(prefs.priorities||[]),...tags])];const scored=projects.map(p=>{let score=this.projectFitScore(p,profile);for(const t of p.tags||[])if(priorities.includes(t)||priorities.includes(p.category))score+=3;return {p,score}}).sort((a,b)=>b.score-a.score);const used=new Set();const take=(filter,n)=>{const out=[];for(const x of scored){if(used.has(x.p.id)||!filter(x.p))continue;out.push(x.p);used.add(x.p.id);if(out.length>=n)break}return out};return {metrics,signals,year1:take(p=>['baja','media'].includes(p.complexity)&&!['€€€€'].includes(p.cost_band),6),year3:take(p=>true,6),year5:take(p=>p.complexity==='alta'||['€€€','€€€€'].includes(p.cost_band),5),principle:'La cartera es orientativa: prioriza encaje, capacidad declarada y señales territoriales; no sustituye planificación, financiación ni evaluación técnica.'}},
 async build90DayPlan(profile){const [projects,opps,obls,support,services]=await Promise.all([this.json('data/catalog/proyectos.json'),this.opportunities(),this.obligations(),this.support(),this.services()]);const ps=[...projects].sort((a,b)=>this.projectFitScore(b,profile)-this.projectFitScore(a,profile)).slice(0,6);const os=[...opps].map(o=>({o,score:this.opportunityScore(o,profile),match:this.matchOpportunity(o,profile)})).filter(x=>x.score>-90).sort((a,b)=>b.score-a.score).slice(0,5);const curated=obls.filter(o=>o.review_status!=='pending').filter(o=>['critico','alto'].includes(o.impact)).slice(0,5);const su=this.supportFor(profile,support).slice(0,4);const tags=[...new Set(ps.flatMap(x=>x.tags||[]))];const sv=services.filter(x=>(x.topics||[]).some(t=>tags.includes(t))).slice(0,5);return {generated_at:new Date().toISOString(),profile,projects:ps,opportunities:os,obligations:curated,support:su,services:sv,phases:[{range:'0–30 días',goal:'Diagnosticar y evitar compras prematuras',actions:[`Confirmar las 2–3 prioridades reales de ${profile?.name||'la localidad'}.`,...curated.slice(0,2).map(x=>'Revisar: '+x.title),...su.slice(0,1).map(x=>'Comprobar apoyo disponible: '+x.title),...sv.slice(0,1).map(x=>'Comprobar servicio común: '+x.title)]},{range:'31–60 días',goal:'Convertir prioridades en proyectos financiables',actions:[...ps.slice(0,3).map(x=>'Definir alcance mínimo de: '+x.title),...os.slice(0,2).map(x=>'Analizar requisitos de: '+x.o.title)]},{range:'61–90 días',goal:'Decidir y preparar ejecución',actions:[...ps.slice(0,2).map(x=>'Preparar decisión/contratación para: '+x.title),'Cerrar responsables, costes recurrentes, indicadores y calendario de cada actuación seleccionada.']} ]}},
 download(filename,content,type='application/json'){const b=new Blob([content],{type});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=filename;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500)},
 escapeHtml(s=''){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
};
async function renderMunicipalities(ov,q){const out=ov.querySelector('.municipality-results');if(!out)return;const token=(ov._requestToken||0)+1;ov._requestToken=token;const clean=String(q||'').trim();if(clean&&BM.normalize(clean).replace(/\s+/g,'').length<2){out.innerHTML='<div class="empty">Escribe al menos 2 caracteres. Brújula cargará solo el fragmento necesario del catálogo nacional.</div>';return}out.innerHTML='<div class="empty">Buscando en el catálogo local…</div>';const items=await BM.searchPlaces(clean);if(token!==ov._requestToken)return;ov._items=items;const manifest=await BM.placeManifest();const noResult=manifest.total_entities<1000?'<div class="empty"><strong>El catálogo nacional todavía no está cargado.</strong><br>Ahora solo hay datos de demostración. Ejecuta <code>ACTUALIZAR_LOCALIDADES.bat</code> y vuelve a abrir Brújula.</div>':'<div class="empty">No encuentro esa localidad en el catálogo nacional cargado. Comprueba la ortografía o prueba con parte del nombre.</div>';out.innerHTML=items.map(x=>`<button class="municipality-option" data-mid="${x.id}"><strong>${x.name}</strong><br><span class="small muted">${x.entity_type==='eatim'?'EATIM · ':x.entity_type==='population_entity'?'Entidad de población · ':''}${x.parent_municipality?'municipio de '+x.parent_municipality+' · ':''}${x.province||'Provincia por determinar'} · ${x.autonomous_region||'CCAA por determinar'}${x.population!=null?' · '+BM.number(x.population)+' hab.':''}</span></button>`).join('')||noResult;out.querySelectorAll('[data-mid]').forEach(b=>b.onclick=async()=>{const x=items.find(y=>y.id===b.dataset.mid);if(!x)return;b.disabled=true;const full=await BM.loadPlace(x.id)||x;BM.setProfile(full);BM.closeSelector();location.href=BM.base()+'municipio/?id='+encodeURIComponent(x.id)})}
function sharedUI(){BM.refreshProfileUI();document.querySelectorAll('[data-workspace-count]').forEach(x=>x.textContent=BM.getWorkspace().length);document.querySelectorAll('[data-open-municipality]').forEach(b=>b.onclick=()=>BM.openSelector());document.querySelector('[data-close-municipality]')?.addEventListener('click',()=>BM.closeSelector());const ov=document.querySelector('#municipality-overlay');ov?.addEventListener('click',e=>{if(e.target===ov)BM.closeSelector()});let timer;ov?.querySelector('input')?.addEventListener('input',e=>{clearTimeout(timer);timer=setTimeout(()=>renderMunicipalities(ov,e.target.value),120)})}
async function globalSearch(){const form=document.querySelector('[data-global-search]');if(!form)return;const out=document.querySelector('[data-search-results]');const [ps,os,ls,cs,ss,sv,pb,sg,ind]=await Promise.all([BM.json('data/catalog/proyectos.json'),BM.opportunities(),BM.obligations(),BM.json('data/catalog/casos.json'),BM.support(),BM.services(),BM.playbooks(),BM.signals(),BM.indicatorSources()]);const all=[...(ind.items||[]).map(x=>({...x,_type:'Indicador territorial',_href:'indicadores/'})),...ps.map(x=>({...x,_type:'Proyecto',_href:'proyectos/detalle.html?id='+x.id})),...os.map(x=>({...x,_type:x.review_status==='pending'?'Radar BDNS':'Oportunidad',_href:'oportunidades/detalle.html?id='+x.id})),...ls.map(x=>({...x,_type:x.review_status==='pending'?'Radar BOE':'Obligación',_href:'obligaciones/detalle.html?id='+x.id})),...ss.map(x=>({...x,_type:'Apoyo',_href:'apoyo/?id='+x.id})),...sv.map(x=>({...x,_type:'Servicio existente',_href:'servicios/'})),...pb.map(x=>({...x,_type:'Playbook',_href:'playbooks/'})),...sg.map(x=>({...x,_type:'Observatorio',_href:'observatorio/'})),...cs.map(x=>({...x,title:`${x.municipality}: ${x.project}`,_type:'Caso',_href:'casos/detalle.html?id='+x.id}))];form.addEventListener('submit',e=>{e.preventDefault();const q=BM.normalize(form.querySelector('input').value);if(!q){out.innerHTML='';return}const synonyms={farolas:'alumbrado',farola:'alumbrado',contadores:'telelectura',hackers:'ciberseguridad',fugas:'agua',subvencion:'financiacion',subvenciones:'financiacion',pueblo:'municipio',papeles:'administracion',wifi:'conectividad',casa:'vivienda',ia:'ia',inteligencia:'ia',facturas:'face',registro:'sir',notificaciones:'notifica',contratar:'contratacion',contratos:'contratacion',datos:'datos'};const words=q.split(/\s+/).map(w=>synonyms[w]||w);const scored=all.map(x=>{const text=BM.normalize(JSON.stringify(x));return {x,s:words.reduce((a,w)=>a+(text.includes(w)?1:0),0)}}).filter(z=>z.s).sort((a,b)=>b.s-a.s).slice(0,14);out.innerHTML=scored.length?scored.map(z=>`<a class="search-result" href="${BM.base()+z.x._href}"><span class="kicker">${z.x._type}</span><strong>${z.x.title}</strong></a>`).join(''):'<div class="empty">No encuentro coincidencia directa. Prueba agua, ENS, alumbrado, vivienda, contratación…</div>'})}
window.addEventListener('DOMContentLoaded',()=>{sharedUI();globalSearch();window.dispatchEvent(new Event('bm-ready'))});

/* v0.8 · parche de calidad visual + corrección radar BOE + dossier ejecutivo */
(function(){
  BM.iconSvg=function(name){
    const icons={
      home:'<svg viewBox="0 0 24 24"><path d="M3 10.5 12 3l9 7.5"></path><path d="M5 9.5V21h14V9.5"></path></svg>',
      inteligencia:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7"></circle><path d="M12 2v3M12 19v3M2 12h3M19 12h3"></path></svg>',
      oportunidades:'<svg viewBox="0 0 24 24"><path d="M12 2v20"></path><path d="M7 6h8a3 3 0 0 1 0 6H9a3 3 0 0 0 0 6h8"></path></svg>',
      proyectos:'<svg viewBox="0 0 24 24"><rect x="3" y="4" width="7" height="7" rx="1"></rect><rect x="14" y="4" width="7" height="7" rx="1"></rect><rect x="3" y="15" width="7" height="6" rx="1"></rect><rect x="14" y="15" width="7" height="6" rx="1"></rect></svg>',
      obligaciones:'<svg viewBox="0 0 24 24"><path d="M8 3h8l5 5v13H3V3h5z"></path><path d="M8 8h8M8 12h8M8 16h5"></path></svg>',
      servicios:'<svg viewBox="0 0 24 24"><path d="M12 2v6"></path><path d="M12 16v6"></path><path d="M4.9 4.9 9 9"></path><path d="M15 15l4.1 4.1"></path><path d="M2 12h6"></path><path d="M16 12h6"></path><path d="M4.9 19.1 9 15"></path><path d="M15 9l4.1-4.1"></path><circle cx="12" cy="12" r="3"></circle></svg>',
      herramientas:'<svg viewBox="0 0 24 24"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.2 2.2-3.2-3.2 2.4-2z"></path></svg>',
      observatorio:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"></circle><path d="M12 7v5l3 3"></path></svg>',
      ejecutivo:'<svg viewBox="0 0 24 24"><path d="M4 19V9"></path><path d="M10 19V5"></path><path d="M16 19v-8"></path><path d="M22 19v-12"></path></svg>',
      espacio:'<svg viewBox="0 0 24 24"><path d="M12 21s-7-4.4-7-11a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 6.6-7 11-7 11z"></path></svg>',
      localidad:'<svg viewBox="0 0 24 24"><path d="M12 21s6-5.4 6-11a6 6 0 1 0-12 0c0 5.6 6 11 6 11z"></path><circle cx="12" cy="10" r="2.5"></circle></svg>',
      download:'<svg viewBox="0 0 24 24"><path d="M12 3v12"></path><path d="m7 10 5 5 5-5"></path><path d="M4 21h16"></path></svg>'
    };
    return icons[name]||icons.home;
  };
  BM.decorateChrome=function(){
    const base=this.base();
    document.querySelectorAll('.brand').forEach((el,idx)=>{
      if(el.dataset.decorated)return;
      const dark=!!el.closest('.footer');
      el.dataset.decorated='1';
      el.innerHTML=`<span class="brand-mark" aria-hidden="true">${this.iconSvg('inteligencia')}</span><span class="brand-meta"><span class="brand-name">Brújula <span>Municipal</span></span><span class="brand-sub">inteligencia local aplicada</span></span>`;
      if(dark)el.classList.add('brand-neutral');
    });
    document.querySelectorAll('.navlinks').forEach(nav=>{
      if(!nav.querySelector('[data-nav="ejecutivo"]')){
        const a=document.createElement('a');
        a.href=base+'ejecutivo/';
        a.dataset.nav='ejecutivo';
        a.textContent='Ejecutivo';
        nav.insertBefore(a,nav.lastElementChild||null);
      }
      nav.querySelectorAll('a').forEach(a=>{
        if(a.querySelector('.nav-icon'))return;
        const href=a.getAttribute('href')||''; const txt=(a.textContent||'').trim().toLowerCase();
        let key='home';
        if(href.includes('inteligencia')||txt.includes('inteligencia'))key='inteligencia';
        else if(href.includes('oportunidades')||txt.includes('oportunidades'))key='oportunidades';
        else if(href.includes('proyectos')||txt.includes('proyectos'))key='proyectos';
        else if(href.includes('obligaciones')||txt.includes('obligaciones'))key='obligaciones';
        else if(href.includes('servicios')||txt.includes('servicios'))key='servicios';
        else if(href.includes('herramientas')||txt.includes('herramientas'))key='herramientas';
        else if(href.includes('observatorio')||txt.includes('observatorio'))key='observatorio';
        else if(href.includes('ejecutivo')||txt.includes('ejecutivo'))key='ejecutivo';
        const ic=document.createElement('span');ic.className='nav-icon';ic.setAttribute('aria-hidden','true');ic.innerHTML=this.iconSvg(key);a.prepend(ic);
      })
    });
    document.querySelectorAll('.workspace-btn').forEach(b=>{if(!b.querySelector('.btn-icon')){const s=document.createElement('span');s.className='btn-icon';s.innerHTML=this.iconSvg('espacio');b.prepend(s)}});
    document.querySelectorAll('.municipality-btn').forEach(b=>{if(!b.querySelector('.btn-icon')){const s=document.createElement('span');s.className='btn-icon';s.innerHTML=this.iconSvg('localidad');b.prepend(s)}});
    document.querySelectorAll('a[href$="ejecutivo/"],a[href*="/ejecutivo/"]').forEach(b=>{if(!b.querySelector('.btn-icon') && !b.classList.contains('nav-icon')){const s=document.createElement('span');s.className='btn-icon';s.innerHTML=this.iconSvg('ejecutivo');b.prepend(s)}});
    let fav=document.querySelector('link[rel="icon"]'); if(!fav){fav=document.createElement('link');fav.rel='icon';document.head.appendChild(fav)} fav.href=base+'assets/img/logo-brujula.svg';
  };
  BM.sanitizeBoeCandidate=function(item){
    const x={...item};
    const sourceNoise=/(^|\b)(200\s*ok|20\d{6}T\d{6}Z|content-type|content-length|server:|connection:|text\/html|utf-8|status\s*:)/i;
    const combined=[x.title,x.summary,x.norm,x.note,x.description].filter(Boolean).join(' · ');
    if(x.review_status==='pending' && (sourceNoise.test(combined)||/^[0-9TZ :\-]+$/.test((x.title||'').trim()))){
      const normLabel=x.norm||x.boe_id||'Cambio normativo detectado en BOE';
      x.title=normLabel.startsWith('Cambio')?normLabel:`Cambio normativo detectado · ${normLabel}`;
      x.summary='Entrada detectada automáticamente en el radar normativo BOE. El texto original necesita revisión editorial antes de convertirse en una obligación práctica.';
    }
    if(x.review_status==='pending'){
      x.summary=x.summary||'Cambio normativo detectado automáticamente en el radar BOE. Requiere revisión editorial.';
      if(!x.norm&&x.boe_id)x.norm=x.boe_id;
    }
    return x;
  };
  const _obligations=BM.obligations.bind(BM);
  BM.obligations=async function(){const out=await _obligations(); return out.map(x=>this.sanitizeBoeCandidate(x))};
  BM.executiveBrief=async function(profile){
    const p=profile||this.getProfile(); if(!p) return null;
    const [metrics,signals,portfolio,plan,support,services,obls,opps,peer]=await Promise.all([
      this.metricsFor(p), this.metricsFor(p).then(m=>this.territorialSignals(m)), this.strategicPortfolio(p), this.build90DayPlan(p), this.support(), this.services(), this.obligations(), this.opportunities(), this.peerContext(p, await this.metricsFor(p))
    ]);
    const urgent=(obls||[]).filter(x=>x.review_status!=='pending').filter(x=>['critico','alto'].includes(x.impact)).slice(0,5);
    const funding=[...(opps||[])].map(o=>({o,m:this.matchOpportunity(o,p),s:this.opportunityScore(o,p)})).filter(x=>x.s>-90).sort((a,b)=>b.s-a.s).slice(0,5);
    const relevantSupport=this.supportFor(p,support).slice(0,4);
    const relevantServices=(services||[]).filter(s=>(portfolio.year1||[]).some(pr=>(pr.tags||[]).some(t=>(s.topics||[]).includes(t)))).slice(0,4);
    const cap=this.getCapacity();
    const executiveSignals=[...signals].sort((a,b)=>(b.priority||0)-(a.priority||0)).slice(0,6);
    return {generated_at:new Date().toISOString(),profile:p,metrics,signals:executiveSignals,capacity:cap,peer,portfolio,plan,urgent,funding,relevantSupport,relevantServices};
  };
  BM.executiveMarkdown=function(r){
    if(!r) return '# Brújula Municipal\n\nSin localidad seleccionada.';
    const fmt=id=>this.metricFormat(id,r.metrics?.[id]);
    const lines=[];
    lines.push(`# Dossier ejecutivo · ${r.profile.name}`);
    lines.push('');
    lines.push(`- Generado: ${new Date(r.generated_at).toLocaleString('es-ES')}`);
    lines.push(`- Localidad: ${r.profile.name}`);
    lines.push(`- Contexto: ${(r.profile.entity_type==='eatim'?'EATIM · ':'')}${r.profile.parent_municipality?'municipio de '+r.profile.parent_municipality+' · ':''}${r.profile.province||''} · ${r.profile.autonomous_region||''}`);
    lines.push('');
    lines.push('## Señales clave');
    (r.signals||[]).forEach(s=>lines.push(`- **${s.title}** — ${s.explanation||'Señal territorial detectada.'} (${this.metricFormat(s.metric,r.metrics?.[s.metric])})`));
    if(!(r.signals||[]).length) lines.push('- Sin señales destacadas en la copia actual.');
    lines.push('');
    lines.push('## Indicadores de contexto');
    [['Población','population'],['Variación población','population_change'],['Densidad','density'],['Edad media','mean_age'],['Mayores de 65','over65'],['Cobertura ≥100 Mbps','broadband100'],['Tiempo a hospital','hospital_minutes'],['Renta media','income_per_person']].forEach(([label,id])=>lines.push(`- ${label}: ${fmt(id)}`));
    lines.push('');
    lines.push('## Cartera recomendada');
    lines.push('### 1 año'); (r.portfolio.year1||[]).forEach(x=>lines.push(`- ${x.title}`));
    lines.push('### 3 años'); (r.portfolio.year3||[]).forEach(x=>lines.push(`- ${x.title}`));
    lines.push('### 5 años'); (r.portfolio.year5||[]).forEach(x=>lines.push(`- ${x.title}`));
    lines.push('');
    lines.push('## Financiación a revisar');
    (r.funding||[]).forEach(x=>lines.push(`- **${x.o.title}** — ${x.m.label}`));
    if(!(r.funding||[]).length) lines.push('- Sin oportunidades destacadas.');
    lines.push('');
    lines.push('## Obligaciones prioritarias');
    (r.urgent||[]).forEach(x=>lines.push(`- ${x.title}`));
    lines.push('');
    lines.push('## Servicios existentes y apoyo');
    [...(r.relevantSupport||[]),...(r.relevantServices||[])].forEach(x=>lines.push(`- ${x.title}`));
    lines.push('');
    lines.push('## Plan de 90 días');
    (r.plan.phases||[]).forEach(ph=>{lines.push(`### ${ph.range} · ${ph.goal}`); (ph.actions||[]).forEach(a=>lines.push(`- ${a}`)); lines.push('')});
    lines.push('');
    lines.push('---');
    lines.push('Brújula Municipal · dossier generado localmente en el navegador.');
    return lines.join('\n');
  };
  BM.downloadExecutiveBrief=async function(profile){const report=await this.executiveBrief(profile); if(!report)return; const slug=this.normalize(report.profile.name).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'localidad'; this.download(`brujula-${slug}-dossier-ejecutivo.md`, this.executiveMarkdown(report), 'text/markdown;charset=utf-8')};
  window.addEventListener('DOMContentLoaded',()=>BM.decorateChrome());
  window.addEventListener('bm-ready',()=>BM.decorateChrome());
})();

/* v0.9 · salto visual agency top + cockpit + autor */
(function(){
  BM.author=async function(){return this.cache.__author||(this.cache.__author=await this.json('data/catalog/author.json'))};
  BM.audienceBrief=async function(profile,audience='alcaldia'){
    const r=await this.executiveBrief(profile); if(!r) return null;
    const map={
      alcaldia:{title:'Alcaldía / Presidencia',focus:'prioridades, impacto y relato político-técnico',actions:[
        `Acordar 3 prioridades de mandato para ${r.profile.name}.`,
        `Validar una cartera corta de actuaciones a 1 año y otra estructural a 3 años.`,
        `Nombrar responsables y fijar una reunión mensual de seguimiento.`]},
      secretaria:{title:'Secretaría',focus:'cumplimiento, seguridad jurídica y secuencia administrativa',actions:[
        `Revisar obligaciones prioritarias y riesgos de cumplimiento.`,
        `Confirmar disponibilidad de medios propios, convenios y servicios compartidos.`,
        `Definir procedimiento y documentación mínima por actuación.`]},
      intervencion:{title:'Intervención',focus:'sostenibilidad económica, cofinanciación y costes recurrentes',actions:[
        `Revisar impacto presupuestario y cofinanciación de las actuaciones.`,
        `Calcular coste total de propiedad y gastos no elegibles.`,
        `Separar actuaciones financiables de mantenimiento estructural.`]},
      tecnica:{title:'Área técnica / TIC',focus:'viabilidad, arquitectura, servicios existentes y ejecución',actions:[
        `Comprobar si existe una plataforma pública reutilizable antes de contratar.`,
        `Definir alcance técnico mínimo viable y dependencias.`,
        `Ordenar quick wins frente a actuaciones de complejidad alta.`]}
    };
    const a=map[audience]||map.alcaldia;
    return {...r,audience:audience,audience_meta:a};
  };
  BM.audienceMarkdown=async function(profile,audience='alcaldia'){
    const r=await this.audienceBrief(profile,audience); if(!r) return '# Brújula Municipal';
    const lines=[];
    lines.push(`# Nota ejecutiva · ${r.audience_meta.title} · ${r.profile.name}`);
    lines.push('');
    lines.push(`Foco: ${r.audience_meta.focus}.`);
    lines.push('');
    lines.push('## Tres decisiones inmediatas'); r.audience_meta.actions.forEach(x=>lines.push(`- ${x}`));
    lines.push('');
    lines.push('## Señales del territorio'); (r.signals||[]).slice(0,4).forEach(s=>lines.push(`- ${s.title}`));
    lines.push('');
    lines.push('## Financiación a revisar'); (r.funding||[]).slice(0,4).forEach(x=>lines.push(`- ${x.o.title} — ${x.m.label}`));
    lines.push('');
    lines.push('## Obligaciones prioritarias'); (r.urgent||[]).slice(0,4).forEach(x=>lines.push(`- ${x.title}`));
    lines.push('');
    lines.push('## Cartera 1 año'); (r.portfolio.year1||[]).slice(0,5).forEach(x=>lines.push(`- ${x.title}`));
    lines.push('');
    lines.push('## Próximo paso'); lines.push(`- Abrir el Plan de 90 días y asignar responsables.`);
    return lines.join('\n');
  };
  BM.downloadAudienceBrief=async function(profile,audience='alcaldia'){ const r=await this.audienceBrief(profile,audience); if(!r)return; const slug=this.normalize(r.profile.name).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'localidad'; this.download(`brujula-${slug}-nota-${audience}.md`, await this.audienceMarkdown(profile,audience), 'text/markdown;charset=utf-8') };
  BM.injectContactCTA=async function(){
    if(document.querySelector('.contact-float')) return;
    try{
      const a=await this.author();
      const wrap=document.createElement('aside'); wrap.className='contact-float';
      wrap.innerHTML=`<div class="contact-float-inner"><div class="kicker">Autor</div><strong>${a.name}</strong><p>${a.headline}</p><div class="contact-float-actions"><a class="btn btn-primary" href="${this.base()}autor/">Ver perfil</a><a class="btn" href="${this.base()}autor/#linkedin">Contacto</a></div></div>`;
      document.body.appendChild(wrap);
    }catch(e){}
  };
  const _decorate=BM.decorateChrome.bind(BM);
  BM.decorateChrome=function(){ _decorate();
    document.querySelectorAll('.navlinks').forEach(nav=>{
      if(!nav.querySelector('[data-nav="cockpit"]')){const a=document.createElement('a');a.href=this.base()+'cockpit/';a.dataset.nav='cockpit';a.textContent='Cockpit';nav.insertBefore(a,nav.children[2]||null)}
      if(!nav.querySelector('[data-nav="autor"]')){const a=document.createElement('a');a.href=this.base()+'autor/';a.dataset.nav='autor';a.textContent='Autor';nav.appendChild(a)}
      nav.querySelectorAll('a').forEach(a=>{
        if(a.querySelector('.nav-icon')) return;
        let key='home'; const href=a.getAttribute('href')||''; const txt=(a.textContent||'').toLowerCase();
        if(href.includes('cockpit')||txt.includes('cockpit')) key='ejecutivo';
        else if(href.includes('autor')||txt.includes('autor')) key='localidad';
        const ic=document.createElement('span'); ic.className='nav-icon'; ic.setAttribute('aria-hidden','true'); ic.innerHTML=this.iconSvg(key); a.prepend(ic);
      });
    });
  };
  window.addEventListener('bm-ready',()=>BM.injectContactCTA());
})();

/* v1.0 · motor de decisiones, casos replicables y presentación */
(function(){
  BM.cases=async function(){return this.cache.__cases||(this.cache.__cases=await this.json('data/catalog/casos.json'))};
  BM.caseSimilarity=function(c,profile,project=null){
    let score=0,reasons=[];
    const prefs=this.getPrefs(), priorities=prefs.priorities||[];
    const ptags=new Set([...(project?.tags||[]),project?.category].filter(Boolean));
    const ctags=new Set([...(c.tags||[]),c.category].filter(Boolean));
    for(const t of ctags){if(ptags.has(t)){score+=5;reasons.push('misma temática/proyecto')} if(priorities.includes(t)){score+=3;reasons.push('prioridad declarada')}}
    const pop=profile?.municipal_population??profile?.population;
    if(pop!=null&&c.population!=null){const ratio=Math.max(pop,c.population)/Math.max(1,Math.min(pop,c.population));if(ratio<=2){score+=4;reasons.push('escala demográfica parecida')}else if(ratio<=5){score+=2;reasons.push('escala comparable')}}
    if(profile?.province&&c.province&&this.normalize(profile.province)===this.normalize(c.province)){score+=2;reasons.push('misma provincia')}
    if(c.replicable){score+=2;reasons.push('lección replicable documentada')}
    return {score,reasons:[...new Set(reasons)]};
  };
  BM.similarCases=async function(profile,project=null,limit=8){const cs=await this.cases();return cs.map(c=>({case:c,...this.caseSimilarity(c,profile,project)})).sort((a,b)=>b.score-a.score).slice(0,limit)};
  BM.projectOpportunityLinks=async function(profile,project){
    const opps=await this.opportunities(); const tags=new Set([project.category,...(project.tags||[])]);
    return opps.map(o=>{const overlap=(o.topics||[]).filter(t=>tags.has(t));const match=this.matchOpportunity(o,profile);let score=this.opportunityScore(o,profile)+overlap.length*5; if(!overlap.length)score-=5;return {opportunity:o,match,overlap,score}}).filter(x=>x.score>-80).sort((a,b)=>b.score-a.score).slice(0,8)
  };
  BM.priorityRanking=async function(profile){
    const [projects,metrics,signals,opps]=await Promise.all([this.json('data/catalog/proyectos.json'),this.metricsFor(profile),this.metricsFor(profile).then(m=>this.territorialSignals(m)),this.opportunities()]);
    const signalTags=[...new Set(signals.flatMap(s=>s.tags||[]))]; const prefs=this.getPrefs(), priorities=prefs.priorities||[];
    const rows=[];
    for(const p of projects){
      let impact=0,urgency=0,feasibility=0,funding=0,reasons=[];
      for(const t of p.tags||[]){if(signalTags.includes(t)){impact+=3;reasons.push('responde a una señal territorial')}if(priorities.includes(t)||priorities.includes(p.category)){impact+=4;reasons.push('prioridad declarada')}}
      impact+=Math.max(0,this.projectFitScore(p,profile));
      if(['baja','media'].includes(p.complexity)){feasibility+=3;reasons.push('complejidad asumible')} else feasibility+=1;
      const cap=this.getCapacity(); if(cap.technical==='low'&&p.complexity==='alta')feasibility-=3;if(cap.investment==='low'&&['€€€','€€€€'].includes(p.cost_band))feasibility-=3;
      const linked=opps.map(o=>({o,m:this.matchOpportunity(o,profile),overlap:(o.topics||[]).filter(t=>(p.tags||[]).includes(t)||t===p.category)})).filter(x=>x.overlap.length&&x.m.level!=='fail');
      if(linked.length){funding=Math.min(6,linked.length*2);reasons.push(`${linked.length} vía(s) de financiación relacionada(s)`)}
      const urgencyTags=['agua','ciberseguridad','servicios','energia','movilidad']; if((p.tags||[]).some(t=>urgencyTags.includes(t)&&signalTags.includes(t)))urgency+=3;
      const total=impact+urgency+feasibility+funding;
      rows.push({project:p,total,impact,urgency,feasibility,funding,reasons:[...new Set(reasons)],linked_count:linked.length});
    }
    return rows.sort((a,b)=>b.total-a.total).slice(0,20);
  };
  BM.institutionalPack=async function(profile){
    const [exec,ranking,cases]=await Promise.all([this.executiveBrief(profile),this.priorityRanking(profile),this.similarCases(profile,null,6)]);if(!exec)return null;
    return {generated_at:new Date().toISOString(),profile,executive:exec,ranking,cases};
  };
  BM.institutionalMarkdown=function(pack){
    if(!pack)return '# Brújula Municipal'; const p=pack.profile,e=pack.executive, lines=[];
    lines.push(`# Paquete institucional · ${p.name}`,'',`Generado: ${new Date(pack.generated_at).toLocaleString('es-ES')}`,'');
    lines.push('## 1. Resumen ejecutivo'); (e.signals||[]).slice(0,5).forEach(s=>lines.push(`- ${s.title}: ${s.explanation||''}`));
    lines.push('','## 2. Top 10 prioridades explicadas'); pack.ranking.slice(0,10).forEach((r,i)=>lines.push(`${i+1}. **${r.project.title}** · ${r.total} puntos internos · ${r.reasons.join('; ')}`));
    lines.push('','## 3. Financiación a revisar'); (e.funding||[]).forEach(x=>lines.push(`- ${x.o.title} — ${x.m.label}`));
    lines.push('','## 4. Obligaciones prioritarias'); (e.urgent||[]).forEach(x=>lines.push(`- ${x.title}`));
    lines.push('','## 5. Casos reales para aprender'); pack.cases.forEach(x=>lines.push(`- **${x.case.municipality}** · ${x.case.project} — ${x.case.replicable}`));
    lines.push('','## 6. Cartera estratégica'); lines.push('### 1 año');(e.portfolio.year1||[]).forEach(x=>lines.push(`- ${x.title}`));lines.push('### 3 años');(e.portfolio.year3||[]).forEach(x=>lines.push(`- ${x.title}`));lines.push('### 5 años');(e.portfolio.year5||[]).forEach(x=>lines.push(`- ${x.title}`));
    lines.push('','## 7. Plan de 90 días');(e.plan.phases||[]).forEach(ph=>{lines.push(`### ${ph.range} · ${ph.goal}`);(ph.actions||[]).forEach(a=>lines.push(`- ${a}`))});
    lines.push('','---','Brújula Municipal · documento orientativo y trazable. Las fuentes oficiales prevalecen.');return lines.join('\n')
  };
  BM.downloadInstitutionalPack=async function(profile){const pack=await this.institutionalPack(profile);if(!pack)return;const slug=this.normalize(pack.profile.name).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'localidad';this.download(`brujula-${slug}-paquete-institucional.md`,this.institutionalMarkdown(pack),'text/markdown;charset=utf-8')};
})();

/* v1.1 · actualización diaria + SEO dinámico */
(function(){
  const _dec=BM.decorateChrome.bind(BM);
  BM.decorateChrome=function(){
    _dec();
    document.querySelectorAll('.navlinks').forEach(nav=>{
      if(!nav.querySelector('[data-nav="actualizacion"]')){
        const a=document.createElement('a'); a.href=this.base()+'actualizacion/'; a.dataset.nav='actualizacion'; a.textContent='Actualización';
        const obs=[...nav.querySelectorAll('a')].find(x=>(x.textContent||'').toLowerCase().includes('observatorio'));
        if(obs) nav.insertBefore(a,obs); else nav.appendChild(a);
        const ic=document.createElement('span');ic.className='nav-icon';ic.setAttribute('aria-hidden','true');ic.innerHTML=this.iconSvg('observatorio');a.prepend(ic);
      }
    });
  };
  BM.setMeta=function(name,value,property=false){let q=property?`meta[property="${name}"]`:`meta[name="${name}"]`,m=document.querySelector(q);if(!m){m=document.createElement('meta');m.setAttribute(property?'property':'name',name);document.head.appendChild(m)}m.setAttribute('content',value)};
  BM.applyDynamicSeo=async function(){
    const path=location.pathname, id=new URLSearchParams(location.search).get('id'); if(!id)return;
    let item=null,kind='';
    try{
      if(path.includes('/proyectos/detalle')){item=(await this.json('data/catalog/proyectos.json')).find(x=>x.id===id);kind='Proyecto'}
      else if(path.includes('/oportunidades/detalle')){item=(await this.opportunities()).find(x=>x.id===id);kind='Oportunidad'}
      else if(path.includes('/obligaciones/detalle')){item=(await this.obligations()).find(x=>x.id===id);kind='Obligación'}
      else if(path.includes('/casos/detalle')){item=(await this.json('data/catalog/casos.json')).find(x=>x.id===id);kind='Caso real'}
      if(!item)return;
      const title=`${item.title||item.project||item.municipality||kind} · Brújula Municipal`;
      const desc=(item.summary||item.result||item.why||item.problem||`${kind} en Brújula Municipal`).slice(0,280);
      document.title=title; this.setMeta('description',desc); this.setMeta('og:title',title,true); this.setMeta('og:description',desc,true); this.setMeta('twitter:title',title); this.setMeta('twitter:description',desc);
      let c=document.querySelector('link[rel="canonical"]');if(!c){c=document.createElement('link');c.rel='canonical';document.head.appendChild(c)}c.href=location.href.split('#')[0];
    }catch(e){}
  };
  window.addEventListener('bm-ready',()=>{BM.decorateChrome();BM.applyDynamicSeo()});
})();
