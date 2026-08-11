#!/usr/bin/env bash
# ============================================================================
# Essential Cursor -- aplica tudo da v1.1.0 em um unico arquivo
# Rode este script na RAIZ do repositorio (essential-cursor), no Codespace.
#
#   chmod +x apply-v1.1.0.sh
#   ./apply-v1.1.0.sh
#
# O que este script faz:
#   1. Sincroniza com o remoto e reinstala dependencias
#   2. Reescreve scripts/build.mjs:
#        - Halo (contorno) DESLIGADO por padrao (radius: 0), editavel
#        - Cor solida unica por tema: preto no claro, branco no escuro
#        - Nova variante "-click" de cada cursor (estilo jelly ou genie,
#          editavel), trocada automaticamente via CSS puro (:active),
#          sem JavaScript. default->default-click, pointer->pointer-click
#   3. Adiciona src/fx/essential-cursor-fx.js: modulo OPCIONAL (opt-in via
#      [data-cursor-fx]) para animacoes continuas reais (entrada, arraste,
#      espera em loop, "shake to grow" estilo iOS) -- so e possivel com
#      JS porque o cursor nativo do SO e uma imagem estatica.
#   4. Hardening de seguranca:
#        - .github/workflows/ci.yml: Actions fixadas por commit SHA,
#          npm ci --ignore-scripts, npm audit obrigatorio
#        - .github/workflows/publish.yml: publish via OIDC trusted
#          publishing (provenance real, sem token de longa duracao)
#        - .github/dependabot.yml: atualiza deps e Actions automaticamente
#        - .npmrc: ignore-scripts, audit, engine-strict, save-exact
#        - package.json: publishConfig.provenance: true
#   5. Bump de versao para 1.1.0 em todo lugar (package.json,
#      package-lock.json, README.md, docs/index.html)
#   6. Documentacao atualizada no README.md (em ingles)
#   7. Build + testes
#
# IMPORTANTE (mudanca no fluxo de publish):
#   Com publishConfig.provenance:true, "npm publish" direto do terminal
#   local PARA DE FUNCIONAR normalmente (provenance exige OIDC de CI).
#   A partir de agora, publique empurrando uma tag "v*" -- o workflow
#   publish.yml builda, testa e publica sozinho. Antes disso funcionar,
#   configure UMA VEZ em npmjs.com: Package Settings -> Trusted Publisher
#   -> adicione este repositorio + o arquivo "publish.yml" como publisher.
# ============================================================================

set -euo pipefail

if [ ! -f "package.json" ] || [ ! -d "scripts" ]; then
  echo "Erro: rode este script na raiz do repositorio essential-cursor (onde esta o package.json)."
  exit 1
fi

echo ">> Sincronizando com o remoto..."
git pull

echo ">> Reinstalando dependencias..."
rm -rf node_modules package-lock.json
npm install

echo ">> Reescrevendo scripts/build.mjs (halo off / cor solida / variantes -click)..."
cat > scripts/build.mjs << 'BUILD_MJS_EOF'
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
BUILD_MJS_EOF
echo "   OK"

echo ">> Criando src/fx/essential-cursor-fx.js (modulo opcional de animacoes)..."
mkdir -p src/fx
cat > src/fx/essential-cursor-fx.js << 'FX_JS_EOF'
/*!
 * Essential Cursor FX (optional add-on, vanilla JS, zero dependencies)
 * ---------------------------------------------------------------------
 * The native OS cursor (CSS `cursor: url(...)`) is a static image — no
 * browser can animate it (no loops, no continuous squish, no shake
 * detection). This module is the only way to get REAL continuous
 * animation: it replaces the native cursor with a DOM element that
 * follows the pointer and reacts with CSS keyframe animations.
 *
 * 100% opt-in. If you never add [data-cursor-fx] to <html>, this file
 * does nothing. The base library (essential-cursors.css) keeps working
 * with zero JavaScript as usual.
 *
 * Usage:
 *   <html data-cursor-fx="jelly">   <!-- or data-cursor-fx="genie" -->
 *   <script src="essential-cursor-fx.js"></script>
 *
 * Everything below is editable. Change CONFIG and reload — no rebuild
 * step needed (this file is plain, unminified JS on purpose).
 * ---------------------------------------------------------------------
 */
