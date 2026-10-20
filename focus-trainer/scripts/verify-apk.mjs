import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SDK = 'E:\\APPS\\Android\\Sdk';
const BUILD_TOOLS = join(SDK, 'build-tools', '36.1.0');
const AAPT = join(BUILD_TOOLS, 'aapt.exe');
const APSIGNER_JAR = join(BUILD_TOOLS, 'lib', 'apksigner.jar');
const JAVA = 'D:\\APPS\\Java\\bin\\java.exe';
const APK = process.argv[2] ?? 'android/app/build/outputs/apk/debug/app-debug.apk';
const PUBLIC_DIR = 'android/app/src/main/assets/public';

const EXPECT = {
  package: 'com.focustrainer.app',
  label: '专注力训练',
  minSdk: '24',
  targetSdk: '36',
  activity: 'com.focustrainer.app.MainActivity',
};

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
}

// 工具不在就直接停，别把「SDK 路径不对」伪装成一条 FAIL
for (const [label, p] of [['aapt.exe', AAPT], ['apksigner.jar', APSIGNER_JAR], ['java.exe', JAVA]]) {
  if (!existsSync(p)) {
    console.error(`找不到 ${label}：${p}`);
    process.exit(2);
  }
}

// 用 Buffer 取 aapt 输出再按 utf8 解码：Windows 控制台代码页会把 CJK 变成问号
function run(cmd, args) {
  return execFileSync(cmd, args, { maxBuffer: 32 * 1024 * 1024 }).toString('utf8');
}

// 工具本身跑不起来（路径错、jar 缺失、JDK 不对）是环境问题，用退出码 2 与「断言失败」的 1 分开
function mustRun(cmd, args) {
  try {
    return run(cmd, args);
  } catch (err) {
    console.error(`${cmd} 调用失败：${String(err).slice(0, 400)}`);
    process.exit(2);
  }
}

if (!existsSync(APK)) {
  console.error(`APK 不存在：${APK}`);
  process.exit(2);
}
const sizeMb = (statSync(APK).size / 1024 / 1024).toFixed(2);
check(`APK 存在（${sizeMb} MB）`, statSync(APK).size > 3 * 1024 * 1024, `${APK}`);

const badging = mustRun(AAPT, ['dump', 'badging', APK]);
check(`包名 name='${EXPECT.package}'`, badging.includes(`package: name='${EXPECT.package}'`), badging.split('\n')[0]);
check(`应用名 application-label:'${EXPECT.label}'`, badging.includes(`application-label:'${EXPECT.label}'`), (badging.match(/application-label:[^\r\n]*/m) ?? [''])[0]);
check(`minSdk '${EXPECT.minSdk}'`, new RegExp(`sdkVersion:'${EXPECT.minSdk}'`).test(badging), (badging.match(/sdkVersion:[^\r\n]*/m) ?? [''])[0]);
check(`targetSdk '${EXPECT.targetSdk}'`, new RegExp(`targetSdkVersion:'${EXPECT.targetSdk}'`).test(badging), (badging.match(/targetSdkVersion:[^\r\n]*/m) ?? [''])[0]);
check(`启动活动 ${EXPECT.activity}`, badging.includes(`launchable-activity: name='${EXPECT.activity}'`), (badging.match(/launchable-activity:[^\r\n]*/m) ?? [''])[0]);
check('保留 INTERNET 权限（WebView 从 localhost 读本地文件所需）', badging.includes("uses-permission: name='android.permission.INTERNET'"), (badging.match(/uses-permission:[^\n]*/g) ?? ['无 uses-permission 行']).join(' | '));

// 方向不在 badging 输出里，只能从 Manifest 的 XML 树读枚举值
const xmltree = run(AAPT, ['dump', 'xmltree', APK, 'AndroidManifest.xml']);
// aapt 36.1.0 的实测打印形态是：
//   A: android:screenOrientation(0x0101001e)=(type 0x10)0x1
// 第一个括号组是属性的 resource id，真正的枚举值是行内最后一个 0x…，且本机打印的是未补齐的
// 「0x1」而不是旧版的「(0x00000001)」，所以取最后一个十六进制串解析成整数再比，两种形态都成立。
const orientLine = (xmltree.match(/android:screenOrientation[^\n]*/g) ?? []).join(' | ');
const orientHexes = [...orientLine.matchAll(/0x[0-9a-fA-F]+/g)].map((m) => m[0]);
const orient = orientHexes.length ? parseInt(orientHexes[orientHexes.length - 1], 16) : Number.NaN;
check(
  '竖屏锁定 screenOrientation = 1 (PORTRAIT)',
  orient === 1,
  orientLine
    ? `${orientHexes.join(' ')} -> ${Number.isNaN(orient) ? '解析不出整数' : orient}（1=portrait，7=sensorPortrait，0=landscape，2=user，8=reverseLandscape，4294967295=0xffffffff=unspecified）`
    : 'Manifest 中找不到 android:screenOrientation'
);

