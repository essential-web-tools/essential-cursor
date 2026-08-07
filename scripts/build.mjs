import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');
const srcSvgDir = join(rootDir, 'src/svg');
const distDir = join(rootDir, 'dist');
const hotspotsFile = join(rootDir, 'hotspots.json');
const packageFile = join(rootDir, 'package.json');

// Lista canônica de cursores (ordem alfabética)
const CANONICAL_CURSORS = [
  "add", "add-object", "click", "copy-object", "crosshair", "default", "duplicate-object",
  "e-resize", "ew-resize", "eyedropper", "grab", "grabbing", "hand-rotate", "help",
  "location-pin", "move", "ne-resize", "nesw-resize", "not-allowed", "n-resize", "ns-resize",
  "nw-resize", "nwse-resize", "pan", "pencil", "pencil-add", "pointer", "rotate",
  "rotate-object", "rotate-selection", "scale-object", "se-resize", "s-resize", "sw-resize",
  "text", "text-select", "wait", "w-resize", "zoom", "zoom-in", "zoom-out"
];

// Keywords válidas do css-ui-4
const VALID_FALLBACKS = new Set([
  'auto', 'default', 'none', 'context-menu', 'help', 'pointer', 'progress',
  'wait', 'cell', 'crosshair', 'text', 'vertical-text', 'alias', 'copy',
  'move', 'no-drop', 'not-allowed', 'grab', 'grabbing',
  'e-resize', 'n-resize', 'ne-resize', 'ns-resize', 'nw-resize',
  's-resize', 'se-resize', 'sw-resize', 'w-resize', 'ew-resize', 'nesw-resize', 'nwse-resize',
  'col-resize', 'row-resize', 'all-scroll', 'zoom-in', 'zoom-out'
]);

