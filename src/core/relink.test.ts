import { expect, it } from 'vitest';
import { createEmptyProject, projectContent } from './project';
import type { Media } from './project';
import { appendMedia } from './timeline';
import { relinkMedia } from './relink';
import { useProjectStore } from './store';
const source: Media = { id:'old',kind:'video',path:'C:/original.mp4',duration:8,w:640,h:360,fps:24,hasAudio:true };
it('relocaliza sin cambiar cortes ni ajustes, y permite deshacer y rehacer',()=>{
 const p=createEmptyProject('Reabrir','horizontal');appendMedia(p,[source]);p.main[0].srcStart=2;p.main[0].srcEnd=7;p.main[0].posX=100;
 const store=useProjectStore.getState;store().load(p,'test.json');const before=projectContent(p);
 expect(()=>store().edit(d=>relinkMedia(d,'old',{...source,id:'new',path:'C:/short.mp4',duration:4}))).toThrow(/demasiado corto/);expect(projectContent(store().project!)).toBe(before);
 store().edit(d=>relinkMedia(d,'old',{...source,id:'new',path:'C:/nuevo.mp4'}));expect(store().project!.media[0]).toMatchObject({id:'old',path:'C:/nuevo.mp4'});expect(store().project!.main[0]).toMatchObject({mediaId:'old',srcStart:2,srcEnd:7,posX:100});
 store().undo();expect(projectContent(store().project!)).toBe(before);store().redo();expect(store().project!.media[0].path).toBe('C:/nuevo.mp4');
});