let signed = '';
let signErr = '';
try {
  signed = run(JAVA, ['-jar', APSIGNER_JAR, 'verify', '--print-certs', APK]);
} catch (err) {
  signErr = String(err?.message ?? err);
}
check('apksigner verify 通过（debug 签名有效、未损坏）', signErr === '', signErr || (signed.match(/DOES NOT VERIFY.*/)?.[0] ?? '退出码 0'));
check('签名者是调试证书 CN=Android Debug', /CN=Android Debug/.test(signed), (signed.match(/Signer #1 certificate DN:[^\r\n]*/m) ?? ['未取到 DN'])[0]);

// 离线审计：APK 里真正打包的 web 资源不得引用任何外部 origin
const URL_RE = /https?:\/\/[A-Za-z0-9.\-_]+/g;
// 旧写法 /^https?:\/\/([a-z0-9-]+\.)?w3\.org/i 只有前缀、没有结尾锚：
// https://w3.org.evil.example 会因子串命中 w3.org 而被放行。本脚本是成功标准 1「离线」的
// 证明工具，审计工具漏判比产品漏判更危险（终审 SF-2）。
// 改成解析 host 再比对白名单：host 必须恰好是 ALLOW_HOSTS 之一或它的子域。
//   放行：https://www.w3.org、http://www.w3.org/2000/svg、http://localhost、http://localhost:5173
//   拒绝：https://w3.org.evil.example（前缀伪装）、https://cdn.example.com、任意其它 host
// URL_RE 的字符类不含「:」，带端口的 origin 到检查器时已被截断成 http://localhost，
// 截断只丢端口、不丢 host，所以 host 比对仍然成立。
const ALLOW_HOSTS = ['w3.org', 'localhost'];
function isAllowedOrigin(raw) {
  let host;
  try {
    host = new URL(raw).hostname.toLowerCase();
  } catch {
    return false; // 解析不出 host 就按外链算，宁可误报不可漏报
  }
  return ALLOW_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}
function collect(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collect(p));
    else if (/\.(html?|js|css|json|svg|txt|xml|map)$/.test(entry.name)) out.push(p);
  }
  return out;
}
const offenders = new Set();
const fontOffenders = new Set();
for (const file of collect(PUBLIC_DIR)) {
  const text = readFileSync(file, 'utf8');
  for (const raw of text.match(URL_RE) ?? []) {
    if (!isAllowedOrigin(raw)) offenders.add(`${raw}  <-  ${file}`);
  }
  for (const hit of text.match(/@font-face|fonts\.googleapis\.com|fonts\.gstatic\.com|@import\s+url\(/g) ?? []) {
    fontOffenders.add(`${hit}  <-  ${file}`);
  }
}
check('web 资源无外部 origin（只允许 w3.org/localhost 之类的命名空间）', offenders.size === 0, [...offenders].slice(0, 5).join('\n'));
check('无网络字体与远程 @import', fontOffenders.size === 0, [...fontOffenders].slice(0, 5).join('\n'));

const indexHtml = readFileSync(join(PUBLIC_DIR, 'index.html'), 'utf8');
check('index.html 用相对路径引用资源（防白屏）', /(?:src|href)="\.\/assets\//.test(indexHtml) && !/(?:src|href)="\/assets\//.test(indexHtml), (indexHtml.match(/(?:src|href)="[^"]+"/g) ?? []).join(' | '));

const widths = results.filter((r) => !r.pass);
for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `   [${r.detail}]` : ''}`);
console.log(`\n共 ${results.length} 项，失败 ${widths.length} 项。`);
process.exit(widths.length === 0 ? 0 : 1);
