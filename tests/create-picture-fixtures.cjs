const fs = require('node:fs');
const path = require('node:path');
const dir = path.join(__dirname,'fixtures'); fs.mkdirSync(dir,{recursive:true});
const bmp = Buffer.alloc(70);
bmp.write('BM'); bmp.writeUInt32LE(70,2); bmp.writeUInt32LE(54,10); bmp.writeUInt32LE(40,14);
bmp.writeInt32LE(2,18); bmp.writeInt32LE(2,22); bmp.writeUInt16LE(1,26); bmp.writeUInt16LE(24,28); bmp.writeUInt32LE(16,34);
for (const asset of ['picture','other']) for (const v of ['001','002','010']) {
  for(let y=0;y<2;y++)for(let x=0;x<2;x++){bmp[54+y*8+x*3]=0;bmp[55+y*8+x*3]=v==='010'?255:0;bmp[56+y*8+x*3]=v==='001'?255:0;}
  fs.writeFileSync(path.join(dir,`${asset}_v${v}.bmp`),bmp);
}
console.log('Created image workflow fixtures.');
