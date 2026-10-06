export const WIDTH = 768, HEIGHT = 832;
export function validateFile(file) {
 if (file.type !== 'image/png') throw new Error('투명 PNG 파일을 선택해주세요.');
 if (file.size > 10 * 1024 * 1024) throw new Error('10MB 이하의 PNG를 선택해주세요.');
}
export function validateDimensions(width,height) {
 if (!width || !height || width>4096 || height>4096) throw new Error('가로·세로 4096픽셀 이하의 이미지를 사용해주세요.');
}
export function normalizeTransform({x=0,y=0,scale=1}) {
 if (![x,y,scale].every(Number.isFinite)) throw new Error('위치와 크기는 숫자로 입력해주세요.');
 return {x:Math.max(-WIDTH,Math.min(WIDTH,x)),y:Math.max(-HEIGHT,Math.min(HEIGHT,y)),scale:Math.max(.1,Math.min(3,scale))};
}
export function orderLayers(layers) {return [...layers].sort((a,b)=>a.order-b.order);}
export function submissionUrl(name,author) {
 const url=new URL('https://github.com/devbyhwang/devbyhwang.github.io/issues/new');
 url.searchParams.set('title',`[죵쬐 옷장] ${name.trim() || '새 옷 제안'}`);
 url.searchParams.set('body',`옷 이름: ${name.trim()}\n제작자: ${author.trim()}\n\n옷 PNG와 정보 JSON을 이 이슈에 첨부해주세요.\n\n- [ ] 직접 만들었거나 공유할 권한이 있는 이미지입니다.\n- [ ] 검토 후 죵쬐 옷장에 공개하는 데 동의합니다.\n\n사용 허용 범위 / 원본 링크:\n`);
 return url.href;
}
export function createImportedGarment(id,filename,src) {
 const name=filename.replace(/\.png$/i,'');
 return {id,category:'clothes',name,author:'내가 불러온 옷',src,order:40,custom:true,
  transform:{x:0,y:0,scale:1,order:40},metadata:{name,author:''}};
}
export function validatePngSignature(bytes) {
 const signature=[137,80,78,71,13,10,26,10];
 if (!signature.every((byte,i)=>bytes[i]===byte)) throw new Error('올바른 PNG 파일이 아니에요. 원본 파일을 확인해주세요.');
}
