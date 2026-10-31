// Lightweight, dependency-free syntax highlighter.
import { esc } from './util.js';

const words = (s) => new Set(s.split(/\s+/).filter(Boolean));

const NUM = /0[xX][\da-fA-F_]+|0[bB][01_]+|(?:\d[\d_]*\.?[\d_]*|\.\d[\d_]*)(?:[eE][+-]?\d+)?[a-zA-Z]*/y;
const DQ = /"(?:[^"\\\n]|\\.)*"?/y;
const SQ = /'(?:[^'\\\n]|\\.)*'?/y;
const BT = /`(?:[^`\\]|\\[\s\S])*`?/y;
const TRIPLE = /("""|''')[\s\S]*?(?:\1|$)/y;
const SLASH_COMMENT = /\/\/[^\n]*/y;
const BLOCK_COMMENT = /\/\*[\s\S]*?(?:\*\/|$)/y;
const HASH_COMMENT = /#[^\n]*/y;
const DASH_COMMENT = /--[^\n]*/y;
const OP = /[+\-*/%=<>!&|^~?:@]+/y;
const PUNCT = /[{}()[\];,.]/y;
const IDENT = /[A-Za-z_$][\w$]*/y;

function cLike({ keywords, types = '', builtins = '', comments = ['//', '/*'], strings = [DQ, SQ], extra = [], capsAreTypes = true, constants = 'true false null' }) {
  return {
    keywords: words(keywords),
    types: words(types),
    builtins: words(builtins),
    constants: words(constants),
    capsAreTypes,
    rules: [
      ...extra,
      ...(comments.includes('//') ? [['comment', SLASH_COMMENT]] : []),
      ...(comments.includes('/*') ? [['comment', BLOCK_COMMENT]] : []),
      ...(comments.includes('#') ? [['comment', HASH_COMMENT]] : []),
      ...(comments.includes('--') ? [['comment', DASH_COMMENT]] : []),
      ...strings.map((r) => ['string', r]),
      ['number', NUM],
      ['ident', IDENT],
      ['op', OP],
      ['punct', PUNCT],
    ],
  };
}

const JS_KW = 'break case catch class const continue debugger default delete do else export extends finally for from function if import in instanceof let new of return static super switch this throw try typeof var void while with yield async await as get set';
const TS_KW = JS_KW + ' interface type enum implements declare namespace abstract private protected public readonly keyof infer is satisfies';
const JS_BUILTINS = 'console window document Math JSON Object Array String Number Boolean Promise Map Set Date RegExp Error fetch setTimeout setInterval clearTimeout clearInterval require module process globalThis localStorage navigator Symbol BigInt Intl structuredClone requestAnimationFrame';

const LANGS = {
  js: cLike({
    keywords: JS_KW,
    builtins: JS_BUILTINS,
    strings: [BT, DQ, SQ],
    constants: 'true false null undefined NaN Infinity',
    extra: [['regex', /\/(?![*/\s])(?:[^/\\\n[]|\\.|\[(?:[^\]\\\n]|\\.)*\])+\/[dgimsuy]*(?=\s*[.,;)\]}]|\s*$)/y]],
  }),
  ts: cLike({
    keywords: TS_KW,
    types: 'string number boolean any unknown never void object bigint symbol',
    builtins: JS_BUILTINS,
    strings: [BT, DQ, SQ],
    constants: 'true false null undefined NaN Infinity',
  }),
  python: cLike({
    keywords: 'and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case',
    builtins: 'print len range enumerate zip map filter sorted reversed sum min max abs open input int float str list dict set tuple bool type isinstance super self cls object round any all iter next format repr hasattr getattr setattr',
    constants: 'True False None',
    comments: ['#'],
    strings: [TRIPLE, /[rbfRBF]{0,2}"(?:[^"\\\n]|\\.)*"?/y, /[rbfRBF]{0,2}'(?:[^'\\\n]|\\.)*'?/y],
    extra: [['builtin', /@[\w.]+/y]],
  }),
  java: cLike({
    keywords: 'abstract assert break case catch class const continue default do else enum extends final finally for goto if implements import instanceof interface native new package private protected public return static strictfp super switch synchronized this throw throws transient try volatile while var record yield',
    types: 'int long short byte char boolean float double void String',
    builtins: 'System Math List ArrayList Map HashMap Arrays Collections Optional',
  }),
  c: cLike({
    keywords: 'auto break case const continue default do else enum extern for goto if inline register restrict return sizeof static struct switch typedef union volatile while class namespace public private protected template typename using virtual override new delete this throw try catch operator friend constexpr nullptr noexcept explicit mutable',
    types: 'int long short char float double void bool unsigned signed size_t auto string vector map std uint8_t uint32_t int64_t',
    builtins: 'printf scanf malloc free cout cin endl std main',
    constants: 'true false NULL nullptr',
    extra: [['builtin', /#\s*\w+[^\n]*/y]],
  }),
  csharp: cLike({
    keywords: 'abstract as base break case catch checked class const continue default delegate do else enum event explicit extern finally fixed for foreach goto if implicit in interface internal is lock namespace new operator out override params private protected public readonly ref return sealed sizeof stackalloc static struct switch this throw try typeof unchecked unsafe using virtual volatile while async await var get set record init',
    types: 'int long short byte char bool float double decimal void string object dynamic',
    builtins: 'Console Math List Dictionary Task String',
  }),
  go: cLike({
    keywords: 'break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var',
    types: 'int int8 int16 int32 int64 uint uint8 uint16 uint32 uint64 float32 float64 string bool byte rune error any',
    builtins: 'fmt append len cap make new panic recover print println close copy delete',
    constants: 'true false nil iota',
    strings: [BT, DQ, SQ],
  }),
  rust: cLike({
    keywords: 'as async await break const continue crate dyn else enum extern fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait type unsafe use where while',
    types: 'i8 i16 i32 i64 i128 isize u8 u16 u32 u64 u128 usize f32 f64 bool char str String Vec Option Result Box',
    builtins: 'println print format vec panic assert assert_eq Some None Ok Err',
    extra: [['builtin', /\w+!/y]],
  }),
  swift: cLike({
    keywords: 'associatedtype class deinit enum extension fileprivate func import init inout internal let open operator private protocol public static struct subscript typealias var break case continue default defer do else fallthrough for guard if in repeat return switch where while as catch is rethrows throw throws try async await some any self Self',
    types: 'Int Double Float String Bool Character Array Dictionary Set Optional Void',
    builtins: 'print',
    constants: 'true false nil',
  }),
  kotlin: cLike({
    keywords: 'as break class continue do else for fun if in interface is object package return super this throw try typealias val var when while by catch constructor finally get import init override private protected public set data sealed suspend companion open internal',
    types: 'Int Long Double Float String Boolean Char Unit Any List Map',
    builtins: 'println print listOf mapOf setOf mutableListOf',
  }),
  php: cLike({
    keywords: 'abstract and array as break callable case catch class clone const continue declare default do echo else elseif empty enddeclare endfor endforeach endif endswitch endwhile extends final finally fn for foreach function global goto if implements include include_once instanceof insteadof interface isset list match namespace new or print private protected public require require_once return static switch throw trait try unset use var while yield',
    comments: ['//', '/*', '#'],
    extra: [['attr', /\$[A-Za-z_]\w*/y], ['tag', /<\?php|\?>/y]],
  }),
  ruby: cLike({
    keywords: 'alias and begin break case class def defined do else elsif end ensure for if in module next not or redo rescue retry return self super then undef unless until when while yield require attr_accessor attr_reader puts',
    constants: 'true false nil',
    comments: ['#'],
    extra: [['attr', /[@$]{1,2}\w+/y], ['type', /:\w+/y]],
  }),
  dart: cLike({
    keywords: 'abstract as assert async await break case catch class const continue default do else enum export extends extension external factory final finally for get if implements import in is late library mixin new on operator part required rethrow return set static super switch sync this throw try typedef var void while with yield',
    types: 'int double num String bool List Map Set dynamic Future Stream Widget',
  }),
  lua: cLike({
    keywords: 'and break do else elseif end for function goto if in local not or repeat return then until while',
    constants: 'true false nil',
    comments: ['--'],
    builtins: 'print pairs ipairs table string math require',
  }),
  sql: {
    ci: true,
    keywords: words('select from where and or not insert into values update set delete create table drop alter add primary key foreign references join left right inner outer full on as group by order having limit offset distinct union all case when then else end is null like in between exists index view default unique check constraint asc desc count sum avg min max with returning if replace begin commit rollback transaction'),
    types: words('int integer bigint smallint varchar char text boolean bool date datetime timestamp float double decimal numeric serial json jsonb uuid real blob'),
    builtins: words('now coalesce lower upper length substr round cast'),
    constants: words('true false null'),
    rules: [['comment', DASH_COMMENT], ['comment', BLOCK_COMMENT], ['string', SQ], ['string', DQ], ['number', NUM], ['ident', IDENT], ['op', OP], ['punct', PUNCT]],
  },
  bash: {
    keywords: words('if then else elif fi for while until do done case esac function in select return export local readonly declare source alias unset shift exit break continue'),
    builtins: words('echo cd ls cat grep sed awk curl wget git npm npx pnpm yarn pip pip3 python python3 node sudo apt apt-get brew mkdir rm cp mv chmod chown touch find xargs tar unzip docker kubectl ssh scp make cargo go java printf read test kill ps tee head tail sort uniq wc which env set'),
    constants: words('true false'),
    rules: [['comment', HASH_COMMENT], ['string', DQ], ['string', SQ], ['attr', /\$\{[^}]*\}|\$\(|\$[\w@#?*!$-]+/y], ['prop', /(?:^|(?<=\s))--?[\w-]+/y], ['number', /\b\d+\b/y], ['ident', /[A-Za-z_][\w.-]*/y], ['op', /[|&;<>=!]+/y], ['punct', /[{}()[\]]/y]],
  },
  css: {
    rules: [
      ['comment', BLOCK_COMMENT],
      ['string', DQ], ['string', SQ],
      ['keyword', /@[\w-]+/y],
      ['number', /#[\da-fA-F]{3,8}\b/y],
      ['prop', /--?[A-Za-z][\w-]*(?=\s*:)/y],
      ['function', /[A-Za-z-][\w-]*(?=\()/y],
      ['number', /-?(?:\d+\.?\d*|\.\d+)(?:%|[a-zA-Z]+)?/y],
      ['tag', /[.#][A-Za-z_-][\w-]*/y],
      ['keyword', /!important/y],
      ['ident', /[A-Za-z_-][\w-]*/y],
      ['op', /[>+~*=:|^$]/y],
      ['punct', /[{}();,[\]]/y],
    ],
    keywords: words(''), builtins: words(''), types: words(''), constants: words(''),
    identClass: 'attr',
  },
  json: {
    rules: [
      ['prop', /"(?:[^"\\\n]|\\.)*"(?=\s*:)/y],
      ['string', DQ],
      ['number', /-?\d+\.?\d*(?:[eE][+-]?\d+)?/y],
      ['ident', IDENT],
      ['punct', /[{}[\],:]/y],
    ],
    keywords: words(''), builtins: words(''), types: words(''), constants: words('true false null'),
  },
  yaml: {
    rules: [
      ['comment', HASH_COMMENT],
      ['prop', /[\w.-]+(?=\s*:(?:\s|$))/y],
      ['string', DQ], ['string', SQ],
      ['number', /-?\d+\.?\d*\b/y],
      ['punct', /[-:|>[\]{},]/y],
      ['ident', IDENT],
    ],
    keywords: words(''), builtins: words(''), types: words(''), constants: words('true false null yes no on off'),
  },
  diff: {
    lines: true,
  },
  markdown: {
    rules: [
      ['heading', /^#{1,6} [^\n]*/my],
      ['string', /`[^`\n]+`/y],
      ['bold', /\*\*[^*\n]+\*\*/y],
      ['attr', /\[[^\]\n]+\]\([^)\n]+\)/y],
      ['keyword', /^\s*(?:[-*+]|\d+\.)\s/my],
      ['comment', /^>[^\n]*/my],
    ],
    keywords: words(''), builtins: words(''), types: words(''), constants: words(''),
  },
};

