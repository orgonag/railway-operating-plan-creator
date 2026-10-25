import { expect, it } from 'vitest';
import { blank } from '../../src/storyboard/model';
import { scene, standalone } from '../../src/storyboard/render';
it('escapes authored labels and script terminators in offline presentations',()=>{
 const d=blank();d.title='<script>alert(1)</script>';d.slides[0]!.text='</script><script>alert(2)</script>';
 d.labels.push({id:'label',kind:'text',a:{x:1,y:1},b:{x:1,y:1},text:'<img src=x onerror=alert(3)>'});
 expect(scene(d,0)).not.toContain('<img');const html=standalone(d);expect(html.match(/<script>/g)).toHaveLength(1);expect(html.match(/<\/script>/g)).toHaveLength(1);expect(html).not.toContain('<script>alert');
});
