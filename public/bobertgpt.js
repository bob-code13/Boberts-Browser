"use strict";
const chat=document.getElementById("chat"),form=document.getElementById("form"),prompt=document.getElementById("prompt"),files=document.getElementById("files"),status=document.getElementById("status"),send=document.getElementById("send");
let messages=[];
function bubble(text,mine){const el=document.createElement("div");el.className="bubble"+(mine?" mine":"");el.textContent=text;chat.append(el);el.scrollIntoView({block:"end"});}
document.getElementById("new").onclick=()=>{messages=[];chat.replaceChildren();status.textContent="New chat started.";};
files.onchange=()=>{document.getElementById("chosen").textContent=[...files.files].map(f=>f.name).join(", ");};
function asBase64(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(new Error("Cannot read file"));reader.onload=()=>resolve(String(reader.result).split(",")[1]);reader.readAsDataURL(file);});}
form.onsubmit=async(event)=>{
 event.preventDefault();if(send.disabled)return;
 const text=prompt.value.trim(),chosen=[...files.files];if(!text)return;
 if(chosen.length>4||chosen.some(f=>f.size>4_000_000)){status.textContent="Up to 4 files, 4 MB each.";return;}
 send.disabled=true;status.textContent="Thinking...";
 try{
 const parts=[{text}];
 for(const f of chosen){if(!["image/png","image/jpeg","image/webp","application/pdf","text/plain"].includes(f.type))throw Error("Unsupported file: "+f.name);parts.push({inlineData:{mimeType:f.type,data:await asBase64(f)}});}
 const next=[...messages,{role:"user",parts}];
 const response=await fetch("/api/bobertgpt",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({messages:next})});
 const data=await response.json();if(!response.ok)throw Error(data.error||"AI request failed");
 bubble(text+(chosen.length?"\n📎 "+chosen.map(f=>f.name).join(", "):""),true);
 bubble(data.answer,false);
 messages=[...next,{role:"model",parts:[{text:data.answer}]}];
 // Keep recent context; discard old uploaded files to control request size.
 if(messages.length>12)messages=messages.slice(-12);
 prompt.value="";files.value="";document.getElementById("chosen").textContent="";status.textContent="Ready.";
 }catch(err){status.textContent=err.message||"Something went wrong.";}finally{send.disabled=false;}
};