const ALIASES = {
  javascript: 'js', jsx: 'js', mjs: 'js', cjs: 'js', node: 'js', es6: 'js',
  typescript: 'ts', tsx: 'ts',
  py: 'python', python3: 'python', py3: 'python',
  cpp: 'c', 'c++': 'c', h: 'c', hpp: 'c', cc: 'c', objc: 'c', arduino: 'c',
  cs: 'csharp', 'c#': 'csharp',
  golang: 'go', rs: 'rust', kt: 'kotlin', kts: 'kotlin', rb: 'ruby',
  sh: 'bash', shell: 'bash', zsh: 'bash', console: 'bash', terminal: 'bash', powershell: 'bash', ps1: 'bash', bat: 'bash', cmd: 'bash',
  scss: 'css', sass: 'css', less: 'css',
  json5: 'json', jsonc: 'json',
  yml: 'yaml', toml: 'yaml', ini: 'yaml',
  md: 'markdown', mdx: 'markdown',
  patch: 'diff',
  scala: 'java', groovy: 'java',
  html: 'markup', xml: 'markup', svg: 'markup', vue: 'markup', svelte: 'markup', xhtml: 'markup', htm: 'markup',
};

export function normalizeLang(lang) {
  const l = String(lang || '').toLowerCase().trim();
  return ALIASES[l] || l;
}