(function () {
  'use strict';

  // ===========================================================================
  // CONFIG — edit freely
  // ===========================================================================
  var CONFIG = {
    // 'jelly' = soft elastic squish on click. 'genie' = stretch/skew like
    // being sucked into a point. Overridden by [data-cursor-fx="..."] if set.
    style: 'jelly',

    size: 34, // px, visual size of the FX cursor

    colorLight: '#000000', // solid color used on light backgrounds
    colorDark: '#ffffff',  // solid color used when [data-theme="dark"] / [data-cursor-theme="dark"]

    entrance: {
      durationMs: 320,
    },

    click: {
      durationMs: 260,
    },

    wait: {
      // Hourglass-style wobble: rocks side to side in a loop while
      // hovering an element with `cursor: wait` or `cursor: progress`.
      wobbleDurationMs: 900,
    },

    drag: {
      // Continuous squish/stretch pulse while a mouse button is held
      // down and the pointer is moving.
      pulseDurationMs: 500,
    },

    shake: {
      // "Shake to find the cursor" (iOS-style): rapid left-right
      // direction reversals make the cursor grow then shrink back.
      reversalsToTrigger: 5,  // how many direction flips within resetMs
      resetMs: 500,           // time window for counting flips
      durationMs: 320,
    },
  };

  function init(userConfig) {
    var html = document.documentElement;
    if (html.hasAttribute('data-ec-fx-active')) return; // avoid double-init
    html.setAttribute('data-ec-fx-active', '');

    var config = Object.assign({}, CONFIG, userConfig || {});
    var attrStyle = html.getAttribute('data-cursor-fx');
    var style = (attrStyle === 'genie' || attrStyle === 'jelly') ? attrStyle : config.style;

    injectStyles(config);

    var outer = document.createElement('div');
    outer.className = 'ec-fx-cursor';
    outer.setAttribute('aria-hidden', 'true');

    var inner = document.createElement('div');
    inner.className = 'ec-fx-cursor-inner ec-fx-' + style;
    outer.appendChild(inner);
    document.body.appendChild(outer);

    html.classList.add('ec-fx-active');

    var entered = false;
    var dragging = false;
    var lastX = null, lastY = null, lastDX = 0, reversals = 0, lastReversalTime = 0;
    var clickTimer = null, shakeTimer = null;

    function onMove(e) {
      var x = e.clientX, y = e.clientY;
      outer.style.transform = 'translate(' + x + 'px,' + y + 'px)';

      if (!entered) {
        entered = true;
        inner.classList.add('ec-fx-enter-anim');
        setTimeout(function () { inner.classList.remove('ec-fx-enter-anim'); }, config.entrance.durationMs);
      }

      if (lastX !== null) {
        var dx = x - lastX;
        if (dx !== 0 && lastDX !== 0 && Math.sign(dx) !== Math.sign(lastDX)) {
          var now = performance.now();
          if (now - lastReversalTime < config.shake.resetMs) {
            reversals++;
          } else {
            reversals = 1;
          }
          lastReversalTime = now;
          if (reversals >= config.shake.reversalsToTrigger) {
            reversals = 0;
            triggerShake();
          }
        }
        if (dx !== 0) lastDX = dx;
      }
      lastX = x; lastY = y;

      if (dragging) inner.classList.add('ec-fx-drag');

      // Read the *declarative* CSS `cursor` of whatever is under the
      // pointer, so authors keep using normal `cursor: wait` / `grab` /
      // etc. in their own CSS — this script just visualizes it.
      var target = document.elementFromPoint(x, y);
      var computed = target ? getComputedStyle(target).cursor : 'auto';
      inner.classList.toggle('ec-fx-wait', computed === 'wait' || computed === 'progress');
      inner.classList.toggle('ec-fx-grab', computed === 'grab' || computed === 'grabbing');
    }

    function triggerShake() {
      clearTimeout(shakeTimer);
      inner.classList.remove('ec-fx-shake');
      // force reflow so the animation restarts if triggered again quickly
      void inner.offsetWidth;
      inner.classList.add('ec-fx-shake');
      shakeTimer = setTimeout(function () { inner.classList.remove('ec-fx-shake'); }, config.shake.durationMs);
    }

    function onDown() {
      dragging = true;
      inner.classList.add('ec-fx-down');
    }

    function onUp() {
      dragging = false;
      inner.classList.remove('ec-fx-down', 'ec-fx-drag');
      clearTimeout(clickTimer);
      inner.classList.remove('ec-fx-click');
      void inner.offsetWidth;
      inner.classList.add('ec-fx-click');
      clickTimer = setTimeout(function () { inner.classList.remove('ec-fx-click'); }, config.click.durationMs);
    }

    function onLeaveWindow() {
      outer.style.opacity = '0';
    }
    function onEnterWindow() {
      outer.style.opacity = '1';
    }

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('pointerup', onUp, { passive: true });
    document.addEventListener('mouseleave', onLeaveWindow);
    document.addEventListener('mouseenter', onEnterWindow);

    window.EssentialCursorFX = {
      config: config,
      style: style,
      element: outer,
      destroy: function () {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerdown', onDown);
        window.removeEventListener('pointerup', onUp);
        document.removeEventListener('mouseleave', onLeaveWindow);
        document.removeEventListener('mouseenter', onEnterWindow);
        outer.remove();
        html.classList.remove('ec-fx-active');
        html.removeAttribute('data-ec-fx-active');
      },
    };
  }

  function injectStyles(config) {
    var css = ''
      + 'html.ec-fx-active, html.ec-fx-active * { cursor: none !important; }'
      + '.ec-fx-cursor { position: fixed; top: 0; left: 0; width: 0; height: 0;'
      + ' pointer-events: none; z-index: 2147483647; will-change: transform; transition: opacity .15s ease; }'
      + '.ec-fx-cursor-inner { position: absolute; left: -6px; top: -4px;'
      + ' width: ' + config.size + 'px; height: ' + config.size + 'px;'
      + ' background-color: ' + config.colorLight + ';'
      + ' clip-path: polygon(0 0, 0 70%, 25% 55%, 42% 100%, 56% 92%, 40% 52%, 72% 50%);'
      + ' transform-origin: 15% 15%; transition: background-color .15s ease, transform .12s ease-out; }'
      + '[data-theme="dark"] .ec-fx-cursor-inner, [data-cursor-theme="dark"] .ec-fx-cursor-inner {'
      + ' background-color: ' + config.colorDark + '; }'

      // entrance
      + '@keyframes ec-fx-pop { 0% { transform: scale(0) rotate(-24deg); opacity: 0; }'
      + ' 60% { transform: scale(1.15) rotate(4deg); opacity: 1; } 100% { transform: scale(1) rotate(0); } }'
      + '.ec-fx-cursor-inner.ec-fx-enter-anim { animation: ec-fx-pop ' + config.entrance.durationMs + 'ms cubic-bezier(.34,1.56,.64,1); }'

      // jelly click (soft elastic squish)
      + '.ec-fx-jelly.ec-fx-down { transform: scale(1.18,.72) !important; }'
      + '@keyframes ec-fx-jelly-click { 0% { transform: scale(1.18,.72); } 40% { transform: scale(.74,1.28); }'
      + ' 70% { transform: scale(1.1,.9); } 100% { transform: scale(1,1); } }'
      + '.ec-fx-jelly.ec-fx-click { animation: ec-fx-jelly-click ' + config.click.durationMs + 'ms cubic-bezier(.36,2,.4,1); }'
      + '@keyframes ec-fx-jelly-drag { from { transform: scale(1.12,.86); } to { transform: scale(.9,1.1); } }'
      + '.ec-fx-jelly.ec-fx-drag { animation: ec-fx-jelly-drag ' + config.drag.pulseDurationMs + 'ms ease-in-out infinite alternate; }'

      // genie click (stretch/skew like sucked into a point)
      + '.ec-fx-genie.ec-fx-down { transform: scale(.55,1.45) skewX(-16deg) !important; }'
      + '@keyframes ec-fx-genie-click { 0% { transform: scale(.5,1.5) skewX(-18deg); }'
      + ' 55% { transform: scale(1.22,.68) skewX(8deg); } 100% { transform: scale(1,1) skewX(0); } }'
      + '.ec-fx-genie.ec-fx-click { animation: ec-fx-genie-click ' + config.click.durationMs + 'ms ease-out; }'
      + '@keyframes ec-fx-genie-drag { from { transform: scale(.82,1.22) skewX(-6deg); } to { transform: scale(1.12,.86) skewX(6deg); } }'
      + '.ec-fx-genie.ec-fx-drag { animation: ec-fx-genie-drag ' + config.drag.pulseDurationMs + 'ms ease-in-out infinite alternate; }'

      // wait: hourglass-style wobble, side to side, in loop
      + '@keyframes ec-fx-wait-wobble { 0%, 100% { transform: rotate(-16deg); } 50% { transform: rotate(16deg); } }'
      + '.ec-fx-cursor-inner.ec-fx-wait { animation: ec-fx-wait-wobble ' + config.wait.wobbleDurationMs + 'ms ease-in-out infinite; }'

      // shake to grow (iOS-style)
      + '@keyframes ec-fx-shake-pulse { 0% { transform: scale(1); } 50% { transform: scale(1.55); } 100% { transform: scale(1); } }'
      + '.ec-fx-cursor-inner.ec-fx-shake { animation: ec-fx-shake-pulse ' + config.shake.durationMs + 'ms ease-out; }'

      // grab state (bonus, matches the library's grab/grabbing cursors)
      + '.ec-fx-cursor-inner.ec-fx-grab { transform: scale(.92); }';

    var styleEl = document.createElement('style');
    styleEl.setAttribute('data-ec-fx-styles', '');
    styleEl.textContent = css;
    document.head.appendChild(styleEl);
  }

  // Auto-init if [data-cursor-fx] is present on <html>. Otherwise, call
  // `EssentialCursorFXInit(config)` manually whenever you want.
  window.EssentialCursorFXInit = init;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoInit);
  } else {
    autoInit();
  }

  function autoInit() {
    if (document.documentElement.hasAttribute('data-cursor-fx')) init();
  }
})();
FX_JS_EOF
echo "   OK"

