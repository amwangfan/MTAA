// A controller belongs to one run. Paused time never consumes reading time.
export const DEMO_STEP_MS=4000;
export class DemoPlayback {
  constructor({now=Date.now,sleep=ms=>new Promise(r=>setTimeout(r,ms))}={}) {
    this.now=now; this.sleep=sleep; this.paused=false; this.stopped=false;
  }
  stop() { this.stopped=true; }
  async wait(ms) {
    let remaining=ms;
    for (;;) {
      if(this.stopped)throw new Error('stopped');
      if(!this.paused&&remaining<=0)return;
      const start=this.now(),wasPaused=this.paused;
      await this.sleep(60);
      if(!wasPaused&&!this.paused)remaining-=Math.max(0,this.now()-start);
    }
  }
}
