const tabList = document.querySelector('.workspace-tabs');
const tabs = Array.from(tabList.querySelectorAll('[role="tab"]'));

function selectWorkspaceTab(selected){
  for(const tab of tabs){
    const active = tab===selected;
    tab.setAttribute('aria-selected',String(active));
    tab.tabIndex = active ? 0 : -1;
    const panel = document.getElementById(tab.getAttribute('aria-controls'));
    panel.hidden = !active;
    panel.toggleAttribute('data-entering',active);
  }
}

for(const tab of tabs) tab.addEventListener('click',()=>selectWorkspaceTab(tab));
tabList.addEventListener('keydown',event=>{
  const index = tabs.indexOf(event.target);
  if(index<0) return;
  const destinations = {ArrowLeft:(index-1+tabs.length)%tabs.length,ArrowRight:(index+1)%tabs.length,Home:0,End:tabs.length-1};
  if(!Object.hasOwn(destinations,event.key)) return;
  event.preventDefault();
  const next = tabs[destinations[event.key]];
  selectWorkspaceTab(next);
  next.focus();
});

const heroDisplay = document.querySelector('[data-hero-display]');
const animatedPointer = matchMedia('(pointer:fine) and (prefers-reduced-motion:no-preference)');
function resetArtworkPosition(){
  heroDisplay.style.removeProperty('--shift-x');
  heroDisplay.style.removeProperty('--shift-y');
}
heroDisplay.addEventListener('pointermove',event=>{
  if(!animatedPointer.matches || event.pointerType!=='mouse') return;
  const bounds = heroDisplay.getBoundingClientRect();
  const x = (event.clientX-bounds.left)/bounds.width-.5;
  const y = (event.clientY-bounds.top)/bounds.height-.5;
  heroDisplay.style.setProperty('--shift-x',`${x*14}px`);
  heroDisplay.style.setProperty('--shift-y',`${y*14}px`);
});
heroDisplay.addEventListener('pointerleave',resetArtworkPosition);
animatedPointer.addEventListener('change',resetArtworkPosition);