export const LANG_LABELS = {
  js: 'JavaScript', ts: 'TypeScript', python: 'Python', java: 'Java', c: 'C/C++', csharp: 'C#', go: 'Go', rust: 'Rust', swift: 'Swift',
  kotlin: 'Kotlin', php: 'PHP', ruby: 'Ruby', dart: 'Dart', lua: 'Lua', sql: 'SQL', bash: 'Shell', css: 'CSS', json: 'JSON', yaml: 'YAML',
  markdown: 'Markdown', markup: 'HTML', diff: 'Diff',
};

const span = (cls, text) => `<span class="tok-${cls}">${esc(text)}</span>`;

function tokenize(code, lang) {
  const out = [];
  let plain = '';
  let i = 0;
  const flush = () => { if (plain) { out.push(esc(plain)); plain = ''; } };
  const n = code.length;
  outer: while (i < n) {
    for (const [cls, re] of lang.rules) {
      re.lastIndex = i;
      const m = re.exec(code);
      if (m && m[0].length) {
        flush();
        const t = m[0];
        if (cls === 'ident') {
          const key = lang.ci ? t.toLowerCase() : t;
          let c = null;
          if (lang.keywords?.has(key)) c = 'keyword';
          else if (lang.constants?.has(key)) c = 'number';
          else if (lang.types?.has(key)) c = 'type';
          else if (lang.builtins?.has(key)) c = 'builtin';
          else {
            let j = i + t.length;
            while (code[j] === ' ') j++;
            if (code[j] === '(') c = 'function';
            else if (lang.capsAreTypes && /^[A-Z][a-z]/.test(t)) c = 'type';
            else if (lang.identClass) c = lang.identClass;
          }
          out.push(c ? span(c, t) : esc(t));
        } else {
          out.push(span(cls, t));
        }
        i += t.length;
        continue outer;
      }
    }
    plain += code[i++];
  }
  flush();
  return out.join('');
}

