const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname,'fixtures','render','SH10');
const bitmap = fs.readFileSync(path.join(__dirname,'fixtures','picture_v001.bmp'));
for (const [folder,revision,separator] of [['r01',1,'_'],['r02',2,'.'],['r99 Vertical',99,'_']]) {
  const dir = path.join(root,folder,'reflections'); fs.mkdirSync(dir,{recursive:true});
  for(let frame=1;frame<=3;frame++) fs.writeFileSync(path.join(dir,`shot_r${String(revision).padStart(2,'0')}_reflections${separator}${String(frame).padStart(4,'0')}.bmp`),bitmap);
}
fs.mkdirSync(path.join(root,'r03','reflections'),{recursive:true});
console.log('Created sibling revision / nested pass fixtures.');
