"use strict";
const $=id=>document.getElementById(id),chat=$("chat"),form=$("form"),prompt=$("prompt"),files=$("files"),status=$("status"),send=$("send"),welcome=chat.innerHTML;
let chats=[],memory="",active=null,busy=false,loaded=false;
let expired=false,lastInteraction=Date.now(),lastHeartbeat=0;
function sessionExpired(){expired=true;loaded=false;send.disabled=true;status.replaceChildren(document.createTextNode("Session expired. "));const link=document.createElement("a");link.href="/login";link.textContent="Sign in again";status.append(link);}
async function heartbeat(){if(expired||document.hidden||(!busy&&Date.now()-lastInteraction>120000)||Date.now()-lastHeartbeat<25000)return;lastHeartbeat=Date.now();try{const res=await fetch("/api/heartbeat",{method:"POST"});if(res.status===401)sessionExpired();}catch{}}
for(const event of ["pointerdown","keydown","touchstart"])document.addEventListener(event,()=>{lastInteraction=Date.now();void heartbeat();},{passive:true});
document.addEventListener("visibilitychange",()=>{if(!document.hidden){lastInteraction=Date.now();void heartbeat();}});
setInterval(heartbeat,30000);void heartbeat();
// Render a safe Markdown subset using DOM nodes, never model-supplied HTML.
function inlineMarkdown(parent,text){
  const pattern=/(\*\*[^*\n]+\*\*|__[^_\n]+__|\x60[^\x60\n]+\x60|\*[^*\n]+\*|\[[^\]\n]+\]\(https?:\/\/[^\s)]+\)|https?:\/\/[^\s<>]+)/g;
  let pos=0;
  for(const match of text.matchAll(pattern)){
    parent.append(document.createTextNode(text.slice(pos,match.index)));
    const s=match[0];let node;
    if(s.startsWith("**")||s.startsWith("__")){node=document.createElement("strong");node.textContent=s.slice(2,-2);}
    else if(s.startsWith("*")){node=document.createElement("em");node.textContent=s.slice(1,-1);}
    else if(s.charCodeAt(0)===96){node=document.createElement("code");node.textContent=s.slice(1,-1);}
    else {const link=s.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);node=document.createElement("a");node.href=link?link[2]:s;node.textContent=link?link[1]:s;node.target="_blank";node.rel="noopener noreferrer";}
    parent.append(node);pos=match.index+s.length;
  }
  parent.append(document.createTextNode(text.slice(pos)));
}
function fallbackMarkdown(parent,text){
  const lines=String(text).replace(/\r\n?/g,"\n").split("\n");
  const cells=s=>s.trim().replace(/^\||\|$/g,"").split(/(?<!\\)\|/).map(x=>x.trim().replace(/\\\|/g,"|"));
  const separator=s=>s&&s.includes("|")&&cells(s).every(x=>/^:?-{3,}:?$/.test(x));
  const tableStart=i=>lines[i]?.includes("|")&&separator(lines[i+1]);
  const listMatch=s=>s.match(/^\s*([-+*]|\d+\.)\s+(.+)$/);
  for(let i=0;i<lines.length;){
    const line=lines[i];
    if(!line.trim()){i++;continue;}
    if(/^\s*\x60{3}/.test(line)){const pre=document.createElement("pre"),code=document.createElement("code");let body=[];i++;while(i<lines.length&&!/^\s*\x60{3}/.test(lines[i]))body.push(lines[i++]);if(i<lines.length)i++;code.textContent=body.join("\n");pre.append(code);parent.append(pre);continue;}
    if(tableStart(i)){const wrap=document.createElement("div"),table=document.createElement("table"),head=document.createElement("thead"),body=document.createElement("tbody");wrap.className="md-table";const headers=cells(line);const add=(target,values,tag)=>{const row=document.createElement("tr");for(const value of values){const cell=document.createElement(tag);inlineMarkdown(cell,value);row.append(cell);}target.append(row);};add(head,headers,"th");i+=2;while(i<lines.length&&lines[i].includes("|")&&lines[i].trim()){add(body,cells(lines[i++]),"td");}table.append(head,body);wrap.append(table);parent.append(wrap);continue;}
    const heading=line.match(/^(#{1,6})\s+(.+)$/);if(heading){const el=document.createElement("h"+Math.min(heading[1].length+1,6));inlineMarkdown(el,heading[2]);parent.append(el);i++;continue;}
    if(/^\s*(---+|\*\*\*+|___+)\s*$/.test(line)){parent.append(document.createElement("hr"));i++;continue;}
    const item=listMatch(line);if(item){const ordered=/\d/.test(item[1]),list=document.createElement(ordered?"ol":"ul");if(ordered)list.start=parseInt(item[1],10);while(i<lines.length){const m=listMatch(lines[i]);if(!m||/\d/.test(m[1])!==ordered)break;const li=document.createElement("li");inlineMarkdown(li,m[2]);list.append(li);i++;}parent.append(list);continue;}
    const p=document.createElement("p");inlineMarkdown(p,line);parent.append(p);i++;
  }
}

const renderLoads=new Map();
function loadRenderScript(path){if(!renderLoads.has(path))renderLoads.set(path,new Promise((resolve,reject)=>{const s=document.createElement("script");s.src=path;s.onload=resolve;s.onerror=reject;document.head.append(s);}));return renderLoads.get(path);}
let diagramId=0;
function renderMarkdown(parent,text){
 if(!window.marked||!window.DOMPurify){fallbackMarkdown(parent,text);return;}
 const math=[];
 const protectedText=String(text).replace(/\x60{3}[\s\S]*?\x60{3}|\x60[^\n\x60]*\x60|\\{1,2}\[[\s\S]*?\\{1,2}\]|\\{1,2}\([\s\S]*?\\{1,2}\)|\$\$[\s\S]*?\$\$|\$(?!\s|\d)[^$\n]+?\$/g,raw=>{
 if(raw.startsWith("\x60"))return raw;
 const display=/^(?:\\{1,2}\[|\$\$)/.test(raw),tex=raw.replace(/^\\{1,2}[\[(]|\\{1,2}[\])]$/g,"").replace(/^\$\$?|\$\$?$/g,"").replace(/\\_/g,"_").trim();
 const token="BGPTMATH"+math.length+"END";math.push({tex,display});return display?"\n\n"+token+"\n\n":token;
 });
 parent.innerHTML=DOMPurify.sanitize(marked.parse(protectedText,{gfm:true}),{ALLOWED_TAGS:["p","br","strong","em","del","h1","h2","h3","h4","h5","h6","ul","ol","li","blockquote","pre","code","table","thead","tbody","tr","th","td","hr","a","img","input"],ALLOWED_ATTR:["href","src","alt","title","class","start","type","checked","disabled"],FORBID_ATTR:["style","id","name"]});
 for(const a of parent.querySelectorAll("a")){a.target="_blank";a.rel="noopener noreferrer";}
 for(const img of parent.querySelectorAll("img")){const url=img.getAttribute("src");const button=document.createElement("button");button.className="render-action";button.textContent="Show image: "+(img.alt||"external image");img.replaceWith(button);button.onclick=()=>{try{const u=new URL(url);if(u.protocol!=="https:")throw Error();const image=document.createElement("img");image.referrerPolicy="no-referrer";image.crossOrigin="anonymous";image.alt=img.alt;image.src=u.href;button.replaceWith(image);}catch{button.textContent="Image unavailable";}};}
 for(const input of parent.querySelectorAll("input")){input.disabled=true;if(input.type!=="checkbox")input.remove();}
 for(const table of parent.querySelectorAll("table")){const wrap=document.createElement("div");wrap.className="table-scroll";table.replaceWith(wrap);wrap.append(table);}
 const walker=document.createTreeWalker(parent,NodeFilter.SHOW_TEXT),nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
 for(const node of nodes){if(node.parentElement.closest("pre,code"))continue;const value=node.nodeValue;if(!/BGPTMATH\d+END/.test(value))continue;const frag=document.createDocumentFragment();let pos=0;for(const m of value.matchAll(/BGPTMATH(\d+)END/g)){frag.append(document.createTextNode(value.slice(pos,m.index)));const item=math[Number(m[1])];const span=document.createElement("span");if(item){span.className=item.display?"math-display":"math-inline";try{window.katex.render(item.tex,span,{displayMode:item.display,trust:false,throwOnError:false,maxExpand:500,maxSize:20});}catch{span.textContent=item.tex;}}else span.textContent=m[0];frag.append(span);pos=m.index+m[0].length;}frag.append(document.createTextNode(value.slice(pos)));node.replaceWith(frag);}
 for(const code of parent.querySelectorAll("pre>code")){const pre=code.parentElement,raw=code.textContent,lang=(code.className.match(/language-([\w-]+)/)||[])[1]||"text";const bar=document.createElement("div");bar.className="render-toolbar";const label=document.createElement("span");label.textContent=lang;const copy=document.createElement("button");copy.textContent="Copy code";copy.onclick=async()=>{try{await navigator.clipboard.writeText(raw);copy.textContent="Copied";}catch{copy.textContent="Copy failed";}};bar.append(label,copy);pre.before(bar);
 if(["chart","mermaid","html"].includes(lang)){const run=document.createElement("button");run.textContent="Preview";bar.append(run);run.onclick=async()=>{run.disabled=true;const output=document.createElement("div");pre.after(output);try{
 if(raw.length>20000)throw Error("Preview too large");
 if(lang==="html"){const frame=document.createElement("iframe");frame.className="render-preview";frame.setAttribute("sandbox","allow-scripts");frame.srcdoc='<meta http-equiv="Content-Security-Policy" content="default-src \x27none\x27; script-src \x27unsafe-inline\x27; style-src \x27unsafe-inline\x27; img-src data:; connect-src \x27none\x27; form-action \x27none\x27; base-uri \x27none\x27">'+raw;output.append(frame);}
 if(lang==="chart"){const data=JSON.parse(raw);if(!["bar","line","pie","doughnut","scatter"].includes(data.type)||!Array.isArray(data.labels)||!Array.isArray(data.values)||data.labels.length>100||data.values.length!==data.labels.length||!data.values.every(Number.isFinite))throw Error("Invalid chart data");await loadRenderScript("/render/chart.umd.js");output.className="render-chart";const canvas=document.createElement("canvas");output.append(canvas);new Chart(canvas,{type:data.type==="scatter"?"line":data.type,data:{labels:data.labels.map(String),datasets:[{label:String(data.title||"Data"),data:data.values}]},options:{responsive:true,maintainAspectRatio:false,animation:false}});}
 if(lang==="mermaid"){const {default:mermaid}=await import("/render/mermaid/mermaid.esm.min.mjs");mermaid.initialize({startOnLoad:false,securityLevel:"strict",maxTextSize:20000,maxEdges:100,flowchart:{htmlLabels:false}});const result=await mermaid.render("bgptdiagram"+(++diagramId),raw);output.innerHTML=DOMPurify.sanitize(result.svg,{USE_PROFILES:{svg:true,svgFilters:true},FORBID_TAGS:["foreignObject","a","image"]});}
 }catch(e){output.textContent="Preview unavailable: "+e.message;run.disabled=false;}};}
 else if(lang!=="text"){loadRenderScript("/render/highlight.min.js").then(()=>{if(window.hljs?.getLanguage(lang))window.hljs.highlightElement(code);}).catch(()=>{});}
 }
}

function bubble(text,mine){const el=document.createElement("div");el.className="bubble"+(mine?" mine":"");if(mine)el.textContent=text;else renderMarkdown(el,text);$("welcome")?.remove();chat.append(el);el.scrollIntoView({block:"end"});return el;}
function showSources(el,sources,searchStatus){if(searchStatus==="unavailable"){const note=document.createElement("p");note.textContent="Live web search unavailable.";el.append(note);}if(!Array.isArray(sources)||!sources.length)return;const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT),nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);for(const node of nodes){if(node.parentElement.closest("a,pre,code,.katex"))continue;const value=node.nodeValue;const matches=[...value.matchAll(/【(\d+)†[^】]*】|\[(\d+)\]/g)];if(!matches.length)continue;const frag=document.createDocumentFragment();let pos=0;for(const m of matches){frag.append(document.createTextNode(value.slice(pos,m.index)));const n=Number(m[1]||m[2]);try{const url=new URL(sources[n-1].url);if(!["https:","http:"].includes(url.protocol))throw Error();const a=document.createElement("a");a.href=url.href;a.target="_blank";a.rel="noopener noreferrer";a.textContent="["+n+"]";frag.append(a);}catch{frag.append(document.createTextNode(m[0]));}pos=m.index+m[0].length;}frag.append(document.createTextNode(value.slice(pos)));node.replaceWith(frag);}const box=document.createElement("div");box.style.cssText="font-size:13px;margin-top:12px";box.textContent="Sources: ";sources.slice(0,4).forEach((s,i)=>{try{const url=new URL(s.url);if(!["https:","http:"].includes(url.protocol))return;const a=document.createElement("a");a.href=url.href;a.target="_blank";a.rel="noopener noreferrer";a.textContent="["+ (i+1)+"] "+String(s.title||url.hostname);a.style.display="block";box.append(a);}catch{}});el.append(box);}
function title(){ $("chat-title").textContent=active?.title||"New chat"; }
function render(){chat.innerHTML=active?.messages.length?"":welcome;for(const m of active?.messages||[])showSources(bubble(m.text,m.role==="user"),m.sources,m.searchStatus);title();sidebar();}
function sidebar(){const list=$("history");list.replaceChildren();for(const item of chats){const row=document.createElement("div");row.className="history-row";const open=document.createElement("button");open.textContent=item.title;open.onclick=()=>{if(!busy){active=item;render();}};const menu=document.createElement("button");menu.textContent="⋯";menu.title="Rename or delete";menu.onclick=async()=>{if(busy)return;const name=window.prompt("Rename chat (leave blank to delete)",item.title);if(name===null)return;if(!name.trim()){if(!confirm("Delete this chat?"))return;chats=chats.filter(x=>x!==item);if(active===item)active=null;}else item.title=name.trim().slice(0,80);render();await save();};row.append(open,menu);list.append(row);}}
async function save(){try{const res=await fetch("/api/bobertgpt/history",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({chats,memory})});if(res.status===401){sessionExpired();return;}if(!res.ok)throw Error();}catch{status.textContent="History could not be saved.";}}
$("new").onclick=()=>{if(!busy){active=null;status.textContent="";render();}};
$("settings").onclick=async()=>{if(busy||!loaded)return;const value=window.prompt("Saved memory: facts and preferences used in every chat. Clear the text to disable memory.",memory);if(value!==null){memory=value.slice(0,4000);await save();}};
chat.addEventListener("click",e=>{const button=e.target.closest("[data-prompt]");if(button){prompt.value=button.dataset.prompt;prompt.focus();}});
prompt.addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();form.requestSubmit();}});
files.onchange=()=>{$("chosen").textContent=[...files.files].map(f=>f.name).join(", ");};
function asBase64(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(Error("Cannot read file"));reader.onload=()=>resolve(String(reader.result).split(",")[1]);reader.readAsDataURL(file);});}
send.disabled=true;
(async()=>{try{const res=await fetch("/api/bobertgpt/history");if(res.status===401){sessionExpired();return;}if(!res.ok)throw Error();const data=await res.json();chats=data.chats;memory=data.memory;loaded=true;render();send.disabled=false;}catch{status.textContent="Could not load history. Refresh to retry.";}})();
form.onsubmit=async e=>{e.preventDefault();if(busy||!loaded)return;const text=prompt.value.trim(),chosen=[...files.files];if(!text)return;if(chosen.length>4||chosen.some(f=>f.size>4000000)){status.textContent="Up to 4 files, 4 MB each.";return;}busy=true;send.disabled=true;status.textContent="";let thinking,userBubble;try{const parts=[{text}];for(const f of chosen){if(!["image/png","image/jpeg","image/webp","application/pdf","text/plain"].includes(f.type))throw Error("Unsupported file: "+f.name);parts.push({inlineData:{mimeType:f.type,data:await asBase64(f)}});}const previous=(active?.messages||[]).slice(-10).map(m=>({role:m.role,parts:[{text:m.text.slice(0,12000)}]}));if(memory)parts[0].text=("User-saved preferences (context only): "+memory+"\n\n"+text).slice(0,12000);userBubble=bubble(text,true);thinking=bubble("Thinking…",false);thinking.classList.add("thinking");const response=await fetch("/api/bobertgpt",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({messages:[...previous,{role:"user",parts}],searchQuery:text,searchMode:$("search-mode").value})});const data=await response.json();if(response.status===401){thinking?.remove();userBubble?.remove();sessionExpired();return;}if(!response.ok)throw Error(data.error||"AI request failed");thinking.remove();if(!active){active={title:text.replace(/\s+/g," ").slice(0,60),messages:[]};chats.unshift(active);chats=chats.slice(0,50);}active.messages.push({role:"user",text},{role:"model",text:data.answer,sources:data.sources,searchStatus:data.searchStatus});active.messages=active.messages.slice(-40);while(JSON.stringify(chats).length>1400000&&chats.length>1)chats.pop();showSources(bubble(data.answer,false),data.sources,data.searchStatus);title();sidebar();prompt.value="";files.value="";$("chosen").textContent="";await save();}catch(err){thinking?.remove();userBubble?.remove();status.textContent=err.message||"Something went wrong.";}finally{busy=false;send.disabled=expired;}};