function highlightMarkup(code) {
  const out = [];
  const re = /<!--[\s\S]*?(?:-->|$)|<!DOCTYPE[^>]*>?|<\/?[A-Za-z][\w:-]*(?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"?|'[^']*'?|[^\s>]+))?)*\s*\/?>?/gi;
  let last = 0;
  let m;
  while ((m = re.exec(code))) {
    if (m.index > last) out.push(esc(code.slice(last, m.index)));
    const t = m[0];
    if (t.startsWith('<!--')) out.push(span('comment', t));
    else if (/^<!DOCTYPE/i.test(t)) out.push(span('keyword', t));
    else {
      out.push(highlightTag(t));
      const name = /^<([A-Za-z][\w:-]*)/.exec(t)?.[1]?.toLowerCase();
      if ((name === 'script' || name === 'style') && !t.endsWith('/>')) {
        const close = new RegExp(`</${name}\\s*>`, 'i');
        const rest = code.slice(re.lastIndex);
        const cm = close.exec(rest);
        const inner = cm ? rest.slice(0, cm.index) : rest;
        out.push(tokenize(inner, name === 'script' ? LANGS.js : LANGS.css));
        re.lastIndex += inner.length;
      }
    }
    last = re.lastIndex;
  }
  if (last < code.length) out.push(esc(code.slice(last)));
  return out.join('');
}

function highlightTag(t) {
  const m = /^(<\/?)([A-Za-z][\w:-]*)([\s\S]*?)(\/?>)?$/.exec(t);
  if (!m) return esc(t);
  const [, open, name, attrs, close = ''] = m;
  const a = attrs.replace(/([^\s=]+)(\s*=\s*)?("[^"]*"?|'[^']*'?|[^\s>]+)?/g, (all, n, eq, v) => {
    if (!eq) return `\u0001attr\u0002${n}\u0003`;
    return `\u0001attr\u0002${n}\u0003${eq}\u0001string\u0002${v || ''}\u0003`;
  });
  const attrHtml = esc(a).replace(/\u0001(\w+)\u0002([\s\S]*?)\u0003/g, (all, c, v) => `<span class="tok-${c}">${v}</span>`);
  return `${span('punct', open)}${span('tag', name)}${attrHtml}${close ? span('punct', close) : ''}`;
}

