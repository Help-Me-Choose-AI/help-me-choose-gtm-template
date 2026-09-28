// Runs template.tpl's own ___TESTS___ scenarios outside GTM, against a small
// emulation of the sandboxed APIs the template uses. It also checks that every
// global write and script injection is covered by ___WEB_PERMISSIONS___, which
// is what GTM enforces at runtime. The GTM template editor remains the source
// of truth: run the tests there too before submitting to the gallery.
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';

const tpl = readFileSync(new URL('../template.tpl', import.meta.url), 'utf8');

const sections = {};
for (const part of tpl.split(/^___([A-Z_]+)___$/m).slice(1).reduce((acc, cur, i, arr) => {
  if (i % 2 === 0) acc.push([cur, arr[i + 1]]);
  return acc;
}, [])) {
  sections[part[0]] = part[1].trim();
}

let failures = 0;
const check = (name, fn) => {
  try {
    fn();
    console.log(`ok   ${name}`);
  } catch (err) {
    failures++;
    console.log(`FAIL ${name}\n     ${err.message}`);
  }
};

// --- Static checks -----------------------------------------------------------

const info = JSON.parse(sections.INFO);
const params = JSON.parse(sections.TEMPLATE_PARAMETERS);
const permissions = JSON.parse(sections.WEB_PERMISSIONS);

check('INFO is a web tag with a PNG thumbnail', () => {
  if (info.type !== 'TAG') throw new Error(`type is ${info.type}`);
  if (!info.containerContexts.includes('WEB')) throw new Error('not a WEB template');
  if (!info.brand.thumbnail.startsWith('data:image/png;base64,')) throw new Error('thumbnail missing');
});

const permission = (id) =>
  permissions.find((p) => p.instance.key.publicId === id)?.instance.param ?? [];

const allowedScripts = permission('inject_script')
  .find((p) => p.key === 'urls')
  ?.value.listItem.map((i) => i.string) ?? [];

const writableGlobals = (permission('access_globals')
  .find((p) => p.key === 'keys')
  ?.value.listItem ?? [])
  .map((item) => {
    const entry = {};
    item.mapKey.forEach((k, i) => {
      const v = item.mapValue[i];
      entry[k.string] = v.type === 8 ? v.boolean : v.string;
    });
    return entry;
  })
  .filter((e) => e.write)
  .map((e) => e.key);

const projectIdRegex = new RegExp(
  params.find((p) => p.name === 'projectId').valueValidators.find((v) => v.type === 'REGEX').args[0],
);

check('project ID validator accepts real slugs and the full key', () => {
  for (const ok of ['org-0f3c9a52-7b1e-4c1d-9a8e-2b6f1d3e4c5a', 'my-store', ' hmc:my_store ']) {
    if (!projectIdRegex.test(ok)) throw new Error(`rejected ${JSON.stringify(ok)}`);
  }
  for (const bad of ['<script>', 'my store', 'awin:123', 'hmc:', 'https://example.com']) {
    if (projectIdRegex.test(bad)) throw new Error(`accepted ${JSON.stringify(bad)}`);
  }
});

// --- Sandbox emulation -------------------------------------------------------

const makeHarness = () => {
  const calls = {};
  const mocks = {};
  const record = (name, args) => (calls[name] ??= []).push(args);

  const defaults = {
    injectScript: () => {},
    setInWindow: () => true,
    logToConsole: () => {},
    makeString: (v) => (v === undefined || v === null ? String(v) : `${v}`),
  };

  const requireApi = (name) => {
    if (!(name in defaults)) throw new Error(`template requires unemulated API ${name}`);
    return (...args) => {
      if (name === 'injectScript' && !allowedScripts.includes(args[0])) {
        throw new Error(`permission: injectScript(${args[0]}) not allowed`);
      }
      if (name === 'setInWindow' && !writableGlobals.includes(args[0])) {
        throw new Error(`permission: setInWindow(${args[0]}) not allowed`);
      }
      record(name, args);
      return (mocks[name] ?? defaults[name])(...args);
    };
  };

  const body = new Function('require', 'data', sections.SANDBOXED_JS_FOR_WEB_TEMPLATE);

  return {
    mock: (name, fn) => {
      mocks[name] = fn;
    },
    runCode: (data) => {
      body(requireApi, {
        ...data,
        gtmOnSuccess: () => record('gtmOnSuccess', []),
        gtmOnFailure: () => record('gtmOnFailure', []),
      });
    },
    assertApi: (name) => ({
      wasCalled: () => {
        if (!calls[name]) throw new Error(`${name} was not called`);
      },
      wasNotCalled: () => {
        if (calls[name]) throw new Error(`${name} was called ${calls[name].length}x`);
      },
      wasCalledWith: (...expected) => {
        if (!(calls[name] ?? []).some((args) => isDeepStrictEqual(args, expected))) {
          throw new Error(`${name} not called with ${JSON.stringify(expected)}; got ${JSON.stringify(calls[name])}`);
        }
      },
    }),
    assertThat: (actual) => ({
      isEqualTo: (expected) => {
        if (!isDeepStrictEqual(actual, expected)) {
          throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
        }
      },
    }),
  };
};

// --- Scenario parsing (just enough YAML for the ___TESTS___ layout) ---------

const blockScalar = (lines, start, indent) => {
  const pad = ' '.repeat(indent);
  let i = start;
  while (i < lines.length && (!lines[i].trim() || lines[i].startsWith(pad))) i++;
  return [lines.slice(start, i).map((l) => l.slice(indent)).join('\n'), i];
};

const testLines = sections.TESTS.split('\n');
const scenarios = [];
let setup = '';
for (let i = 0; i < testLines.length; i++) {
  const line = testLines[i];
  if (line.startsWith('- name: ')) {
    scenarios.push({ name: line.slice(8).trim() });
  } else if (line.startsWith('  code: |-')) {
    const [code, next] = blockScalar(testLines, i + 1, 4);
    scenarios.at(-1).code = code;
    i = next - 1;
  } else if (line.startsWith('setup: |-')) {
    [setup] = blockScalar(testLines, i + 1, 2);
    break;
  }
}

for (const scenario of scenarios) {
  check(scenario.name, () => {
    const h = makeHarness();
    new Function('mock', 'runCode', 'assertApi', 'assertThat', `${setup}\n${scenario.code}`)(
      h.mock,
      h.runCode,
      h.assertApi,
      h.assertThat,
    );
  });
}

console.log(`\n${scenarios.length} scenarios, ${failures} failure(s)`);
process.exit(failures ? 1 : 0);
