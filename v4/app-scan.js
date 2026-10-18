// OCR runs in the browser; only reviewed transaction fields reach the inbox.
const bankScan = { busy:false };
let localScanLibrary;
function loadLocalScanLibrary() {
  if (localScanLibrary) return localScanLibrary;
  localScanLibrary = new Promise((resolve,reject) => {
    const script=document.createElement('script');
    script.src='https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js';
    script.onload=()=>globalThis.Tesseract?.createWorker ? resolve(globalThis.Tesseract) : reject(new Error('OCR не загрузился'));
    script.onerror=()=>reject(new Error('Нет связи с бесплатным OCR. Попробуй снова при подключении к интернету.'));
    document.head.append(script);
  }).catch(error=>{localScanLibrary=null;throw error;});
  return localScanLibrary;
}
function scanCategory(label) {
  if (/taxi|uber|bolt|fuel|petrol|транспорт|такси|бензин/i.test(label)) return 'transport';
  if (/market|food|grocery|cafe|restaurant|продукт|магазин|кафе|ресторан/i.test(label)) return 'products';
  if (/pharm|clinic|аптек|медицин/i.test(label)) return 'health';
  if (/rent|utility|аренд|коммунал/i.test(label)) return 'household';
  if (/cloth|одежд/i.test(label)) return 'clothes';
  return 'other';
}
function scanDate(text,hint) {
  const iso=text.match(/\b(20\d\d)[-./](0?[1-9]|1[0-2])[-./](0?[1-9]|[12]\d|3[01])\b/);
  const local=text.match(/\b(0?[1-9]|[12]\d|3[01])[./-](0?[1-9]|1[0-2])[./-](20\d\d)\b/);
  const parts=iso ? [iso[1],iso[2],iso[3]] : local ? [local[3],local[2],local[1]] : null;
  if (!parts) return hint;
  const value=parts.map((x,i)=>i?String(x).padStart(2,'0'):x).join('-');
  const parsed=new Date(value+'T12:00:00Z');
  return parsed.toISOString().slice(0,10)===value ? value : hint;
}
function parseLocalBankText(text,captureDate,digest) {
  // Never persist OCR text or bank/card identifiers; keep only a short label.
  const lines=String(text||'').split(/\n/).map(x=>x.trim()).filter(Boolean);
  const excluded=/(?:declined|rejected|pending|processing|отклон|ожидан|неуспеш|в обработке)/i;
  const amounts=[];
  for (const [lineNo,line] of lines.entries()) {
    if (excluded.test(line)) continue;
    const match=line.match(/(?:^|\s|[-−])((?:\d{1,3}(?:[ .]\d{3})*|\d{1,8})[.,]\d{2})\s*(MDL|USD|EUR|лей|леев|€|\$)/i) ||
      line.match(/(?:MDL|USD|EUR|€|\$)\s*((?:\d{1,3}(?:[ .]\d{3})*|\d{1,8})[.,]\d{2})/i);
    if (!match) continue;
    const raw=match[1].replace(/(?<=\d)[ .](?=\d{3}(?:[.,]|$))/g,'').replace(',','.');
    const minor=Math.round(Number(raw)*100);
    if (!Number.isSafeInteger(minor) || minor<=0) continue;
    const currencyMatch=line.match(/MDL|USD|EUR|лей|леев|€|\$/i);
    const currency=currencyMatch ? ({'€':'EUR','$':'USD',лей:'MDL',леев:'MDL'}[currencyMatch[0].toLowerCase()]||currencyMatch[0].toUpperCase()) : null;
    if (!currency) continue;
    const redact=value=>value.replace(/\b[A-Z]{2}\d{2}(?:[A-Z0-9 ]{11,30})\b/gi,'')
      .replace(/\b(?:\d{4}[ -]?){3,4}\d{4}\b/g,'').replace(/\b\d{12,19}\b/g,'');
    const description=redact(line.replace(match[0],'')).trim();
    const nearby=lines.slice(Math.max(0,lineNo-2),lineNo+2).join(' ');
    const label=redact(description || lines[lineNo-1] || 'Операция').trim().slice(0,120);
    const date=scanDate(nearby,captureDate);
    if (date) amounts.push({id:'scan_'+digest.slice(0,32)+'_'+lineNo,name:label||'Операция',date,amount:minor,
      currency,category:scanCategory(label)});
  }
  return {items:amounts,excludedCount:lines.filter(x=>excluded.test(x)).length,uncertainCount:amounts.length?0:1};
}
const originalScanBanner = inboxBanner;
inboxBanner = function () {
  if (!sync.connected) return '';
  const upload = '<section class="ct-card ct-scan-banner" style="margin:12px 0;padding:14px;border:1px solid #736477;border-radius:15px">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px">' +
      '<div><strong>Банковские скриншоты</strong>' +
      '<p style="margin:5px 0;font-size:13px">Загрузить фото → проверить операции → подтвердить один раз.</p></div>' +
      '<button type="button" data-scan-upload class="ct-primary"' +
        (bankScan.busy?' disabled':'') + '>' +
        (bankScan.busy?'Распознаю…':'＋ Загрузить') + '</button></div>' +
    '<input data-scan-files type="file" accept="image/*" multiple style="display:none">' +
    '<small style="display:block;margin-top:5px">Распознавание на устройстве, без отправки снимка в облако. Проверь все цифры перед подтверждением.</small>' +
    '</section>';
  return upload + originalScanBanner();
};