function highlightDiff(code) {
  return code.split('\n').map((line) => {
    if (/^\+(?!\+\+)/.test(line)) return span('inserted', line);
    if (/^-(?!--)/.test(line)) return span('deleted', line);
    if (/^@@/.test(line)) return span('keyword', line);
    return esc(line);
  }).join('\n');
}

export function highlight(code, lang) {
  const l = normalizeLang(lang);
  try {
    if (l === 'markup') return highlightMarkup(code);
    if (l === 'diff') return highlightDiff(code);
    const def = LANGS[l];
    if (!def) {
      if (/^\s*</.test(code) && /<\/?[a-z][\s\S]*>/i.test(code)) return highlightMarkup(code);
      return esc(code);
    }
    return tokenize(code, def);
  } catch (e) {
    console.warn('highlight failed', e);
    return esc(code);
  }
}

export function guessLang(code) {
  if (/^\s*<(!doctype|html|div|svg|\?xml)/i.test(code)) return 'html';
  if (/^\s*[{[]/.test(code) && /"\s*:/.test(code)) return 'json';
  if (/\bdef \w+\(|\bimport \w+$|print\(/m.test(code)) return 'python';
  if (/\bfunction\b|=>|\bconst\b|\blet\b|console\./.test(code)) return 'javascript';
  if (/#include|std::/.test(code)) return 'cpp';
  if (/\bfn main\(|let mut\b/.test(code)) return 'rust';
  if (/\bpackage main\b|func \w+\(/.test(code)) return 'go';
  if (/\bpublic (static )?(class|void)\b/.test(code)) return 'java';
  if (/^\s*(select|insert|create|update)\b/im.test(code)) return 'sql';
  if (/^\s*[.#]?[\w-]+\s*\{[\s\S]*:[\s\S]*\}/.test(code)) return 'css';
  return '';
}
