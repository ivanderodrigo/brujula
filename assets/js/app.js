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
 async opportunities(){if(this.cache.__opps)return this.cache.__opps;const [curated,direct,eu,gen,genEu]=await Promise.all([this.json('data/catalog/oportunidades.json'),this.jsonOptional('data/catalog/oportunidades_directas.json',{items:[]}),this.jsonOptional('data/catalog/oportunidades_europeas.json',{items:[]}),this.jsonOptional('data/generated/oportunidades_bdns.json',{items:[]}),this.jsonOptional('data/generated/oportunidades_eu.json',{items:[]})]);const items=[...curated,...((Array.isArray(direct)?direct:direct.items)||[]),...((Array.isArray(eu)?eu:eu.items)||[]),...((Array.isArray(gen)?gen:gen.items)||[]),...((Array.isArray(genEu)?genEu:genEu.items)||[])];return this.cache.__opps=[...new Map(items.map(x=>[x.id,x])).values()]},
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
   if(o.population_rules?.length){let pop;if(route==='parent_municipality'||selectedType==='population_entity')pop=p.municipal_population;else pop=p.population;pop=pop??this.getPrefs().population;if(pop==null){checks.push(['unknown',route==='parent_municipality'?'Población del municipio matriz':'Población']);unknown++}else for(const rule of o.population_rules){let ok=true;if(rule.max!=null)ok=pop<=rule.max;if(rule.min!=null)ok=ok&&pop>=rule.min;checks.push([ok?'pass':'fail',`${route==='parent_municipality'?'Población municipio matriz':'Población'} ${[rule.min!=null?'≥ '+this.number(rule.min):'',rule.max!=null?'≤ '+this.number(rule.max):''].filter(Boolean).join(' y ')}`]);if(!ok)fail=true}}
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
 async metricsFor(profile){const code=this.municipalCode(profile);if(!code)return {ine_code:null};const [t,r]=await Promise.all([this.territorialDataset(),this.incomeDataset()]);const a=(t.items||[]).find(x=>x.ine_code===code)||{};const b=(r.items||[]).find(x=>x.ine_code===code)||{};let admin=profile;if(profile?.entity_type!=='municipality'&&profile?.parent_municipality_id){admin=await this.loadPlace(profile.parent_municipality_id)||profile}const out={...a,...b,ine_code:code,_evidence:{...(a._evidence||{}),...(b._evidence||{})}};if(out.population==null)out.population=admin?.population??profile?.municipal_population??profile?.population??null;if(out.density==null&&typeof out.population==='number'&&typeof admin?.surface_ha==='number'&&admin.surface_ha>0){out.density=out.population/(admin.surface_ha/100);out._derived={...(out._derived||{}),density:'Población oficial / superficie oficial del municipio'}}return out},
 async territorialSignals(metrics){const rules=await this.json('data/catalog/reglas_inteligencia.json');const out=[];for(const rule of rules.signals||[]){const v=metrics?.[rule.metric];if(typeof v!=='number')continue;const w=rule.when||{};let ok=true;if(w.lt!=null)ok=ok&&v<w.lt;if(w.lte!=null)ok=ok&&v<=w.lte;if(w.gt!=null)ok=ok&&v>w.gt;if(w.gte!=null)ok=ok&&v>=w.gte;if(w.eq!=null)ok=ok&&v===w.eq;if(ok)out.push({...rule,value:v})}return out},
 benchmarkBand(pop){if(pop==null)return 'unknown';if(pop<=500)return 'le500';if(pop<=1000)return '501_1000';if(pop<=5000)return '1001_5000';if(pop<=20000)return '5001_20000';if(pop<=50000)return '20001_50000';return 'gt50000'},
 async peerContext(profile,metrics){const b=await this.territorialBenchmark();const pop=metrics?.population??profile?.municipal_population??profile?.population;const key=this.benchmarkBand(pop);return {group:key,benchmark:b.groups?.[key]||null,national:b.groups?.national||null,peers:b.peers?.[this.municipalCode(profile)]||[],method:b.method}},
 metricFormat(id,v){if(v==null)return 'No disponible';const f={population:x=>this.number(x)+' hab.',population_change:x=>(x>0?'+':'')+Number(x).toLocaleString('es-ES',{maximumFractionDigits:1})+' %',density:x=>Number(x).toLocaleString('es-ES',{maximumFractionDigits:1})+' hab/km²',mean_age:x=>Number(x).toLocaleString('es-ES',{maximumFractionDigits:1})+' años',over65:x=>Number(x).toLocaleString('es-ES',{maximumFractionDigits:1})+' %',under18_pct:x=>Number(x).toLocaleString('es-ES',{maximumFractionDigits:1})+' %',household_size:x=>Number(x).toLocaleString('es-ES',{maximumFractionDigits:2})+' pers./hogar',one_person_households:x=>Number(x).toLocaleString('es-ES',{maximumFractionDigits:1})+' %',broadband100:x=>Number(x).toLocaleString('es-ES',{maximumFractionDigits:1})+' %',primary_care_centres:x=>this.number(x),hospital_count:x=>this.number(x),pharmacies:x=>this.number(x),primary_schools:x=>this.number(x),highway_minutes:x=>Number(x).toLocaleString('es-ES',{maximumFractionDigits:0})+' min',hospital_minutes:x=>Number(x).toLocaleString('es-ES',{maximumFractionDigits:0})+' min',income_per_person:x=>this.money(x)+'/persona',income_per_household:x=>this.money(x)+'/hogar',gini:x=>Number(x).toLocaleString('es-ES',{maximumFractionDigits:2})};return (f[id]||((x)=>String(x)))(v)},
 async strategicPortfolio(profile){const [projects,metrics]=await Promise.all([this.json('data/catalog/proyectos.json'),this.metricsFor(profile)]);const signals=await this.territorialSignals(metrics);const tags=[...new Set(signals.flatMap(s=>s.tags||[]))];const prefs=this.getPrefs();const priorities=[...new Set([...(prefs.priorities||[]),...tags])];const scored=projects.map(p=>{let score=this.projectFitScore(p,profile);for(const t of p.tags||[])if(priorities.includes(t)||priorities.includes(p.category))score+=3;return {p,score}}).sort((a,b)=>b.score-a.score);const used=new Set();const take=(filter,n)=>{const out=[];for(const x of scored){if(used.has(x.p.id)||!filter(x.p))continue;out.push(x.p);used.add(x.p.id);if(out.length>=n)break}return out};return {metrics,signals,year1:take(p=>['baja','media'].includes(p.complexity)&&!['€€€€'].includes(p.cost_band),6),year3:take(p=>true,6),year5:take(p=>p.complexity==='alta'||['€€€','€€€€'].includes(p.cost_band),5),principle:'La cartera es orientativa: prioriza encaje, capacidad declarada y señales territoriales; no sustituye planificación, financiación ni evaluación técnica.'}},
 async build90DayPlan(profile){const [projects,opps,obls,support,services]=await Promise.all([this.json('data/catalog/proyectos.json'),this.opportunities(),this.obligations(),this.support(),this.services()]);const ps=[...projects].sort((a,b)=>this.projectFitScore(b,profile)-this.projectFitScore(a,profile)).slice(0,6);const os=[...opps].map(o=>({o,score:this.opportunityScore(o,profile),match:this.matchOpportunity(o,profile)})).filter(x=>x.score>-90).sort((a,b)=>b.score-a.score).slice(0,5);const curated=obls.filter(o=>o.review_status!=='pending').filter(o=>['critico','alto'].includes(o.impact)).slice(0,5);const su=this.supportFor(profile,support).slice(0,4);const tags=[...new Set(ps.flatMap(x=>x.tags||[]))];const sv=services.filter(x=>(x.topics||[]).some(t=>tags.includes(t))).slice(0,5);return {generated_at:new Date().toISOString(),profile,projects:ps,opportunities:os,obligations:curated,support:su,services:sv,phases:[{range:'0–30 días',goal:'Diagnosticar y evitar compras prematuras',actions:[`Confirmar las 2–3 prioridades reales de ${profile?.name||'la localidad'}.`,...curated.slice(0,2).map(x=>'Revisar: '+x.title),...su.slice(0,1).map(x=>'Comprobar apoyo disponible: '+x.title),...sv.slice(0,1).map(x=>'Comprobar servicio común: '+x.title)]},{range:'31–60 días',goal:'Convertir prioridades en proyectos financiables',actions:[...ps.slice(0,3).map(x=>'Definir alcance mínimo de: '+x.title),...os.slice(0,2).map(x=>'Analizar requisitos de: '+x.o.title)]},{range:'61–90 días',goal:'Decidir y preparar ejecución',actions:[...ps.slice(0,2).map(x=>'Preparar decisión/contratación para: '+x.title),'Cerrar responsables, costes recurrentes, indicadores y calendario de cada actuación seleccionada.']} ]}},
 download(filename,content,type='application/json'){const b=new Blob([content],{type});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=filename;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500)},
 escapeHtml(s=''){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
};
async function renderMunicipalities(ov,q){const out=ov.querySelector('.municipality-results');if(!out)return;const token=(ov._requestToken||0)+1;ov._requestToken=token;const clean=String(q||'').trim();if(clean&&BM.normalize(clean).replace(/\s+/g,'').length<2){out.innerHTML='<div class="empty">Escribe al menos 2 caracteres. Brújula cargará solo el fragmento necesario del catálogo nacional.</div>';return}out.innerHTML='<div class="empty">Buscando en el catálogo local…</div>';const items=await BM.searchPlaces(clean);if(token!==ov._requestToken)return;ov._items=items;const manifest=await BM.placeManifest();const noResult=manifest.total_entities<1000?'<div class="empty"><strong>El catálogo nacional todavía no está cargado.</strong><br>Ahora solo hay datos de demostración. Ejecuta <code>ACTUALIZAR_LOCALIDADES.bat</code> y vuelve a abrir Brújula.</div>':'<div class="empty">No encuentro esa localidad en el catálogo nacional cargado. Comprueba la ortografía o prueba con parte del nombre.</div>';out.innerHTML=items.map(x=>`<button class="municipality-option" data-mid="${x.id}"><strong>${x.name}</strong><br><span class="small muted">${x.entity_type==='eatim'?'EATIM · ':x.entity_type==='population_entity'?'Entidad de población · ':''}${x.parent_municipality?'municipio de '+x.parent_municipality+' · ':''}${x.province||'Provincia por determinar'} · ${x.autonomous_region||'CCAA por determinar'}${x.population!=null?' · '+BM.number(x.population)+' hab.':''}</span></button>`).join('')||noResult;out.querySelectorAll('[data-mid]').forEach(b=>b.onclick=async()=>{const x=items.find(y=>y.id===b.dataset.mid);if(!x)return;b.disabled=true;let full=await BM.loadPlace(x.id)||x;if(full.entity_type!=='municipality'&&full.parent_municipality_id&&!full.municipal_population){const parent=await BM.loadPlace(full.parent_municipality_id);if(parent?.population!=null)full={...full,municipal_population:parent.population,parent_municipality:full.parent_municipality||parent.name}}BM.setProfile(full);BM.closeSelector();location.reload()})}
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
    [['Población','population'],['Variación población','population_change'],['Densidad','density'],['Edad media','mean_age'],['Mayores de 65','over65'],['Menores de 18','under18_pct'],['Cobertura ≥100 Mbps','broadband100'],['Centros de Atención Primaria','primary_care_centres'],['Hospitales en el municipio','hospital_count'],['Renta media por persona','income_per_person'],['Renta media por hogar','income_per_household']].forEach(([label,id])=>lines.push(`- ${label}: ${fmt(id)}`));
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

