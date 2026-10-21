// ブラウザ用のスクリプトを Node のテストで読み込む
require('../vendor/s2/s2.bundle.js');
for (const f of ['geo', 'cell', 'sources', 'candidates', 'writer', 'store']) require(`../js/core/${f}.js`);
module.exports = globalThis.PSF;
