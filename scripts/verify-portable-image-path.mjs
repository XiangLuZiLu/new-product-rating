/** Unit test: importing the same local-image.js from two different checkout roots. */
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { LOCAL_IMAGE_DIR } from '../server/local-image.js';
const realRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
if (LOCAL_IMAGE_DIR !== join(realRoot, 'image')) throw Error(`项目目录未正确解析：${LOCAL_IMAGE_DIR}`);
const temp = mkdtempSync(join(tmpdir(), 'rating-image-root-check-'));
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLZAAAAAElFTkSuQmCC', 'base64');
try {
  for (const folder of ['deployment-A', 'another/deployment-B']) {
    const root = join(temp, folder);
    mkdirSync(join(root, 'server'), { recursive: true });
    mkdirSync(join(root, 'scripts'), { recursive: true });
    writeFileSync(join(root, 'package.json'), '{"type":"module"}\n');
    copyFileSync(join(realRoot, 'server/local-image.js'), join(root, 'server/local-image.js'));
    copyFileSync(join(realRoot, 'scripts/render-rating-service.mjs'), join(root, 'scripts/render-rating-service.mjs'));
    const module = await import(pathToFileURL(join(root,'server/local-image.js')).href);
    const expected = join(root, 'image');
    if (module.LOCAL_IMAGE_DIR !== expected) throw Error(`安装目录计算失败 ${module.LOCAL_IMAGE_DIR} != ${expected}`);
    const key = 'review-images-PORTABILITY.png';
    const result = await module.saveLocalImage(key, png, 'image/png');
    if (result.url !== `/image/${key}` || !existsSync(join(expected, key))) throw Error(`存储未落到项目本身目录：${expected}`);
    if (module.getLocalImageFile(`/image/${key}`) !== join(expected, key)) throw Error('本地读取路径错误');
    const del = await module.deleteLocalImageUrl(result.url, { image_key_prefix:'review-images' });
    if (!del.deleted || existsSync(join(expected,key))) throw Error('本地图片删除失败');
    if (process.platform === 'linux') {
      const unit = execFileSync(process.execPath, [join(root,'scripts/render-rating-service.mjs')], {encoding:'utf8'});
      if (!unit.includes(`WorkingDirectory=${root}`) || !unit.includes(`ReadWritePaths=${root}/data ${root}/image`)) throw Error('systemd 单元不是按实际项目路径生成');
    }
    console.log(`✓ 动态部署目录 ${root} → ${expected}`);
  }
  console.log('✓ 图片目录根据项目部署位置动态计算，不依赖 /opt/new-product-rating');
} finally {
  rmSync(temp, {recursive:true, force:true});
}
