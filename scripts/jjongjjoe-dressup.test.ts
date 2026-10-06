import { describe, it, expect } from 'vitest';
import { validateFile, validateDimensions, normalizeTransform, orderLayers, submissionUrl } from '../src/playground/jjongjjoe-dressup/wardrobe.js';
describe('죵쬐 옷장', () => {
 it('rejects non-PNG and oversized files', () => {
  expect(()=>validateFile({type:'image/jpeg',size:20})).toThrow();
  expect(()=>validateFile({type:'image/png',size:10*1024*1024+1})).toThrow();
  expect(()=>validateFile({type:'image/png',size:10*1024*1024})).not.toThrow();
 });
 it('rejects excessive and empty image dimensions',()=>{
  expect(()=>validateDimensions(4097,832)).toThrow();
  expect(()=>validateDimensions(0,832)).toThrow();
  expect(()=>validateDimensions(768,832)).not.toThrow();
 });
 it('clamps transforms and rejects nonfinite input',()=>{
  expect(normalizeTransform({x:2000,y:-2000,scale:10})).toEqual({x:768,y:-832,scale:3});
  expect(()=>normalizeTransform({x:NaN,y:0,scale:1})).toThrow();
 });
 it('preserves base below clothing and honors front/back accessories',()=>{
  expect(orderLayers([{id:'front',order:80},{id:'clothes',order:40},{id:'base',order:10},{id:'back',order:0}]).map(x=>x.id)).toEqual(['back','base','clothes','front']);
 });
 it('encodes contribution fields without executing markup',()=>{
  const u=new URL(submissionUrl('<img src=x>','a&b'));
  expect(u.origin).toBe('https://github.com');
  expect(u.searchParams.get('title')).toContain('<img src=x>');
  expect(u.searchParams.get('body')).toContain('a&b');
 });
});

import { createImportedGarment } from '../src/playground/jjongjjoe-dressup/wardrobe.js';
describe('imported garments keep their own editing state',()=>{
 it('keeps each garment alignment and submission metadata independently',()=>{
  const a=createImportedGarment('a','a.png','blob:a');const b=createImportedGarment('b','b.png','blob:b');
  a.transform.x=120;a.transform.scale=1.5;a.metadata.name='나의 후드';a.metadata.author='작가';b.transform.x=-80;
  expect(a.transform).toEqual({x:120,y:0,scale:1.5,order:40});
  expect(b.transform.x).toBe(-80);expect(a.metadata).toEqual({name:'나의 후드',author:'작가'});
 });
});
import { validatePngSignature } from '../src/playground/jjongjjoe-dressup/wardrobe.js';
it('rejects damaged or renamed non-PNG contents',()=>{
 expect(()=>validatePngSignature(new Uint8Array([255,216,255]))).toThrow();
 expect(()=>validatePngSignature(new Uint8Array([137,80,78,71,13,10,26,10]))).not.toThrow();
});
