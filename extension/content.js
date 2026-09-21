const sensitive=/aadhaar|aadhar|passport|pan\b|voter|card number|password/i;
let fields=[];
function descriptor(el,i){const label=[...document.querySelectorAll(`label[for="${el.id}"]`)].map(x=>x.innerText).join(' '),nearby=el.closest('div,fieldset,section')?.innerText?.slice(0,300)||'';return{id:'sf-'+i,text:[label,el.getAttribute('aria-label'),el.placeholder,el.name,el.id,nearby].filter(Boolean).join(' | '),type:el.type||el.tagName.toLowerCase(),options:el.tagName==='SELECT'?[...el.options].map(o=>o.text):[],sensitive:sensitive.test([label,el.placeholder,el.name,el.id,nearby].join(' '))}}
function scan(){fields=[...document.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button]),textarea,select')].filter(e=>!e.disabled).map((el,i)=>({el,...descriptor(el,i)}));return fields.map(({el,...x})=>x)}
async function setValue(el,value,file){if(el.type==='file'){if(!file)throw Error('No stored file was selected.');let blob=await fetch(file.dataUrl).then(r=>r.blob()),chosen=new File([blob],file.name,{type:file.type||blob.type}),transfer=new DataTransfer();transfer.items.add(chosen);el.files=transfer.files}else if(el.tagName==='SELECT'){const option=[...el.options].find(o=>o.text.toLowerCase()===String(value).toLowerCase()||o.value===value);if(option)el.value=option.value}else if(el.type==='checkbox'||el.type==='radio'){el.checked=Boolean(value)}else el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));el.classList.add('smartform-filled')}
chrome.runtime.onMessage.addListener((msg,_,send)=>{
 if(msg.type==='scan'){send({fields:scan()});return}
 if(msg.type==='apply'){Promise.all(msg.items.map(async x=>{const f=fields.find(y=>y.id===x.id);if(f)await setValue(f.el,x.value,x.file)})).then(()=>send({ok:true})).catch(e=>send({ok:false,error:e.message}));return true}
 if(msg.type==='pageContext'){send({text:(document.body.innerText||'').slice(0,3000)});return}
 if(msg.type==='clear'){fields.forEach(f=>{if(f.el.classList.contains('smartform-filled')){f.el.value='';f.el.classList.remove('smartform-filled')}});send({ok:true})}
});
