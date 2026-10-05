// Decode approved artwork stored as text so GitHub Pages can serve the exact files without binary upload tooling.
(async()=>{
  const specs=[['approved-dark-hero','./assets/final-dark-hero.b64'],['approved-light-home','./assets/final-light-home.b64']];
  for(const [name,path] of specs){
    try{
      const r=await fetch(path,{cache:'force-cache'});if(!r.ok)throw new Error(path);
      const b64=(await r.text()).replace(/\s+/g,'');const bin=atob(b64),bytes=new Uint8Array(bin.length);
      for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);
      const url=URL.createObjectURL(new Blob([bytes],{type:'image/webp'}));
      document.documentElement.style.setProperty(`--${name}`,`url("${url}")`);
    }catch(e){console.warn('approved artwork unavailable',name,e)}
  }
})();
