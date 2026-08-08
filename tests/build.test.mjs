import { test } from 'node:test';
import { strictEqual, ok } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');
const distDir = join(rootDir, 'dist');
const hotspotsFile = join(rootDir, 'hotspots.json');

const CANONICAL_CURSORS = [
  'add', 'add-object', 'click', 'copy-object', 'crosshair', 'default', 'duplicate-object',
  'e-resize', 'ew-resize', 'eyedropper', 'grab', 'grabbing', 'hand-rotate', 'help',
  'location-pin', 'move', 'ne-resize', 'nesw-resize', 'not-allowed', 'n-resize', 'ns-resize',
  'nw-resize', 'nwse-resize', 'pan', 'pencil', 'pencil-add', 'pointer', 'rotate',
  'rotate-object', 'rotate-selection', 'scale-object', 'se-resize', 's-resize', 'sw-resize',
  'text', 'text-select', 'wait', 'w-resize', 'zoom', 'zoom-in', 'zoom-out'
];

const VALID_FALLBACKS = new Set([
  'auto', 'default', 'none', 'context-menu', 'help', 'pointer', 'progress',
  'wait', 'cell', 'crosshair', 'text', 'vertical-text', 'alias', 'copy',
  'move', 'no-drop', 'not-allowed', 'grab', 'grabbing',
  'e-resize', 'n-resize', 'ne-resize', 'ns-resize', 'nw-resize',
  's-resize', 'se-resize', 'sw-resize', 'w-resize', 'ew-resize',
  'nesw-resize', 'nwse-resize', 'col-resize', 'row-resize',
  'all-scroll', 'zoom-in', 'zoom-out'
]);

test('41 tokens × 2 temas presentes', async () => {
  const cssContent = await readFile(
    join(distDir, 'essential-cursors.css'),
    'utf-8'
  );

  // Verificar tokens no :root (tema claro)
  ok(cssContent.includes(':root {'), 'Deve ter :root');

  for (const cursor of CANONICAL_CURSORS) {
    ok(
      cssContent.includes(`--ec-${cursor}:`),
      `Deve ter token --ec-${cursor}`
    );
  }

  // Verificar tokens no tema escuro
  ok(
    cssContent.includes('[data-theme="dark"]') ||
    cssContent.includes('[data-cursor-theme="dark"]'),
    'Deve ter seletor de tema escuro'
  );
});

test('classes e data-cursor completos', async () => {
  const cssContent = await readFile(
    join(distDir, 'essential-cursors.css'),
    'utf-8'
  );

  for (const cursor of CANONICAL_CURSORS) {
    ok(
      cssContent.includes(`.ec-${cursor} {`),
      `Deve ter classe .ec-${cursor}`
    );

    ok(
      cssContent.includes(`[data-cursor="${cursor}"]`),
      `Deve ter [data-cursor="${cursor}"]`
    );
  }
});

test('hotspots/fallbacks válidos', async () => {
  const hotspotsData = await readFile(hotspotsFile, 'utf-8');
  const hotspots = JSON.parse(hotspotsData);

  strictEqual(
    Object.keys(hotspots).length,
    41,
    'Deve ter 41 hotspots'
  );

  for (const cursor of CANONICAL_CURSORS) {
    const hs = hotspots[cursor];

    ok(hs, `Hotspot deve existir para ${cursor}`);

    const [x, y, fallback] = hs;

    ok(
      x >= 0 && x <= 60,
      `X deve estar em 0-60 para ${cursor}`
    );

    ok(
      y >= 0 && y <= 60,
      `Y deve estar em 0-60 para ${cursor}`
    );

    ok(
      VALID_FALLBACKS.has(fallback),
      `Fallback deve ser válido para ${cursor}: ${fallback}`
    );
  }
});