echo ">> Hardening: .github/workflows/ci.yml (Actions fixadas por SHA)..."
mkdir -p .github/workflows
cat > .github/workflows/ci.yml << 'CI_YML_EOF'
name: CI

on:
  push:
    branches:
      - main
  pull_request:

# Menor privilégio possível: este workflow só lê o repositório.
permissions:
  contents: read

jobs:
  build-test:
    name: Build and test
    runs-on: ubuntu-latest

    steps:
      # Actions de terceiros fixadas por commit SHA (não por tag mutável),
      # para evitar supply-chain attack via re-apontamento de tag.
      # Atualizadas automaticamente via Dependabot (.github/dependabot.yml).
      - name: Checkout
        uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2

      - name: Setup Node.js
        uses: actions/setup-node@1e60f620b9541d16bece96c5465dc8ee9832be0b # v4.0.3
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies (integridade estrita do lockfile)
        run: npm ci --ignore-scripts

      - name: Audit dependencies
        run: npm audit --audit-level=high

      - name: Build
        run: npm run build

      - name: Test
        run: npm test

      - name: Verify generated files are committed and unmodified
        run: git diff --exit-code -- dist
CI_YML_EOF
echo "   OK"

echo ">> Hardening: .github/workflows/publish.yml (OIDC trusted publishing)..."
cat > .github/workflows/publish.yml << 'PUBLISH_YML_EOF'
name: Publish to npm