async function encodeBankScreenshot(file) {
  if (!file || !String(file.type).startsWith('image/') || file.size > 12000000)
    throw new Error('Выбери изображение до 12 МБ');
  const source = URL.createObjectURL(file);
  const img = new Image();
  try {
    await new Promise((resolve,reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error('Не удалось открыть изображение'));
      img.src = source;
    });
    if (!img.naturalWidth || !img.naturalHeight)
      throw new Error('Пустое изображение');
    const scale = Math.min(1, 2200 / Math.max(img.naturalWidth,img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1,Math.round(img.naturalWidth*scale));
    canvas.height = Math.max(1,Math.round(img.naturalHeight*scale));
    canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
    for(const quality of [0.85,0.72,0.60]){
      const encoded=canvas.toDataURL('image/jpeg',quality);
      if(encoded.length <= 2520000)return encoded;
    }
    throw new Error('Скриншот слишком большой после сжатия');
  } finally {
    URL.revokeObjectURL(source);
  }
}

function screenshotFileDate(file) {
  // iOS photo-library timestamp is a useful hint, not a guaranteed capture date.
  const value = Number(file?.lastModified);
  if (!Number.isFinite(value) || value <= 0) return null;
  const d = new Date(value);
  if (!Number.isFinite(d.getTime()) || d.getFullYear() < 2020 || d.getFullYear() > 2035) return null;
  const two = x => String(x).padStart(2, '0');
  return d.getFullYear() + '-' + two(d.getMonth()+1) + '-' + two(d.getDate());
}
async function recognizeBankScreenshot(image,captureDate){
  const library=await loadLocalScanLibrary();
  const worker=await library.createWorker(['eng','rus'],1,{
    workerPath:'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/worker.min.js',
    corePath:'https://cdn.jsdelivr.net/npm/tesseract.js-core@7.0.0',
    langPath:'https://tessdata.projectnaptha.com/4.0.0'
  });
  try {
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(image))))
      .map(byte=>byte.toString(16).padStart(2,'0')).join('');
    const result=await worker.recognize(image);
    return parseLocalBankText(result.data.text,captureDate,digest);
  } finally {await worker.terminate();}
}

async function scanBankFiles(files){
  if(bankScan.busy)return;
  if(!sync.connected||sync.paused)return notify('Сначала войди в общий бюджет');
  const selection=Array.from(files||[]);
  if(!selection.length)return;
  if(selection.length>4)return notify('За один раз можно выбрать до четырёх скриншотов.');
  bankScan.busy=true;
  render();
  let declined=0, uncertain=0, failed=0;
  let firstError='';
  const items=[];
  try{
    for(const file of selection){
      try{
        const img=await encodeBankScreenshot(file);
        const output=await recognizeBankScreenshot(img,screenshotFileDate(file));
        declined+=Number(output.excludedCount||0);
        uncertain+=Number(output.uncertainCount||0);
        if(Array.isArray(output.items))items.push(...output.items);
      }catch(error){
        failed++;
        if (!firstError) firstError=error.message || 'Не удалось обработать скриншот';
        if(selection.length===1)throw error;
      }
    }
    const unique = [...new Map(items.map(x=>[x.id,x])).values()];
    if(unique.length>200)throw new Error('Слишком много операций за один раз');
    if(!unique.length && failed)throw new Error(firstError);
    let queued=0, duplicates=0;
    if(unique.length){
      // Several screenshots can exceed the API's 50-row request limit. Keep the
      // single final family confirmation, staging in bounded private chunks.
      for(let offset=0;offset<unique.length;offset+=50){
        const staged=await inboxRequest('POST',{action:'stage-recognized',items:unique.slice(offset,offset+50)});
        queued+=Number(staged.accepted||0);
        duplicates+=Number(staged.duplicates||0);
      }
      await refreshExpenseInbox();
    }
    notify('В очередь: '+queued+' · Дубли: '+duplicates+' · Отклонено/ожидает: '+
      declined+' · Неясно: '+uncertain+(failed?' · Ошибок: '+failed:''));
  }catch(error){
    notify(error.message||'Не удалось обработать скриншоты');
  }finally{
    bankScan.busy=false;
    await refreshExpenseInbox();
    render();
  }
}
document.addEventListener('click',event=>{
  const button=event.target.closest('[data-scan-upload]');
  if(!button)return;
  event.preventDefault();
  event.stopImmediatePropagation();
  app.querySelector('[data-scan-files]')?.click();
},true);
document.addEventListener('change',event=>{
  const input=event.target.closest?.('[data-scan-files]');
  if(!input)return;
  const files=Array.from(input.files||[]);
  input.value='';
  scanBankFiles(files);
},true);