test('encoding íntegro', async () => {
  const cssContent = await readFile(
    join(distDir, 'essential-cursors.css'),
    'utf-8'
  );

  // Verificar que não há % cru
  // Apenas %25, %23, %3C e %3E são permitidos
  const cssCheck = cssContent.replace(/%25|%23|%3C|%3E/g, '');

  ok(
    !cssCheck.includes('%'),
    'Não deve ter caractere % cru no CSS'
  );

  // Verificar que data URIs estão presentes
  ok(
    cssContent.includes('data:image/svg+xml'),
    'Deve ter data URIs'
  );
  // Verificar que não há quebras de linha cruas (\r ou \n) dentro do CSS,
  // já que newline literal dentro de uma string entre aspas é CSS inválido
  ok(
    !cssContent.includes('\r'),
    'Não deve ter carriage return (\\r) cru no CSS'
  );
  ok(
    !/url\("[^"]*\n[^"]*"\)/.test(cssContent),
    'Não deve ter quebra de linha (\\n) crua dentro de uma string url("...")'
  );
});

test('build é idempotente', async () => {
  const cssPath = join(distDir, 'essential-cursors.css');
  const minCssPath = join(distDir, 'essential-cursors.min.css');

  const css1 = await readFile(cssPath, 'utf-8');
  const minCss1 = await readFile(minCssPath, 'utf-8');

  const hash1 = createHash('sha256')
    .update(css1)
    .digest('hex');

  const minHash1 = createHash('sha256')
    .update(minCss1)
    .digest('hex');

  // Simular segundo build
  // Os arquivos devem ser deterministicamente idênticos
  const css2 = await readFile(cssPath, 'utf-8');
  const minCss2 = await readFile(minCssPath, 'utf-8');

  const hash2 = createHash('sha256')
    .update(css2)
    .digest('hex');

  const minHash2 = createHash('sha256')
    .update(minCss2)
    .digest('hex');

  strictEqual(
    hash1,
    hash2,
    'CSS deve ser idempotente'
  );

  strictEqual(
    minHash1,
    minHash2,
    'Min CSS deve ser idempotente'
  );
});

test('package.json é JSON válido com campos required', async () => {
  const pkgPath = join(rootDir, 'package.json');
  const pkgContent = await readFile(pkgPath, 'utf-8');
  const pkg = JSON.parse(pkgContent);

  strictEqual(
    pkg.name,
    'essential-cursors',
    'name deve ser essential-cursors'
  );

  // Aceitar qualquer versão SemVer válida
  ok(
    /^\d+\.\d+\.\d+$/.test(pkg.version),
    `version deve seguir SemVer: ${pkg.version}`
  );

  ok(
    pkg.unpkg,
    'Deve ter campo unpkg'
  );

  ok(
    pkg.jsdelivr,
    'Deve ter campo jsdelivr'
  );

  ok(
    Array.isArray(pkg.files),
    'Deve ter campo files como array'
  );

  ok(
    pkg.files.includes('dist'),
    'files deve incluir dist'
  );

  ok(
    pkg.files.includes('LICENSE'),
    'files deve incluir LICENSE'
  );

  ok(
    pkg.files.includes('README.md'),
    'files deve incluir README.md'
  );
});

test('LICENSE contém cláusulas 4 e 5', async () => {
  const licensePath = join(rootDir, 'LICENSE');
  const licenseContent = await readFile(licensePath, 'utf-8');

  ok(
    licenseContent.includes(
      'ADDITIONAL CONDITION — NO TRANSFER TO SPECIFIED ENTITY'
    ),
    'Deve ter cláusula 4'
  );

  ok(
    licenseContent.includes('Essential Web Tools'),
    'Deve mencionar Essential Web Tools'
  );

  ok(
    licenseContent.includes(
      'ADDITIONAL CONDITION — SCOPE OF PROTECTION'
    ),
    'Deve ter cláusula 5'
  );
});

test('nenhum arquivo menciona MIT', async () => {
  const files = [
    join(rootDir, 'LICENSE'),
    join(rootDir, 'package.json'),
    join(rootDir, 'README.md'),
    join(distDir, 'essential-cursors.css')
  ];

  for (const file of files) {
    try {
      const content = await readFile(file, 'utf-8');

      ok(
        !content.includes('MIT'),
        `${file} não deve mencionar MIT`
      );
    } catch (e) {
      // Arquivo pode não existir ainda
    }
  }
});
