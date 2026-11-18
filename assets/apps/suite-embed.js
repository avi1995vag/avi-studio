/* Keep old studio links inside the shared workspace without rewriting editor logic. */
(() => {
  const id=location.pathname.split('/').filter(Boolean).at(-1)==='index.html'
    ?location.pathname.split('/').filter(Boolean).at(-2):location.pathname.split('/').filter(Boolean).at(-1);
  const embedded=window.parent!==window;
  if(embedded){document.documentElement.classList.add('avi-embedded');return;}
  if(new URLSearchParams(location.search).has('standalone'))return;
  if(['infographic-studio','motion-studio','india-motion','ai-workspace'].includes(id)){
    const url=new URL('../../../studio.html',location.href);url.searchParams.set('studio',id);location.replace(url);
  }
})();
