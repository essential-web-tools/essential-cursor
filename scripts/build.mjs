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

// ─────────────────────────────────────────────────────────────────────────
// CONFIGURAÇÃO DO HALO (contorno em volta dos ícones)
// Edite estes valores e rode `npm run build` para regenerar todos os cursores.
//   radius        -> espessura do contorno (0 = sem halo)
//   blur          -> suavização das bordas do contorno (maior = mais suave)
//   colorLight    -> cor do halo no tema claro
//   colorDark     -> cor do halo no tema escuro
// Padrão: sem halo (radius: 0). Aumente o radius para reativar o contorno.
// ─────────────────────────────────────────────────────────────────────────
const HALO_CONFIG = {
  radius: 0,
  blur: 0.6,
  colorLight: '#ffffff',
  colorDark: '#ffffff',
};

// ─────────────────────────────────────────────────────────────────────────
// CONFIGURAÇÃO DE COR DO ÍCONE (cor sólida única por tema)
// Edite estes valores e rode `npm run build` para regenerar todos os cursores.
// ─────────────────────────────────────────────────────────────────────────
const ICON_COLOR_CONFIG = {
  light: '#000000', // tema claro: cursor preto sólido
  dark: '#ffffff',  // tema escuro: cursor branco sólido
};

// ─────────────────────────────────────────────────────────────────────────
// CONFIGURAÇÃO DO ESTADO "CLIQUE" (variante -click de cada cursor)
// Trocada automaticamente via CSS puro (:active), sem JavaScript.
//   style   -> 'jelly' (compressão elástica) ou 'genie' (estica/afina)
//   jelly   -> scaleX/scaleY simulam um "aperto" mole no instante do clique
//   genie   -> scaleX/scaleY/skew simulam o ícone sendo "sugado/esticado"
// Edite os valores e rode `npm run build` para regenerar as variantes -click.
// ─────────────────────────────────────────────────────────────────────────
const CLICK_CONFIG = {
  style: 'jelly', // 'jelly' | 'genie'
  jelly: { scaleX: 1.16, scaleY: 0.8, skewX: 0 },
  genie: { scaleX: 0.62, scaleY: 1.32, skewX: -10 },
};

/**
 * Gera o bloco <defs><filter>...</filter></defs> do halo e injeta o atributo
 * filter="" na tag <svg>. Centralizado aqui para os temas claro/escuro nunca
 * ficarem dessincronizados entre si. Se radius <= 0, não aplica halo algum.
 */
function applyHaloFilter(svgContent, haloId, color) {
  const { radius, blur } = HALO_CONFIG;
  if (radius <= 0) return svgContent;

  svgContent = svgContent.replace(
    /<svg([^>]*)>/,
    `<svg$1><defs><filter id="${haloId}" x="-30%" y="-30%" width="160%" height="160%">` +
    `<feMorphology in="SourceAlpha" operator="dilate" radius="${radius}" result="dilated"/>` +
    `<feGaussianBlur in="dilated" stdDeviation="${blur}" result="softened"/>` +
    `<feFlood flood-color="${color}" result="haloColor"/>` +
    `<feComposite in="haloColor" in2="softened" operator="in" result="halo"/>` +
    `<feMerge><feMergeNode in="halo"/><feMergeNode in="SourceGraphic"/></feMerge>` +
    `</filter></defs>`
  );

  svgContent = svgContent.replace(
    /(<svg[^>]*)(>)/,
    `$1 filter="url(#${haloId})"$2`
  );

  return svgContent;
}

/**
 * Força o ícone a usar uma cor sólida única, independente do que o SVG
 * original tinha. Envolve todo o conteúdo em <g fill="COLOR">, que os
 * paths herdam automaticamente (a menos que já tenham fill próprio).
 */
function applySolidColor(svgContent, color) {
  svgContent = svgContent.replace(
    /(<svg[^>]*>)/,
    `$1<g fill="${color}">`
  );
  svgContent = svgContent.replace(/<\/svg>\s*$/, '</g></svg>');
  return svgContent;
}

/**
 * Gera a variante "-click" do ícone (usada via CSS :active, sem JS): aplica
 * uma transformação afim (scale/skew) centralizada no viewBox para simular
 * um aperto (jelly) ou um estica-e-afina (genie) no instante do clique.
 */
