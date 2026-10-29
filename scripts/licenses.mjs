import fs from 'node:fs/promises';
import path from 'node:path';
const inventory=JSON.parse((await fs.readFile('dependency-licenses.json','utf8')).replace(/^\uFEFF/,''));
const notices=['ApplyPilot third-party dependency notices\nGenerated from the pinned pnpm installation. Includes development dependencies for completeness.\n'];
const missing=[];
for(const packages of Object.values(inventory)) {
  for(const pkg of packages) {
    notices.push(`\n${'='.repeat(72)}\n${pkg.name} ${pkg.versions.join(', ')}\nDeclared license: ${pkg.license}\n${pkg.homepage ?? ''}\n`);
    const root=pkg.paths?.[0];let found=false;
    if(root){
      const files=await fs.readdir(root);
      for(const name of files.filter(name=>/^(license|licence|copying|notice)([.-]|$)/i.test(name))){
        const file=path.join(root,name);if(!(await fs.stat(file)).isFile())continue;
        notices.push(`\n${name}\n${await fs.readFile(file,'utf8')}\n`);found=true;
      }
    }
    if(!found)missing.push(pkg.name);
  }
}
await fs.mkdir('public',{recursive:true});
await fs.writeFile('public/THIRD_PARTY_NOTICES.txt',notices.join('\n'));
const portable=Object.fromEntries(Object.entries(inventory).map(([license,packages])=>[license,packages.map(({ paths, ...rest })=>rest)]));
await fs.mkdir('docs',{recursive:true});
await fs.writeFile('docs/DEPENDENCIES.json',JSON.stringify(portable,null,2)+'\n');
console.log(`Third-party notices written. Packages without a root license file: ${missing.join(', ') || 'none'}.`);
