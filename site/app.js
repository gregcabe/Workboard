(function(){
"use strict";
var LKEY="workboard.local";
var STAGES=["Idea","Parked","Plan","Do next","Doing","Done"];
var PRI={"H|L":"do","H|M":"do","M|L":"do","H|H":"plan","M|M":"plan","L|L":"fill","M|H":"park","L|M":"park","L|H":"park"};
var PLABEL={do:"Do first",plan:"Plan",fill:"Fill in",park:"Park",none:"Not rated"};
var PALETTE=["#2A5A97","#7A4FA8","#B5780A","#1F7F86","#2B7A4B","#56636E","#9A2B20","#8A5A12","#3F6E3A","#6B4A7A"];
var TABLES=["projects","people","workstreams","bundles","actions","checklist_items","updates"];
var S={projects:[],people:[],workstreams:[],bundles:[],actions:[],checklist_items:[],updates:[]},LAST={},L={},pending=false,offline=false;
try{L=JSON.parse(localStorage.getItem(LKEY)||"{}")||{};}catch(e){L={};}
function saveL(){try{localStorage.setItem(LKEY,JSON.stringify(L));}catch(e){}}
function clone(x){return JSON.parse(JSON.stringify(x));}
function snapshot(){LAST={};TABLES.forEach(function(t){S[t].forEach(function(r){LAST[t+"/"+r.id]=JSON.stringify(r);});});}
function api(path,opts){opts=opts||{};opts.headers=Object.assign({"X-Key":L.key||"","Content-Type":"application/json"},opts.headers||{});return fetch(path,opts).then(function(r){return r.json().then(function(b){return {status:r.status,body:b};});});}
function load(){return api("/api/state").then(function(r){if(r.status===401){delete L.key;saveL();askKey();return false;}if(r.status!==200)throw new Error(r.body.error||r.status);
 S=r.body;TABLES.forEach(function(t){S[t]=S[t]||[];});if(!S.projects.length){S.projects.push({id:uid("p"),key:"PRJ",name:"First project",nextNum:1,deleted:0,updatedAt:now(),version:0});}
 if(!L.cur||!S.projects.some(function(p){return p.id===L.cur&&!p.deleted}))L.cur=S.projects[0].id;if(!L.me||!peopleList().some(function(p){return p.id===L.me}))L.me=(S.people[0]||{}).id||"";saveL();snapshot();offline=false;return true;}).catch(function(e){offline=true;setStatus();throw e;});}
var flushing=false,flushAgain=false;
function save(){pending=true;setStatus();if(flushing){flushAgain=true;return;}flushing=true;
 var rows=[],sent={};TABLES.forEach(function(t){S[t].forEach(function(r){var k=t+"/"+r.id,js=JSON.stringify(r);if(LAST[k]!==js){rows.push({table:t,row:clone(r)});sent[k]=js;}});});
 if(!rows.length){flushing=false;pending=false;setStatus();return;}
 api("/api/save",{method:"POST",body:JSON.stringify({rows:rows})}).then(function(r){flushing=false;
  if(r.status===200){(r.body.versions||[]).forEach(function(v){var row=S[v.table].find(function(x){return x.id===v.id});if(row){row.version=v.version;sent[v.table+"/"+v.id]=JSON.stringify(row);}});
   Object.keys(sent).forEach(function(k){LAST[k]=sent[k];});TABLES.forEach(function(t){S[t]=S[t].filter(function(x){return !x.deleted});});pending=false;offline=false;setStatus();if(flushAgain){flushAgain=false;save();}else save();}
  else if(r.status===409){toast("Someone else changed that first. Reloading.");reload();}
  else if(r.status===401){delete L.key;saveL();askKey();}
  else{offline=true;setStatus();toast("Save failed: "+(r.body.error||r.status)+". Will retry.");setTimeout(save,8000);}
 }).catch(function(){flushing=false;offline=true;setStatus();setTimeout(save,8000);});}
function reload(){return load().then(function(ok){if(ok){render();if(ui.open)openDrawer(ui.open,true);}}).catch(function(){});}
setInterval(function(){if(!pending&&!document.hidden&&!drag&&!ui.open)reload();},30000);
document.addEventListener("visibilitychange",function(){if(!document.hidden&&!pending&&!ui.open)reload();});
function askKey(){var inp=h("input",{type:"password",placeholder:"Access key","aria-label":"Access key"});
 var box=h("div",{class:"keybox"},h("h2",null,"Workboard"),h("p",null,"Enter the access key to open the board. It is kept in this browser only."),inp,h("button",{type:"button",class:"btn primary",onclick:go},"Open"));
 function go(){var v=inp.value.trim();if(!v)return;L.key=v;saveL();box.remove();boot();}
 inp.addEventListener("keydown",function(e){if(e.key==="Enter")go();});document.querySelectorAll(".keybox").forEach(function(n){n.remove()});document.body.append(box);inp.focus();}
var ui={view:L.view||"board",q:"",ws:"",owner:"",open:null,cols:"stage",rows:"owner",since:isoDay(-7),listGroup:"stage"};

function now(){return new Date().toISOString();}
function isoDay(off){var d=new Date();d.setDate(d.getDate()+(off||0));return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");}
function uid(p){return p+Date.now().toString(36)+Math.random().toString(36).slice(2,6);}
function h(tag,props){var e=document.createElement(tag);props=props||{};for(var k in props){var v=props[k];if(v==null)continue;if(k.slice(0,5)==="aria-"){e.setAttribute(k,String(v));continue;}if(v===false)continue;
 if(k.slice(0,2)==="on")e.addEventListener(k.slice(2),v);else if(k==="class")e.className=v;else if(k==="style")e.style.cssText=v;else if(k in e&&k!=="list"&&k!=="for")e[k]=v;else e.setAttribute(k,v===true?"":v);}
 for(var i=2;i<arguments.length;i++)add(e,arguments[i]);return e;}
function add(e,c){if(c==null||c===false)return;if(Array.isArray(c)){c.forEach(function(x){add(e,x)});return;}e.append(c.nodeType?c:document.createTextNode(String(c)));}
function setKids(n){n.replaceChildren();for(var i=1;i<arguments.length;i++)add(n,arguments[i]);}
var toastT;function toast(m){var t=document.querySelector(".toast");if(t)t.remove();t=h("div",{class:"toast",role:"status"},m);document.body.append(t);clearTimeout(toastT);toastT=setTimeout(function(){t.remove()},3200);}

/* lookups */
function proj(){return S.projects.find(function(p){return p.id===L.cur})||S.projects[0];}
function projList(){return S.projects.filter(function(p){return !p.deleted});}
function wsList(){return S.workstreams.filter(function(w){return w.projectId===L.cur&&!w.deleted}).sort(function(a,b){return a.ord-b.ord||a.name.localeCompare(b.name)});}
function peopleList(){return S.people.filter(function(p){return !p.deleted}).sort(function(a,b){return a.name.localeCompare(b.name)});}
function chk(a){return S.checklist_items.filter(function(c){return c.actionId===a.id&&!c.deleted}).sort(function(x,y){return x.ord-y.ord});}
function ws(id){return S.workstreams.find(function(w){return w.id===id});}
function person(id){return S.people.find(function(p){return p.id===id});}
function pname(id){var p=person(id);return p?p.name:"";}
function initials(n){return n.split(/\s+/).map(function(w){return w[0]}).join("").slice(0,3).toUpperCase();}
function bundle(id){return S.bundles.find(function(b){return b.id===id});}
function bundles(){return S.bundles.filter(function(b){return b.projectId===L.cur&&!b.deleted}).sort(function(x,y){return (x.date||"9999").localeCompare(y.date||"9999")||x.name.localeCompare(y.name)});}
function daysSince(t){return Math.max(0,Math.floor((Date.now()-new Date(t).getTime())/864e5));}
function act(id){return S.actions.find(function(a){return a.id===id});}
function key(a){var p=S.projects.find(function(x){return x.id===a.projectId});return (p?p.key:"")+"-"+a.num;}
function auto(a){return (a.impact&&a.effort)?PRI[a.impact+"|"+a.effort]:"none";}
function pri(a){return a.priority||auto(a);}
function late(a){return a.due&&a.stage!=="Done"&&a.due<isoDay(0);}
function fmtDate(d){if(!d)return "";var p=d.split("-");return ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][+p[1]-1]+" "+(+p[2]);}
function fmtTime(t){var d=new Date(t);return d.toLocaleString([], {month:"short",day:"numeric",hour:"numeric",minute:"2-digit"});}
function projActs(){return S.actions.filter(function(a){return a.projectId===L.cur&&!a.deleted});}
function filtered(){return projActs().filter(function(a){
 if(ui.ws==="_none"&&a.workstreamId)return false;if(ui.ws&&ui.ws!=="_none"&&a.workstreamId!==ui.ws)return false;
 if(ui.owner==="_none"&&a.ownerId)return false;if(ui.owner&&ui.owner!=="_none"&&a.ownerId!==ui.owner)return false;
 if(ui.blockedOnly&&!a.blocked)return false;
 if(ui.q){var hay=(key(a)+" "+a.title+" "+a.notes+" "+a.src.join(" ")+" "+pname(a.ownerId)).toLowerCase();if(hay.indexOf(ui.q)<0)return false;}
 return true;}).sort(function(a,b){return a.num-b.num});}

/* writes */
var FIELD={stage:"Stage",ownerId:"Owner",workstreamId:"Workstream",due:"Due",impact:"Impact",effort:"Effort",priority:"Priority",title:"Title",notes:"Notes",blocked:"Blocked",blockedReason:"Blocked reason",blockedOn:"Waiting on",start:"Start",bundleId:"Bundle"};
function show(f,v){if(f==="blocked")return v?"yes":"no";if(f==="start")return v?fmtDate(v):"none";if(f==="bundleId")return v?((bundle(v)||{}).name||"removed"):"none";if(f==="blockedOn"){var o=act(v);return o?key(o):"none";}if(f==="ownerId")return pname(v)||"none";if(f==="workstreamId")return (ws(v)||{}).name||"none";if(f==="due")return v?fmtDate(v):"none";if(f==="priority")return v?PLABEL[v]:"auto";return v||"none";}
function addUpdate(aid,text,kind){S.updates.push({id:uid("up"),actionId:aid,at:now(),who:L.me,kind:kind||"change",text:text});}
function change(a,f,v,quiet){var old=a[f]==null?"":a[f];if(old===v)return false;a[f]=v;a.updatedAt=now();
 if(!quiet){addUpdate(a.id,(f==="title"||f==="notes")?FIELD[f]+" edited.":FIELD[f]+": "+show(f,old)+" → "+show(f,v)+".");}
 return true;}
function commit(){save();render();if(ui.open)openDrawer(ui.open,true);}
function newAction(title,extra){var p=proj();var a={id:uid("a"),projectId:p.id,num:p.nextNum++,title:title,stage:"Idea",workstreamId:"",ownerId:"",due:"",start:"",impact:"",effort:"",priority:"",notes:"",src:[],blocked:false,blockedReason:"",blockedOn:"",blockedSince:"",bundleId:"",deleted:0,created:now(),updatedAt:now(),version:0};p.updatedAt=now();
 for(var k in extra||{})a[k]=extra[k];S.actions.push(a);
 addUpdate(a.id,"Created.");return a;}

/* capability: none needed; storage is this browser */

/* shell */
var root=document.getElementById("root");
var statusEl=h("span",{class:"savestate"});
var projSel=h("select",{class:"proj","aria-label":"Project",onchange:function(e){if(e.target.value==="_new"){newProject();return;}L.cur=e.target.value;ui.ws="";ui.owner="";saveL();render();}});
var meSel=h("select",{"aria-label":"You are",onchange:function(e){L.me=e.target.value;saveL();render();}});
var search=h("input",{type:"search",placeholder:"Search actions","aria-label":"Search actions",oninput:function(){ui.q=search.value.toLowerCase();renderMain();}});
var topBar=h("div",{class:"top"},h("div",{class:"brand"},"Workboard"),h("label",null,"Project",projSel),h("span",{class:"grow"}),search,h("label",null,"You are",meSel),statusEl,
h("button",{class:"btn primary",type:"button",onclick:function(){var a=newAction("");commit();openDrawer(a.id,false,true);}},"Add an idea"),h("button",{class:"btn help",type:"button","aria-label":"How to use Workboard",title:"How to use Workboard",onclick:openHelp},"?"));
var VIEWS=[["board","Board"],["list","List"],["matrix","Matrix"],["buckets","Buckets"],["timeline","Timeline"],["bundles","Bundles"],["mine","My actions"],["review","Weekly review"],["setup","Setup"]];
var tabs=h("div",{class:"tabs",role:"group","aria-label":"View"},VIEWS.map(function(v){return h("button",{type:"button","data-v":v[0],onclick:function(){ui.view=v[0];L.view=v[0];saveL();render();}},v[1]);}));
var fWs=h("select",{"aria-label":"Workstream",onchange:function(e){ui.ws=e.target.value;renderMain();}});
var fOwn=h("select",{"aria-label":"Owner",onchange:function(e){ui.owner=e.target.value;renderMain();}});
var attn=h("span",{class:"attn"});
var fBlk=h("input",{type:"checkbox",onchange:function(e){ui.blockedOnly=e.target.checked;renderMain();}});
var subBar=h("div",{class:"sub"},tabs,h("label",{class:"fl"},"Workstream",fWs),h("label",{class:"fl"},"Owner",fOwn),h("label",{class:"fl"},fBlk,"Blocked only"),h("span",{class:"grow"}),attn);
function setStatus(){statusEl.textContent=offline?"Can't reach the server. Changes will retry.":pending?"Saving...":"Saved";statusEl.className="savestate"+(offline?" bad":pending?" busy":"");}
var main=h("main");
var normalShell=h("div",null,topBar,subBar,main);
root.append(normalShell);

function render(){
 setKids(projSel,projList().map(function(p){return h("option",{value:p.id,selected:p.id===L.cur},p.name)}),h("option",{value:"_new"},"+ New project"));
 setKids(meSel,peopleList().map(function(p){return h("option",{value:p.id,selected:p.id===L.me},p.name)}));
 tabs.querySelectorAll("button").forEach(function(b){b.setAttribute("aria-pressed",b.dataset.v===ui.view);});
 setKids(fWs,h("option",{value:""},"All"),h("option",{value:"_none"},"None set"),wsList().map(function(w){return h("option",{value:w.id,selected:ui.ws===w.id},w.name)}));fWs.value=ui.ws;
 setKids(fOwn,h("option",{value:""},"All"),h("option",{value:"_none"},"No owner"),peopleList().map(function(p){return h("option",{value:p.id,selected:ui.owner===p.id},p.name)}));fOwn.value=ui.owner;
 var showF=["board","list","matrix","buckets","timeline"].indexOf(ui.view)>=0;subBar.querySelectorAll(".fl").forEach(function(n){n.hidden=!showF;});
 renderMain();}
function renderMain(){
 var pa=projActs(),wk=isoDay(-7);
 var nl=pa.filter(late).length,no=pa.filter(function(a){return !a.ownerId&&["Plan","Do next","Doing"].indexOf(a.stage)>=0}).length;
 var ch=pa.filter(function(a){return S.updates.some(function(u){return u.actionId===a.id&&u.at.slice(0,10)>=wk&&u.kind!=="import"&&u.kind!=="retract";})}).length;
 var nb=pa.filter(function(a){return a.blocked&&a.stage!=="Done"}).length;
 setKids(attn,h("b",{class:"l"},nl+" overdue"),", ",h("b",{class:"l"},nb+" blocked"),", ",h("b",{class:"o"},no+" in play without an owner"),", "+ch+" changed this week");
 var V={board:boardView,list:listView,matrix:matrixView,buckets:bucketView,timeline:timelineView,bundles:bundlesView,mine:mineView,review:reviewView,setup:setupView}[ui.view]||boardView;
 main.replaceChildren(V());}

/* card */
function card(a,compact){var o=a.ownerId?pname(a.ownerId):"",w=ws(a.workstreamId);
 var n=h("div",{class:"card"+(compact?" compact":"")+(a.stage==="Done"?" done":""),role:"button",tabindex:"0",title:a.title,onkeydown:function(e){if(e.key==="Enter"){openDrawer(a.id)}}},
  compact?null:h("div",{class:"k"},key(a)),
  h("div",{class:"t"},compact?h("span",{class:"k"},a.num+"  "):null,a.title||"(untitled)"),
  compact?null:h("div",{class:"ws"},h("span",{class:"dot",style:"background:"+(w?w.color:"transparent")+";border:1px solid "+(w?w.color:"var(--muted)")}),w?w.name:"No workstream"),
  tagRow(a,compact),
  h("div",{class:"ft"},h("span",{class:"who"+(o?"":" noown")},h("span",{class:"av"},o?initials(o):"?"),h("span",null,o||"No owner")),a.due?h("span",{class:"due"+(late(a)?" late":"")},fmtDate(a.due)):null));
 draggable(n,a.id);return n;}

function tagRow(a,compact){var t=[];
 if(a.blocked&&a.stage!=="Done"){var on=act(a.blockedOn);t.push(h("span",{class:"tag blk",title:"Blocked"+(a.blockedSince?" for "+daysSince(a.blockedSince)+" days":"")},"Blocked"+(compact?"":(a.blockedReason?": "+a.blockedReason:""))+(on&&!compact?(on.stage==="Done"?" ("+key(on)+" is done)":" ("+key(on)+")"):"")));}
 var b=bundle(a.bundleId);if(b)t.push(h("span",{class:"tag bun"},compact?"Bundle":b.name+(b.date?", "+fmtDate(b.date):"")));
 var cl=chk(a);if(cl.length){var d=cl.filter(function(c){return c.done}).length;t.push(h("span",{class:"tag chk"+(d===cl.length?" all":"")},d+"/"+cl.length));}
 return t.length?h("div",{class:"tags2"},t):null;}
/* pointer drag */
var drag=null,justDragged=0;
function draggable(n,id){n.addEventListener("click",function(){if(Date.now()-justDragged<400)return;openDrawer(id);});
 n.addEventListener("pointerdown",function(e){if(e.button>0)return;drag={id:id,x:e.clientX,y:e.clientY,node:n,moved:false,ghost:null,over:null};});}
function zone(n,set){n.setAttribute("data-drop",JSON.stringify(set));return n;}
function clearOver(){if(drag&&drag.over){drag.over.classList.remove("over");drag.over=null;}}
document.addEventListener("pointermove",function(e){if(!drag)return;var dx=e.clientX-drag.x,dy=e.clientY-drag.y;
 if(!drag.moved){if(Math.abs(dx)+Math.abs(dy)<6)return;drag.moved=true;var r=drag.node.getBoundingClientRect();var g=drag.node.cloneNode(true);g.classList.add("ghost");g.style.width=r.width+"px";g.style.left=r.left+"px";g.style.top=r.top+"px";document.body.append(g);drag.ghost=g;drag.node.classList.add("dragging");document.body.classList.add("isdragging");}
 e.preventDefault();drag.ghost.style.transform="translate("+dx+"px,"+dy+"px)";
 var t=document.elementFromPoint(e.clientX,e.clientY);var z=t&&t.closest("[data-drop]");if(z!==drag.over){clearOver();if(z){z.classList.add("over");drag.over=z;}}
 if(e.clientY<70)window.scrollBy(0,-14);else if(e.clientY>window.innerHeight-70)window.scrollBy(0,14);
 var sc=t&&t.closest(".scrollx");if(sc){var r2=sc.getBoundingClientRect();if(e.clientX<r2.left+50)sc.scrollLeft-=14;else if(e.clientX>r2.right-50)sc.scrollLeft+=14;}},{passive:false});
function endDrag(cancel){if(!drag)return;var d=drag,z=d.over;clearOver();drag=null;document.body.classList.remove("isdragging");if(d.ghost)d.ghost.remove();d.node.classList.remove("dragging");
 if(cancel||!d.moved)return;justDragged=Date.now();var a=act(d.id);if(!a||!z)return;var set=JSON.parse(z.getAttribute("data-drop"));
 Object.keys(set).forEach(function(k){var v=set[k];
  if(k==="matrix"){change(a,"impact",v[0]);change(a,"effort",v[1]);change(a,"priority","");}
  else if(k==="priority"){if(v==="none"){change(a,"priority","");change(a,"impact","");change(a,"effort","");}else change(a,"priority",v);}
  else change(a,k,v);});commit();}
document.addEventListener("pointerup",function(){endDrag(false);});document.addEventListener("pointercancel",function(){endDrag(true);});

/* views */
function sid(s){return s.replace(/\s/g,"");}
function boardView(){var items=filtered();
 return h("div",{class:"scrollx"},h("div",{class:"board"},STAGES.map(function(s){var g=items.filter(function(a){return a.stage===s});
  return h("div",{class:"col"},h("div",{class:"colh s-"+sid(s)},s,h("span",null,g.length)),
   zone(h("div",{class:"colb"},g.map(function(a){return card(a)}),s==="Idea"?h("button",{class:"addcard",type:"button",onclick:function(){var a=newAction("");commit();openDrawer(a.id,false,true);}},"Add an idea"):null),{stage:s}));})));}

function sel(opts,val,on,label){return h("select",{"aria-label":label,onchange:function(e){on(e.target.value)}},opts.map(function(o){return h("option",{value:o[0],selected:o[0]===val},o[1])}));}
function wsOpts(){return [["","None"]].concat(wsList().map(function(w){return [w.id,w.name]}));}
function ownOpts(){return [["","No owner"]].concat(peopleList().map(function(p){return [p.id,p.name]}));}
function priSel(a){var p=pri(a),au=auto(a);return h("select",{class:"prisel "+(p==="none"?"none":"p-"+p),"aria-label":"Priority",title:a.priority?"Set by hand":"From impact and effort",onchange:function(e){change(a,"priority",e.target.value);commit();}},
 h("option",{value:"",selected:!a.priority},au==="none"?"Not rated":PLABEL[au]),["do","plan","fill","park"].map(function(k){return h("option",{value:k,selected:a.priority===k},PLABEL[k]+" (set)")}));}
function lrow(a){return h("div",{class:"lrow"},h("span",{class:"kk"},key(a)),h("div",null,h("button",{type:"button",class:"tt",onclick:function(){openDrawer(a.id)}},a.title||"(untitled)"),tagRow(a,false)),
 sel(wsOpts(),a.workstreamId,function(v){change(a,"workstreamId",v);commit();},"Workstream"),
 sel(STAGES.map(function(s){return [s,s]}),a.stage,function(v){change(a,"stage",v);commit();},"Stage"),
 sel(ownOpts(),a.ownerId,function(v){change(a,"ownerId",v);commit();},"Owner"),
 h("input",{type:"date",value:a.due,"aria-label":"Due",class:late(a)?"late":"",onchange:function(e){change(a,"due",e.target.value);commit();}}),priSel(a));}
function listView(){var items=filtered();var head=h("div",{class:"lrow head"},h("span",null,"#"),h("span",null,"Action"),h("span",null,"Workstream"),h("span",null,"Stage"),h("span",null,"Owner"),h("span",null,"Due"),h("span",null,"Priority"));
 var ctl=h("div",{class:"bctl"},h("label",null,"Group by ",sel([["stage","Stage"],["ws","Workstream"],["owner","Owner"],["none","Nothing"]],ui.listGroup,function(v){ui.listGroup=v;renderMain();},"Group by")));
 if(!items.length)return h("div",null,ctl,h("div",{class:"empty"},"No actions match these filters."));
 if(ui.listGroup==="none")return h("div",null,ctl,h("div",{class:"tbl"},head,items.map(lrow)));
 var groups=ui.listGroup==="stage"?STAGES.map(function(s){return [s,s]}):ui.listGroup==="ws"?wsOpts().slice(1).concat([["","No workstream"]]):ownOpts().slice(1).concat([["","No owner"]]);
 var f=ui.listGroup==="stage"?"stage":ui.listGroup==="ws"?"workstreamId":"ownerId";
 return h("div",null,ctl,groups.map(function(g){var its=items.filter(function(a){return (a[f]||"")===g[0]});if(!its.length)return null;return h("section",null,h("div",{class:"grp"},g[1],h("span",null,its.length)),h("div",{class:"tbl"},head.cloneNode(true),its.map(lrow)));}));}

function matrixView(){var items=filtered().filter(function(a){return a.stage!=="Done"});var un=items.filter(function(a){return !(a.impact&&a.effort)});
 var cells=[h("div"),["L","M","H"].map(function(e){return h("div",{class:"ax"},"Effort: "+{L:"low",M:"medium",H:"high"}[e])})];
 ["H","M","L"].forEach(function(im){cells.push(h("div",{class:"ax v"},"Impact: "+{H:"high",M:"medium",L:"low"}[im]));
  ["L","M","H"].forEach(function(ef){var p=PRI[im+"|"+ef];var g=items.filter(function(a){return a.impact===im&&a.effort===ef});
   cells.push(zone(h("div",{class:"cell p-"+p},h("h3",null,PLABEL[p]+(g.length?" ("+g.length+")":"")),g.map(function(a){return card(a,true)})),{matrix:[im,ef]}));});});
 return h("div",null,h("div",{class:"bctl"},"Drag a card into a cell to rate it. Stage and owner stay as they are. Done items are hidden."),
  h("div",{class:"mwrap"},zone(h("div",{class:"tray"},h("h3",null,"Not rated ("+un.length+")"),un.map(function(a){return card(a,true)})),{priority:"none"}),h("div",{class:"scrollx",style:"flex:1"},h("div",{class:"matrix"},cells))));}

var AX={stage:"Stage",owner:"Owner",ws:"Workstream",priority:"Priority"};
function axVals(f){if(f==="stage")return STAGES.map(function(s){return [s,s]});if(f==="owner")return [["","No owner"]].concat(peopleList().map(function(p){return [p.id,p.name]}));
 if(f==="ws")return [["","No workstream"]].concat(wsList().map(function(w){return [w.id,w.name]}));return ["do","plan","fill","park","none"].map(function(k){return [k,PLABEL[k]]});}
function axGet(f,a){return f==="stage"?a.stage:f==="owner"?a.ownerId:f==="ws"?a.workstreamId:pri(a);}
function axSet(f,v,set){if(f==="stage")set.stage=v;else if(f==="owner")set.ownerId=v;else if(f==="ws")set.workstreamId=v;else set.priority=v;}
function bucketView(){var cf=ui.cols,rf=ui.rows==="none"?null:ui.rows;var items=filtered();if(cf!=="stage"&&rf!=="stage")items=items.filter(function(a){return a.stage!=="Done"});
 var cols=axVals(cf),rows=rf?axVals(rf):[[null,null]];L.collapsed=L.collapsed||{};ui.collapsed=L.collapsed;
 function ck(r){return rf+"|"+r;}
 var ctl=h("div",{class:"bctl"},h("label",null,"Columns ",sel(Object.keys(AX).map(function(k){return [k,AX[k]]}),cf,function(v){ui.cols=v;if(ui.rows===v)ui.rows="none";renderMain();},"Columns")),
  h("label",null,"Rows ",sel([["none","None"]].concat(Object.keys(AX).filter(function(k){return k!==cf}).map(function(k){return [k,AX[k]]})),ui.rows,function(v){ui.rows=v;renderMain();},"Rows")),
  rf?h("button",{type:"button",class:"btn",onclick:function(){rows.forEach(function(r){ui.collapsed[ck(r[0])]=true});saveL();renderMain();}},"Collapse all rows"):null,
  rf?h("button",{type:"button",class:"btn",onclick:function(){rows.forEach(function(r){delete ui.collapsed[ck(r[0])]});saveL();renderMain();}},"Expand all"):null,
  h("span",null,"Drag a card into a bucket to set it. Click a card to open it."));
 var grid=h("div",{class:"bgrid",style:"grid-template-columns:"+(rf?"11rem ":"")+"repeat("+cols.length+",minmax(200px,1fr))"});
 if(rf)grid.append(h("div",{class:"bcorner"}));
 cols.forEach(function(c){var n=items.filter(function(a){return (axGet(cf,a)||"")===c[0]}).length;grid.append(h("div",{class:"bh bch "+hcls(cf,c[0])},c[1],h("span",null,n)));});
 rows.forEach(function(r){var col=rf&&ui.collapsed[ck(r[0])];
  if(rf){var n=items.filter(function(a){return (axGet(rf,a)||"")===r[0]}).length;
   grid.append(h("button",{type:"button",class:"bh brh "+hcls(rf,r[0]),"aria-expanded":!col,title:col?"Expand this row":"Collapse this row",onclick:function(){if(col)delete ui.collapsed[ck(r[0])];else ui.collapsed[ck(r[0])]=true;saveL();renderMain();}},h("span",{class:"in"},h("span",{class:"chev"},col?"▸":"▾"),h("span",{class:"bl"},r[1]),h("span",null,n))));}
  cols.forEach(function(c){var g=items.filter(function(a){return (axGet(cf,a)||"")===c[0]&&(!rf||(axGet(rf,a)||"")===r[0])});var set={};axSet(cf,c[0],set);if(rf)axSet(rf,r[0],set);
   grid.append(zone(h("div",{class:"bk"+(col?" collapsed":"")},col?(g.length?h("span",{class:"cnt"},g.length+(g.length===1?" card":" cards")):null):g.map(function(a){return card(a,true)})),set));});});
 var sc=h("div",{class:"bscroll"},grid);
 return h("div",null,ctl,sc);}
function hcls(f,v){if(f==="stage")return "s-"+sid(v);if(f==="priority")return v==="none"?"":"p-"+v;return "";}

function bundlesView(){var nm=h("input",{type:"text",placeholder:"New bundle, e.g. Carousel downtime, Thu 2nd shift","aria-label":"New bundle name",style:"flex:1"});var dt=h("input",{type:"date","aria-label":"Planned date"});
 function addB(){var v=nm.value.trim();if(!v)return;S.bundles.push({id:uid("b"),projectId:L.cur,name:v,date:dt.value,notes:"",deleted:0,updatedAt:now(),version:0});save();renderMain();}
 nm.addEventListener("keydown",function(e){if(e.key==="Enter")addB();});
 var bs=bundles();
 return h("div",{class:"bundles"},h("div",{class:"bctl"},"Group actions that have to happen together, like everything needing the same downtime window. Add an action to a bundle from its card."),
  h("div",{class:"sec addb"},h("div",{class:"srow"},nm,dt,h("button",{type:"button",class:"btn primary",onclick:addB},"Add bundle"))),
  bs.length?null:h("div",{class:"empty"},"No bundles yet."),
  bs.map(function(b){var ms=projActs().filter(function(a){return a.bundleId===b.id}).sort(function(x,y){return x.num-y.num});var open=ms.filter(function(a){return a.stage!=="Done"}).length;
   var del=h("button",{type:"button",class:"btn danger",onclick:function(e){var t=e.currentTarget;if(t.dataset.arm){b.deleted=1;b.updatedAt=now();ms.forEach(function(a){change(a,"bundleId","")});save();renderMain();}else{t.dataset.arm="1";t.textContent="Click again: members are kept, just unbundled";}}},"Delete bundle");
   return h("div",{class:"sec bundle"},h("div",{class:"srow"},h("input",{type:"text",value:b.name,"aria-label":"Bundle name",style:"flex:1;font-weight:700;font-size:1.02rem",onchange:function(e){b.name=e.target.value.trim()||b.name;b.updatedAt=now();save();renderMain();}}),h("input",{type:"date",value:b.date,"aria-label":"Planned date",onchange:function(e){b.date=e.target.value;b.updatedAt=now();ms.forEach(function(a){addUpdate(a.id,"Bundle \""+b.name+"\" date: "+(e.target.value?fmtDate(e.target.value):"none")+".")});save();renderMain();}})),
    h("div",{style:"color:var(--muted);font-size:.88rem"},ms.length+" actions, "+open+" open"+(b.date?"":". No date yet.")),
    h("textarea",{rows:2,value:b.notes,placeholder:"Notes for this window, e.g. who to schedule with","aria-label":"Bundle notes",style:"border:1px solid var(--line);border-radius:6px;padding:6px 8px;background:var(--panel);resize:vertical",onchange:function(e){b.notes=e.target.value;b.updatedAt=now();save();}}),
    ms.map(function(a){return h("div",{class:"bm"},h("button",{type:"button",class:"t",onclick:function(){openDrawer(a.id)}},key(a)+"  "+(a.title||"(untitled)")),h("span",{class:"bmm"},(pname(a.ownerId)||"No owner")+", "+a.stage),tagRow(a,false),h("button",{type:"button",class:"cx","aria-label":"Remove from bundle",title:"Remove from bundle",onclick:function(){change(a,"bundleId","");commit();}},"×"));}),
    h("div",null,del));}));}
function pd(s){var p=s.split("-");return new Date(+p[0],+p[1]-1,+p[2]);}
function addDays(d,n){var x=new Date(d);x.setDate(x.getDate()+n);return x;}
function timelineView(){var weeks=+(ui.tlWeeks||12),DW=14,today=pd(isoDay(0));var st=addDays(today,-((today.getDay()+6)%7)-7+7*(ui.tlOff||0));var days=weeks*7,W=days*DW;
 function x(d){return Math.round((pd(d)-st)/864e5)*DW;}
 var all=filtered(),items=all.filter(function(a){return a.start||a.due}),und=all.length-items.length;
 var g=ui.tlGroup||"ws";var groups=g==="ws"?wsOpts().slice(1).concat([["","No workstream"]]):g==="owner"?ownOpts().slice(1).concat([["","No owner"]]):g==="bundle"?bundles().map(function(b){return [b.id,b.name]}).concat([["","Not bundled"]]):STAGES.map(function(s){return [s,s]});
 var f=g==="ws"?"workstreamId":g==="owner"?"ownerId":g==="bundle"?"bundleId":"stage";
 var ctl=h("div",{class:"bctl"},h("label",null,"Group by ",sel([["ws","Workstream"],["owner","Owner"],["bundle","Bundle"],["stage","Stage"]],g,function(v){ui.tlGroup=v;renderMain();},"Group by")),
  h("label",null,"Show ",sel([["8","8 weeks"],["12","12 weeks"],["26","26 weeks"]],String(weeks),function(v){ui.tlWeeks=v;renderMain();},"Weeks")),
  h("button",{type:"button",class:"btn",onclick:function(){ui.tlOff=(ui.tlOff||0)-4;renderMain();}},"Earlier"),h("button",{type:"button",class:"btn",onclick:function(){ui.tlOff=0;renderMain();}},"Today"),h("button",{type:"button",class:"btn",onclick:function(){ui.tlOff=(ui.tlOff||0)+4;renderMain();}},"Later"),
  h("span",null,und?und+" actions have no start or due date and aren't shown. Add dates in the card.":"Click a bar to open the action."));
 var labels=h("div",{class:"tll"},h("div",{class:"tlh tlcorner"},"Action")),chart=h("div",{class:"tlc",style:"width:"+W+"px"});
 var head=h("div",{class:"tlh tlweeks",style:"width:"+W+"px"});var MON=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
 for(var i=0;i<weeks;i++){var d=addDays(st,i*7);head.append(h("div",{class:"wk",style:"left:"+(i*7*DW)+"px;width:"+(7*DW)+"px"},MON[d.getMonth()]+" "+d.getDate()));}
 chart.append(head);var rows=h("div",{class:"tlrows",style:"width:"+W+"px"});chart.append(rows);
 for(i=0;i<weeks;i++)rows.append(h("div",{class:"wkline",style:"left:"+(i*7*DW)+"px"}));
 bundles().forEach(function(b){if(!b.date)return;var bx=x(b.date);if(bx<0||bx>=W)return;rows.append(h("div",{class:"band",style:"left:"+bx+"px;width:"+DW+"px",title:b.name+", "+fmtDate(b.date)}));head.append(h("div",{class:"bandlab",style:"left:"+bx+"px",title:b.name+", "+fmtDate(b.date)},b.name));});
 var tx=x(isoDay(0));rows.append(h("div",{class:"todayl",style:"left:"+(tx+DW/2)+"px"}));
 var shown=0;
 groups.forEach(function(gr){var its=items.filter(function(a){return (a[f]||"")===gr[0]}).sort(function(p,q){return (p.start||p.due).localeCompare(q.start||q.due)||p.num-q.num});if(!its.length)return;
  labels.append(h("div",{class:"tlg"},gr[1]+" ("+its.length+")"));rows.append(h("div",{class:"tlgr"}));
  its.forEach(function(a){shown++;var w=ws(a.workstreamId),col=w?w.color:"#56636E";
   labels.append(h("button",{type:"button",class:"tlr",onclick:function(){openDrawer(a.id)},title:a.title},h("span",{class:"k"},a.num),h("span",{class:"tn"},a.title||"(untitled)")));
   var r=h("div",{class:"tlrow"});
   var s=a.start||a.due,e=a.due||a.start,x1=x(s),x2=x(e)+DW;if(x2<x1)x2=x1+DW;
   var cls="bar"+(late(a)?" late":"")+(a.blocked&&a.stage!=="Done"?" blk":"")+(a.stage==="Done"?" done":"");
   if(x2<=0)r.append(h("span",{class:"off l"+(late(a)?" late":"")},"◂ "+(late(a)?"Overdue, due ":"")+fmtDate(e)));else if(x1>=W)r.append(h("span",{class:"off r"},fmtDate(s)+" ▸"));
   else if(a.start&&a.due){var l=Math.max(0,x1),rr=Math.min(W,x2);r.append(h("button",{type:"button",class:cls,"aria-label":key(a)+" "+a.title,style:"left:"+l+"px;width:"+(rr-l)+"px;--c:"+col,title:a.title+": "+fmtDate(a.start)+" to "+fmtDate(a.due),onclick:function(){openDrawer(a.id)}}));}
   else r.append(h("button",{type:"button",class:"mk "+cls,"aria-label":key(a)+" "+a.title,style:"left:"+(x1+DW/2-7)+"px;--c:"+col,title:a.title+": "+(a.due?"due ":"starts ")+fmtDate(s),onclick:function(){openDrawer(a.id)}}));
   rows.append(r);});});
 if(!shown)return h("div",null,ctl,h("div",{class:"empty"},"Nothing to show yet. Give actions a start or due date in their cards and they appear here."));
 return h("div",null,ctl,h("div",{class:"tl"},h("div",{class:"tlin"},labels,chart)),h("div",{class:"tlkey"},h("span",null,h("i",{class:"kb"}),"start to due"),h("span",null,h("i",{class:"kmk"}),"due date only"),h("span",null,h("i",{class:"kb late"}),"overdue"),h("span",null,h("i",{class:"kb blk"}),"blocked"),h("span",null,h("i",{class:"kband"}),"bundle date"),h("span",null,h("i",{class:"ktoday"}),"today")));}

function mineView(){var me=L.me,its=projActs().filter(function(a){return a.ownerId===me&&a.stage!=="Done"});
 var groups=[["Overdue",its.filter(late)],["Doing",its.filter(function(a){return a.stage==="Doing"&&!late(a)})],["Do next",its.filter(function(a){return a.stage==="Do next"&&!late(a)})],["Plan",its.filter(function(a){return a.stage==="Plan"&&!late(a)})],["Ideas and parked",its.filter(function(a){return (a.stage==="Idea"||a.stage==="Parked")&&!late(a)})]];
 var nextStage={"Idea":"Plan","Parked":"Plan","Plan":"Do next","Do next":"Doing","Doing":"Done"};
 return h("div",{class:"mine"},h("div",{class:"bctl"},"Showing actions owned by "+pname(me)+" in "+proj().name+". Change who you are at the top."),
  its.length?null:h("div",{class:"empty"},"Nothing assigned to "+pname(me)+" in this project."),
  groups.map(function(g){if(!g[1].length)return null;return h("section",null,h("h2",null,g[0]+" ("+g[1].length+")"),g[1].map(function(a){var w=ws(a.workstreamId);var ns=nextStage[a.stage];
   return h("div",{class:"mcard"},h("button",{type:"button",class:"t",onclick:function(){openDrawer(a.id)}},a.title||"(untitled)"),h("div",{class:"mrow"},h("span",null,key(a)+"  "+(w?w.name:"No workstream")+"  "+a.stage),a.due?h("span",{class:"due"+(late(a)?" late":"")},(late(a)?"Overdue: ":"Due ")+fmtDate(a.due)):null),
    h("div",{class:"mbtns"},h("button",{type:"button",class:"btn",onclick:function(){openDrawer(a.id,false,false,true)}},"Add update"),ns?h("button",{type:"button",class:"btn",onclick:function(){change(a,"stage",ns);commit();toast(key(a)+" moved to "+ns+".");}},ns==="Done"?"Mark done":"Move to "+ns):null));}));}));}

function reviewView(){var since=ui.since,pa=projActs();
 var changed=pa.map(function(a){return [a,S.updates.filter(function(u){return u.actionId===a.id&&u.at.slice(0,10)>=since&&u.kind!=="import"&&u.kind!=="retract"})]}).filter(function(x){return x[1].length}).sort(function(x,y){return y[1][y[1].length-1].at.localeCompare(x[1][x[1].length-1].at)});
 var ri=function(a,sub){return h("div",{class:"ritem"},h("button",{type:"button",class:"t",onclick:function(){openDrawer(a.id)}},key(a)+"  "+(a.title||"(untitled)")),sub);};
 var over=pa.filter(late),noown=pa.filter(function(a){return !a.ownerId&&["Plan","Do next","Doing"].indexOf(a.stage)>=0}),nodue=pa.filter(function(a){return !a.due&&["Do next","Doing"].indexOf(a.stage)>=0&&a.ownerId});
 return h("div",null,h("div",{class:"bctl"},h("label",null,"Changes since ",h("input",{type:"date",value:since,onchange:function(e){ui.since=e.target.value||isoDay(-7);renderMain();}}))),
  h("div",{class:"rev"},
   h("div",{class:"sec"},h("h2",null,"What changed",h("span",null,changed.length+" actions")),changed.length?changed.map(function(x){return ri(x[0],x[1].map(function(u){return h("div",{class:"u"},fmtTime(u.at)+"  "+pname(u.who)+": "+u.text)}));}):h("div",{class:"u"},"No changes since "+fmtDate(since)+".")),
   h("div",{style:"display:flex;flex-direction:column;gap:18px"},
    (function(){var bl=pa.filter(function(a){return a.blocked&&a.stage!=="Done"}).sort(function(x,y){return (x.blockedSince||"").localeCompare(y.blockedSince||"")});
     return h("div",{class:"sec"},h("h2",null,"Blocked",h("span",null,bl.length)),bl.length?bl.map(function(a){var on=act(a.blockedOn);return ri(a,h("div",{class:"u"},(a.blockedReason||"No reason given")+(on?", waiting on "+key(on)+(on.stage==="Done"?" (now done)":""):"")+(a.blockedSince?", "+daysSince(a.blockedSince)+" days":"")+", "+(pname(a.ownerId)||"no owner")))}):h("div",{class:"u"},"Nothing blocked."));})(),
    h("div",{class:"sec"},h("h2",null,"Overdue",h("span",null,over.length)),over.length?over.map(function(a){return ri(a,h("div",{class:"u"},(pname(a.ownerId)||"No owner")+", due "+fmtDate(a.due)))}):h("div",{class:"u"},"Nothing overdue.")),
    h("div",{class:"sec"},h("h2",null,"In play without an owner",h("span",null,noown.length)),noown.length?noown.map(function(a){return ri(a,h("div",{class:"u"},a.stage))}):h("div",{class:"u"},"Every action in play has an owner.")),
    h("div",{class:"sec"},h("h2",null,"Owned, no due date",h("span",null,nodue.length)),nodue.length?nodue.map(function(a){return ri(a,h("div",{class:"u"},pname(a.ownerId)+", "+a.stage))}):h("div",{class:"u"},"Every active action has a date.")))));}

function setupView(){
 function listSec(title,items,row,addPh,onAdd){var inp=h("input",{type:"text",placeholder:addPh});
  return h("div",{class:"sec"},h("h2",null,title,h("span",null,items.length)),items.map(row),h("div",{class:"srow"},inp,h("button",{type:"button",class:"btn",onclick:function(){var v=inp.value.trim();if(v){onAdd(v);save();render();}}},"Add")));}
 function nameExists(list,v){return list.some(function(x){return x.name.toLowerCase()===v.toLowerCase()});}
 return h("div",{class:"setup"},
  listSec("Projects",projList(),function(p){return h("div",{class:"srow"},h("input",{type:"text",value:p.name,"aria-label":"Project name",onchange:function(e){p.name=e.target.value.trim()||p.name;p.updatedAt=now();save();render();}}),h("input",{type:"text",value:p.key,style:"width:4.5rem","aria-label":"Project key",onchange:function(e){p.key=e.target.value.trim().toUpperCase()||p.key;p.updatedAt=now();save();render();}}));},"New project name",function(v){addProject(v);}),
  listSec("Workstreams in "+proj().name,wsList(),function(w){return h("div",{class:"srow"},h("input",{type:"color",value:w.color,"aria-label":"Color",onchange:function(e){w.color=e.target.value;w.updatedAt=now();save();render();}}),h("input",{type:"text",value:w.name,"aria-label":"Workstream name",onchange:function(e){w.name=e.target.value.trim()||w.name;w.updatedAt=now();save();render();}}));},"New workstream",function(v){if(nameExists(wsList(),v)){toast("That workstream already exists.");return;}S.workstreams.push({id:uid("w"),projectId:L.cur,name:v,color:PALETTE[wsList().length%PALETTE.length],ord:wsList().length+1,deleted:0,updatedAt:now(),version:0});}),
  listSec("People and companies",peopleList(),function(p){return h("div",{class:"srow"},h("input",{type:"text",value:p.name,"aria-label":"Name",onchange:function(e){p.name=e.target.value.trim()||p.name;p.updatedAt=now();save();render();}}),sel([["person","Person"],["company","Company"]],p.kind||"person",function(v){p.kind=v;p.updatedAt=now();save();},"Kind"));},"New person or company",function(v){if(nameExists(peopleList(),v)){toast("That person is already listed.");return;}S.people.push({id:uid("u"),name:v,kind:"person",email:"",deleted:0,updatedAt:now(),version:0});}));}
function addProject(v){var k=v.replace(/[^A-Za-z]/g,"").slice(0,3).toUpperCase()||"PRJ";var p={id:uid("p"),key:k,name:v,nextNum:1,deleted:0,updatedAt:now(),version:0};S.projects.push(p);L.cur=p.id;saveL();return p;}
function newProject(){ui.view="setup";render();toast("Add the new project under Projects, then pick it from the list.");}

/* help */
function openHelp(){closeDrawer();var P=function(t){return h("p",null,t)};var H=function(t){return h("h3",null,t)};
 var body=h("div",{class:"db help"},
  H("What this is"),P("The team's action board. Every idea and action is one card that moves through Idea, Parked, Plan, Do next, Doing and Done."),
  H("Getting around"),P("Board: drag cards between stages. List: edit in place. Matrix: drag onto the impact and effort grid to set priority. Buckets: any two of stage, owner, workstream and priority; drag a card into a bucket to set both. Timeline: cards with dates, by week. Bundles: work that happens together, like one downtime window. My actions: just yours. Weekly review: what changed, what is overdue, blocked, or has no owner."),
  H("Working a card"),P("Click a card to open it. Set the owner, due date and workstream. Tick \"Blocked\" when something is stuck and say why. Use the checklist for steps inside one action. Post an update whenever something moves; that is what the weekly review reads. Posts can be retracted but never deleted, so the history stays honest."),
  H("Adding ideas"),P("Add an idea (top right) or the button at the bottom of the Idea column. No form to fill: type the idea, and the rest can come later."),
  H("You are"),P("Set \"You are\" to your name at the top right so your changes carry your name. It is remembered in this browser."),
  H("Saving"),P("Changes save as you make them. \"Saved\" shows top right. Other people's changes appear within about 30 seconds or when you come back to the tab."));
 var dr=h("div",{class:"drawer",role:"dialog","aria-modal":"true","aria-label":"How to use Workboard"},h("div",{class:"dh"},h("span",null,"How to use Workboard"),h("button",{type:"button",class:"btn",onclick:closeDrawer},"Close")),body);
 document.body.append(h("div",{class:"scrim",onclick:closeDrawer}),dr);ui.open="help";}
/* drawer */
function closeDrawer(){if(ui.open==="help")ui.open=null;ui.open=null;document.querySelectorAll(".scrim,.drawer").forEach(function(n){n.remove()});}
function openDrawer(id,keep,focusTitle,focusPost){var a=act(id);if(!a){closeDrawer();return;}var old=document.querySelector(".drawer .db"),st=keep&&old?old.scrollTop:0;closeDrawer();ui.open=id;
 var ttl=h("textarea",{class:"title",rows:2,value:a.title,"aria-label":"Title",placeholder:"What's the idea or action?",onchange:function(e){change(a,"title",e.target.value.trim());save();renderMain();}});
 var post=h("input",{type:"text",placeholder:"Add an update","aria-label":"Add an update",onkeydown:function(e){if(e.key==="Enter")doPost();}});
 function doPost(){var v=post.value.trim();if(!v)return;addUpdate(a.id,v,"note");a.updatedAt=now();commit();}
 function seg(f,label){return h("span",{class:"seg",role:"group","aria-label":label},h("i",null,label),["H","M","L"].map(function(v){return h("button",{type:"button","aria-pressed":a[f]===v,onclick:function(){change(a,f,a[f]===v?"":v);commit();}},v)}));}
 var retracted={};S.updates.forEach(function(u){if(u.kind==="retract")retracted[u.text]=u;});
 var ups=S.updates.filter(function(u){return u.actionId===a.id&&u.kind!=="retract"}).sort(function(x,y){return y.at.localeCompare(x.at)});
 var others=projActs().filter(function(x){return x.id!==a.id}).sort(function(x,y){return x.num-y.num});
 var merge=sel([["","Merge into another action..."]].concat(others.map(function(x){return [x.id,key(x)+"  "+(x.title||"").slice(0,60)]})),"",function(v){if(v)mergeInto(a,act(v));},"Merge into");
 var delBtn=h("button",{type:"button",class:"btn danger",onclick:function(e){var b=e.currentTarget;if(b.dataset.arm){a.deleted=1;a.updatedAt=now();S.actions.forEach(function(x){if(x.blockedOn===a.id){x.blockedOn="";x.updatedAt=now();}});closeDrawer();save();render();toast(key(a)+" deleted.");}else{b.dataset.arm="1";b.textContent="Click again to delete";}}},"Delete");
 var body=h("div",{class:"db"},ttl,
  h("div",null,h("span",{class:"flab"},"Stage"),h("div",{class:"pills"},STAGES.map(function(s){return h("button",{type:"button","aria-pressed":a.stage===s,onclick:function(){change(a,"stage",s);commit();}},s)}))),
  h("div",{class:"f2"},
   h("div",{class:"f"},h("label",null,"Workstream"),sel(wsOpts().concat([["_add","+ Add a workstream"]]),a.workstreamId,function(v){if(v==="_add"){ui.view="setup";closeDrawer();render();return;}change(a,"workstreamId",v);commit();},"Workstream")),
   h("div",{class:"f"},h("label",null,"Owner"),sel(ownOpts().concat([["_add","+ Add a person"]]),a.ownerId,function(v){if(v==="_add"){ui.view="setup";closeDrawer();render();return;}change(a,"ownerId",v);commit();},"Owner")),
   h("div",{class:"f"},h("label",null,"Start"),h("input",{type:"date",value:a.start,onchange:function(e){change(a,"start",e.target.value);commit();}})),
   h("div",{class:"f"},h("label",null,"Due"),h("input",{type:"date",value:a.due,onchange:function(e){change(a,"due",e.target.value);commit();}})),
   h("div",{class:"f"},h("label",null,"Priority"),priSel(a)),
   h("div",{class:"f"},h("label",null,"Bundle"),ui.addingBundle?bundleAdder(a):sel([["","None"]].concat(bundles().map(function(b){return [b.id,b.name+(b.date?", "+fmtDate(b.date):"")]})).concat([["_new","+ New bundle"]]),a.bundleId,function(v){if(v==="_new"){ui.addingBundle=true;openDrawer(a.id,true);return;}change(a,"bundleId",v);commit();},"Bundle"))),
  blockedBox(a),
  h("div",{style:"display:flex;gap:10px;flex-wrap:wrap"},seg("impact","Impact"),seg("effort","Effort")),
  h("div",{class:"f"},h("label",null,"Source"),h("input",{type:"text",value:a.src.join(", "),placeholder:"Where it came from, comma separated",onchange:function(e){a.src=e.target.value.split(",").map(function(s){return s.trim()}).filter(Boolean);a.updatedAt=now();save();renderMain();}})),
  checklistBox(a),
  h("div",{class:"f"},h("label",null,"Notes"),h("textarea",{rows:3,value:a.notes,onchange:function(e){change(a,"notes",e.target.value);save();}})),
  h("div",null,h("span",{class:"flab"},"Updates"),h("div",{class:"post"},post,h("button",{type:"button",class:"btn primary",onclick:doPost},"Post")),
   h("div",{class:"log"},ups.map(function(u){var r=retracted[u.id];
    if(r)return h("div",{class:"e"},h("div",{class:"m"},h("b",null,pname(u.who)||"Someone"),"  "+fmtTime(u.at)),h("div",{class:"x chg"},"Post retracted by "+(pname(r.who)||"someone")+", "+fmtTime(r.at)+"."));
    return h("div",{class:"e"},h("div",{class:"m"},h("b",null,pname(u.who)||"Someone"),"  "+fmtTime(u.at),u.kind==="note"?h("button",{type:"button",class:"rx",title:"Retract this post",onclick:function(e){var b=e.currentTarget;if(b.dataset.arm){S.updates.push({id:uid("up"),actionId:a.id,at:now(),who:L.me,kind:"retract",text:u.id});commit();}else{b.dataset.arm="1";b.textContent="Click again to retract";}}},"Retract"):null),h("div",{class:"x"+(u.kind!=="note"?" chg":"")},u.text));}))));
 var dr=h("div",{class:"drawer",role:"dialog","aria-modal":"true","aria-label":"Action "+key(a)},
  h("div",{class:"dh"},h("span",null,proj().name+" / "+key(a)),h("button",{type:"button",class:"btn",onclick:closeDrawer},"Close")),body,
  h("div",{class:"df"},merge,delBtn));
 document.body.append(h("div",{class:"scrim",onclick:closeDrawer}),dr);body.scrollTop=st;
 if(focusTitle)ttl.focus();if(focusPost)post.focus();}
function bundleAdder(a){var nm=h("input",{type:"text",placeholder:"Bundle name, e.g. Carousel downtime","aria-label":"New bundle name"});var dt=h("input",{type:"date","aria-label":"Bundle date"});
 function go(){var v=nm.value.trim();if(!v){ui.addingBundle=false;openDrawer(a.id,true);return;}var b={id:uid("b"),projectId:a.projectId,name:v,date:dt.value,notes:"",deleted:0,updatedAt:now(),version:0};S.bundles.push(b);ui.addingBundle=false;change(a,"bundleId",b.id);commit();}
 setTimeout(function(){nm.focus()},0);nm.addEventListener("keydown",function(e){if(e.key==="Enter")go();if(e.key==="Escape"){e.stopPropagation();ui.addingBundle=false;openDrawer(a.id,true);}});
 return h("div",{style:"display:flex;flex-direction:column;gap:6px"},nm,h("div",{style:"display:flex;gap:6px"},dt,h("button",{type:"button",class:"btn",onclick:go},"Add")));}
var REASONS=["Needs downtime","Waiting on parts","Waiting on another action","Waiting on a vendor","Needs approval"];
function blockedBox(a){var on=act(a.blockedOn);
 var cb=h("input",{type:"checkbox",checked:a.blocked,onchange:function(e){var v=e.target.checked;change(a,"blocked",v);if(v){a.blockedSince=now();}else{a.blockedSince="";if(a.blockedReason)change(a,"blockedReason","",true);if(a.blockedOn)change(a,"blockedOn","",true);}commit();}});
 var box=h("div",{class:"blkbox"+(a.blocked?" on":"")},h("label",{class:"blkh"},cb,h("span",null,"Blocked, or a prerequisite isn't met yet")));
 if(a.blocked){var others=projActs().filter(function(x){return x.id!==a.id}).sort(function(x,y){return x.num-y.num});
  box.append(h("div",{class:"f"},h("label",null,"Reason"),h("input",{type:"text",list:"reasons",value:a.blockedReason,placeholder:"e.g. Needs 4 hr downtime",onchange:function(e){change(a,"blockedReason",e.target.value.trim());commit();}}),h("datalist",{id:"reasons"},REASONS.map(function(r){return h("option",{value:r})}))),
   h("div",{class:"f"},h("label",null,"Waiting on another action (optional)"),sel([["","Nothing specific"]].concat(others.map(function(x){return [x.id,key(x)+"  "+(x.title||"").slice(0,55)+(x.stage==="Done"?" (done)":"")]})),a.blockedOn,function(v){change(a,"blockedOn",v);commit();},"Waiting on")),
   h("div",{class:"bsince"},a.blockedSince?"Blocked since "+fmtTime(a.blockedSince)+(on&&on.stage==="Done"?". "+key(on)+" is done, so this may be clear to go.":""):""));}
 return box;}
function checklistBox(a){var cl=chk(a),d=cl.filter(function(c){return c.done}).length;var inp=h("input",{type:"text",placeholder:"Add a step and press Enter","aria-label":"Add a checklist step",onkeydown:function(e){if(e.key==="Enter"){var v=inp.value.trim();if(!v)return;S.checklist_items.push({id:uid("c"),actionId:a.id,text:v,done:false,ord:cl.length+1,deleted:0,updatedAt:now(),version:0});a.updatedAt=now();save();renderMain();openDrawer(a.id,true);var n=document.querySelector(".chkadd input");if(n)n.focus();}}});
 return h("div",null,h("span",{class:"flab"},"Checklist"+(cl.length?" ("+d+" of "+cl.length+" done)":"")),
  h("div",{class:"chklist"},cl.map(function(c){return h("div",{class:"ci"+(c.done?" done":"")},h("input",{type:"checkbox",checked:c.done,"aria-label":"Done: "+c.text,onchange:function(e){c.done=e.target.checked;c.updatedAt=now();addUpdate(a.id,"Checklist: \""+c.text+"\" "+(c.done?"done.":"reopened."));commit();}}),
   h("input",{type:"text",value:c.text,"aria-label":"Step","class":"ct",onchange:function(e){c.text=e.target.value.trim()||c.text;c.updatedAt=now();save();}}),
   h("button",{type:"button",class:"cx","aria-label":"Remove step",onclick:function(){c.deleted=1;c.updatedAt=now();commit();}},"×"));})),
  h("div",{class:"chkadd"},inp));}
function mergeInto(a,t){if(!t)return;t.src=Array.from(new Set(t.src.concat(a.src)));t.notes=(t.notes?t.notes+"\n":"")+"Merged from "+key(a)+": "+a.title+(a.notes?" ("+a.notes+")":"");
 if(!t.ownerId&&a.ownerId)t.ownerId=a.ownerId;if(!t.bundleId&&a.bundleId)t.bundleId=a.bundleId;if(!t.workstreamId&&a.workstreamId)t.workstreamId=a.workstreamId;
 S.updates.filter(function(u){return u.actionId===a.id&&u.kind==="note"}).forEach(function(u){S.updates.push({id:uid("up"),actionId:t.id,at:u.at,who:u.who,kind:"note",text:"["+key(a)+"] "+u.text});});
 chk(a).forEach(function(c){c.actionId=t.id;c.updatedAt=now();});S.actions.forEach(function(x){if(x.blockedOn===a.id){x.blockedOn=t.id;x.updatedAt=now();}});addUpdate(t.id,"Merged "+key(a)+" into this action.","change");a.deleted=1;a.updatedAt=now();t.updatedAt=now();
 closeDrawer();save();render();openDrawer(t.id);toast(key(a)+" merged into "+key(t)+".");}
document.addEventListener("keydown",function(e){if(e.key==="Escape"&&ui.open)closeDrawer();});


function boot(){load().then(function(ok){if(ok){setStatus();render();}}).catch(function(e){console.error(e);toast("Could not load: "+e.message);});}
if(L.key)boot();else askKey();
})();
