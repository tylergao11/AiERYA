import type { AudioMixer } from '../audio/mixer';
import { DEFAULT_AUDIO, type AudioPreferences } from '../audio/preferences';
import { uiIcon } from './icons';

export class AudioSettings {
  private readonly dialog=document.createElement('dialog');
  private readonly button=document.createElement('button');
  private readonly abort=new AbortController();
  private readonly off:()=>void;
  private returnFocus: HTMLElement | null = null;
  private closing = false;
  constructor(host:HTMLElement,private readonly mixer:AudioMixer,private readonly onOpen:(open:boolean)=>void,onMute:(muted:boolean)=>void){
    this.button.className='sound-settings-toggle';this.button.type='button';this.button.title='音量设置';this.button.setAttribute('aria-label','音量设置');this.button.setAttribute('aria-haspopup','dialog');this.button.textContent='调音';
    host.querySelector('.tools')!.append(this.button);
    this.dialog.className='sound-settings';this.dialog.setAttribute('aria-label','声音设置');
    this.dialog.innerHTML=`<form method="dialog"><div class="sound-settings-heading"><div><p>山林声息</p><h2>调音</h2></div><button class="sound-close" aria-label="关闭声音设置">×</button></div>${(['master','music','effects','ambience'] as const).map((key,i)=>`<label class="sound-volume"><span>${['总音量','音乐','音效','环境'][i]}</span><input type="range" min="0" max="100" step="1" data-volume="${key}" aria-label="${['总音量','音乐音量','音效音量','环境音量'][i]}"><output data-value="${key}"></output></label>`).join('')}<div class="sound-settings-footer"><label><input type="checkbox" data-mute> 静音</label><button type="button" data-restore>恢复默认</button></div></form>`;
    document.querySelector('#game')!.append(this.dialog);
    const signal=this.abort.signal;
    this.button.addEventListener('click',()=>this.open(),{signal});
    this.dialog.addEventListener('close',()=>{this.closing=false;onOpen(false);if(this.returnFocus?.isConnected)this.returnFocus.focus();},{signal});
    this.dialog.addEventListener('cancel',event=>{event.preventDefault();this.close();},{signal});
    this.dialog.addEventListener('submit',event=>{event.preventDefault();this.close();},{signal});
    this.dialog.addEventListener('keydown',event=>{event.stopPropagation();},{signal});
    this.dialog.addEventListener('pointerdown',()=>{void mixer.unlock().catch(()=>{});},{signal});
    this.dialog.addEventListener('input',event=>{const input=event.target as HTMLInputElement;if(input.dataset.volume)mixer.setPreferences({[input.dataset.volume]:Number(input.value)/100});if(input.hasAttribute('data-mute'))mixer.setPreferences({muted:input.checked});},{signal});
    this.dialog.querySelector('[data-restore]')!.addEventListener('click',()=>mixer.setPreferences({...DEFAULT_AUDIO}),{signal});
    this.off=mixer.subscribe(settings=>{
      for(const key of ['master','music','effects','ambience'] as const){const value=String(Math.round(settings[key]*100));this.dialog.querySelector<HTMLInputElement>(`[data-volume="${key}"]`)!.value=value;this.dialog.querySelector(`[data-value="${key}"]`)!.textContent=`${value}%`;}
      this.dialog.querySelector<HTMLInputElement>('[data-mute]')!.checked=settings.muted;
      const quick=host.querySelector<HTMLButtonElement>('[data-action="sound"]')!;quick.innerHTML=uiIcon(settings.muted?'soundOff':'sound');quick.classList.toggle('muted',settings.muted);quick.setAttribute('aria-label',settings.muted?'开启声音':'关闭声音');quick.title='全局静音';onMute(settings.muted);
    });
  }
  open():void{
    if(this.dialog.open)return;
    this.returnFocus=document.activeElement instanceof HTMLElement?document.activeElement:this.button;
    void this.mixer.unlock().catch(()=>{});this.onOpen(true);this.dialog.showModal();
    this.dialog.querySelector<HTMLInputElement>('input')!.focus();
    if(!matchMedia('(prefers-reduced-motion: reduce)').matches)this.dialog.animate([{opacity:0,transform:'translateY(8px) scale(.98)'},{opacity:1,transform:'none'}],{duration:220,easing:'ease-out'});
  }
  private close():void{
    if(this.closing||!this.dialog.open)return;this.closing=true;
    if(matchMedia('(prefers-reduced-motion: reduce)').matches){this.dialog.close();return;}
    const animation=this.dialog.animate([{opacity:1},{opacity:0,transform:'translateY(6px)'}],{duration:160,easing:'ease-in'});
    void animation.finished.then(()=>this.dialog.close(),()=>{});
  }
  get preferences():Readonly<AudioPreferences>{return this.mixer.settings;}
  dispose():void{this.off();this.abort.abort();this.dialog.getAnimations().forEach(a=>a.cancel());this.dialog.remove();this.button.remove();}
}