/* v1.1.1 PRO · navegación, organización visual y copia local */
(function(){
  const originalDecorate=BM.decorateChrome.bind(BM);
  BM.proNav=function(){
    const b=this.base();
    return `
      <a href="${b}" data-pro-nav="inicio">Inicio</a>
      <a href="${b}municipio/" data-pro-nav="municipio">Mi municipio</a>
      <a href="${b}oportunidades/" data-pro-nav="oportunidades">Oportunidades</a>
      <a href="${b}proyectos/" data-pro-nav="proyectos">Proyectos</a>
      <a href="${b}obligaciones/" data-pro-nav="obligaciones">Obligaciones</a>
      <details class="mega-menu"><summary>Explorar</summary><div class="mega-panel">
        <div class="mega-group"><strong>Decidir</strong><a href="${b}ejecutivo/">Ejecutivo 360</a><a href="${b}cockpit/">Cockpit</a><a href="${b}decisiones/">Prioridades</a><a href="${b}plan/">Plan 90 días</a><a href="${b}presentacion/">Presentación</a></div>
        <div class="mega-group"><strong>Inteligencia</strong><a href="${b}inteligencia/">Territorio 360</a><a href="${b}comparar/">Comparar municipios</a><a href="${b}indicadores/">Indicadores</a><a href="${b}observatorio/">Observatorio</a><a href="${b}casos/">Casos reales</a></div>
        <div class="mega-group"><strong>Ejecutar</strong><a href="${b}herramientas/">Herramientas</a><a href="${b}playbooks/">Playbooks</a><a href="${b}servicios/">Servicios públicos</a><a href="${b}calendario/">Calendario</a><a href="${b}recursos/">Fuentes y recursos</a></div>
      </div></details>`;
  };
  BM.decorateChrome=function(){
    originalDecorate();
    const base=this.base();
    document.querySelectorAll('.brand').forEach(el=>{
      const footer=!!el.closest('.footer');
      el.innerHTML=`<span class="brand-mark"><img src="${base}assets/img/logo-brujula.svg" alt=""></span><span class="brand-meta"><span class="brand-name">Brújula <span>Municipal</span></span><span class="brand-sub">inteligencia local aplicada</span></span>`;
      if(footer)el.classList.add('brand-neutral');
    });
    document.querySelectorAll('.navlinks').forEach(nav=>{
      nav.innerHTML=this.proNav();
      const path=location.pathname.toLowerCase();
      let key='inicio';
      for(const k of ['municipio','oportunidades','proyectos','obligaciones'])if(path.includes('/'+k+'/'))key=k;
      nav.querySelector(`[data-pro-nav="${key}"]`)?.setAttribute('aria-current','page');
    });
    if(!document.querySelector('.mobile-dock')){
      const dock=document.createElement('nav');dock.className='mobile-dock';dock.setAttribute('aria-label','Navegación móvil');
      dock.innerHTML=`
        <a href="${base}" class="${location.pathname==='/'||location.pathname.endsWith('/brujula/')?'active':''}">${this.iconSvg('home')}<span>Inicio</span></a>
        <a href="${base}municipio/">${this.iconSvg('localidad')}<span>Municipio</span></a>
        <a href="${base}oportunidades/">${this.iconSvg('oportunidades')}<span>Ayudas</span></a>
        <a href="${base}proyectos/">${this.iconSvg('proyectos')}<span>Proyectos</span></a>
        <a href="${base}herramientas/">${this.iconSvg('herramientas')}<span>Herramientas</span></a>`;
      document.body.appendChild(dock);
    }
    document.querySelectorAll('main').forEach(m=>{if(!m.id)m.id='main-content'});
    if(!document.querySelector('.skip-link')){
      const a=document.createElement('a');a.className='skip-link';a.href='#main-content';a.textContent='Saltar al contenido principal';document.body.prepend(a);
    }
  };
  BM.localBackup=function(){
    const keys=['bm_profile','bm_prefs','bm_capacity','bm_workspace'];const data={version:'1.1.1',exported_at:new Date().toISOString(),data:{}};
    for(const k of keys){const raw=localStorage.getItem(k);if(raw!==null){try{data.data[k]=JSON.parse(raw)}catch{data.data[k]=raw}}}
    this.download(`brujula-copia-local-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify(data,null,2),'application/json;charset=utf-8');
    localStorage.setItem('bm_last_backup',new Date().toISOString());
  };
  BM.restoreLocalBackup=async function(file){
    const text=await file.text();const payload=JSON.parse(text);const data=payload.data||payload;
    for(const k of ['bm_profile','bm_prefs','bm_capacity','bm_workspace'])if(k in data)localStorage.setItem(k,JSON.stringify(data[k]));
    location.reload();
  };
  BM.injectSpaceSafety=function(){
    if(!location.pathname.includes('/espacio/')||document.querySelector('.local-data-safety'))return;
    const main=document.querySelector('main');if(!main)return;
    const box=document.createElement('section');box.className='section local-data-safety';
    const last=localStorage.getItem('bm_last_backup');
    box.innerHTML=`<div class="shell"><div class="notice" style="display:grid;grid-template-columns:1fr auto;gap:18px;align-items:center"><div><div class="kicker">Copia local</div><h3 style="margin-top:6px">Tu trabajo vive solo en este navegador</h3><p class="muted">Si borras los datos del navegador, usas incógnito o cambias de equipo puedes perder municipio, prioridades y elementos guardados.${last?` Última copia: ${new Date(last).toLocaleString('es-ES')}.`:''}</p></div><div class="exec-actions"><button class="btn btn-teal" data-local-backup>Descargar copia</button><label class="btn">Restaurar<input type="file" accept="application/json" data-local-restore hidden></label></div></div></div>`;
    main.insertBefore(box,main.firstChild);
    box.querySelector('[data-local-backup]').onclick=()=>this.localBackup();
    box.querySelector('[data-local-restore]').onchange=e=>{if(e.target.files?.[0])this.restoreLocalBackup(e.target.files[0]).catch(()=>alert('No se pudo restaurar la copia.'))};
  };
  window.addEventListener('keydown',e=>{
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){
      const input=document.querySelector('[data-global-search] input');
      if(input){e.preventDefault();input.focus();input.scrollIntoView({block:'center',behavior:'smooth'})}
    }
  });
  window.addEventListener('bm-ready',()=>{BM.decorateChrome();BM.injectSpaceSafety()});
})();

/* v1.1.1 PRO · context rail for inner pages */
(function(){
  BM.injectProContext=function(){
    const path=location.pathname.replace(/\/+/g,'/');
    const base=this.base();
    if(document.querySelector('.pro-context')) return;
    const isHome=path==='/' || /\/brujula\/?$/.test(path) || /\/brujula-municipal\/?$/.test(path);
    if(isHome) return;
    const map={
      municipio:['Mi municipio','Contexto territorial'],oportunidades:['Oportunidades','Financiación'],proyectos:['Proyectos','Cartera de soluciones'],obligaciones:['Obligaciones','Cumplimiento'],
      inteligencia:['Inteligencia territorial','Diagnóstico'],comparar:['Comparar','Benchmark'],indicadores:['Indicadores','Datos'],observatorio:['Observatorio','Señales'],casos:['Casos reales','Aprendizaje'],
      ejecutivo:['Ejecutivo 360','Dirección'],cockpit:['Cockpit','Dirección'],decisiones:['Prioridades','Decidir'],plan:['Plan 90 días','Ejecutar'],presentacion:['Presentación','Reunión'],
      herramientas:['Herramientas','Ejecutar'],playbooks:['Playbooks','Ejecutar'],servicios:['Servicios públicos','Antes de comprar'],calendario:['Calendario','Plazos'],recursos:['Fuentes y metodología','Rigor'],actualizacion:['Actualización','Calidad del dato'],espacio:['Mi espacio','Trabajo local'],autor:['Autor','Proyecto']
    };
    const key=Object.keys(map).find(k=>path.includes('/'+k+'/')) || 'brujula';
    const meta=map[key]||['Brújula Municipal','Inteligencia local'];
    const header=document.querySelector('.topbar'); if(!header)return;
    const profile=this.getProfile?this.getProfile():null;
    const locality=profile?.name || 'Selecciona localidad';
    const rail=document.createElement('div');rail.className='pro-context';
    rail.innerHTML=`<div class="shell pro-context-inner"><div class="pro-breadcrumb"><a href="${base}">Brújula</a><span class="sep">/</span><span>${meta[1]}</span><span class="sep">/</span><b>${meta[0]}</b></div><div class="pro-context-actions"><span class="pro-context-chip">${this.iconSvg('localidad')}<strong>${this.escapeHtml(locality)}</strong></span><a class="pro-context-chip" href="${base}actualizacion/">${this.iconSvg('observatorio')}Datos y fuentes</a><a class="pro-context-chip" href="${base}espacio/">${this.iconSvg('herramientas')}Mi espacio</a></div></div>`;
    header.insertAdjacentElement('afterend',rail);
  };
  window.addEventListener('bm-ready',()=>BM.injectProContext());
})();

/* v1.1.2 PRO · chrome enterprise + localización territorial exacta + cobertura de datos */
(function(){
  BM.entityLabel=function(p){if(!p)return 'Sin localidad';if(p.entity_type==='eatim')return 'EATIM';if(p.entity_type==='population_entity')return 'Entidad de población';return 'Municipio'};
  BM.proNav=function(){
    const b=this.base();
    return `
      <a href="${b}municipio/" data-pro-nav="municipio">Mi municipio</a>
      <details class="mega-menu mega-decision"><summary>Decidir</summary><div class="mega-panel mega-panel-compact">
        <div class="mega-intro"><span class="mega-kicker">Centro de decisión</span><strong>De los datos a una hoja de ruta.</strong><p>Prioridades, cartera y ejecución adaptadas al municipio.</p></div>
        <div class="mega-group"><strong>Dirección</strong><a href="${b}ejecutivo/">Ejecutivo 360 <span>Resumen para decidir</span></a><a href="${b}cockpit/">Cockpit <span>Visión por perfiles</span></a><a href="${b}decisiones/">Prioridades <span>Ranking explicable</span></a><a href="${b}plan/">Plan 90 días <span>Primeros pasos</span></a></div>
      </div></details>
      <a href="${b}oportunidades/" data-pro-nav="oportunidades">Financiación</a>
      <a href="${b}proyectos/" data-pro-nav="proyectos">Proyectos</a>
      <a href="${b}obligaciones/" data-pro-nav="obligaciones">Cumplimiento</a>
      <details class="mega-menu"><summary>Explorar</summary><div class="mega-panel">
        <div class="mega-intro"><span class="mega-kicker">Explorar Brújula</span><strong>Todo lo que puede ayudar a ejecutar mejor.</strong><p>Inteligencia territorial, referencias reales y herramientas prácticas.</p></div>
        <div class="mega-group"><strong>Territorio</strong><a href="${b}inteligencia/">Inteligencia 360 <span>Diagnóstico municipal</span></a><a href="${b}comparar/">Comparar municipios <span>Benchmark</span></a><a href="${b}indicadores/">Indicadores <span>Datos y fuentes</span></a><a href="${b}casos/">Casos reales <span>Qué replicar</span></a></div>
        <div class="mega-group"><strong>Ejecutar</strong><a href="${b}herramientas/">Herramientas <span>Checklists y cálculos</span></a><a href="${b}playbooks/">Playbooks <span>Rutas paso a paso</span></a><a href="${b}servicios/">Servicios públicos <span>Antes de contratar</span></a><a href="${b}observatorio/">Observatorio <span>Señales y tendencias</span></a></div>
      </div></details>`;
  };
  BM.mapPoint=function(p){
    const lat=Number(p?.latitude),lon=Number(p?.longitude);if(!Number.isFinite(lat)||!Number.isFinite(lon))return null;
    // ViewBox 720×420. Tres zonas para evitar colocar Canarias sobre la península.
    if(lon<-12 && lat<31){const x=70+(lon+18.5)/5.5*125,y=330+(29.5-lat)/2.8*54;return {x,y,zone:'Canarias'}}
    if(lon>1 && lat<40.5){const x=585+(lon-1)/3.5*85,y=230+(40.5-lat)/2.2*48;return {x,y,zone:'Baleares'}}
    const x=82+(lon+9.5)/13.9*455,y=62+(43.9-lat)/8.3*245;return {x,y,zone:'Península'};
  };
  BM.renderTerritorialLocator=function(){
    const p=this.getProfile();
    document.querySelectorAll('[data-map-town],[data-home-town]').forEach(el=>el.textContent=p?.name||'Selecciona una localidad');
    document.querySelectorAll('[data-map-province]').forEach(el=>el.textContent=p?.province||'Provincia por seleccionar');
    document.querySelectorAll('[data-map-region]').forEach(el=>el.textContent=p?.autonomous_region||'Comunidad autónoma');
    document.querySelectorAll('[data-map-entity]').forEach(el=>el.textContent=this.entityLabel(p));
    document.querySelectorAll('[data-map-parent]').forEach(el=>el.textContent=p?.parent_municipality?`Municipio de ${p.parent_municipality}`:'Administración municipal');
    document.querySelectorAll('[data-map-population]').forEach(el=>el.textContent=(p?.population??p?.municipal_population)!=null?this.number(p.population??p.municipal_population)+' hab.':'Población pendiente');
    document.querySelectorAll('[data-municipality-province]').forEach(el=>el.textContent=p?.province?`${p.province} · ${p.autonomous_region||''}`:'Selecciona provincia y localidad');
    document.querySelectorAll('[data-home-town-meta]').forEach(el=>el.textContent=p?`${this.entityLabel(p)} · ${p.parent_municipality?'municipio de '+p.parent_municipality+' · ':''}${p.province||''} · ${p.autonomous_region||''}`:'Brújula distingue municipio, EATIM o entidad de población y aplica la vía administrativa correcta.');
    const pt=this.mapPoint(p);document.querySelectorAll('[data-map-marker]').forEach(g=>{if(pt){g.style.display='';g.setAttribute('transform',`translate(${pt.x.toFixed(1)} ${pt.y.toFixed(1)})`)}else g.style.display='none'});
    document.querySelectorAll('[data-map-svg-label]').forEach(el=>el.textContent=p?.name?`${p.name} · ${p.province||''}`:'Localidad · provincia');
    document.querySelectorAll('[data-map-coordinates]').forEach(el=>el.textContent=pt?`${Number(p.latitude).toFixed(4)}°, ${Number(p.longitude).toFixed(4)}° · ${pt.zone}`:'Coordenadas disponibles al seleccionar localidad');
  };
  BM.dataCoverage=async function(){
    const [status,terr,income,bench,manifest,last]=await Promise.all([
      this.jsonOptional('data/generated/status.json',{}),this.territorialDataset(),this.incomeDataset(),this.territorialBenchmark(),this.placeManifest(),this.jsonOptional('data/system/last-check.json',{})
    ]);
    const terrItems=terr.items||[],incItems=income.items||[];const peers=bench.peers||{};
    return {
      localities:manifest.total_entities||status.localities_ngmep?.total||0,
      bdns:status.bdns?.details||0,boe:status.boe?.candidates||0,
      territorial:terrItems.length,income:incItems.length,peers:Object.keys(peers).length,
      officialOk:terr.successful_sources??status.territorial_official?.successful_sources??0,
      officialTotal:terr.total_sources??status.territorial_official?.total_sources??5,
      coverage:terr.coverage||status.territorial_official?.coverage||{},
      incomeMode:income.source_mode||status.income_ine?.source||'pendiente',
      checkedAt:last.checked_at||status.generated_at||null
    };
  };
  const _refresh112=BM.refreshProfileUI.bind(BM);
  BM.refreshProfileUI=function(){_refresh112();this.renderTerritorialLocator();};
  const _decorate112=BM.decorateChrome.bind(BM);
  BM.decorateChrome=function(){
    _decorate112();const b=this.base();
    document.querySelectorAll('.navlinks').forEach(nav=>{nav.innerHTML=this.proNav();const path=location.pathname.toLowerCase();let key='';for(const k of ['municipio','oportunidades','proyectos','obligaciones'])if(path.includes('/'+k+'/'))key=k;if(key)nav.querySelector(`[data-pro-nav="${key}"]`)?.setAttribute('aria-current','page')});
    document.querySelectorAll('.nav-actions').forEach(actions=>{
      const workspace=actions.querySelector('.workspace-btn');if(workspace){workspace.className='utility-button workspace-btn';workspace.innerHTML=`${this.iconSvg('espacio')}<span class="sr-only">Mi espacio</span><span class="workspace-count" data-workspace-count>${this.getWorkspace().length}</span>`;workspace.setAttribute('title','Mi espacio')}
      let search=actions.querySelector('[data-command-search]');if(!search){search=document.createElement('button');search.type='button';search.className='command-search';search.dataset.commandSearch='1';search.innerHTML=`<span>${this.iconSvg('observatorio')} Buscar</span><kbd>⌘ K</kbd>`;search.onclick=()=>{const input=document.querySelector('[data-global-search] input');if(input){input.focus();input.scrollIntoView({block:'center',behavior:'smooth'})}else location.href=b+'#buscar'};actions.insertBefore(search,actions.firstChild)}
      const mb=actions.querySelector('.municipality-btn');if(mb){mb.className='municipality-command municipality-btn';mb.innerHTML=`<span class="municipality-pin">${this.iconSvg('localidad')}</span><span class="municipality-copy"><strong data-municipality-label>Seleccionar localidad</strong><small data-municipality-province>Contexto territorial</small></span><span class="municipality-chevron">⌄</span>`}
    });
    this.renderTerritorialLocator();
  };
  BM.injectDataAvailability=async function(){
    const path=location.pathname; if(!['/inteligencia/','/indicadores/','/comparar/','/municipio/'].some(x=>path.includes(x))||document.querySelector('.data-availability-rail'))return;
    const c=await this.dataCoverage();const main=document.querySelector('main');if(!main)return;const sec=document.createElement('section');sec.className='data-availability-rail';sec.innerHTML=`<div class="shell data-availability-inner"><div><span class="data-availability-dot ${c.territorial?'ok':'warn'}"></span><strong>Cobertura territorial</strong><span>${this.number(c.territorial)} con contexto · ${this.number(c.coverage?.population_change||0)} con evolución demográfica · ${this.number(c.coverage?.broadband100||0)} con ≥100 Mbps · ${this.number(c.income)} con renta</span></div><a href="${this.base()}actualizacion/">Ver calidad del dato →</a></div>`;main.insertBefore(sec,main.firstChild);
  };
  window.addEventListener('bm-ready',async()=>{BM.decorateChrome();BM.renderTerritorialLocator();BM.injectDataAvailability()});
})();


/* v1.1.3 PRO · municipal facts strip: only useful available data, with provenance */
(function(){
  BM.metricSourceLabel=function(metrics,id){
    const e=metrics?._evidence?.[id]||{};const src=e.source||'';const ref=e.reference?` · ${e.reference}`:'';
    if(src.includes('SETELECO'))return 'SETELECO'+ref;
    if(src.includes('Sanidad'))return 'Ministerio de Sanidad'+ref;
    if(src.includes('ADRH'))return 'INE · ADRH'+ref;
    if(src.includes('padrón')||src.includes('padron'))return 'INE · Padrón'+ref;
    if(src.includes('IGN')||src.includes('CNIG'))return 'IGN/CNIG'+ref;
    return src?src+ref:'Fuente oficial trazada';
  };
  BM.injectMunicipalFacts=async function(){
    const path=location.pathname.toLowerCase();
    if(!['/municipio/','/inteligencia/','/ejecutivo/','/cockpit/'].some(x=>path.includes(x))||document.querySelector('.municipal-facts-pro'))return;
    const p=this.getProfile();if(!p)return;const m=await this.metricsFor(p);const main=document.querySelector('main');if(!main)return;
    const defs=[
      ['Población','population'],['Variación 10 años','population_change'],['Edad media','mean_age'],['Mayores de 65','over65'],
      ['Cobertura ≥100 Mbps','broadband100'],['Atención Primaria','primary_care_centres'],['Hospitales','hospital_count'],['Renta por persona','income_per_person']
    ];
    const available=defs.filter(([,id])=>typeof m[id]==='number');
    const missing=defs.filter(([,id])=>typeof m[id]!=='number').map(([label])=>label);
    const sec=document.createElement('section');sec.className='municipal-facts-pro';
    sec.innerHTML=`<div class="shell"><div class="municipal-facts-head"><div><span class="kicker">Radiografía municipal · datos disponibles</span><h2>${this.escapeHtml(p.name)}</h2></div><p>Solo se muestran indicadores con dato trazable. La ausencia de una fuente nunca se presenta como cero ni se completa por estimación.</p></div><div class="municipal-facts-grid">${available.map(([label,id],i)=>`<article class="municipal-fact ${i===0?'accent':''}"><span class="fact-label">${this.escapeHtml(label)}</span><strong>${this.escapeHtml(this.metricFormat(id,m[id]))}</strong><small>${this.escapeHtml(this.metricSourceLabel(m,id))}</small></article>`).join('')}</div>${missing.length?`<div class="data-gap-note"><strong>No mostrados por falta de fuente nacional validada:</strong> ${missing.map(x=>this.escapeHtml(x)).join(' · ')}. <a href="${this.base()}actualizacion/">Ver cobertura y fuentes →</a></div>`:''}</div>`;
    const rail=main.querySelector('.data-availability-rail');
    if(rail)rail.insertAdjacentElement('afterend',sec);else main.insertBefore(sec,main.firstChild);
  };
  window.addEventListener('bm-ready',()=>BM.injectMunicipalFacts());
})();


/* v1.2.0 SIMPLE · Brújula útil antes que compleja */
(function(){
  BM.minimumServices=async function(profile){
    const d=await this.json('data/catalog/servicios_minimos_lbrl.json');
    let admin=profile;
    if(profile?.entity_type!=='municipality'&&profile?.parent_municipality_id){admin=await this.loadPlace(profile.parent_municipality_id)||profile}
    const pop=profile?.entity_type==='municipality'?(profile?.population??profile?.municipal_population):(admin?.population??profile?.municipal_population??null);
    if(pop==null)return {...d,population:null,services:[],band:'Población municipal pendiente',coordination:[]};
    const services=[];
    for(const band of d.bands||[])if(pop>=band.min)services.push(...band.services);
    return {...d,population:pop,services,band:this.populationBand(pop),coordination:pop<20000?(d.under_20000_coordination||[]):[]};
  };
  BM.verifiedOpportunitiesFor=async function(profile,{includeAnnounced=true,limit=12}={}){
    const all=await this.opportunities();
    const allowed=new Set(includeAnnounced?['open','announced']:['open']);
    return all.filter(o=>o.review_status!=='pending'&&allowed.has(o.status)).map(o=>({o,match:this.matchOpportunity(o,profile),score:this.opportunityScore(o,profile)})).filter(x=>x.match.level!=='fail').sort((a,b)=>b.score-a.score).slice(0,limit);
  };
  BM.coreObligations=async function(){
    const all=await this.obligations();
    const weight={critico:4,alto:3,medio:2,bajo:1};
    return all.filter(o=>o.review_status!=='pending').sort((a,b)=>(weight[b.impact]||0)-(weight[a.impact]||0));
  };
  BM.simpleDashboard=async function(profile){
    if(!profile)return null;
    const [minimum,obligations,opportunities,plan,metrics]=await Promise.all([
      this.minimumServices(profile),this.coreObligations(),this.verifiedOpportunitiesFor(profile,{limit:5}),this.build90DayPlan(profile),this.metricsFor(profile)
    ]);
    const keyObligations=obligations.filter(x=>['critico','alto'].includes(x.impact)).slice(0,4);
    const priorities=[];
    if(keyObligations[0])priorities.push({kind:'Cumplimiento',title:keyObligations[0].title,text:keyObligations[0].summary,href:'obligaciones/detalle.html?id='+keyObligations[0].id});
    if(minimum.services.length)priorities.push({kind:'Servicios mínimos',title:`Revisar ${minimum.services.length} servicios exigibles por tamaño`,text:`${minimum.band}. Brújula muestra solo los escalones que corresponden a la población municipal.`,href:'obligaciones/'});
    if(opportunities[0])priorities.push({kind:'Financiación',title:opportunities[0].o.title,text:opportunities[0].match.label,href:'oportunidades/detalle.html?id='+opportunities[0].o.id});
    const p0=plan?.projects?.[0]; if(p0)priorities.push({kind:'Actuación',title:p0.title,text:p0.summary,href:'proyectos/detalle.html?id='+p0.id});
    return {profile,minimum,keyObligations,opportunities,plan,metrics,priorities:priorities.slice(0,4)};
  };
  BM.applySimpleChrome=function(){
    const base=this.base();
    const path=location.pathname;
    document.querySelectorAll('.navlinks').forEach(nav=>{
      nav.innerHTML=`<a href="${base}" ${/(^|\/)index\.html$/.test(path)||path==='/'?'aria-current="page"':''}>Inicio</a><a href="${base}obligaciones/" ${path.includes('/obligaciones/')?'aria-current="page"':''}>Obligaciones</a><a href="${base}oportunidades/" ${path.includes('/oportunidades/')?'aria-current="page"':''}>Ayudas</a><a href="${base}plan/" ${path.includes('/plan/')?'aria-current="page"':''}>Mi plan</a>`;
    });
    document.querySelectorAll('.workspace-btn').forEach(x=>x.remove());
    document.querySelectorAll('.brand-sub').forEach(x=>x.textContent='decisiones claras para municipios pequeños');
    document.querySelectorAll('.municipality-copy small').forEach(x=>x.textContent='Cambiar municipio');
    document.body.classList.add('bm-simple');
  };
  window.addEventListener('DOMContentLoaded',()=>BM.applySimpleChrome());
  window.addEventListener('bm-ready',()=>BM.applySimpleChrome());
})();

/* v1.2.1 RICH MINIMAL · toda la información, en capas */
(function(){
  BM.richStats=async function(profile){
    const [projects,opps,obls,support,services,playbooks,signals]=await Promise.all([
      this.json('data/catalog/proyectos.json'),this.opportunities(),this.obligations(),this.support(),this.services(),this.playbooks(),this.signals()
    ]);
    const verified=opps.filter(o=>o.review_status!=='pending'&&o.status!=='pending_review');
    const radar=opps.filter(o=>o.review_status==='pending'||o.status==='pending_review');
    const boeRadar=obls.filter(o=>o.review_status==='pending');
    return {projects:projects.length,opportunities:opps.length,verified_opportunities:verified.length,radar_opportunities:radar.length,obligations:obls.filter(o=>o.review_status!=='pending').length,boe_radar:boeRadar.length,support:support.length,services:services.length,playbooks:playbooks.length,signals:signals.length};
  };
  BM.projectRecommendations=async function(profile,limit=8){
    const projects=await this.json('data/catalog/proyectos.json');
    if(!profile)return projects.slice(0,limit);
    return projects.map(p=>({p,score:this.projectFitScore(p,profile)})).sort((a,b)=>b.score-a.score).slice(0,limit).map(x=>x.p);
  };
  BM.opportunityLayers=async function(profile){
    const all=await this.opportunities();
    const rows=all.map(o=>({o,match:this.matchOpportunity(o,profile),score:this.opportunityScore(o,profile)}));
    const recommended=rows.filter(x=>x.o.review_status!=='pending'&&x.o.status!=='pending_review'&&['open','announced'].includes(x.o.status)&&x.match.level!=='fail').sort((a,b)=>b.score-a.score);
    const radar=rows.filter(x=>x.o.review_status==='pending'||x.o.status==='pending_review').sort((a,b)=>b.score-a.score);
    return {all:rows.sort((a,b)=>b.score-a.score),recommended,radar};
  };
  BM.obligationLayers=async function(){
    const all=await this.obligations();
    const weight={critico:4,alto:3,medio:2,bajo:1};
    const curated=all.filter(o=>o.review_status!=='pending').sort((a,b)=>(weight[b.impact]||0)-(weight[a.impact]||0));
    const radar=all.filter(o=>o.review_status==='pending');
    return {all,curated,radar};
  };
  BM.applySimpleChrome=function(){
    const base=this.base(),path=location.pathname;
    document.querySelectorAll('.navlinks').forEach(nav=>{
      nav.innerHTML=`<a href="${base}" ${path==='/'||/(^|\/)index\.html$/.test(path)?'aria-current="page"':''}>Inicio</a><a href="${base}obligaciones/" ${path.includes('/obligaciones/')?'aria-current="page"':''}>Obligaciones</a><a href="${base}oportunidades/" ${path.includes('/oportunidades/')?'aria-current="page"':''}>Ayudas</a><a href="${base}proyectos/" ${path.includes('/proyectos/')?'aria-current="page"':''}>Proyectos</a><a href="${base}plan/" ${path.includes('/plan/')?'aria-current="page"':''}>Mi plan</a>`;
    });
    document.querySelectorAll('.workspace-btn').forEach(x=>x.remove());
    document.querySelectorAll('.brand-sub').forEach(x=>x.textContent='decisiones claras para municipios pequeños');
    document.querySelectorAll('.municipality-copy small').forEach(x=>x.textContent='Cambiar municipio');
    document.body.classList.add('bm-simple','bm-rich-minimal');
  };
  window.addEventListener('DOMContentLoaded',()=>BM.applySimpleChrome());
  window.addEventListener('bm-ready',()=>BM.applySimpleChrome());
})();

/* v1.3.0 SMART SIMPLE · inteligencia profunda, interfaz mínima */
(function(){
  BM.simpleLogic=async function(){return this.cache.__simpleLogic||(this.cache.__simpleLogic=await this.json('data/catalog/logica_simple.json'))};
  BM.resolveAdministrativeMunicipality=async function(profile){
    if(!profile)return null;
    if(profile.entity_type==='municipality')return profile;
    if(profile.parent_municipality_id){const p=await this.loadPlace(profile.parent_municipality_id);if(p)return p}
    if(profile.parent_municipality){
      const rows=await this.searchPlaces(profile.parent_municipality);
      const exact=rows.find(x=>x.entity_type==='municipality'&&this.normalize(x.name)===this.normalize(profile.parent_municipality)&&(!profile.province||this.normalize(x.province)===this.normalize(profile.province)));
      if(exact)return await this.loadPlace(exact.id)||exact;
    }
    return profile.municipal_population!=null?{...profile,entity_type:'municipality',name:profile.parent_municipality||profile.name,population:profile.municipal_population}:null;
  };
  BM.relativeTerritorialSignals=async function(metrics,peer){
    const logic=await this.simpleLogic(), med=peer?.benchmark?.median||{},out=[];
    for(const r of logic.relative_signals||[]){const v=metrics?.[r.metric],m=med?.[r.metric];if(typeof v!=='number'||typeof m!=='number'||!Number.isFinite(v)||!Number.isFinite(m))continue;let ok=false;
      if(r.direction==='low')ok=v<m*r.ratio;
      if(r.direction==='high')ok=v>m*r.ratio;
      if(r.direction==='high_delta')ok=v>m+r.delta;
      if(r.direction==='low_delta')ok=v<m-r.delta;
      if(ok)out.push({...r,value:v,peer_median:m,severity:'context'});
    }return out;
  };
  BM.smartContext=async function(profile){
    if(!profile)return null;const admin=await this.resolveAdministrativeMunicipality(profile);const metricProfile=admin?.entity_type==='municipality'?admin:profile;const metrics=await this.metricsFor(metricProfile);const peer=await this.peerContext(metricProfile,metrics);const [baseSignals,relative,logic,supportAll,commonServices]=await Promise.all([this.territorialSignals(metrics),this.relativeTerritorialSignals(metrics,peer),this.simpleLogic(),this.support(),this.services()]);
    const population=metrics?.population??admin?.population??profile.municipal_population??(profile.entity_type==='municipality'?profile.population:null);
    const entityRoute=profile.entity_type==='municipality'?'direct':profile.entity_type==='eatim'?'eatim':'parent';
    const priorityTags=new Set([...baseSignals,...relative].flatMap(x=>x.tags||[]));
    if(population!=null&&population<=1000){['administracion','contratacion','servicios','digitalizacion'].forEach(x=>priorityTags.add(x))}
    else if(population!=null&&population<=5000){['servicios','administracion'].forEach(x=>priorityTags.add(x))}
    if(entityRoute!=='direct'){priorityTags.add('servicios');priorityTags.add('administracion')}
    const legalProvincial=(logic.provincial_rules||[]).filter(r=>population!=null&&population<=r.max_population).map(r=>({...r,source:logic.sources?.lbrl||null}));
    const verifiedProvincial=supportAll.filter(x=>x.province&&profile.province&&this.normalize(x.province)===this.normalize(profile.province)).filter(x=>{
      const types=x.entity_types||[];if(!types.length)return true;if(profile.entity_type==='eatim'&&types.includes('eatim'))return true;if(profile.entity_type==='population_entity')return types.includes('municipality');return types.includes('municipality')||types.includes('local_entity');
    });
    const reasons=[];
    if(profile.entity_type==='eatim')reasons.push(`EATIM · los umbrales municipales se calculan con ${admin?.name||profile.parent_municipality||'el municipio matriz'}`);
    else if(profile.entity_type==='population_entity')reasons.push(`Núcleo de población · tramitación y umbrales vía ${admin?.name||profile.parent_municipality||'municipio matriz'}`);
    if(population!=null)reasons.push(this.populationBand(population));
    [...baseSignals,...relative].slice(0,2).forEach(s=>reasons.push(s.title));
    if(verifiedProvincial.length)reasons.push(`${verifiedProvincial.length} apoyos provinciales verificados`);
    return {profile,admin,population,entityRoute,metrics,peer,signals:[...baseSignals,...relative],priorityTags:[...priorityTags],legalProvincial,verifiedProvincial,commonServices,reasons:[...new Set(reasons)].slice(0,4)};
  };
  BM.minimumServices=async function(profile){
    const d=await this.json('data/catalog/servicios_minimos_lbrl.json');if(!profile)return {...d,population:null,services:[],rows:[],band:'Selecciona municipio',coordination:[]};const ctx=await this.smartContext(profile),pop=ctx.population;
    if(pop==null)return {...d,population:null,services:[],rows:[],band:'Población municipal pendiente',coordination:[],context:ctx,legal_provincial:ctx.legalProvincial,verified_provincial:ctx.verifiedProvincial};
    const services=[];for(const band of d.bands||[])if(pop>=band.min)services.push(...band.services);const coordination=pop<20000?(d.under_20000_coordination||[]):[],coordSet=new Set(coordination.map(x=>this.normalize(x)));
    const rows=services.map(service=>{const n=this.normalize(service),coordKey=['alumbrado publico','limpieza viaria','acceso a los nucleos','pavimentacion','recogida de residuos','abastecimiento domiciliario','alcantarillado'].some(k=>n.includes(k)),coordinated=pop<20000&&(coordKey||[...coordSet].some(x=>n.includes(x)||x.includes(n)));let route='Ayuntamiento';let note='Servicio mínimo municipal.';
      if(ctx.entityRoute!=='direct'){route=`Municipio matriz${ctx.admin?.name?' · '+ctx.admin.name:''}`;note='El umbral del artículo 26 se aplica al municipio; revisar competencias/delegaciones de la entidad inframunicipal.'}
      else if(coordinated){route='Ayuntamiento · coordinación provincial posible';note='En municipios de menos de 20.000 habitantes la Diputación o equivalente coordina este servicio en los términos del art. 26.2 LBRL.'}
      return {service,route,note,coordinated};
    });
    return {...d,population:pop,services,rows,band:this.populationBand(pop),coordination,context:ctx,legal_provincial:ctx.legalProvincial,verified_provincial:ctx.verifiedProvincial};
  };
  BM.smartObligationFit=async function(o,ctx){
    const logic=await this.simpleLogic(),rule=logic.obligation_rules?.[o.id]||{mode:'general'};let score=({critico:10,alto:7,medio:4,bajo:2}[o.impact]||1),label='Revisar',level='relevant',reason='Marco u obligación práctica relevante para la entidad.';
    if((ctx?.priorityTags||[]).includes(o.category)){score+=4;reason='Además conecta con una característica o prioridad del municipio.'}
    if(rule.mode==='conditional'||rule.mode==='conditional_common'){score-=2;label='Solo si se da esta situación';level='conditional';reason=rule.condition}
    else if(rule.mode==='activity'){score-=1;label='Cuando realices esta actividad';level='conditional';reason=rule.condition}
    else if(rule.mode==='service'){score+=2;label='Ligada a un servicio municipal';reason=rule.condition}
    if(ctx?.entityRoute==='parent'){score-=1;label='Vía municipio matriz';reason=`La referencia administrativa principal es ${ctx.admin?.name||'el municipio matriz'}. ${reason}`}
    if(ctx?.entityRoute==='eatim'){score-=1;label='Revisar alcance EATIM';reason=`No se presume la misma competencia que un municipio. Revisar normativa autonómica, competencias propias/delegadas y, cuando corresponda, ${ctx.admin?.name||'municipio matriz'}. ${reason}`}
    return {score,label,level,reason,rule};
  };
  BM.smartObligationLayers=async function(profile){
    const all=await this.obligations(),ctx=profile?await this.smartContext(profile):null,weight={critico:4,alto:3,medio:2,bajo:1};const curated=[],radar=[];
    for(const o of all){if(o.review_status==='pending'){let score=o.detection_score||0;if(ctx?.priorityTags?.includes(o.category))score+=8;radar.push({o,score,label:ctx?.priorityTags?.includes(o.category)?'Prioridad de revisión':'Vigilancia',reason:ctx?.priorityTags?.includes(o.category)?'La materia coincide con señales o prioridades del municipio.':'Cambio detectado; falta confirmar efecto concreto.'})}else{const fit=ctx?await this.smartObligationFit(o,ctx):{score:(weight[o.impact]||0)*2,label:'Revisar',level:'relevant',reason:o.summary};curated.push({o,fit,score:fit.score})}}
    curated.sort((a,b)=>b.score-a.score);radar.sort((a,b)=>b.score-a.score);return {all,curated,radar,context:ctx};
  };
  BM.smartProjectRecommendations=async function(profile,limit=8){
    const projects=await this.json('data/catalog/proyectos.json');if(!profile)return projects.slice(0,limit).map(p=>({p,score:0,reasons:['Proyecto del catálogo']}));const ctx=await this.smartContext(profile),obls=await this.smartObligationLayers(profile);const topObl=new Set(obls.curated.slice(0,8).map(x=>x.o.id));
    const rows=projects.map(p=>{let score=this.projectFitScore(p,profile),reasons=[],overlap=(p.tags||[]).filter(t=>ctx.priorityTags.includes(t)||ctx.priorityTags.includes(p.category));if(overlap.length){score+=Math.min(9,overlap.length*3);reasons.push('Responde al contexto del municipio')}
      if(ctx.population!=null&&ctx.population<=1000){if(p.complexity==='baja'){score+=4;reasons.push('Adecuado para una estructura municipal muy pequeña')}if(p.complexity==='alta')score-=6;if(['€€€','€€€€'].includes(p.cost_band))score-=5}
      else if(ctx.population!=null&&ctx.population<=5000){if(p.complexity==='baja')score+=2;if(p.complexity==='alta')score-=3;if(p.cost_band==='€€€€')score-=3}
      if(ctx.entityRoute!=='direct'&&p.complexity==='alta')score-=2;
      const obligationHit=(p.obligations||[]).some(id=>topObl.has(id));if(obligationHit){score+=3;reasons.push('Conecta con una obligación prioritaria')}
      const genericTopics=new Set(['servicios','administracion','digitalizacion']);const topicMatch=s=>(s.topics||[]).includes(p.category)||(s.topics||[]).some(t=>!genericTopics.has(t)&&(p.tags||[]).includes(t));
      const provincial=ctx.verifiedProvincial.filter(topicMatch);if(provincial.length){const substitutable=['administracion','digitalizacion','contratacion','tributos','archivo','interoperabilidad'].includes(p.category)||(p.tags||[]).some(t=>['registro','interoperabilidad'].includes(t));if(substitutable)score-=4;else score+=1;reasons.push(`Antes de comprar, comprobar apoyo provincial: ${provincial[0].title}`)}
      const legalProv=ctx.legalProvincial.filter(topicMatch);if(legalProv.length&&!provincial.length){score-=1;reasons.push('Comprobar primero si la Diputación puede prestar o coordinar esta necesidad')}
      const common=ctx.commonServices.filter(topicMatch);if(common.length){score-=3;reasons.push(`Antes de desarrollar, revisar servicio común: ${common[0].title}`)}
      if(ctx.entityRoute!=='direct')reasons.push(`Coordinar con ${ctx.admin?.name||'el municipio matriz'}`);
      return {p,score,reasons:[...new Set(reasons)].slice(0,3),provincial,common};
    }).sort((a,b)=>b.score-a.score);return rows.slice(0,limit);
  };
  BM.smartOpportunityFit=async function(o,ctx){
    if(!ctx)return {tier:'explore',score:o.detection_score||0,label:'Explorar',reasons:['Selecciona municipio para valorar el encaje'],match:null};const match=this.matchOpportunity(o,ctx.profile);if(match.level==='fail')return {tier:'excluded',score:-100,label:'No parece aplicable',reasons:match.checks.filter(x=>x[0]==='fail').map(x=>x[1]),match};
    const topics=(o.topics||[]).filter(t=>ctx.priorityTags.includes(t)),explicit=(o.beneficiary_types||[]).length>0,hardPass=explicit&&match.checks?.length&&match.checks.every(c=>c[0]==='pass');let score=this.opportunityScore(o,ctx.profile)+(o.detection_score?Math.min(5,o.detection_score/5):0)+topics.length*3,reasons=[];
    if(topics.length)reasons.push(`Relacionada con ${topics.slice(0,2).join(' · ')}`);
    if(hardPass){score+=5;reasons.push('Beneficiario, población y ámbito detectados encajan')}
    else if(!explicit)reasons.push('La BDNS no ha permitido confirmar aún el beneficiario');
    if(match.route==='parent_municipality')reasons.push(`Posible vía ${ctx.admin?.name||'municipio matriz'}`);
    const days=this.daysUntil(o.deadline);if(days!=null&&days>=0){score+=2;reasons.push(`Plazo detectado: ${days} días`)}
    if(o.review_status!=='pending'&&o.status!=='pending_review')return {tier:'verified',score:score+8,label:'Verificada · revisar bases',reasons:[match.label,...reasons].slice(0,3),match};
    if(hardPass&&topics.length)return {tier:'likely',score,label:'Buen candidato · revisar bases',reasons:reasons.slice(0,3),match};
    if((explicit&&match.level!=='fail')||topics.length)return {tier:'possible',score,label:match.route==='parent_municipality'?'Posible vía municipio matriz':'Puede encajar · comprobar',reasons:reasons.slice(0,3),match};
    return {tier:'low',score,label:'Baja prioridad de revisión',reasons:reasons.slice(0,2),match};
  };
  BM.smartOpportunityLayers=async function(profile){
    const all=await this.opportunities(),ctx=profile?await this.smartContext(profile):null,rows=[];for(const o of all){rows.push({o,fit:await this.smartOpportunityFit(o,ctx)})}rows.sort((a,b)=>b.fit.score-a.fit.score);
    return {context:ctx,verified:rows.filter(x=>x.fit.tier==='verified'&&['open','announced'].includes(x.o.status)),likely:rows.filter(x=>x.fit.tier==='likely'),possible:rows.filter(x=>x.fit.tier==='possible'),low:rows.filter(x=>x.fit.tier==='low'),excluded:rows.filter(x=>x.fit.tier==='excluded'),all:rows};
  };
  BM.smartDashboard=async function(profile){
    if(!profile)return null;const [ctx,min,obls,opps,projects]=await Promise.all([this.smartContext(profile),this.minimumServices(profile),this.smartObligationLayers(profile),this.smartOpportunityLayers(profile),this.smartProjectRecommendations(profile,6)]);const priorities=[];
    if(obls.curated[0])priorities.push({kind:'Cumplimiento',title:obls.curated[0].o.title,text:obls.curated[0].fit.label+' · '+obls.curated[0].fit.reason,href:'obligaciones/detalle.html?id='+obls.curated[0].o.id});
    const pSupport=ctx.verifiedProvincial[0]||ctx.legalProvincial[0];if(pSupport)priorities.push({kind:'Apoyo provincial',title:pSupport.title,text:pSupport.summary||pSupport.message||'Comprobar prestación o asistencia antes de contratar una solución propia.',href:'obligaciones/'});
    const f=opps.verified[0]||opps.likely[0]||opps.possible[0];if(f)priorities.push({kind:'Financiación',title:f.o.title,text:f.fit.label+(f.fit.reasons[0]?' · '+f.fit.reasons[0]:''),href:'oportunidades/detalle.html?id='+f.o.id});
    if(projects[0])priorities.push({kind:'Actuación',title:projects[0].p.title,text:projects[0].reasons[0]||projects[0].p.summary,href:'proyectos/detalle.html?id='+projects[0].p.id});
    return {profile,context:ctx,minimum:min,obligations:obls,opportunities:opps,projects,priorities:priorities.slice(0,4)};
  };
  BM.smart90DayPlan=async function(profile){
    const dash=await this.smartDashboard(profile),ctx=dash.context,obls=dash.obligations.curated.slice(0,4),projects=dash.projects.slice(0,4),fund=[...dash.opportunities.verified,...dash.opportunities.likely,...dash.opportunities.possible].slice(0,3);const support=ctx.verifiedProvincial[0]||ctx.legalProvincial[0];
    const phases=[
      {range:'0–30 días',goal:'Aclarar obligaciones y usar lo que ya existe',actions:[`Comprobar cómo se prestan los servicios mínimos que corresponden a ${ctx.admin?.name||profile.name}.`,...(support?[`Comprobar antes de contratar: ${support.title}.`]:[]),...obls.slice(0,2).map(x=>`${x.fit.label}: ${x.o.title}.`)]},
      {range:'31–60 días',goal:'Elegir pocas actuaciones con buen encaje',actions:[...projects.slice(0,3).map(x=>`Definir alcance mínimo de ${x.p.title}${x.reasons[0]?' · '+x.reasons[0]:''}.`),...fund.slice(0,1).map(x=>`Revisar bases y encaje de ${x.o.title}.`)]},
      {range:'61–90 días',goal:'Preparar ejecución y financiación',actions:[...fund.slice(0,2).map(x=>`Decidir si preparar solicitud para ${x.o.title} (${x.fit.label}).`),...projects.slice(0,1).map(x=>`Cerrar responsable, coste recurrente y siguiente hito de ${x.p.title}.`)]}
    ];return {...dash,phases};
  };
})();

/* v1.4.0 DECISION ENGINE · mucha inteligencia detrás, pocas decisiones delante */
(function(){
  BM._decisionKey=function(profile,suffix=''){return `__v140_${suffix}_${profile?.id||profile?.name||'none'}`};
  BM._finite=function(v){return typeof v==='number'&&Number.isFinite(v)};
  BM._uniq=function(xs){return [...new Set((xs||[]).filter(Boolean))]};
  BM.capacityProfile=async function(population){
    const logic=await this.simpleLogic();
    return (logic.capacity_bands||[]).find(x=>population!=null&&population<=x.max_population)||(logic.capacity_bands||[]).slice(-1)[0]||{};
  };
  BM._signalWeight=async function(signal){
    const logic=await this.simpleLogic();
    if(signal?.weight!=null)return signal.weight;
    return (logic.severity_weights||{})[signal?.severity]||2;
  };
  BM._topicFamily=async function(tag){
    const logic=await this.simpleLogic(),n=this.normalize(tag);
    for(const [family,tags] of Object.entries(logic.topic_families||{}))if((tags||[]).some(x=>this.normalize(x)===n))return family;
    return tag||'otros';
  };
  BM._topicAffinity=function(itemTags,ctx){
    let score=0,hits=[];for(const raw of itemTags||[]){const t=this.normalize(raw);const w=ctx?.tagWeights?.[t]||0;if(w>0){score+=w;hits.push({tag:raw,weight:w})}}
    hits.sort((a,b)=>b.weight-a.weight);return {score,hits};
  };
  BM._evidenceConfidence=function(o){
    if(o?.extraction_confidence)return o.extraction_confidence;
    if(o?.review_status!=='pending'&&o?.status!=='pending_review'&&o?.verified)return 'high';
    let n=0;if((o?.beneficiary_types||[]).length)n++;if((o?.territories||[]).length||o?.scope==='España')n++;if(o?.deadline)n++;if(o?.bases_url||o?.source)n++;
    return n>=3?'medium':'low';
  };
  BM._topicMatch=function(subject,service){
    const a=this._uniq([subject?.category,...(subject?.tags||[]),...(subject?.topics||[])]).map(x=>this.normalize(x));
    const b=this._uniq([service?.category,...(service?.topics||[])]).map(x=>this.normalize(x));
    return a.some(x=>b.includes(x))||a.some(x=>b.some(y=>x.length>4&&y.length>4&&(x.includes(y)||y.includes(x))));
  };

  BM.smartContext=async function(profile){
    if(!profile)return null;const key=this._decisionKey(profile,'ctx');if(this.cache[key])return this.cache[key];
    const promise=(async()=>{
      const admin=await this.resolveAdministrativeMunicipality(profile),metricProfile=admin?.entity_type==='municipality'?admin:profile;
      const metrics=await this.metricsFor(metricProfile),peer=await this.peerContext(metricProfile,metrics);
      const [rawBase,relative,logic,supportAll,commonServices]=await Promise.all([this.territorialSignals(metrics),this.relativeTerritorialSignals(metrics,peer),this.simpleLogic(),this.support(),this.services()]);
      const population=metrics?.population??admin?.population??profile.municipal_population??(profile.entity_type==='municipality'?profile.population:null);
      const entityRoute=profile.entity_type==='municipality'?'direct':profile.entity_type==='eatim'?'eatim':'parent',localPopulation=profile.population??population,capacityPopulation=entityRoute==='direct'?population:(localPopulation??population),capacity=await this.capacityProfile(capacityPopulation);
      // Para reglas absolutas sobre una misma métrica conservamos la más intensa (evita duplicar “baja” y “muy baja”).
      const byMetric=new Map();for(const s of rawBase||[]){const w=await this._signalWeight(s),old=byMetric.get(s.metric);if(!old||w>old._weight)byMetric.set(s.metric,{...s,_weight:w})}
      const baseSignals=[...byMetric.values()],signals=[...baseSignals,...(relative||[])];
      const tagWeights={};for(const s of signals){const w=await this._signalWeight(s);for(const tag of s.tags||[]){const n=this.normalize(tag);tagWeights[n]=(tagWeights[n]||0)+w}}
      const add=(tag,w)=>{const n=this.normalize(tag);tagWeights[n]=(tagWeights[n]||0)+w};
      if(population!=null&&population<=500){[['administracion',5],['servicios',5],['digitalizacion',3],['contratacion',4],['ciberseguridad',3]].forEach(x=>add(...x))}
      else if(population!=null&&population<=1000){[['administracion',4],['servicios',4],['contratacion',3],['digitalizacion',3]].forEach(x=>add(...x))}
      else if(population!=null&&population<=5000){[['servicios',3],['administracion',3],['digitalizacion',2]].forEach(x=>add(...x))}
      if(entityRoute!=='direct'){add('administracion',4);add('servicios',3)}
      const priorityTags=Object.entries(tagWeights).sort((a,b)=>b[1]-a[1]).map(x=>x[0]);
      const legalProvincial=(logic.provincial_rules||[]).filter(r=>population!=null&&population<=r.max_population).map(r=>({...r,source:logic.sources?.lbrl||null}));
      const verifiedProvincial=supportAll.filter(x=>x.province&&profile.province&&this.normalize(x.province)===this.normalize(profile.province)).filter(x=>{
        const types=x.entity_types||[];if(!types.length)return true;if(profile.entity_type==='eatim')return types.includes('eatim')||types.includes('local_entity');if(profile.entity_type==='population_entity')return types.includes('municipality');return types.includes('municipality')||types.includes('local_entity');
      });
      const known=['population','population_change','density','mean_age','over65','under18_pct','broadband100','income_per_person','income_per_household','one_person_households'].filter(k=>this._finite(metrics?.[k]));
      const dataConfidence=known.length>=6?'high':known.length>=3?'medium':'basic';
      const constraints=[],advantages=[];
      if(capacity?.shared_first)constraints.push('Conviene priorizar soluciones compartidas y con poco mantenimiento');
      if(entityRoute!=='direct')constraints.push('Las competencias y la vía de tramitación deben confirmarse con el municipio matriz o régimen de la entidad');
      if((signals||[]).some(s=>s.id==='connectivity_gap'||s.id==='broadband_peer_low'))constraints.push('No diseñar servicios que dependan exclusivamente de conectividad doméstica');
      if(verifiedProvincial.length)advantages.push('Existe apoyo provincial concreto verificado que puede evitar compras o trabajo duplicado');
      if(commonServices.length)advantages.push('Hay servicios comunes estatales que deben comprobarse antes de desarrollar soluciones propias');
      const reasons=[];
      if(profile.entity_type==='eatim')reasons.push(`EATIM · umbrales municipales sobre ${admin?.name||profile.parent_municipality||'municipio matriz'}`);
      else if(profile.entity_type==='population_entity')reasons.push(`Núcleo · decisiones administrativas vía ${admin?.name||profile.parent_municipality||'municipio matriz'}`);
      if(population!=null)reasons.push(this.populationBand(population));
      signals.slice().sort((a,b)=>(b._weight||b.weight||0)-(a._weight||a.weight||0)).slice(0,2).forEach(s=>reasons.push(s.title));
      if(verifiedProvincial.length)reasons.push(`${verifiedProvincial.length} apoyos provinciales verificados`);
      return {profile,admin,population,legalPopulation:population,localPopulation,capacityPopulation,entityRoute,capacity,metrics,peer,signals,tagWeights,priorityTags,legalProvincial,verifiedProvincial,commonServices,dataConfidence,constraints,advantages,reasons:this._uniq(reasons).slice(0,4)};
    })();this.cache[key]=promise;return promise;
  };

  BM.smartObligationFit=async function(o,ctx){
    const logic=await this.simpleLogic(),rule=logic.obligation_rules?.[o.id]||{mode:'general'},impact=({critico:12,alto:9,medio:5,bajo:2}[o.impact]||3);
    let score=impact,label='Revisar',level='relevant',reason='Obligación o marco práctico relevante para la entidad.',decision='do_now',route='municipality',confidence=o.certainty==='official-law'?'high':'medium';
    const affinity=this._topicAffinity([o.category,...(o.topics||[])],ctx);score+=Math.min(8,affinity.score);
    if(rule.mode==='conditional'||rule.mode==='conditional_common'){score-=4;label='Solo si se da esta situación';level='conditional';decision='explore';reason=rule.condition}
    else if(rule.mode==='activity'){score-=2;label='Cuando realices esta actividad';level='conditional';decision='prepare';reason=rule.condition}
    else if(rule.mode==='service'){score+=2;label='Ligada a un servicio municipal';reason=rule.condition}
    else if(rule.mode==='good_practice'||rule.mode==='good_practice_critical'){label=rule.mode==='good_practice_critical'?'Control operativo prioritario':'Buena práctica recomendada';level='practice';decision=rule.mode==='good_practice_critical'?'do_now':'prepare';reason=rule.condition;confidence='medium'}
    // Caso legal específico: todos los municipios tienen canal interno; <10.000 pueden compartir medios.
    if(o.id==='canal-interno'&&ctx?.entityRoute==='direct'){
      label=ctx.population!=null&&ctx.population<10000?'Obligación · puede compartirse':'Obligación municipal';
      decision=ctx.population!=null&&ctx.population<10000?'shared_compliance':'do_now';
      route=ctx.population!=null&&ctx.population<10000?'shared':'municipality';score+=6;
      reason=ctx.population!=null&&ctx.population<10000?rule.shared_message:'Todos los municipios deben disponer de un Sistema interno de información conforme a la Ley 2/2023.';confidence='high';
    }
    // Cuando la ley básica atribuye asistencia/prestación provincial, se recomienda comprobarla antes de contratar.
    if(ctx?.entityRoute==='direct'&&rule.prefer_provincial_under&&ctx.population!=null&&ctx.population<rule.prefer_provincial_under){
      const topic=rule.provincial_topic||o.category,verified=ctx.verifiedProvincial.find(s=>this._topicMatch({category:topic,tags:[topic]},s)),legal=ctx.legalProvincial.find(s=>(s.topics||[]).some(t=>this.normalize(t)===this.normalize(topic)));
      if(verified||legal){route=verified?'provincial_verified':'provincial_check';decision=decision==='do_now'?'shared_compliance':decision;score+=2;reason=`${reason} ${verified?`Hay apoyo provincial verificado: ${verified.title}.`:`Antes de contratar, comprobar la asistencia/prestación provincial prevista para municipios de este tamaño.`}`}
    }
    if(rule.prefer_common){const common=ctx?.commonServices?.find(s=>this._topicMatch({category:o.category,tags:[rule.provincial_topic||o.category]},s));if(common){route='common_service';decision='check_existing';reason=`${reason} Antes de adquirir una herramienta propia, comprobar si puede resolverse con ${common.title}.`;score+=1}}
    // EATIM / núcleo: no se presume que una obligación municipal se traslade automáticamente.
    if(ctx?.entityRoute==='parent'){score-=2;label='Vía municipio matriz';level='route';decision='prepare';route='parent_municipality';reason=`La referencia administrativa principal es ${ctx.admin?.name||'el municipio matriz'}. No se aplica automáticamente al núcleo como entidad separada. ${reason}`}
    else if(ctx?.entityRoute==='eatim'){
      score-=2;label='Revisar alcance EATIM';level='route';decision='prepare';route='eatim_review';confidence='medium';reason=`No se presume la misma competencia que un municipio. Confirmar personalidad/régimen autonómico, competencias propias o delegadas y la relación con ${ctx.admin?.name||'el municipio matriz'}. ${reason}`;
    }
    const reasons=this._uniq([reason,affinity.hits[0]?`El contexto municipal refuerza ${affinity.hits[0].tag}`:null]);
    return {score,label,level,reason:reasons[0],reasons,decision,route,confidence,rule,breakdown:{impact,need:affinity.score}};
  };

  BM.smartObligationLayers=async function(profile){
    const key=this._decisionKey(profile,'obls');if(profile&&this.cache[key])return this.cache[key];const promise=(async()=>{
      const all=await this.obligations(),ctx=profile?await this.smartContext(profile):null,curated=[],radar=[];
      for(const o of all){if(o.review_status==='pending'){
        const affinity=ctx?this._topicAffinity([o.category,...(o.topics||[])],ctx):{score:0,hits:[]},score=(o.detection_score||0)+Math.min(10,affinity.score);
        radar.push({o,score,label:affinity.score>=5?'Prioridad de revisión':'Vigilancia',reason:affinity.score>=5?`La materia coincide con ${affinity.hits.slice(0,2).map(x=>x.tag).join(' · ')}.`:'Cambio detectado; falta confirmar su efecto concreto en la entidad.'});
      }else{const fit=ctx?await this.smartObligationFit(o,ctx):{score:({critico:12,alto:9,medio:5,bajo:2}[o.impact]||3),label:'Revisar',reason:o.summary,decision:'prepare'};curated.push({o,fit,score:fit.score})}}
      curated.sort((a,b)=>b.score-a.score);radar.sort((a,b)=>b.score-a.score);return {all,curated,radar,context:ctx};
    })();if(profile)this.cache[key]=promise;return promise;
  };

  BM.smartOpportunityFit=async function(o,ctx){
    if(!ctx)return {tier:'explore',score:o.detection_score||0,label:'Explorar',decision:'explore',confidence:'low',reasons:['Selecciona municipio para valorar el encaje'],match:null};
    const n=x=>this.normalize(x),days=this.daysUntil(o.deadline),confidence=this._evidenceConfidence(o),selected=ctx.profile.entity_type||'municipality',benef=o.beneficiary_types||[],targets=o.beneficiary_targets||benef,applicationState=o.application_status||(o.review_status==='pending'?'unknown':o.status);
    let score=0,reasons=[],route=ctx.entityRoute==='parent'?'parent_municipality':ctx.entityRoute,hardFail=false,hardPasses=0,unknowns=0;
    // Estado y plazo son vetos duros cuando son conocidos.
    if(applicationState==='closed_detected'||o.status==='closed'||(days!=null&&days<0))return {tier:'excluded',score:-200,label:'Cerrada',decision:'not_applicable',confidence,reasons:['El plazo detectado ha finalizado.'],match:{level:'fail',route}};
    // Beneficiario. Solo tratamos como veto lo que la fuente identifica de forma suficientemente explícita.
    const directMunicipal=targets.some(x=>['municipality','local_entity'].includes(x));
    const directEatim=targets.includes('eatim');
    const clearlyPrivate=targets.length&&targets.every(x=>['company','individual','nonprofit','private_entity'].includes(x));
    if(clearlyPrivate){hardFail=true;reasons.push('Los beneficiarios detectados son privados, no una entidad local.')}
    else if(selected==='municipality'){
      if(directMunicipal){score+=12;hardPasses++;reasons.push('El tipo de beneficiario detectado incluye entidades locales/municipios.')}else if(targets.length){unknowns++;reasons.push('El tipo de beneficiario no confirma expresamente al municipio.')}else{unknowns++;reasons.push('Beneficiario pendiente de confirmar en bases.')}
    }else if(selected==='eatim'){
      if(directEatim){score+=14;hardPasses++;route='eatim_direct';reasons.push('La convocatoria menciona expresamente EATIM/entidades inframunicipales.')}
      else if(directMunicipal){route='parent_municipality';score+=5;unknowns++;reasons.push(`Puede requerir tramitación mediante ${ctx.admin?.name||'el municipio matriz'}.`)}
      else if(targets.length){unknowns++;reasons.push('No se ha confirmado que una EATIM pueda ser beneficiaria directa.')}else{unknowns++;reasons.push('Beneficiario pendiente de confirmar en bases.')}
    }else{
      if(directMunicipal){route='parent_municipality';score+=5;hardPasses++;reasons.push(`La actuación se analizaría vía ${ctx.admin?.name||'el municipio matriz'}.`)}else unknowns++;
    }
    // Umbrales demográficos sobre municipio administrativo salvo admisión EATIM explícita con regla propia (no se presupone).
    if((o.population_rules||[]).length){for(const r of o.population_rules){let pop=ctx.population,basis=r.basis||'unknown',ambiguous=false;if(selected==='eatim'&&route==='eatim_direct'){if(['eatim','local_entity','beneficiary'].includes(basis))pop=ctx.localPopulation;else if(basis==='municipality')pop=ctx.population;else{pop=ctx.population;ambiguous=true}}if(pop==null){unknowns++;reasons.push('Falta población para comprobar el umbral.');continue}let ok=true;if(r.min!=null)ok=ok&&pop>=r.min;if(r.max!=null)ok=ok&&pop<=r.max;const txt=`${r.min!=null?'≥ '+this.number(r.min):''}${r.min!=null&&r.max!=null?' y ':''}${r.max!=null?'≤ '+this.number(r.max):''}`;if(!ok&&ambiguous){unknowns++;reasons.push(`El umbral ${txt} está detectado, pero en una EATIM hay que confirmar si se refiere a la entidad o al municipio matriz.`)}else if(!ok){hardFail=true;reasons.push(`No cumple el umbral poblacional detectado (${txt}).`)}else{score+=8;hardPasses++;reasons.push(`Cumple el umbral poblacional detectado${selected==='eatim'&&route==='eatim_direct'&&['eatim','local_entity','beneficiary'].includes(basis)?' con la población de la entidad':''}.`)}}}
    // Territorio estructurado.
    const territories=(o.territories||[]).map(n).filter(Boolean);if(territories.length){const vals=[ctx.profile.autonomous_region,ctx.profile.province,'España'].map(n);const national=territories.some(t=>['espana','es','es - espana'].includes(t)||t.includes('espana'));const ok=national||territories.some(t=>vals.some(v=>v&&(t===v||t.includes(v)||v.includes(t))));if(!ok){hardFail=true;reasons.push('El territorio de impacto detectado no coincide con la entidad.')}else{score+=8;hardPasses++;reasons.push(national?'Ámbito estatal detectado.':'El territorio detectado coincide.')}}else if(o.scope==='España'){score+=5;hardPasses++}else{unknowns++}
    if(hardFail)return {tier:'excluded',score:-150,label:'No parece aplicable',decision:'not_applicable',confidence,reasons:this._uniq(reasons).slice(0,3),match:{level:'fail',route}};
    const affinity=this._topicAffinity(o.topics||[],ctx);score+=Math.min(18,affinity.score*1.5);if(affinity.hits.length)reasons.push(`Responde a ${affinity.hits.slice(0,2).map(x=>x.tag).join(' · ')}.`);
    if(applicationState==='open_detected'||o.status==='open')score+=10;else if(applicationState==='future_detected'||o.status==='announced')score+=4;
    if(days!=null&&days>=0&&days<=21){score+=7;reasons.push(`Plazo próximo: ${days} días.`)}else if(days!=null&&days<=60){score+=4;reasons.push(`Plazo detectado: ${days} días.`)}else if(days!=null)score+=1;
    if(o.budget_total)score+=1;if(o.bases_url)score+=2;if(confidence==='high')score+=6;else if(confidence==='medium')score+=2;else score-=4;
    const verified=o.review_status!=='pending'&&o.status!=='pending_review';
    if(verified)return {tier:'verified',score:score+12,label:o.status==='announced'?'Verificada · pendiente de apertura':'Verificada · revisar bases',decision:o.status==='announced'?'prepare':'do_now',confidence,reasons:this._uniq(reasons).slice(0,3),match:{level:unknowns?'unknown':'pass',route}};
    if(hardPasses>=2&&confidence!=='low'&&affinity.score>=3)return {tier:'likely',score,label:'Buen candidato · revisar bases',decision:'prepare',confidence,reasons:this._uniq(reasons).slice(0,3),match:{level:unknowns?'unknown':'pass',route}};
    if((hardPasses>=1||affinity.score>=4)&&confidence!=='low')return {tier:'possible',score,label:route==='parent_municipality'?'Puede encajar vía municipio matriz':'Puede encajar · comprobar',decision:'explore',confidence,reasons:this._uniq(reasons).slice(0,3),match:{level:'unknown',route}};
    return {tier:'low',score,label:'Baja prioridad de revisión',decision:'later',confidence,reasons:this._uniq(reasons).slice(0,2),match:{level:'unknown',route}};
  };

  BM.smartOpportunityLayers=async function(profile){
    const key=this._decisionKey(profile,'opps');if(profile&&this.cache[key])return this.cache[key];const promise=(async()=>{
      const all=await this.opportunities(),ctx=profile?await this.smartContext(profile):null,rows=[];for(const o of all)rows.push({o,fit:await this.smartOpportunityFit(o,ctx)});rows.sort((a,b)=>b.fit.score-a.fit.score);
      return {context:ctx,verified:rows.filter(x=>x.fit.tier==='verified'&&['open','announced','pending_review'].includes(x.o.status)),likely:rows.filter(x=>x.fit.tier==='likely'),possible:rows.filter(x=>x.fit.tier==='possible'),low:rows.filter(x=>x.fit.tier==='low'),excluded:rows.filter(x=>x.fit.tier==='excluded'),all:rows};
    })();if(profile)this.cache[key]=promise;return promise;
  };

  BM._projectDecision=async function(p,ctx,topObligations,fundingRows){
    const logic=await this.simpleLogic(),aff=this._topicAffinity([p.category,...(p.tags||[])],ctx),cap=ctx.capacity||{},breakdown={need:Math.min(22,aff.score*1.7),compliance:0,feasibility:0,reuse:0,funding:0,route:0},reasons=[];
    const linked=(p.obligations||[]).filter(id=>topObligations.has(id));if(linked.length){breakdown.compliance+=8;reasons.push('Ayuda a responder a una obligación o control prioritario')}
    if(aff.hits.length)reasons.push(`Encaja con ${aff.hits.slice(0,2).map(x=>x.tag).join(' · ')}`);
    if((cap.complexity_preference||[]).includes(p.complexity))breakdown.feasibility+=6;else if(p.complexity==='alta')breakdown.feasibility-=8;
    if(p.cost_max!=null&&cap.max_preferred_cost!=null){if(p.cost_max<=cap.max_preferred_cost)breakdown.feasibility+=5;else if(p.cost_min!=null&&p.cost_min>cap.max_preferred_cost)breakdown.feasibility-=8;else breakdown.feasibility-=3}
    if(ctx.population!=null&&ctx.population<=500&&p.complexity==='baja')reasons.push('Proporcional a una estructura municipal muy pequeña');
    if(ctx.entityRoute!=='direct'){breakdown.route-=3;reasons.push(`Coordinar con ${ctx.admin?.name||'el municipio matriz'}`)}
    const verified=ctx.verifiedProvincial.filter(s=>this._topicMatch(p,s)),legal=ctx.legalProvincial.filter(s=>this._topicMatch(p,s)),common=ctx.commonServices.filter(s=>this._topicMatch(p,s));
    const substitutable=(logic.reuse_categories||[]).some(c=>this.normalize(c)===this.normalize(p.category))||(p.tags||[]).some(t=>(logic.reuse_categories||[]).some(c=>this.normalize(c)===this.normalize(t)));
    let decision='prepare';if(substitutable&&verified.length){breakdown.reuse-=12;decision='check_existing';reasons.unshift(`Comprobar antes el apoyo provincial: ${verified[0].title}`)}
    else if(substitutable&&common.length){breakdown.reuse-=10;decision='check_existing';reasons.unshift(`Comprobar antes el servicio común: ${common[0].title}`)}
    else if(substitutable&&legal.length){breakdown.reuse-=6;decision='check_existing';reasons.unshift('Comprobar primero si Diputación puede prestar o coordinar esta necesidad')}
    else if(verified.length){breakdown.reuse+=2;reasons.push(`Puede apoyarse en ${verified[0].title}`)}
    // Financiación es un acelerador, nunca el motivo único para hacer un proyecto.
    const fund=(fundingRows||[]).filter(x=>x.fit.tier!=='excluded'&&x.fit.tier!=='low').map(x=>({x,aff:this._topicAffinity(x.o.topics||[],{tagWeights:Object.fromEntries(this._uniq([p.category,...(p.tags||[])]).map(t=>[this.normalize(t),2]))})})).filter(x=>x.aff.score>0).sort((a,b)=>b.x.fit.score-a.x.fit.score)[0];
    if(fund){breakdown.funding+=Math.min(5,fund.aff.score);reasons.push(`Hay financiación relacionada para revisar: ${fund.x.o.title}`)}
    const score=breakdown.need+breakdown.compliance+breakdown.feasibility+breakdown.reuse+breakdown.funding+breakdown.route;
    if(decision!=='check_existing'){if(linked.length&&score>=12)decision='do_now';else if(score>=10)decision='prepare';else if(score>=2)decision='explore';else decision='later'}
    const confidence=(p.evidence_level&&this.normalize(p.evidence_level).includes('editorial'))?'medium':'medium';
    return {p,score,decision,decisionLabel:(logic.decision_labels||{})[decision]||'Preparar',confidence,reasons:this._uniq(reasons).slice(0,4),breakdown,provincial:verified,common,funding:fund?.x||null};
  };
  BM._diversifyProjects=async function(rows,n){
    const logic=await this.simpleLogic(),maxCat=logic.diversity?.max_same_category_top||2,maxFam=logic.diversity?.max_same_family_top||3,cat={},fam={},chosen=[],rest=[];
    for(const x of rows){const c=x.p.category||'otros',f=await this._topicFamily(c);if(chosen.length<n&&(cat[c]||0)<maxCat&&(fam[f]||0)<maxFam){chosen.push(x);cat[c]=(cat[c]||0)+1;fam[f]=(fam[f]||0)+1}else rest.push(x)}
    if(chosen.length<n){while(chosen.length<n&&rest.length)chosen.push(rest.shift())}return [...chosen,...rest];
  };
  BM.smartProjectRecommendations=async function(profile,limit=8){
    const projects=await this.json('data/catalog/proyectos.json');if(!profile)return projects.slice(0,limit).map(p=>({p,score:0,decision:'explore',decisionLabel:'Explorar',reasons:['Proyecto del catálogo']}));
    const key=this._decisionKey(profile,'projects');if(!this.cache[key])this.cache[key]=(async()=>{
      const [ctx,obls,opps]=await Promise.all([this.smartContext(profile),this.smartObligationLayers(profile),this.smartOpportunityLayers(profile)]),topObligations=new Set(obls.curated.filter(x=>['do_now','shared_compliance','check_existing'].includes(x.fit.decision)).slice(0,10).map(x=>x.o.id)),rows=[];
      for(const p of projects)rows.push(await this._projectDecision(p,ctx,topObligations,opps.all));rows.sort((a,b)=>b.score-a.score);return this._diversifyProjects(rows,12);
    })();const all=await this.cache[key];return all.slice(0,Math.min(limit,all.length));
  };

  BM.smartDashboard=async function(profile){
    if(!profile)return null;const [ctx,min,obls,opps,projects]=await Promise.all([this.smartContext(profile),this.minimumServices(profile),this.smartObligationLayers(profile),this.smartOpportunityLayers(profile),this.smartProjectRecommendations(profile,12)]),priorities=[];
    const must=obls.curated.find(x=>['do_now','shared_compliance'].includes(x.fit.decision))||obls.curated[0];if(must)priorities.push({kind:'Cumplimiento',title:must.o.title,text:`${must.fit.label} · ${must.fit.reason}`,href:'obligaciones/detalle.html?id='+must.o.id});
    const reuse=projects.find(x=>x.decision==='check_existing'),support=ctx.verifiedProvincial[0]||ctx.legalProvincial[0];if(reuse)priorities.push({kind:'Evita duplicar',title:reuse.p.title,text:reuse.reasons[0],href:'proyectos/detalle.html?id='+reuse.p.id});else if(support)priorities.push({kind:'Apoyo provincial',title:support.title,text:support.summary||support.message||'Comprobar prestación antes de comprar una solución propia.',href:'obligaciones/'});
    const fund=opps.verified[0]||opps.likely[0]||opps.possible[0];if(fund)priorities.push({kind:'Financiación',title:fund.o.title,text:`${fund.fit.label}${fund.fit.reasons[0]?' · '+fund.fit.reasons[0]:''}`,href:'oportunidades/detalle.html?id='+fund.o.id});
    const act=projects.find(x=>['do_now','prepare'].includes(x.decision)&&x.decision!=='check_existing')||projects[0];if(act)priorities.push({kind:'Actuación',title:act.p.title,text:`${act.decisionLabel} · ${act.reasons[0]||act.p.summary}`,href:'proyectos/detalle.html?id='+act.p.id});
    return {profile,context:ctx,minimum:min,obligations:obls,opportunities:opps,projects,priorities:priorities.slice(0,4)};
  };
  BM.smart90DayPlan=async function(profile){
    const dash=await this.smartDashboard(profile),ctx=dash.context,obls=dash.obligations.curated,projects=dash.projects,funds=[...dash.opportunities.verified,...dash.opportunities.likely,...dash.opportunities.possible];
    const shared=obls.filter(x=>x.fit.decision==='shared_compliance').slice(0,2),must=obls.filter(x=>x.fit.decision==='do_now').slice(0,2),reuse=projects.filter(x=>x.decision==='check_existing').slice(0,2),act=projects.filter(x=>['do_now','prepare'].includes(x.decision)).slice(0,3);
    const phases=[
      {range:'0–30 días',goal:'Cumplir y evitar trabajo o compras innecesarias',actions:this._uniq([...must.map(x=>`${x.fit.label}: ${x.o.title}.`),...shared.map(x=>`${x.fit.label}: ${x.o.title}.`),...reuse.map(x=>`${x.decisionLabel}: ${x.p.title} · ${x.reasons[0]}.`)]).slice(0,5)},
      {range:'31–60 días',goal:'Preparar solo actuaciones proporcionadas',actions:this._uniq([...act.map(x=>`${x.decisionLabel}: definir alcance mínimo de ${x.p.title}.`),...funds.slice(0,2).map(x=>`Comprobar bases y documentación de ${x.o.title} (${x.fit.label}).`)]).slice(0,5)},
      {range:'61–90 días',goal:'Decidir, financiar y ejecutar',actions:this._uniq([...funds.slice(0,2).map(x=>`Decidir si preparar solicitud para ${x.o.title}.`),...act.slice(0,2).map(x=>`Cerrar responsable, coste recurrente, contratación y siguiente hito de ${x.p.title}.`)]).slice(0,5)}
    ];
    return {...dash,phases};
  };
})();


/* v1.4.1 DEEP LOGIC · misma interfaz, más inteligencia interna */
(function(){
  const _ctx140=BM.smartContext.bind(BM), _obl140=BM.smartObligationFit.bind(BM), _opp140=BM.smartOpportunityFit.bind(BM), _proj140=BM._projectDecision.bind(BM), _dash140=BM.smartDashboard.bind(BM), _plan140=BM.smart90DayPlan.bind(BM);
  BM._deepKey=function(profile,suffix=''){return `__v141_${suffix}_${profile?.id||profile?.name||'none'}`};
  BM._num=function(v){return typeof v==='number'&&Number.isFinite(v)?v:null};
  BM._hasSignal=function(ctx,id){return (ctx?.signals||[]).some(s=>s.id===id)};
  BM._supportFresh=function(s,days=548){
    const raw=s?.verified||s?.updated||s?.checked; if(!raw)return false; const d=new Date(raw); if(Number.isNaN(d.getTime()))return false; return (Date.now()-d.getTime())/86400000<=days;
  };
  BM._durationMonths=function(txt){const a=[...(String(txt||'').matchAll(/(\\d+)\\s*[–-]\\s*(\\d+)\\s*mes/gi))];if(a.length)return +a[0][2];const b=String(txt||'').match(/(\\d+)\\s*mes/i);return b?+b[1]:0};
  BM._compoundSignals=function(ctx){
    const m=ctx?.metrics||{}, out=[], add=(id,title,tags,weight,message)=>out.push({id,title,tags,weight,severity:'high',message,compound:true});
    const over=this._num(m.over65), one=this._num(m.one_person_households), ch=this._num(m.population_change), young=this._num(m.under18_pct), den=this._num(m.density), broad=this._num(m.broadband100);
    if(over!=null&&one!=null&&over>=30&&one>=35)add('aging_isolation','Envejecimiento y hogares unipersonales',['servicios','mayores','cuidados','movilidad','accesibilidad'],8,'Ganan prioridad proximidad, accesibilidad, movilidad y acompañamiento.');
    if(ch!=null&&young!=null&&ch<-5&&young<=15)add('depopulation_youth','Despoblación y poco peso juvenil',['despoblacion','vivienda','familias','conectividad','emprendimiento'],8,'Ganan prioridad arraigo, vivienda, familias, conectividad y actividad económica.');
    if(den!=null&&broad!=null&&den<12.5&&broad<80)add('sparse_connectivity','Baja densidad y conectividad débil',['conectividad','movilidad','servicios','administracion'],8,'Favorece soluciones compartidas, móviles o asistidas.');
    if(over!=null&&broad!=null&&over>=30&&broad<80)add('aging_connectivity','Envejecimiento y brecha de conectividad',['accesibilidad','administracion','servicios','conectividad'],7,'Los servicios digitales necesitan alternativa asistida y accesible.');
    if(this._hasSignal(ctx,'population_decline')&&this._hasSignal(ctx,'income_peer_low'))add('decline_low_income','Despoblación y menor renta relativa',['servicios','empleo','vivienda','emprendimiento'],7,'Prima bajo coste recurrente e impacto directo en servicios y economía local.');
    if(ctx?.entityRoute!=='direct'&&ctx?.localPopulation!=null&&ctx.localPopulation<=500)add('micro_eatim','Escala local muy pequeña',['servicios','administracion','movilidad','conectividad'],6,'Dimensionar para la entidad y tramitar por la vía administrativa correcta.');
    return out;
  };
  BM._capacityNarrative=function(ctx){
    const id=ctx?.capacity?.id||'small';
    if(['micro','very_small'].includes(id))return {level:'very_low',label:'capacidad operativa probablemente muy limitada',shared:true};
    if(id==='small')return {level:'low',label:'capacidad operativa limitada',shared:true};
    if(id==='small_medium')return {level:'medium',label:'capacidad operativa moderada',shared:true};
    return {level:'higher',label:'mayor capacidad operativa probable',shared:false};
  };
  BM.smartContext=async function(profile){
    if(!profile)return null; const key=this._deepKey(profile,'ctx'); if(this.cache[key])return this.cache[key];
    const promise=(async()=>{
      const base=await _ctx140(profile), compound=this._compoundSignals(base), tagWeights={...(base.tagWeights||{})};
      for(const s of compound)for(const t of s.tags||[]){const n=this.normalize(t);tagWeights[n]=(tagWeights[n]||0)+(s.weight||5)}
      const fresh=(base.verifiedProvincial||[]).filter(s=>this._supportFresh(s)), stale=(base.verifiedProvincial||[]).filter(s=>!this._supportFresh(s));
      const capacityNarrative=this._capacityNarrative(base), strategicSignals=[...(base.signals||[]),...compound];
      const high=compound.slice().sort((a,b)=>(b.weight||0)-(a.weight||0))[0];
      const reasons=this._uniq([...(base.reasons||[]),high?.title]).slice(0,4);
      const quality={territorial:base.dataConfidence,provincial:fresh.length?'verified':stale.length?'reconfirm':'unknown',entity_route:base.entityRoute==='direct'?'high':base.admin?'medium':'low'};
      return {...base,signals:strategicSignals,compoundSignals:compound,tagWeights,verifiedProvincialFresh:fresh,verifiedProvincialStale:stale,capacityNarrative,quality,reasons};
    })(); this.cache[key]=promise; return promise;
  };
  BM._nextObligationAction=function(o,fit,ctx){
    if(fit.decision==='shared_compliance')return 'Comprobar primero la vía compartida disponible y asignar responsable interno.';
    if(fit.decision==='check_existing')return 'Preguntar al servicio público o provincial correspondiente antes de contratar una solución propia.';
    if(fit.route==='parent_municipality')return `Confirmar con ${ctx?.admin?.name||'el municipio matriz'} quién debe tramitar y ejecutar esta obligación.`;
    if(fit.route==='eatim_review')return 'Confirmar competencias propias/delegadas y régimen autonómico antes de actuar.';
    if(fit.level==='conditional')return 'Confirmar si se da la condición indicada; si no se da, no abrir trabajo innecesario.';
    if((o.steps||[]).length)return o.steps[0]+'.';
    return 'Asignar responsable y comprobar el estado actual antes de abrir nuevas actuaciones.';
  };
  BM.smartObligationFit=async function(o,ctx){
    const fit=await _obl140(o,ctx); if(!ctx)return fit;
    const affinity=this._topicAffinity([o.category,...(o.topics||[])],ctx); let score=fit.score+Math.min(5,affinity.score*.35), reasons=this._uniq([fit.reason,...(fit.reasons||[])]);
    const fresh=(ctx.verifiedProvincialFresh||[]).filter(s=>this._topicMatch(o,s));
    if(fresh.length&&ctx.population!=null&&ctx.population<20000&&fit.decision!=='shared_compliance'){reasons.push(`Hay apoyo provincial verificado relacionado: ${fresh[0].title}.`);score+=2}
    const nextAction=this._nextObligationAction(o,fit,ctx);
    return {...fit,score,reason:reasons[0],reasons:reasons.slice(0,4),nextAction,publicSupport:fresh};
  };
  BM.smartOpportunityFit=async function(o,ctx){
    const fit=await _opp140(o,ctx); if(!ctx||fit.tier==='excluded')return {...fit,nextAction:fit.tier==='excluded'?'No dedicar tiempo salvo que cambien las bases o el plazo.':fit.nextAction};
    let score=fit.score, reasons=[...(fit.reasons||[])], tier=fit.tier,label=fit.label,decision=fit.decision; const days=this.daysUntil(o.deadline), aff=this._topicAffinity(o.topics||[],ctx);
    if((ctx.compoundSignals||[]).length&&aff.score>=6){score+=4;reasons.push('La convocatoria coincide con varias necesidades territoriales que se refuerzan entre sí.')}
    if(days!=null&&days<=10&&days>=0&&['micro','very_small'].includes(ctx.capacity?.id)){reasons.push('Plazo muy ajustado para una estructura municipal pequeña: comprobar capacidad de preparar la solicitud.');score-=2}
    if(ctx.entityRoute!=='direct'&&fit.match?.route==='parent_municipality')reasons.push(`La solicitud debe revisarse con ${ctx.admin?.name||'el municipio matriz'}.`);
    if(tier==='low'&&fit.match?.level==='pass'&&fit.confidence!=='low'&&aff.score>=8){tier='possible';label='Puede encajar · comprobar';decision='explore';score+=4}
    let nextAction='Leer las bases antes de invertir tiempo en la solicitud.';
    if(tier==='verified'||tier==='likely')nextAction=days!=null&&days<=21?'Revisar hoy bases, documentación y capacidad de ejecución.':'Comprobar bases, gasto subvencionable, cofinanciación y documentación.';
    else if(tier==='possible')nextAction='Confirmar primero beneficiario, territorio y umbrales; solo después preparar documentación.';
    if(fit.match?.route==='parent_municipality')nextAction=`Confirmar con ${ctx.admin?.name||'el municipio matriz'} si debe presentar la solicitud.`;
    return {...fit,score,tier,label,decision,reasons:this._uniq(reasons).slice(0,4),nextAction};
  };
  BM._projectEffort=function(p,ctx){
    const cp={baja:2,media:5,alta:9}[this.normalize(p.complexity)]||4; let points=cp, factors=[]; const cap=ctx.capacity||{}, max=cap.max_preferred_cost||50000;
    if(p.cost_max!=null&&max){const r=p.cost_max/max;if(r>2){points+=8;factors.push('coste muy alto para la escala probable')}else if(r>1){points+=5;factors.push('coste por encima del rango preferente')}else if(r>.5){points+=2}}
    const months=this._durationMonths(p.duration_band);if(months>=12){points+=4;factors.push('implantación larga')}else if(months>=6){points+=2}
    const mt=this.normalize(p.maintenance||'');if(['mantenimiento','soporte','actualizaciones','continuidad','licencias','integracion'].some(k=>mt.includes(k))){points+=2;factors.push('carga recurrente de operación/soporte')}
    if(ctx.entityRoute!=='direct'){points+=2;factors.push('requiere coordinación administrativa adicional')}
    if(ctx.localPopulation!=null&&ctx.localPopulation<=500&&p.complexity!=='baja'){points+=2;factors.push('escala local muy pequeña')}
    return {points,level:points>=11?'high':points>=7?'medium':'low',factors:this._uniq(factors)};
  };
  BM._projectPublicRoute=function(p,ctx){
    const fresh=(ctx.verifiedProvincialFresh||[]).filter(s=>this._topicMatch(p,s)),stale=(ctx.verifiedProvincialStale||[]).filter(s=>this._topicMatch(p,s)),common=(ctx.commonServices||[]).filter(s=>this._topicMatch(p,s)),legal=(ctx.legalProvincial||[]).filter(s=>this._topicMatch(p,s));
    if(fresh.length)return {level:'verified',items:fresh,label:`Apoyo provincial verificado: ${fresh[0].title}`};
    if(common.length)return {level:'common',items:common,label:`Servicio común a comprobar: ${common[0].title}`};
    if(stale.length)return {level:'reconfirm',items:stale,label:`Servicio provincial conocido que conviene reconfirmar: ${stale[0].title}`};
    if(legal.length)return {level:'legal_check',items:legal,label:'La Diputación tiene una función relacionada: comprobar prestación concreta'};
    return {level:'none',items:[],label:'No hay servicio público/provincial verificado en el catálogo para esta actuación'};
  };
  BM._projectNextAction=function(row,ctx){
    const route=row.publicRoute||{};
    if(row.decision==='check_existing'){if(route.level==='verified')return `Contactar con el servicio provincial “${route.items[0].title}” y confirmar alcance antes de contratar.`;if(route.level==='common')return `Comprobar si “${route.items[0].title}” cubre la necesidad antes de desarrollar una solución propia.`;return 'Preguntar a Diputación u organismo competente si puede prestar, coordinar o apoyar esta actuación antes de comprar.'}
    if(ctx.entityRoute!=='direct')return `Acordar con ${ctx.admin?.name||'el municipio matriz'} la vía de ejecución y el alcance mínimo.`;
    if(row.externalSupport?.show)return 'Definir un alcance mínimo y pedir apoyo para diseño/implantación antes de iniciar contratación.';
    if(row.funding)return `Revisar la financiación relacionada y, en paralelo, definir responsable, alcance mínimo y coste recurrente.`;
    if(row.decision==='do_now')return 'Asignar responsable, fijar alcance mínimo y comprobar coste recurrente antes de iniciar contratación.';
    if(row.decision==='prepare')return 'Preparar una ficha breve: problema, alcance mínimo, responsable, coste total y servicio público ya comprobado.';
    return 'No abrir expediente todavía: confirmar necesidad y comparar alternativas más sencillas.';
  };
  BM._projectDecision=async function(p,ctx,topObligations,fundingRows){
    const base=await _proj140(p,ctx,topObligations,fundingRows), effort=this._projectEffort(p,ctx), publicRoute=this._projectPublicRoute(p,ctx), aff=this._topicAffinity([p.category,...(p.tags||[])],ctx);
    let score=base.score+Math.min(10,aff.score*.35)-Math.max(0,effort.points-5)*.55, decision=base.decision, reasons=[...(base.reasons||[])];
    const hardCompliance=(base.breakdown?.compliance||0)>0;
    if(decision!=='check_existing'&&effort.level==='high'&&!hardCompliance&&decision==='do_now')decision='prepare';
    if(decision==='prepare'&&effort.level==='low'&&aff.score>=15)decision='do_now';
    if(effort.level==='high')reasons.push(`Esfuerzo de implantación alto para ${ctx.capacityNarrative?.label||'la escala municipal'}`);
    if(publicRoute.level==='reconfirm')reasons.unshift(publicRoute.label);
    const noPublic=['none'].includes(publicRoute.level), supportNeeded=noPublic&&['do_now','prepare'].includes(decision)&&effort.points>=7;
    const externalSupport={show:supportNeeded,reason:supportNeeded?'No aparece un servicio provincial o común verificado que resuelva por sí solo esta actuación y la implantación requiere capacidad técnica/organizativa adicional.':'',caution:'Antes de contratar apoyo externo, confirma con Diputación u organismo competente que no exista un servicio no catalogado.'};
    const logic=await this.simpleLogic(), row={...base,score,decision,decisionLabel:(logic.decision_labels||{})[decision]||base.decisionLabel,reasons:this._uniq(reasons).slice(0,4),effort,publicRoute,externalSupport};
    row.nextAction=this._projectNextAction(row,ctx); return row;
  };
  BM.smartDashboard=async function(profile){
    const d=await _dash140(profile); if(!d)return d; const obls=d.obligations.curated, opps=d.opportunities, projects=d.projects, out=[];
    const must=obls.find(x=>['do_now','shared_compliance','check_existing'].includes(x.fit.decision))||obls[0];if(must)out.push({kind:'Cumplimiento',title:must.o.title,text:`${must.fit.label}. Ahora: ${must.fit.nextAction||must.fit.reason}`,href:'obligaciones/detalle.html?id='+must.o.id});
    const reuse=projects.find(x=>x.decision==='check_existing');if(reuse)out.push({kind:'Antes de gastar',title:reuse.p.title,text:`Ahora: ${reuse.nextAction}`,href:'proyectos/detalle.html?id='+reuse.p.id});
    const fund=opps.verified[0]||opps.likely[0]||opps.possible[0];if(fund)out.push({kind:'Financiación',title:fund.o.title,text:`${fund.fit.label}. Ahora: ${fund.fit.nextAction||'Revisar bases.'}`,href:'oportunidades/detalle.html?id='+fund.o.id});
    const act=projects.find(x=>['do_now','prepare'].includes(x.decision)&&x!==reuse)||projects[0];if(act)out.push({kind:'Actuación',title:act.p.title,text:`${act.decisionLabel}. Ahora: ${act.nextAction}`,href:'proyectos/detalle.html?id='+act.p.id});
    return {...d,priorities:out.slice(0,4)};
  };
  BM.smart90DayPlan=async function(profile){
    const d=await _plan140(profile); if(!d)return d; const obls=d.obligations.curated, projects=d.projects, funds=[...d.opportunities.verified,...d.opportunities.likely,...d.opportunities.possible];
    return {...d,phases:[
      {range:'0–30 días',goal:'Cumplir y evitar trabajo o compras innecesarias',actions:this._uniq([...obls.filter(x=>['do_now','shared_compliance','check_existing'].includes(x.fit.decision)).slice(0,3).map(x=>x.fit.nextAction),...projects.filter(x=>x.decision==='check_existing').slice(0,2).map(x=>x.nextAction)]).slice(0,5)},
      {range:'31–60 días',goal:'Preparar solo actuaciones proporcionadas',actions:this._uniq(projects.filter(x=>['do_now','prepare'].includes(x.decision)&&x.decision!=='check_existing').slice(0,4).map(x=>x.nextAction)).slice(0,5)},
      {range:'61–90 días',goal:'Financiar y ejecutar lo que ya tiene sentido',actions:this._uniq([...funds.slice(0,2).map(x=>x.fit.nextAction),...projects.filter(x=>['do_now','prepare'].includes(x.decision)).slice(0,2).map(x=>`Cerrar responsable, coste total y siguiente hito de ${x.p.title}.`)]).slice(0,5)}
    ]};
  };
})();


/* v1.4.2 DEEP DECISION · misma estructura externa, más fuentes, filtros, cautelas y plan editable */
(function(){
  const _opp141=BM.smartOpportunityFit.bind(BM), _proj141=BM._projectDecision.bind(BM), _plan141=BM.smart90DayPlan.bind(BM);
  BM.fundingSources=async function(){return this.cache.__fundingSources||(this.cache.__fundingSources=await this.jsonOptional('data/catalog/funding_sources.json',{sources:[]}))};
  BM._normList=function(xs){return (xs||[]).map(x=>this.normalize(x)).filter(Boolean)};
  BM._regionMatch=function(value,list){const v=this.normalize(value||'');return !!v&&this._normList(list).some(x=>x===v||x.includes(v)||v.includes(x))};
  BM._opportunityAdminPenalty=function(o,ctx){const e=this.normalize(o.administrative_effort||'');const cap=ctx?.capacity?.id||'small';const table={very_high:{micro:14,very_small:11,small:7,small_medium:4,medium:2,large:0},high:{micro:10,very_small:8,small:5,small_medium:3,medium:1,large:0},medium:{micro:4,very_small:3,small:2,small_medium:1,medium:0,large:0},low:{micro:0,very_small:0,small:0,small_medium:0,medium:0,large:0}};return table[e]?.[cap]||0};
  BM._euFundingChecks=function(o,ctx){
    const out={hardFail:false,score:0,reasons:[],cautions:[],route:null};if(!ctx)return out;
    if((o.eligible_provinces||[]).length&&!this._regionMatch(ctx.profile?.province,o.eligible_provinces)){out.hardFail=true;out.reasons.push('El municipio está fuera del ámbito provincial de este programa.');return out}
    if((o.eligible_autonomous_regions||[]).length&&!this._regionMatch(ctx.profile?.autonomous_region,o.eligible_autonomous_regions)){out.hardFail=true;out.reasons.push('La comunidad autónoma está fuera del ámbito territorial del programa.');return out}
    if((o.excluded_autonomous_regions||[]).length&&this._regionMatch(ctx.profile?.autonomous_region,o.excluded_autonomous_regions)){out.hardFail=true;out.reasons.push('El territorio está excluido por el programa.');return out}
    if(o.requires_legal_personality&&ctx.profile?.entity_type==='population_entity'){out.route='parent_municipality';out.score-=2;out.cautions.push(`La solicitud tendría que analizarse a través de ${ctx.admin?.name||'el municipio matriz'}, porque el núcleo no se trata como solicitante independiente.`)}
    if(o.requires_legal_personality&&ctx.profile?.entity_type==='eatim')out.cautions.push('Confirmar que la EATIM dispone de personalidad y capacidad jurídica suficientes para esta convocatoria; si no, revisar la vía del municipio matriz.')
    const min=Number(o.project_min||0),max=Number(ctx.capacity?.max_preferred_cost||0);if(min&&max&&min>max){const ratio=min/max;out.score-=ratio>3?12:8;out.cautions.push(`El tamaño mínimo del proyecto (${this.money(min)}) supera el rango preferente para una entidad de esta escala.`)}
    const adminPenalty=this._opportunityAdminPenalty(o,ctx);if(adminPenalty){out.score-=adminPenalty;out.cautions.push('La preparación y gestión de esta ayuda tiene una carga administrativa alta para la capacidad probable del ayuntamiento.')}
    if(o.requires_cross_border||Number(o.partners_min||0)>=2){const tiny=['micro','very_small'].includes(ctx.capacity?.id);out.score-=tiny?6:2;out.cautions.push(tiny?'Para una estructura muy pequeña es preferible entrar con Diputación, mancomunidad u otro socio con capacidad de gestión antes que liderar el consorcio.':'Confirmar socios, reparto de responsabilidades y capacidad de gestión antes de preparar la candidatura.')}
    if(typeof o.cofinance_rate==='number'&&o.cofinance_rate<1){const own=Math.round((1-o.cofinance_rate)*100);out.score-=['micro','very_small'].includes(ctx.capacity?.id)?3:1;out.cautions.push(`La ayuda no cubre el 100 %: prever al menos un ${own}% de cofinanciación, además de tesorería y gastos no elegibles.`)}
    return out;
  };
  BM.smartOpportunityFit=async function(o,ctx){
    const fit=await _opp141(o,ctx);if(!ctx||fit.tier==='excluded')return fit;
    const extra=this._euFundingChecks(o,ctx);if(extra.hardFail)return {...fit,tier:'excluded',score:-180,label:'No parece aplicable',decision:'not_applicable',reasons:extra.reasons,programCautions:extra.cautions,match:{...(fit.match||{}),level:'fail',route:extra.route||fit.match?.route}};
    let score=fit.score+extra.score,tier=fit.tier,label=fit.label,decision=fit.decision,reasons=this._uniq([...(fit.reasons||[]),...extra.reasons]),nextAction=fit.nextAction;
    const tiny=['micro','very_small'].includes(ctx.capacity?.id),complexEU=['high','very_high'].includes(this.normalize(o.administrative_effort||'')),euKinds=['life','poctep','interreg','sudoe','cerv','erasmus','leader','funding_tenders','eu'];const isEU=o.type==='eu_opportunity'||euKinds.includes(this.normalize(o.source_kind||''));
    if(isEU){
      if(tiny&&complexEU&&['verified','likely'].includes(tier)){tier='possible';label='Puede encajar · mejor con apoyo';decision='explore'}
      if((o.requires_cross_border||Number(o.partners_min||0)>=2)&&tiny)nextAction='Comprobar primero si Diputación, mancomunidad o un socio con experiencia puede liderar o acompañar la candidatura.';
      else if(complexEU&&['micro','very_small'].includes(ctx.capacity?.id))nextAction='No preparar la solicitud todavía: validar encaje y buscar apoyo de gestión antes de comprometer recursos.';
      else if(extra.cautions.length)nextAction=nextAction||'Confirmar requisitos de programa, socios, cofinanciación y capacidad de gestión.';
    }
    return {...fit,score,tier,label,decision,reasons:reasons.slice(0,4),nextAction,programCautions:extra.cautions,match:{...(fit.match||{}),route:extra.route||fit.match?.route}};
  };
  BM._specialistProject=function(p){const raw=this.normalize([p.category,p.title,p.summary,...(p.tags||[]),p.maintenance].filter(Boolean).join(' '));const words=(this.cache.__logic?.author_support?.specialist_keywords)||['ciberseguridad','ens','software','web','datos','integracion','interoperabilidad','iot','sensor','inteligencia artificial','automatizacion','conectividad','estrategia'];return words.some(w=>raw.includes(this.normalize(w)))};
  BM._fundingChannelFit=async function(p,ctx){const data=await this.fundingSources(),tags=this._uniq([p.category,...(p.tags||[])]).map(x=>this.normalize(x)),rows=[];for(const f of data.sources||[]){let score=0;for(const t of f.topics||[])if(t==='todos'||tags.some(x=>x.includes(this.normalize(t))||this.normalize(t).includes(x)))score+=3;if(f.id==='leader'&&ctx?.population!=null&&ctx.population<=20000)score+=5;if(f.id==='poctep'&&!['A Coruña','Lugo','Ourense','Pontevedra','Ávila','León','Salamanca','Valladolid','Zamora','Badajoz','Cáceres','Cádiz','Córdoba','Huelva','Sevilla'].some(x=>this.normalize(x)===this.normalize(ctx?.profile?.province)))score=-99;if(score>0)rows.push({source:f,score})}return rows.sort((a,b)=>b.score-a.score).slice(0,3)};
  BM._projectDecision=async function(p,ctx,topObligations,fundingRows){
    const base=await _proj141(p,ctx,topObligations,fundingRows),route=base.publicRoute||this._projectPublicRoute(p,ctx),effort=base.effort||this._projectEffort(p,ctx),logic=await this.simpleLogic(),cfg=logic.author_support||{},specialist=this._specialistProject(p),priority=['do_now','prepare','check_existing'].includes(base.decision),threshold=Math.min(Number(cfg.minimum_effort_without_specialism||5),4),enoughEffort=effort.points>=threshold,needHelp=priority&&(enoughEffort||specialist||base.decision==='check_existing');
    let externalSupport={show:false,mode:'own_means',reason:'La actuación parece abordable con medios propios si se siguen los primeros pasos y se controla el mantenimiento.',caution:cfg.caution||'Confirmar primero servicios públicos disponibles.'};
    if(route.level==='verified')externalSupport={show:false,mode:'public_verified',reason:`Hay apoyo público/provincial verificado relacionado: ${route.items?.[0]?.title||'servicio identificado'}. Debe comprobarse su alcance antes de contratar fuera.`,caution:cfg.caution};
    else if(needHelp&&ctx?.entityRoute!=='direct')externalSupport={show:true,mode:'after_parent_check',reason:`Primero acuerda con ${ctx.admin?.name||'el municipio matriz'} la vía de ejecución. Si no existe apoyo supramunicipal suficiente, puede ser útil apoyo especializado.`,caution:cfg.caution};
    else if(needHelp&&['common','legal_check','reconfirm'].includes(route.level))externalSupport={show:true,mode:'after_public_check',reason:'Existe un servicio común, una función provincial o un antecedente relacionado, pero Brújula no ha verificado que cubra realmente toda esta actuación. Compruébalo primero; si no la cubre, puede tener sentido pedir apoyo especializado.',caution:cfg.caution};
    else if(needHelp&&route.level==='none')externalSupport={show:true,mode:'direct_if_needed',reason:'No aparece un servicio provincial o común suficiente en el catálogo y la actuación requiere capacidad técnica u organizativa adicional.',caution:cfg.caution};
    const fundingChannels=await this._fundingChannelFit(p,ctx);const row={...base,externalSupport,fundingChannels,specialist};row.nextAction=this._projectNextAction(row,ctx);return row;
  };
  const _next141=BM._projectNextAction.bind(BM);
  BM._projectNextAction=function(row,ctx){
    if(row.externalSupport?.show){if(row.externalSupport.mode==='after_public_check')return 'Preguntar primero a Diputación si cubre esta actuación; si no, definir alcance mínimo y solicitar apoyo especializado.';if(row.externalSupport.mode==='after_parent_check')return `Acordar primero la vía con ${ctx.admin?.name||'el municipio matriz'}; si no hay apoyo público suficiente, definir alcance y pedir ayuda especializada.`;return 'Definir alcance mínimo, coste total y responsable; si no hay capacidad interna suficiente, solicitar apoyo especializado antes de contratar.'}
    return _next141(row,ctx);
  };
  BM._planKey=function(profile){return `bm_plan_extra_v142_${profile?.id||this.normalize(profile?.name||'municipio')}`};
  BM.getPlanExtras=function(profile){try{return JSON.parse(localStorage.getItem(this._planKey(profile))||'[]')}catch{return []}};
  BM.setPlanExtras=function(profile,ids){localStorage.setItem(this._planKey(profile),JSON.stringify(this._uniq(ids||[])));this.cache={...this.cache,__author:this.cache.__author,__logic:this.cache.__logic,__fundingSources:this.cache.__fundingSources}};
  BM.togglePlanExtra=function(profile,id){const xs=this.getPlanExtras(profile),has=xs.includes(id);this.setPlanExtras(profile,has?xs.filter(x=>x!==id):[...xs,id]);return !has};
  BM._planCautions=function(plan){
    const ctx=plan.context||{},projects=plan.planProjects||plan.projects||[],funds=[...(plan.opportunities?.verified||[]),...(plan.opportunities?.likely||[]),...(plan.opportunities?.possible||[])],out=[],add=(severity,id,title,text,href='')=>out.push({severity,id,title,text,href});
    const uniqueProj=[...new Map(projects.map(x=>[x.p.id,x])).values()];
    const reuse=uniqueProj.filter(x=>x.decision==='check_existing'||['verified','common','reconfirm','legal_check'].includes(x.publicRoute?.level));if(reuse.length)add(3,'public-first','Comprueba lo público antes de gastar',`${reuse.slice(0,2).map(x=>x.p.title).join(' · ')} tienen una vía pública, provincial o compartida que conviene descartar antes de comprar.`,`../proyectos/detalle.html?id=${reuse[0].p.id}`);
    const mediumHigh=uniqueProj.filter(x=>['medium','high'].includes(x.effort?.level)),limit={micro:1,very_small:2,small:3,small_medium:4,medium:5,large:6}[ctx.capacity?.id||'small']||3;if(mediumHigh.length>limit)add(4,'capacity','No abras demasiados frentes a la vez',`El plan contiene ${mediumHigh.length} actuaciones de esfuerzo medio/alto y la capacidad probable aconseja no ejecutar más de ${limit} simultáneamente. Prioriza y secuencia.`);
    const maint=uniqueProj.filter(x=>/mantenimiento|soporte|licencias|actualizaciones|continuidad|operaci[oó]n/i.test(x.p.maintenance||''));if(maint.length>=2)add(2,'maintenance','Mira el coste después de implantar',`${maint.length} proyectos añaden mantenimiento o soporte recurrente. Confirma responsable y coste anual antes de aprobarlos.`);
    const tight=funds.find(x=>{const d=this.daysUntil(x.o.deadline);return d!=null&&d>=0&&d<=14&&['high','very_high'].includes(this.normalize(x.o.administrative_effort||''))});if(tight)add(4,'deadline','Plazo corto para una ayuda compleja',`${tight.o.title} vence pronto y exige preparación relevante. No comprometas al equipo sin comprobar documentación, socios y capacidad real.`,`../oportunidades/detalle.html?id=${tight.o.id}`);
    const cofund=funds.find(x=>typeof x.o.cofinance_rate==='number'&&x.o.cofinance_rate<1);if(cofund){const own=Math.round((1-cofund.o.cofinance_rate)*100);add(3,'cofinance','La subvención puede necesitar dinero propio',`${cofund.o.title} exige prever aproximadamente un ${own}% no cubierto, además de tesorería y gastos que puedan quedar fuera.`)}
    const partners=funds.find(x=>x.o.requires_cross_border||Number(x.o.partners_min||0)>=2);if(partners)add(2,'partners','No prepares el proyecto europeo sin socios',`${partners.o.title} requiere cooperación/partenariado. Para un ayuntamiento pequeño suele ser mejor incorporarse con un socio líder solvente.`);
    if(ctx.entityRoute!=='direct'&&uniqueProj.length)add(4,'eatim','Confirma la vía administrativa',`La entidad seleccionada no se trata como municipio independiente para todos los efectos. Coordina competencias, solicitud y contratación con ${ctx.admin?.name||'el municipio matriz'} cuando corresponda.`);
    const sensitive=uniqueProj.find(x=>/ciber|ens|datos|sensor|c[aá]mara|web|app|software|inteligencia artificial|\bia\b/i.test([x.p.category,x.p.title,...(x.p.tags||[])].join(' ')));if(sensitive)add(2,'controls','Incluye controles desde el principio',`${sensitive.p.title} puede implicar seguridad, privacidad, accesibilidad o interoperabilidad. Revisa esos controles antes de cerrar requisitos, no al final.`,`../proyectos/detalle.html?id=${sensitive.p.id}`);
    const expensive=uniqueProj.find(x=>x.p.cost_max&&ctx.capacity?.max_preferred_cost&&x.p.cost_max>ctx.capacity.max_preferred_cost);if(expensive)add(3,'cost','Revisa coste total y contratación',`${expensive.p.title} supera el rango preferente para esta escala. Valida coste total de propiedad y si existe contratación centralizada o apoyo supramunicipal.`);
    const fam={};for(const x of uniqueProj){const k=this.normalize(x.p.category||'otros');fam[k]=(fam[k]||0)+1}const heavy=Object.entries(fam).find(([,n])=>n>=3);if(heavy)add(1,'concentration','Evita un plan demasiado concentrado',`Hay ${heavy[1]} actuaciones de una misma categoría. Comprueba que no estén desplazando necesidades más básicas del municipio.`);
    const rank={4:4,3:3,2:2,1:1};return [...new Map(out.sort((a,b)=>rank[b.severity]-rank[a.severity]).map(x=>[x.id,x])).values()].slice(0,4);
  };
  BM.smart90DayPlan=async function(profile){
    const d=await _plan141(profile);if(!d)return d;const allProjects=await this.json('data/catalog/proyectos.json'),extraIds=this.getPlanExtras(profile),extra=[];if(extraIds.length){const full=await this.smartProjectRecommendations(profile,allProjects.length);for(const id of extraIds){const row=full.find(x=>x.p.id===id);if(row)extra.push({...row,manual:true})}}
    const auto=d.projects||[],planProjects=[...new Map([...auto.slice(0,8),...extra].map(x=>[x.p.id,x])).values()];const phases=(d.phases||[]).map(x=>({...x,actions:[...(x.actions||[])]}));
    if(extra.length){const p2=phases[1]||phases[0],p3=phases[2]||p2;for(const x of extra.slice(0,4)){if(!p2.actions.some(a=>a.includes(x.p.title)))p2.actions.push(`Proyecto añadido por el equipo: validar alcance mínimo de ${x.p.title}.`);if(x.effort?.level==='high'&&!p3.actions.some(a=>a.includes(x.p.title)))p3.actions.push(`No ejecutar ${x.p.title} hasta cerrar capacidad, coste recurrente y apoyo necesario.`)}}
    const out={...d,projects:planProjects,manualProjects:extra,planProjects,phases:phases.map(x=>({...x,actions:x.actions.slice(0,7)}))};out.cautions=this._planCautions(out);return out;
  };
})();


/* v1.4.3 · cascarón mínimo, accesibilidad, seguridad y escalado TIC exclusivo */
(function(){
  const _decision142 = BM._projectDecision ? BM._projectDecision.bind(BM) : null;
  const _simpleChrome143 = BM.applySimpleChrome ? BM.applySimpleChrome.bind(BM) : null;

  BM.isICTProject=function(p){
    if(!p)return false;
    const cfg=(this.cache.__logic?.author_support)||{};
    const core=new Set((cfg.ict_core_categories||['ciberseguridad','conectividad','digitalizacion','datos','ia','smart-village']).map(x=>this.normalize(x)));
    const category=this.normalize(p.category||'');
    if(core.has(category))return true;
    const raw=this.normalize([p.title,p.summary,...(p.tags||[]),p.maintenance,...(p.first_steps||[])].filter(Boolean).join(' '));
    const strong=(cfg.ict_strong_keywords||[]).map(x=>this.normalize(x)).filter(Boolean);
    // Fuera de categorías TIC, exigir un indicador técnico fuerte. "digital" o "estrategia" solos no bastan.
    return strong.some(k=>raw.includes(k));
  };
  BM._specialistProject=function(p){return this.isICTProject(p)};

  if(_decision142){
    BM._projectDecision=async function(p,ctx,topObligations,fundingRows){
      const row=await _decision142(p,ctx,topObligations,fundingRows);
      const ict=this.isICTProject(p);
      const previous={...(row.externalSupport||{})};
      if(!ict && previous.show){
        row.externalSupport={
          show:false,
          mode:'external_other',
          reason:'La actuación puede requerir apoyo especializado del ámbito correspondiente, pero no es un proyecto TIC y Brújula no la escala al autor.',
          caution:previous.caution||'Comprueba primero servicios públicos y capacidad interna antes de contratar apoyo externo.'
        };
      }
      row.ictProject=ict;
      row.authorEligible=!!(ict && row.externalSupport?.show);
      return row;
    };
  }

  // Eliminar cualquier CTA global heredada. El autor solo puede aparecer dentro de una ficha TIC elegible.
  BM.injectContactCTA=async function(){document.querySelectorAll('.contact-float').forEach(x=>x.remove())};

  BM.safeExternalUrl=function(value){
    try{
      const u=new URL(String(value||''),location.href);
      if(!['http:','https:'].includes(u.protocol))return '#';
      return u.href;
    }catch{return '#'}
  };
  BM.hardenLinks=function(root=document){
    root.querySelectorAll('a').forEach(a=>{
      const raw=(a.getAttribute('href')||'').trim();
      if(/^\s*(javascript|data|vbscript):/i.test(raw)){a.removeAttribute('href');a.setAttribute('aria-disabled','true')}
      if(a.target==='_blank')a.rel='noopener noreferrer';
    });
  };
  BM.installSecurityMeta=function(){
    if(!document.querySelector('meta[name="referrer"]')){
      const m=document.createElement('meta');m.name='referrer';m.content='strict-origin-when-cross-origin';document.head.appendChild(m);
    }
  };

  BM.textScaleLevels=[1,1.25,1.5,1.75,2];
  BM.getTextScale=function(){
    const n=Number(localStorage.getItem('bm_text_scale_v143')||1);
    return this.textScaleLevels.includes(n)?n:1;
  };
  BM.setTextScale=function(scale){
    const levels=this.textScaleLevels;let n=Number(scale);if(!levels.includes(n))n=1;
    localStorage.setItem('bm_text_scale_v143',String(n));
    document.documentElement.style.fontSize=`${Math.round(n*100)}%`;
    document.documentElement.dataset.bmTextScale=String(Math.round(n*100));
    document.querySelectorAll('[data-text-scale]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.textScale)===n)));
    const status=document.querySelector('#bm-text-size-status');if(status)status.textContent=`Tamaño de texto ${Math.round(n*100)} %`;
  };
  BM.installTextControls=function(){
    document.querySelectorAll('.nav-actions').forEach(actions=>{
      if(actions.querySelector('.text-size-tools'))return;
      const wrap=document.createElement('div');wrap.className='text-size-tools';wrap.setAttribute('role','group');wrap.setAttribute('aria-label','Tamaño de texto');
      wrap.innerHTML=`<button type="button" data-text-step="down" aria-label="Reducir tamaño de texto">A−</button><button type="button" data-text-scale="1" aria-label="Restablecer tamaño de texto">A</button><button type="button" data-text-step="up" aria-label="Aumentar tamaño de texto">A+</button><span class="sr-only" id="bm-text-size-status" aria-live="polite"></span>`;
      const municipality=actions.querySelector('[data-open-municipality],.municipality-btn,.municipality-command');
      actions.insertBefore(wrap,municipality||actions.firstChild);
      const move=dir=>{const levels=this.textScaleLevels,cur=this.getTextScale(),i=Math.max(0,levels.indexOf(cur)),next=levels[Math.max(0,Math.min(levels.length-1,i+dir))];this.setTextScale(next)};
      wrap.querySelector('[data-text-step="down"]').onclick=()=>move(-1);
      wrap.querySelector('[data-text-step="up"]').onclick=()=>move(1);
      wrap.querySelector('[data-text-scale]').onclick=()=>this.setTextScale(1);
    });
    this.setTextScale(this.getTextScale());
  };

  BM.enhanceDialogAccessibility=function(){
    const ov=document.querySelector('#municipality-overlay');if(!ov||ov.dataset.a11y143)return;ov.dataset.a11y143='1';
    const selector=ov.querySelector('.selector');if(selector){selector.setAttribute('role','dialog');selector.setAttribute('aria-modal','true');const h=selector.querySelector('h2');if(h){h.id=h.id||'municipality-dialog-title';selector.setAttribute('aria-labelledby',h.id)}}
    const input=ov.querySelector('input');if(input&&!input.getAttribute('aria-label'))input.setAttribute('aria-label','Buscar municipio, pueblo o EATIM');
    const results=ov.querySelector('.municipality-results');if(results){results.setAttribute('aria-live','polite');results.setAttribute('aria-relevant','additions text')}
    const close=ov.querySelector('[data-close-municipality]');if(close&&!close.getAttribute('aria-label'))close.setAttribute('aria-label','Cerrar selector de municipio');
    document.addEventListener('keydown',e=>{
      if(!ov.classList.contains('open'))return;
      if(e.key==='Escape'){e.preventDefault();BM.closeSelector();return}
      if(e.key!=='Tab'||!selector)return;
      const focusable=[...selector.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter(x=>!x.disabled&&x.offsetParent!==null);
      if(!focusable.length)return;const first=focusable[0],last=focusable[focusable.length-1];
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
    });
  };

  if(_simpleChrome143){
    BM.applySimpleChrome=function(){
      _simpleChrome143();
      // Mantener el menú principal en cinco opciones. Nunca añadir Autor como navegación global.
      document.querySelectorAll('.navlinks a[href*="/autor/"]').forEach(x=>x.remove());
      document.querySelectorAll('footer a[href*="/autor/"]').forEach(x=>x.remove());
      this.installTextControls();this.hardenLinks();this.enhanceDialogAccessibility();
      const current=document.querySelector('.navlinks a[aria-current="page"]');if(current)current.scrollIntoView?.({block:'nearest',inline:'nearest'});
    };
  }

  const observer=(typeof MutationObserver!=='undefined')?new MutationObserver(m=>{for(const r of m)for(const n of r.addedNodes)if(n.nodeType===1)BM.hardenLinks(n)}):null;
  window.addEventListener('DOMContentLoaded',()=>{
    BM.installSecurityMeta();BM.injectContactCTA();BM.installTextControls();BM.enhanceDialogAccessibility();BM.hardenLinks();
    observer?.observe(document.documentElement,{subtree:true,childList:true});
  });
})();

/* v1.4.4 · matching estricto general proyecto-financiacion */
(function () {
  BM.weakFundingTopics = new Set([
    'servicios', 'accesibilidad', 'edificios', 'equipamiento',
    'infraestructura', 'infraestructuras', 'innovacion', 'sostenibilidad',
    'municipal', 'municipio', 'rural', 'territorio', 'digitalizacion',
    'datos', 'administracion', 'gobernanza', 'smart', 'smart-village',
    'tecnologia', 'salud', 'mayores', 'familias'
  ].map(x => BM.normalize(x)));

  BM.genericFundingCategories = new Set([
    'servicios', 'digitalizacion', 'administracion',
    'datos', 'smart-village', 'otros'
  ].map(x => BM.normalize(x)));

  BM.fundingProjectCompatibility = async function (project, opportunity, fit = null) {
    if (!project || !opportunity) {
      return { compatible: false, mode: 'invalid', score: 0, hits: [] };
    }

    if (fit && ['excluded', 'low'].includes(fit.tier)) {
      return { compatible: false, mode: 'municipal_fit', score: 0, hits: [] };
    }

    const opportunityId = opportunity.id;
    const explicit = (project.opportunities || []).includes(opportunityId);

    if (explicit) {
      return {
        compatible: true,
        mode: 'explicit',
        score: 100,
        hits: [opportunityId]
      };
    }

    const category = this.normalize(project.category || '');
    const opportunityTopics = new Set(
      (opportunity.topics || [])
        .map(topic => this.normalize(topic))
        .filter(Boolean)
    );

    if (!opportunityTopics.size) {
      return { compatible: false, mode: 'no_topics', score: 0, hits: [] };
    }

    /*
     * Una categoría concreta exige coincidencia exacta.
     * Ejemplos: agua, energía, turismo, patrimonio, movilidad,
     * vivienda, ciberseguridad, conectividad...
     */
    if (
      category &&
      !this.genericFundingCategories.has(category) &&
      !this.weakFundingTopics.has(category)
    ) {
      if (!opportunityTopics.has(category)) {
        return {
          compatible: false,
          mode: 'category_mismatch',
          score: 0,
          hits: []
        };
      }

      return {
        compatible: true,
        mode: 'exact_category',
        score: 12,
        hits: [category]
      };
    }

    /*
     * En categorías amplias no basta "servicios", "digitalización",
     * "accesibilidad", "edificios", "innovación", etc.
     * Se exige al menos un descriptor específico exacto.
     */
    const anchors = this._uniq(
      (project.tags || []).map(tag => this.normalize(tag))
    ).filter(tag =>
      tag &&
      tag.length >= 3 &&
      !this.weakFundingTopics.has(tag) &&
      !this.genericFundingCategories.has(tag)
    );

    const hits = anchors.filter(tag => opportunityTopics.has(tag));

    if (!hits.length) {
      return {
        compatible: false,
        mode: 'generic_only',
        score: 0,
        hits: []
      };
    }

    return {
      compatible: true,
      mode: 'specific_tag',
      score: 8 + Math.min(4, hits.length * 2),
      hits
    };
  };

  BM.projectOpportunityLinks = async function (profile, project) {
    const opportunities = await this.opportunities();
    const output = [];

    for (const opportunity of opportunities) {
      const match = this.matchOpportunity(opportunity, profile);

      if (match.level === 'fail') {
        continue;
      }

      const compatibility = await this.fundingProjectCompatibility(
        project,
        opportunity,
        null
      );

      if (!compatibility.compatible) {
        continue;
      }

      const score =
        this.opportunityScore(opportunity, profile) +
        compatibility.score;

      if (score <= -80) {
        continue;
      }

      output.push({
        opportunity,
        match,
        overlap: compatibility.hits,
        score,
        compatibility
      });
    }

    return output.sort((a, b) => b.score - a.score).slice(0, 8);
  };

  BM.priorityRanking = async function (profile) {
    const [projects, metrics, signals, opportunities] = await Promise.all([
      this.json('data/catalog/proyectos.json'),
      this.metricsFor(profile),
      this.metricsFor(profile).then(m => this.territorialSignals(m)),
      this.opportunities()
    ]);

    const signalTags = [
      ...new Set(signals.flatMap(signal => signal.tags || []))
    ];

    const preferences = this.getPrefs();
    const priorities = preferences.priorities || [];
    const rows = [];

    for (const project of projects) {
      let impact = 0;
      let urgency = 0;
      let feasibility = 0;
      let funding = 0;
      const reasons = [];

      for (const tag of project.tags || []) {
        if (signalTags.includes(tag)) {
          impact += 3;
          reasons.push('responde a una señal territorial');
        }

        if (
          priorities.includes(tag) ||
          priorities.includes(project.category)
        ) {
          impact += 4;
          reasons.push('prioridad declarada');
        }
      }

      impact += Math.max(0, this.projectFitScore(project, profile));

      if (['baja', 'media'].includes(project.complexity)) {
        feasibility += 3;
        reasons.push('complejidad asumible');
      } else {
        feasibility += 1;
      }

      const capacity = this.getCapacity();

      if (
        capacity.technical === 'low' &&
        project.complexity === 'alta'
      ) {
        feasibility -= 3;
      }

      if (
        capacity.investment === 'low' &&
        ['€€€', '€€€€'].includes(project.cost_band)
      ) {
        feasibility -= 3;
      }

      let linkedFunding = 0;

      for (const opportunity of opportunities) {
        const municipalMatch = this.matchOpportunity(opportunity, profile);

        if (municipalMatch.level === 'fail') {
          continue;
        }

        const compatibility = await this.fundingProjectCompatibility(
          project,
          opportunity,
          null
        );

        if (compatibility.compatible) {
          linkedFunding++;
        }
      }

      if (linkedFunding) {
        funding = Math.min(6, linkedFunding * 2);
        reasons.push(
          `${linkedFunding} vía(s) de financiación con encaje temático fuerte`
        );
      }

      const urgencyTags = [
        'agua', 'ciberseguridad', 'servicios', 'energia', 'movilidad'
      ];

      if (
        (project.tags || []).some(
          tag => urgencyTags.includes(tag) && signalTags.includes(tag)
        )
      ) {
        urgency += 3;
      }

      const total = impact + urgency + feasibility + funding;

      rows.push({
        project,
        total,
        impact,
        urgency,
        feasibility,
        funding,
        reasons: [...new Set(reasons)],
        linked_count: linkedFunding
      });
    }

    return rows.sort((a, b) => b.total - a.total).slice(0, 20);
  };

  BM._fundingChannelFit = async function (project, context) {
    const data = await this.fundingSources();
    const rows = [];

    for (const source of data.sources || []) {
      /*
       * "todos" significa fuente general de búsqueda.
       * Nunca se usa como prueba de que financia un proyecto concreto.
       */
      const topics = (source.topics || []).filter(
        topic => this.normalize(topic) !== 'todos'
      );

      if (!topics.length) {
        continue;
      }

      const pseudoOpportunity = {
        id: `source:${source.id}`,
        topics
      };

      const compatibility = await this.fundingProjectCompatibility(
        project,
        pseudoOpportunity,
        null
      );

      if (!compatibility.compatible) {
        continue;
      }

      let score = compatibility.score;

      if (
        source.id === 'leader' &&
        context?.population != null &&
        context.population <= 20000
      ) {
        score += 5;
      }

      if (source.id === 'poctep') {
        const eligibleProvinces = [
          'A Coruña', 'Lugo', 'Ourense', 'Pontevedra', 'Ávila',
          'León', 'Salamanca', 'Valladolid', 'Zamora',
          'Badajoz', 'Cáceres', 'Cádiz', 'Córdoba', 'Huelva', 'Sevilla'
        ];

        const province = this.normalize(context?.profile?.province);

        if (
          !eligibleProvinces.some(
            candidate => this.normalize(candidate) === province
          )
        ) {
          continue;
        }
      }

      rows.push({
        source,
        score,
        compatibility
      });
    }

    return rows.sort((a, b) => b.score - a.score).slice(0, 3);
  };

  const previousProjectDecision =
    BM._projectDecision ? BM._projectDecision.bind(BM) : null;

  if (previousProjectDecision) {
    BM._projectDecision = async function (
      project,
      context,
      topObligations,
      fundingRows
    ) {
      const row = await previousProjectDecision(
        project,
        context,
        topObligations,
        fundingRows
      );

      /*
       * Retirar cualquier puntuación de financiación heredada de la lógica
       * antigua antes de aplicar la comprobación estricta.
       */
      const oldFunding = Number(row.breakdown?.funding || 0);

      if (row.breakdown) {
        row.breakdown.funding = 0;
      }

      row.score = Number(row.score || 0) - oldFunding;
      row.funding = null;

      row.reasons = (row.reasons || []).filter(reason =>
        !/financiaci[oó]n relacionada|v[ií]a\(s\) de financiaci[oó]n/i
          .test(String(reason))
      );

      let best = null;

      for (const fundingRow of fundingRows || []) {
        if (!fundingRow?.o) {
          continue;
        }

        if (['excluded', 'low'].includes(fundingRow.fit?.tier)) {
          continue;
        }

        const compatibility = await this.fundingProjectCompatibility(
          project,
          fundingRow.o,
          fundingRow.fit
        );

        if (!compatibility.compatible) {
          continue;
        }

        const candidate = {
          row: fundingRow,
          compatibility,
          rank:
            Number(fundingRow.fit?.score || 0) +
            compatibility.score
        };

        if (
          !best ||
          candidate.rank > best.rank
        ) {
          best = candidate;
        }
      }

      if (best) {
        const add = Math.min(5, best.compatibility.score);

        if (row.breakdown) {
          row.breakdown.funding = add;
        }

        row.score += add;
        row.funding = best.row;

        const prefix =
          best.compatibility.mode === 'explicit'
            ? 'Financiación vinculada y aplicable a revisar'
            : 'Financiación con encaje temático fuerte a revisar';

        row.reasons = this._uniq([
          ...(row.reasons || []),
          `${prefix}: ${best.row.o.title}`
        ]).slice(0, 4);
      }

      /*
       * Si una asociación de financiación incorrecta había elevado la
       * prioridad del proyecto, recalcularla sin esos puntos.
       */
      if (row.decision !== 'check_existing') {
        const compliance =
          Number(row.breakdown?.compliance || 0) > 0;

        let decision =
          row.score >= 10
            ? 'prepare'
            : row.score >= 2
              ? 'explore'
              : 'later';

        if (compliance && row.score >= 12) {
          decision = 'do_now';
        }

        if (
          decision === 'do_now' &&
          row.effort?.level === 'high' &&
          !compliance
        ) {
          decision = 'prepare';
        }

        row.decision = decision;

        try {
          const logic = await this.simpleLogic();
          row.decisionLabel =
            (logic.decision_labels || {})[decision] ||
            row.decisionLabel;
        } catch (_error) {
          // No romper el motor si falla solo la etiqueta.
        }
      }

      if (this._projectNextAction) {
        row.nextAction = this._projectNextAction(row, context);
      }

      return row;
    };
  }
})();