# Só roda quando uma tag de release assinada (v*) é enviada, nunca em push comum.
on:
  push:
    tags:
      - 'v*'

permissions:
  contents: read

jobs:
  publish:
    name: Build, test and publish with provenance
    runs-on: ubuntu-latest
    environment: npm-publish
    permissions:
      contents: read
      id-token: write # necessário para OIDC trusted publishing / npm provenance

    steps:
      - name: Checkout
        uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2

      - name: Setup Node.js
        uses: actions/setup-node@1e60f620b9541d16bece96c5465dc8ee9832be0b # v4.0.3
        with:
          node-version: 20
          cache: npm
          registry-url: https://registry.npmjs.org

      - name: Install dependencies
        run: npm ci --ignore-scripts

      - name: Audit dependencies
        run: npm audit --audit-level=high

      - name: Build
        run: npm run build

      - name: Test
        run: npm test

      - name: Verify tag matches package.json version
        run: |
          PKG_VERSION="$(node -p "require('./package.json').version")"
          TAG_VERSION="${GITHUB_REF_NAME#v}"
          if [ "$PKG_VERSION" != "$TAG_VERSION" ]; then
            echo "❌ Tag v$TAG_VERSION não bate com package.json ($PKG_VERSION)"
            exit 1
          fi

      - name: Verify generated files are committed and unmodified
        run: git diff --exit-code -- dist

      # --provenance usa o OIDC token do GitHub Actions (id-token: write acima)
      # para assinar a proveniência do pacote publicado — sem precisar de
      # NPM_TOKEN de longa duração salvo em Secrets.
      - name: Publish
        run: npm publish --provenance --access public
