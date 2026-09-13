import { createServer } from 'vite';
import fs from 'node:fs/promises';
const server=await createServer({server:{middlewareMode:true,watch:null},appType:'custom'});
try{const {audit}=await server.ssrLoadModule('/scripts/wall-defense-audit.ts');const result=audit();await fs.writeFile('artifacts/roguelike/wall-defense.json',JSON.stringify(result,null,2),'utf8');console.log(JSON.stringify(result.map(({damage,picked,...v})=>v),null,2));}finally{await server.close();}