function applyClickTransform(svgContent, viewBoxW, viewBoxH) {
  const cfg = CLICK_CONFIG[CLICK_CONFIG.style];
  const cx = viewBoxW / 2;
  const cy = viewBoxH / 2;
  const transform =
    `translate(${cx} ${cy}) scale(${cfg.scaleX} ${cfg.scaleY}) skewX(${cfg.skewX}) translate(${-cx} ${-cy})`;

  svgContent = svgContent.replace(
    /(<svg[^>]*>)/,
    `$1<g transform="${transform}">`
  );
  svgContent = svgContent.replace(/<\/svg>\s*$/, '</g></svg>');
  return svgContent;
}

function encodeSVG(svgContent) {
  // Normaliza quebras de linha/espaços (SVGs exportados do Illustrator vêm
  // com CRLF), pois uma quebra de linha crua dentro de uma string CSS
  // entre aspas é inválida e quebra o parser do navegador.
  let normalized = svgContent
    .replace(/\r\n?/g, '\n')   // CRLF/CR -> LF
    .replace(/\n+/g, ' ')      // colapsa quebras de linha em espaço
    .replace(/\t/g, ' ')       // tabs -> espaço
    .replace(/ {2,}/g, ' ')    // colapsa espaços múltiplos
    .trim();

  // Codificação para data URI: % # < > aspas
  let encoded = normalized
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

  // Helper: monta o data URI de um cursor para um tema e variante (normal/click)
  async function buildCursorDataUri(cursor, theme) {
    const svgPath = join(srcSvgDir, `${cursor}.svg`);
    let raw = await readFile(svgPath, 'utf-8');

    const viewBoxMatch = raw.match(/viewBox="[\d.]+\s+[\d.]+\s+([\d.]+)\s+([\d.]+)"/);
    const vbW = viewBoxMatch ? parseFloat(viewBoxMatch[1]) : 66.8;
    const vbH = viewBoxMatch ? parseFloat(viewBoxMatch[2]) : 66.8;

    const iconColor = theme === 'dark' ? ICON_COLOR_CONFIG.dark : ICON_COLOR_CONFIG.light;
    const haloColor = theme === 'dark' ? HALO_CONFIG.colorDark : HALO_CONFIG.colorLight;

    let normalSvg = applySolidColor(raw, iconColor);
    normalSvg = applyHaloFilter(normalSvg, `halo-${theme}-${cursor}`, haloColor);

    let clickSvg = applyClickTransform(applySolidColor(raw, iconColor), vbW, vbH);
    clickSvg = applyHaloFilter(clickSvg, `halo-${theme}-${cursor}-click`, haloColor);

    return {
      normal: encodeSVG(normalSvg),
      click: encodeSVG(clickSvg),
    };
  }

  // Gerar CSS
  let cssContent = `/*! Essential Cursor v${packageVersion} | BSD-3-Clause | 41 SVG cursors */\n\n`;
  cssContent += `:root {\n`;

  // Tema claro (default) - cor sólida preta, sem halo (configurável)
  for (const cursor of CANONICAL_CURSORS) {
    const { normal, click } = await buildCursorDataUri(cursor, 'light');
    const [hx, hy, fallback] = hotspots[cursor];
    cssContent += `  --ec-${cursor}: url("${normal}") ${hx} ${hy}, ${fallback};\n`;
    cssContent += `  --ec-${cursor}-click: url("${click}") ${hx} ${hy}, ${fallback};\n`;
  }

  cssContent += `}\n\n`;

  // Tema escuro - cor sólida branca, sem halo (configurável)
  cssContent += `[data-theme="dark"],\n[data-cursor-theme="dark"] {\n`;
  for (const cursor of CANONICAL_CURSORS) {
    const { normal, click } = await buildCursorDataUri(cursor, 'dark');
    const [hx, hy, fallback] = hotspots[cursor];
    cssContent += `  --ec-${cursor}: url("${normal}") ${hx} ${hy}, ${fallback};\n`;
    cssContent += `  --ec-${cursor}-click: url("${click}") ${hx} ${hy}, ${fallback};\n`;
  }
  cssContent += `}\n\n`;

  // Classes utilitárias (+ estado de clique via :active, 100% CSS, sem JS)
  for (const cursor of CANONICAL_CURSORS) {
    cssContent += `.ec-${cursor} {\n  cursor: var(--ec-${cursor});\n}\n`;
    cssContent += `.ec-${cursor}:active {\n  cursor: var(--ec-${cursor}-click);\n}\n\n`;
  }

  // Data attributes (+ estado de clique via :active, 100% CSS, sem JS)
  for (const cursor of CANONICAL_CURSORS) {
    cssContent += `[data-cursor="${cursor}"] {\n  cursor: var(--ec-${cursor});\n}\n`;
    cssContent += `[data-cursor="${cursor}"]:active {\n  cursor: var(--ec-${cursor}-click);\n}\n\n`;
  }

  // ───────────────────────────────────────────────────────────────────────
  // Estado de clique nativo (sem JavaScript): ao pressionar o botão do
  // mouse, o cursor "default" vira --ec-default-click e o "pointer" vira
  // --ec-pointer-click automaticamente, via :active. O estilo da variante
  // -click (jelly ou genie) é definido em CLICK_CONFIG.style acima.
  // ───────────────────────────────────────────────────────────────────────
  cssContent += `/* Estado de clique via :active (sem JS). Estilo: ${CLICK_CONFIG.style} */\n`;
  cssContent += `html:active {\n  cursor: var(--ec-default-click);\n}\n\n`;
  cssContent += `a:active,\n` +
    `button:active,\n` +
    `[role="button"]:active,\n` +
    `input[type="button"]:active,\n` +
    `input[type="submit"]:active,\n` +
    `input[type="reset"]:active,\n` +
    `label[for]:active,\n` +
    `select:active,\n` +
    `summary:active {\n` +
    `  cursor: var(--ec-pointer-click);\n` +
    `}\n\n`;

  // Auto-click: em elementos tipicamente interativos, troca automaticamente
  // o cursor padrão/pointer do navegador pelo cursor de "clique" da
  // biblioteca (mesmo antes de pressionar o botão). Ativado por opt-in via
  // [data-cursor-auto] (no <html>, <body> ou em qualquer container). Para um
  // elemento manter o cursor nativo do navegador mesmo dentro de uma área
  // com auto-click, adicione [data-cursor-native] nele (ou em um ancestral).
  cssContent += `/* Auto-click: opt-in via [data-cursor-auto]; opt-out pontual via [data-cursor-native] */\n`;
  cssContent += `[data-cursor-auto] a,\n` +
    `[data-cursor-auto] button,\n` +
    `[data-cursor-auto] [role="button"],\n` +
    `[data-cursor-auto] input[type="button"],\n` +
    `[data-cursor-auto] input[type="submit"],\n` +
    `[data-cursor-auto] input[type="reset"],\n` +
    `[data-cursor-auto] label[for],\n` +
    `[data-cursor-auto] select,\n` +
    `[data-cursor-auto] summary,\n` +
    `[data-cursor-auto] [onclick],\n` +
    `[data-cursor-auto] [tabindex]:not([tabindex="-1"]) {\n` +
    `  cursor: var(--ec-pointer);\n` +
    `}\n\n`;
  cssContent += `[data-cursor-auto] a:active,\n` +
    `[data-cursor-auto] button:active,\n` +
    `[data-cursor-auto] [role="button"]:active,\n` +
    `[data-cursor-auto] input[type="button"]:active,\n` +
    `[data-cursor-auto] input[type="submit"]:active,\n` +
    `[data-cursor-auto] input[type="reset"]:active,\n` +
    `[data-cursor-auto] label[for]:active,\n` +
    `[data-cursor-auto] select:active,\n` +
    `[data-cursor-auto] summary:active,\n` +
    `[data-cursor-auto] [onclick]:active,\n` +
    `[data-cursor-auto] [tabindex]:not([tabindex="-1"]):active {\n` +
    `  cursor: var(--ec-pointer-click);\n` +
    `}\n\n`;
  cssContent += `[data-cursor-auto] [data-cursor-native],\n` +
    `[data-cursor-auto] [data-cursor-native] * {\n` +
    `  cursor: revert;\n` +
    `}\n\n`;
  

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