function encodeSVG(svgContent) {
  // Codificação para data URI: % # < > aspas
  let encoded = svgContent
    .replace(/%/g, '%25')
    .replace(/#/g, '%23')
    .replace(/</g, '%3C')
    .replace(/>/g, '%3E')
    .replace(/"/g, "'");
  return `data:image/svg+xml,${encoded}`;
}

function computeSHA384(content) {
  const hash = createHash('sha384');
  hash.update(content);
  return `sha384-${hash.digest('base64')}`;
}

async function main() {
  const packageJson = JSON.parse(
    await readFile(packageFile, 'utf-8')
  );

  const packageVersion = packageJson.version;
  // Validar exatamente os SVGs canônicos
  const files = await readdir(srcSvgDir);

  const svgFiles = files
    .filter(f => f.endsWith('.svg'))
    .map(f => f.replace('.svg', ''));

  const canonicalSet = new Set(CANONICAL_CURSORS);

  const missingSvgFiles = CANONICAL_CURSORS.filter(
    cursor => !svgFiles.includes(cursor)
  );

  const extraSvgFiles = svgFiles.filter(
    cursor => !canonicalSet.has(cursor)
  );

  if (missingSvgFiles.length > 0) {
    console.error(
      `❌ SVGs ausentes: ${missingSvgFiles.join(', ')}`
    );
    process.exit(1);
  }

  if (extraSvgFiles.length > 0) {
    console.error(
      `❌ SVGs não canônicos: ${extraSvgFiles.join(', ')}`
    );
    process.exit(1);
  }

  if (svgFiles.length !== CANONICAL_CURSORS.length) {
    console.error(
      `❌ Quantidade inválida de SVGs: ${svgFiles.length}. ` +
      `Esperado: ${CANONICAL_CURSORS.length}.`
    );
    process.exit(1);
  }
  
  // Carregar hotspots
  const hotspotsData = await readFile(hotspotsFile, 'utf-8');
  const hotspots = JSON.parse(hotspotsData);
  
  // Validar hotspots
  for (const cursor of CANONICAL_CURSORS) {
    const hs = hotspots[cursor];
    if (!hs) {
      console.error(`❌ Erro: hotspot ausente para ${cursor}`);
      process.exit(1);
    }
    const [x, y, fallback] = hs;
    if (x < 0 || x > 60 || y < 0 || y > 60) {
      console.error(`❌ Erro: hotspot fora do range 0-60 para ${cursor}: [${x}, ${y}]`);
      process.exit(1);
    }
    if (!VALID_FALLBACKS.has(fallback)) {
      console.error(`❌ Erro: fallback inválido para ${cursor}: ${fallback}`);
      process.exit(1);
    }
  }
  
  const hotspotKeys = Object.keys(hotspots);

  if (hotspotKeys.length !== CANONICAL_CURSORS.length) {
    console.error(
      `❌ Quantidade inválida de hotspots: ${hotspotKeys.length}. ` +
      `Esperado: ${CANONICAL_CURSORS.length}.`
    );
    process.exit(1);
  }

  const extraHotspots = hotspotKeys.filter(
    cursor => !canonicalSet.has(cursor)
  );

  if (extraHotspots.length > 0) {
    console.error(
      `❌ Hotspots não canônicos: ${extraHotspots.join(', ')}`
    );
    process.exit(1);
  }

  // Gerar CSS
  let cssContent = `/*! Essential Cursor v${packageVersion} | BSD-3-Clause | 41 SVG cursors */\n\n`;
  cssContent += `:root {\n`;
  
  // Tema claro (default) - halo branco
  for (const cursor of CANONICAL_CURSORS) {
    const svgPath = join(srcSvgDir, `${cursor}.svg`);
    let svgContent = await readFile(svgPath, 'utf-8');
    
    // Adicionar halo branco de forma independente da estrutura interna do SVG
    const haloId = `halo-light-${cursor}`;

    svgContent = svgContent.replace(
      /<svg([^>]*)>/,
      `<svg$1><defs><filter id="${haloId}" x="-30%" y="-30%" width="160%" height="160%">` +
      `<feMorphology in="SourceAlpha" operator="dilate" radius="2" result="dilated"/>` +
      `<feFlood flood-color="#ffffff" result="haloColor"/>` +
      `<feComposite in="haloColor" in2="dilated" operator="in" result="halo"/>` +
      `<feMerge><feMergeNode in="halo"/><feMergeNode in="SourceGraphic"/></feMerge>` +
      `</filter></defs></svg>`
    );

    svgContent = svgContent.replace(
      /(<svg[^>]*)(>)/,
      `$1 filter="url(#${haloId})"$2`
    );

    const dataUri = encodeSVG(svgContent);
    const [hx, hy, fallback] = hotspots[cursor];
    cssContent += `  --ec-${cursor}: url("${dataUri}") ${hx} ${hy}, ${fallback};\n`;
  }
  
  cssContent += `}\n\n`;
  
  // Tema escuro - halo preto
  cssContent += `[data-theme="dark"],\n[data-cursor-theme="dark"] {\n`;
  for (const cursor of CANONICAL_CURSORS) {
    const svgPath = join(srcSvgDir, `${cursor}.svg`);
    let svgContent = await readFile(svgPath, 'utf-8');
    
    // Tema escuro: halo branco para manter cursores escuros visíveis
    const haloId = `halo-dark-${cursor}`;

    svgContent = svgContent.replace(
      /<svg([^>]*)>/,
      `<svg$1><defs><filter id="${haloId}" x="-30%" y="-30%" width="160%" height="160%">` +
      `<feMorphology in="SourceAlpha" operator="dilate" radius="2" result="dilated"/>` +
      `<feFlood flood-color="#ffffff" result="haloColor"/>` +
      `<feComposite in="haloColor" in2="dilated" operator="in" result="halo"/>` +
      `<feMerge><feMergeNode in="halo"/><feMergeNode in="SourceGraphic"/></feMerge>` +
      `</filter></defs></svg>`
    );

    svgContent = svgContent.replace(
      /(<svg[^>]*)(>)/,
      `$1 filter="url(#${haloId})"$2`
    );

    const dataUri = encodeSVG(svgContent);
    const [hx, hy, fallback] = hotspots[cursor];
    cssContent += `  --ec-${cursor}: url("${dataUri}") ${hx} ${hy}, ${fallback};\n`;
  }
  cssContent += `}\n\n`;
  
  // Classes utilitárias
  for (const cursor of CANONICAL_CURSORS) {
    cssContent += `.ec-${cursor} {\n  cursor: var(--ec-${cursor});\n}\n\n`;
  }
  
  // Data attributes
  for (const cursor of CANONICAL_CURSORS) {
    cssContent += `[data-cursor="${cursor}"] {\n  cursor: var(--ec-${cursor});\n}\n\n`;
  }
  
  // Validação: verificar encoding (apenas %25, %23, %3C, %3E são permitidos)
  const cssCheck = cssContent.replace(/%25|%23|%3C|%3E/g, '');
  if (cssCheck.includes('%')) {
    console.error('❌ Erro: caractere % cru no CSS');
    process.exit(1);
  }
  
  // Escrever CSS normal
  const cssPath = join(distDir, 'essential-cursors.css');
  await writeFile(cssPath, cssContent);
  
  // Minificar (remover comentários e whitespace desnecessário)
  let minCss = cssContent
    .replace(/\/\*!.*?\*\//g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\n\s+/g, '\n')
    .replace(/\n\n+/g, '\n')
    .replace(/:\s+/g, ':')
    .replace(/;\s+/g, ';')
    .replace(/{\s+/g, '{')
    .replace(/}\s+/g, '}')
    .trim();
  
  const minCssPath = join(distDir, 'essential-cursors.min.css');
  await writeFile(minCssPath, minCss);
  
  // Gerar integrity.json com hashes SHA384
  const cssBytes = Buffer.from(cssContent, 'utf-8');
  const minCssBytes = Buffer.from(minCss, 'utf-8');
  
  const integrityJson = {
    "essential-cursors.css": {
      "sha384": computeSHA384(cssBytes),
      "size": cssBytes.length
    },
    "essential-cursors.min.css": {
      "sha384": computeSHA384(minCssBytes),
      "size": minCssBytes.length
    }
  };
  
  const integrityPath = join(distDir, 'integrity.json');
  await writeFile(integrityPath, JSON.stringify(integrityJson, null, 2) + '\n');
  
  // Tabela de pesos
  console.log('\n📦 Build concluído!\n');
  console.log('Arquivo                    | Tamanho (bytes)');
  console.log('---------------------------|----------------');
  console.log(`essential-cursors.css       | ${cssBytes.length.toString().padStart(14)}`);
  console.log(`essential-cursors.min.css   | ${minCssBytes.length.toString().padStart(14)}`);
  console.log(`\nCSS normal: ${cssBytes.length} bytes`);
  console.log(`CSS minificado: ${minCssBytes.length} bytes`);
  console.log('\n✅ Validações passed:');
  console.log('   • 41 arquivos SVG presentes');
  console.log('   • Hotspots dentro de 0-60');
  console.log('   • Fallbacks são keywords CSS válidas');
  console.log('   • Encoding íntegro (sem caracteres crus)');
}

main().catch(err => {
  console.error('Erro no build:', err);
  process.exit(1);
});
