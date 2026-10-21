const fs = require('node:fs');
const path = require('node:path');
const bitmap = fs.readFileSync(path.join(__dirname, 'fixtures', 'picture_v001.bmp'));
for (const version of [11, 12]) {
  const dir = path.join(__dirname, 'fixtures', 'card', `card_r${version}`);
  fs.mkdirSync(dir, {recursive:true});
  for (const pass of ['albedo', 'diffuse', 'reflections']) for (let frame=1; frame<=3; frame++) {
    fs.writeFileSync(path.join(dir, `card_${pass}_r${version}_${String(frame).padStart(4,'0')}.bmp`), bitmap);
  }
}
console.log('Created multipass composition fixtures.');
