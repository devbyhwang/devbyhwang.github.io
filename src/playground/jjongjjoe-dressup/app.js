import { WIDTH,HEIGHT,validateFile,validatePngSignature,validateDimensions,normalizeTransform,orderLayers,submissionUrl,createImportedGarment } from './wardrobe.js';
import { catalog } from './catalog.js';
const $=id=>document.getElementById(id);
const canvas=$('preview'),ctx=canvas.getContext('2d');
const items=[...catalog],images=new Map();
const defaults={clothes:'none',eyes:'open',mouth:'closed',arms:'neutral',accessory:'none'};
let selected={...defaults},category='clothes',ready=false,importSerial=0;
let transform={x:0,y:0,scale:1,order:40};
function status(message,error=false){$('status').textContent=message;$('status').classList.toggle('error',error);}
function current(categoryName){return items.find(i=>i.category===categoryName&&i.id===selected[categoryName]);}
function loadImage(src){return new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(new Error('이미지를 읽지 못했어요. 다른 PNG 파일을 확인해주세요.'));im.src=src;});}
function drawItem(target,item){
 const im=images.get(item.src);if(!im)return;
 const t=item.custom?normalizeTransform(transform):{x:0,y:0,scale:1};
 // Template images align 1:1; other aspect ratios fit, without stretching.
 const fit=Math.min(WIDTH/im.width,HEIGHT/im.height);
 const w=im.width*fit*t.scale,h=im.height*fit*t.scale;
 target.drawImage(im,(WIDTH-w)/2+t.x,(HEIGHT-h)/2+t.y,w,h);
}
function render(){
 if(!ready)return;
 ctx.clearRect(0,0,WIDTH,HEIGHT);ctx.imageSmoothingEnabled=true;
 const layers=[{src:'assets/body.png',order:5},{src: selected.arms==='gesture' ? 'assets/base-gesture.png' : 'assets/base.png',order:10},...Object.keys(selected).map(current).filter(Boolean).filter(i=>i.src).map(i=>({...i,order:i.custom?transform.order:i.order}))];
 for(const i of orderLayers(layers))drawItem(ctx,i);
}
function syncControls(){
 const garment=current('clothes');if(garment?.custom)transform=garment.transform;
 for(const key of ['x','y']){$(key).value=transform[key];$(`${key}-value`).textContent=transform[key];}
 $('scale').value=Math.round(transform.scale*100);$('scale-value').textContent=`${Math.round(transform.scale*100)}%`;$('order').value=transform.order;
 $('adjustments').hidden=!current('clothes')?.custom;
 const item=current('clothes');if(item?.custom){$('clothing-name').value=item.metadata.name;$('author').value=item.metadata.author;updateSubmit();}
}
function updateSubmit(){$('submit').href=submissionUrl($('clothing-name').value,$('author').value);}
function updateCatalog(){
 const focusedId=document.activeElement?.dataset?.itemId;
 const list=items.filter(i=>i.category===category);$('item-count').textContent=`${list.length}가지`;$('catalog').replaceChildren();
 for(const item of list){
  const button=document.createElement('button');button.className='item';button.type='button';button.dataset.itemId=item.id;button.setAttribute('aria-pressed',String(selected[category]===item.id));
  const picture=document.createElement('span');picture.className='item-image';
  if(item.src){const thumb=document.createElement('canvas');thumb.width=240;thumb.height=180;const tctx=thumb.getContext('2d');const im=images.get(item.src);
   const boxes={eyes:[96,256,420,132],mouth:[208,352,220,120],arms:[64,424,516,292],clothes:[208,436,248,280],accessory:[48,248,512,168]};
   const [x,y,w,h]=boxes[category];if(im){if(item.custom){const fit=Math.min(240/im.width,180/im.height);tctx.drawImage(im,(240-im.width*fit)/2,(180-im.height*fit)/2,im.width*fit,im.height*fit);}else tctx.drawImage(im,x,y,w,h,12,8,216,164);}
   picture.append(thumb);
  }else{picture.textContent='⊘';picture.classList.add('none-icon');}
  const name=document.createElement('span');name.className='item-name';name.textContent=item.name;
  const author=document.createElement('span');author.className='item-author';author.textContent=item.author;
  button.append(picture,name,author);button.addEventListener('click',()=>{selected[category]=item.id;syncControls();updateCatalog();render();status(`${item.name} 선택했어요.`);});$('catalog').append(button);
 }
 if(focusedId){const target=[...$('catalog').children].find(b=>b.dataset.itemId===focusedId);target?.focus();}
}
function chooseCategory(next){category=next;
 for(const button of document.querySelectorAll('[role=tab]')){const active=button.dataset.category===next;button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;}
 $('catalog').setAttribute('aria-labelledby',`tab-${next}`);updateCatalog();
}
for(const tab of document.querySelectorAll('[role=tab]')){
 tab.addEventListener('click',()=>chooseCategory(tab.dataset.category));
 tab.addEventListener('keydown',e=>{const tabs=[...document.querySelectorAll('[role=tab]')];let index=tabs.indexOf(tab);if(e.key==='ArrowRight')index=(index+1)%tabs.length;else if(e.key==='ArrowLeft')index=(index+tabs.length-1)%tabs.length;else if(e.key==='Home')index=0;else if(e.key==='End')index=tabs.length-1;else return;e.preventDefault();tabs[index].focus();chooseCategory(tabs[index].dataset.category);});
}
for(const id of ['x','y','scale','order'])$(id).addEventListener('input',()=>{transform[id]=Number($(id).value)/(id==='scale'?100:1);syncControls();render();});
$('align-reset').addEventListener('click',()=>{Object.assign(transform,{x:0,y:0,scale:1,order:40});syncControls();render();});
$('reset').addEventListener('click',()=>{importSerial++;selected={...defaults};transform={x:0,y:0,scale:1,order:40};$('author').value='';syncControls();updateCatalog();render();status('기본 죵쬐로 돌아왔어요. 불러온 옷은 옷장에 남아 있어요.');});
$('file').addEventListener('change',async event=>{
 const file=event.target.files[0];if(!file)return;const serial=++importSerial;let url;
 try{validateFile(file);validatePngSignature(new Uint8Array(await file.slice(0,8).arrayBuffer()));status('새 옷을 불러오고 있어요…');url=URL.createObjectURL(file);const image=await loadImage(url);validateDimensions(image.width,image.height);if(serial!==importSerial)return;
  const id=`custom-${serial}`,name=file.name.replace(/\.png$/i,'');items.push(createImportedGarment(id,file.name,url));images.set(url,image);url=null;
  selected.clothes=id;chooseCategory('clothes');syncControls();render();status('옷을 불러왔어요. 위치를 맞춰보고, 기본 몸 위에 자연스럽게 놓이는지 확인해주세요.');
 }catch(error){if(serial===importSerial)status(error.message,true);}
 finally{if(url)URL.revokeObjectURL(url);event.target.value='';}
});
function saveData(data,name){const a=document.createElement('a');a.href=data;a.download=name;document.body.append(a);a.click();a.remove();}
function saveCanvas(c,name){const data=c.toDataURL('image/png');$('export-image').src=data;$('export-download').href=data;$('export-download').download=name;$('download-help').hidden=false;saveData(data,name);}
$('save').addEventListener('click',()=>{try{render();saveCanvas(canvas,'죵쬐.png');status('투명 배경 PNG 다운로드를 시작했어요.');}catch{status('저장하지 못했어요. 다시 시도해주세요.',true);}});
$('export-clothes').addEventListener('click',()=>{
 const item=current('clothes');if(!item?.custom)return;
 try{const c=document.createElement('canvas');c.width=WIDTH;c.height=HEIGHT;drawItem(c.getContext('2d'),item);saveCanvas(c,'jjongjjoe-outfit.png');
  status('옷 PNG 다운로드를 시작했어요. 정보 JSON도 따로 저장해주세요.');
 }catch{status('옷 파일을 저장하지 못했어요.',true);}
});
$('export-info').addEventListener('click',()=>{
 const item=current('clothes');if(!item?.custom)return;
 try{const metadata={version:1,name:$('clothing-name').value.trim()||item.name,author:$('author').value.trim(),width:WIDTH,height:HEIGHT,category:'clothes',file:'jjongjjoe-outfit.png',order:transform.order};
  saveData(`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(metadata,null,2))}`,'jjongjjoe-outfit.json');status('정보 JSON 다운로드를 시작했어요. 제안 글에 옷 PNG와 함께 첨부해주세요.');
 }catch{status('옷 파일을 저장하지 못했어요.',true);}
});
for(const id of ['clothing-name','author'])$(id).addEventListener('input',()=>{const item=current('clothes');if(item?.custom)item.metadata[id==='author'?'author':'name']=$(id).value;updateSubmit();});
for(const button of document.querySelectorAll('[data-bg]'))button.addEventListener('click',()=>{$('stage').className=`stage ${button.dataset.bg}`;for(const b of document.querySelectorAll('[data-bg]')){const active=b===button;b.classList.toggle('selected',active);b.setAttribute('aria-pressed',String(active));}});
for(const id of ['guide-open','guide-button'])$(id).addEventListener('click',()=>$('guide').showModal());
$('guide-close').addEventListener('click',()=>$('guide').close());
$('download-guide').addEventListener('click',()=>saveData('assets/clothing-template.png','죵쬐-옷-제작가이드.png'));
$('download-template').addEventListener('click',()=>{const c=document.createElement('canvas');c.width=WIDTH;c.height=HEIGHT;saveCanvas(c,'죵쬐-투명템플릿.png');});
$('show-export').addEventListener('click',()=>$('export-dialog').showModal());
$('export-close').addEventListener('click',()=>$('export-dialog').close());
async function init(){
 try{const sources=[...new Set(['assets/body.png','assets/base.png','assets/base-gesture.png',...items.map(i=>i.src).filter(Boolean)])];await Promise.all(sources.map(async src=>images.set(src,await loadImage(src))));ready=true;render();updateCatalog();syncControls();$('save').disabled=false;status('눈, 입, 팔과 소품을 골라보세요. 직접 그린 옷도 불러올 수 있어요.');}
 catch(error){status(`옷장을 열지 못했어요. 새로고침 후 다시 시도해주세요. ${error.message}`,true);}
}
init();