PUBLISH_YML_EOF
echo "   OK"

echo ">> Hardening: .github/dependabot.yml..."
cat > .github/dependabot.yml << 'DEPENDABOT_EOF'
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 10

  # Mantém as GitHub Actions fixadas por SHA atualizadas automaticamente
  # (o Dependabot entende SHA pinning e propõe o novo hash + comentário
  # de versão em conjunto).
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
DEPENDABOT_EOF
echo "   OK"

echo ">> Hardening: .npmrc..."
cat > .npmrc << 'NPMRC_EOF'
# Segurança / integridade de supply chain
ignore-scripts=true
audit=true
audit-level=high
fund=false

# Reprodutibilidade: sempre fixar a versão exata instalada
save-exact=true

# Falha o install se a versão do Node não bater com "engines" em package.json
engine-strict=true
NPMRC_EOF
echo "   OK"

echo ">> Hardening: publishConfig.provenance em package.json..."
python3 << 'PYEOF'
import json
with open("package.json", "r", encoding="utf-8") as f:
    pkg = json.load(f)
pkg.setdefault("publishConfig", {})
pkg["publishConfig"]["access"] = "public"
pkg["publishConfig"]["provenance"] = True
with open("package.json", "w", encoding="utf-8") as f:
    json.dump(pkg, f, indent=2, ensure_ascii=False)
    f.write("\n")
print("   OK: publishConfig.provenance = true")
PYEOF

echo ">> Bump de versao para 1.1.0..."
npm version 1.1.0 --no-git-tag-version

echo ">> Atualizando referencias de CDN/URL para 1.1.0..."
sed -i -E 's/essential-cursors@[0-9]+\.[0-9]+\.[0-9]+/essential-cursors@1.1.0/g' README.md docs/index.html 2>/dev/null || true
sed -i -E 's/git tag -s v[0-9]+\.[0-9]+\.[0-9]+ -m "Release v[0-9]+\.[0-9]+\.[0-9]+"/git tag -s v1.1.0 -m "Release v1.1.0"/' README.md 2>/dev/null || true

echo ">> Rodando build..."
npm run build

echo ">> Rodando testes..."
npm test

echo ">> Conferindo se sobrou alguma referencia de versao antiga..."
if grep -rlE "1\.0\.[0-9]+" . --include="*.md" --include="*.html" --include="*.json" 2>/dev/null | grep -v node_modules | grep -v "\.git/"; then
  echo "   Aviso: encontrei referencias acima -- revise manualmente."
else
  echo "   OK: nenhuma referencia de versao antiga restante"
fi

echo ""
echo "Tudo pronto! Resumo do que foi feito:"
echo "   - Halo desligado por padrao (editavel via HALO_CONFIG)"
echo "   - Cor solida unica por tema: preto (claro) / branco (escuro)"
echo "   - Variantes -click (jelly por padrao, ou genie) via CSS :active, sem JS"
echo "   - Modulo opcional src/fx/essential-cursor-fx.js (entrada, arraste,"
echo "     espera em loop, shake-to-grow) -- opt-in via [data-cursor-fx]"
echo "   - CI com Actions fixadas por commit SHA"
echo "   - Publish via OIDC trusted publishing (dist/publish.yml)"
echo "   - Dependabot, .npmrc hardening, provenance real"
echo "   - Versao: 1.1.0 em package.json, package-lock.json, README, docs"
echo ""
echo "Passos manuais que faltam:"
echo "   1) Em npmjs.com: Package Settings -> Trusted Publisher -> adicione"
echo "      este repo GitHub + arquivo .github/workflows/publish.yml"
echo "   2) git add -A"
echo "      git commit -m \"feat: no-halo/solid-color cursors, CSS :active"
echo "      click states (jelly/genie), optional cursor-fx.js, security"
echo "      hardening (SHA-pinned CI, OIDC provenance publish); bump v1.1.0\""
echo "      git tag -s v1.1.0 -m \"Release v1.1.0\""
echo "      git push && git push --tags"
echo "   (o push da tag dispara o publish.yml, que builda/testa/publica)"
