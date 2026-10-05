// Rebuild the tiny WebP reference artwork atlas from text chunks at runtime.
(async()=>{
  try{
    const parts=await Promise.all([0,1,2,3].map(async i=>{
      const r=await fetch(`./assets/ref-atlas-${i}.txt?v=1`,{cache:'force-cache'});
      if(!r.ok)throw new Error(`atlas_${i}`);
      return r.text();
    }));
    const bin=atob(parts.join('').replace(/\s+/g,''));
    const bytes=new Uint8Array(bin.length);
    for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);
    const url=URL.createObjectURL(new Blob([bytes],{type:'image/webp'}));
    document.documentElement.style.setProperty('--atlas',`url("${url}")`);
  }catch(e){
    console.warn('reference art unavailable',e);
  }
})();
