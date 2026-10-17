// Upload bank screenshots from VNN itself. Recognition stages expenses ONLY:
// the budget is changed later by the existing one-confirmation inbox review.
const bankScan = { busy:false };
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
    '<small style="display:block;margin-top:5px">Снимки обрабатывает внешний ИИ-сервис. Банковские пароли и полные номера карт не нужны.</small>' +
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
  const response = await fetch(SYNC_API+'/api/recognize',{
    method:'POST',cache:'no-store',
    headers:{Authorization:'Bearer '+sync.token,'Content-Type':'application/json'},
    body:JSON.stringify({image,captureDate})
  });
  const result=await response.json().catch(()=>({}));
  if(!response.ok){
    const messages={
      scan_not_configured:'Распознавание ещё не подключено: нужен API-ключ и включение лимита.',
      invalid_session:'Сессия закончилась. Войди снова.',
      image_too_large:'Скриншот слишком большой.',
      recognition_provider_unavailable:'Сервис распознавания временно недоступен.'
    };
    throw new Error(messages[result.error]||'Не удалось распознать скриншот');
  }
  return result;
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
