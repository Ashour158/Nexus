#!/usr/bin/env node
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = resolve(HERE, '..');
const CATEGORIES = {
  unreachable: '(a) unreachable handler',
  unconsumed: '(b) published event has no started consumer',
  unpublished: '(c) handler has no publisher',
  unknownTopic: '(d) published literal topic is absent from TOPICS',
  unsupported: '(e) unsupported static source shape',
};

function parseArgs(argv) {
  const options = { root: DEFAULT_ROOT, check: false, docs: null, allowlist: null };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--check') options.check = true;
    else if (value === '--root') options.root = resolve(argv[++index] ?? '');
    else if (value === '--docs') options.docs = resolve(argv[++index] ?? '');
    else if (value === '--allowlist') options.allowlist = resolve(argv[++index] ?? '');
    else throw new Error(`Unknown argument: ${value}`);
  }
  options.docs ??= resolve(options.root, 'docs/EVENTS.md');
  options.allowlist ??= resolve(options.root, 'scripts/event-contract-allowlist.json');
  return options;
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function walk(path) {
  const files = [];
  if (!(await exists(path))) return files;
  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (['node_modules', 'dist', 'coverage', '.next'].includes(entry.name)) continue;
    const child = resolve(path, entry.name);
    if (entry.isDirectory()) files.push(...await walk(child));
    else files.push(child);
  }
  return files;
}

function lineAt(source, offset) {
  return source.slice(0, offset).split('\n').length;
}

function maskComments(source) {
  let output = '';
  let state = 'code';
  let quote = null;
  let escaped = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (state === 'code' && quote) {
      output += char;
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = null;
    } else if (state === 'code' && (char === "'" || char === '"' || char === '`')) {
      quote = char;
      output += char;
    } else if (state === 'code' && char === '/' && next === '/') {
      state = 'line';
      output += '  ';
      index += 1;
    } else if (state === 'code' && char === '/' && next === '*') {
      state = 'block';
      output += '  ';
      index += 1;
    } else if (state === 'line' && char === '\n') {
      state = 'code';
      output += '\n';
    } else if (state === 'block' && char === '*' && next === '/') {
      state = 'code';
      output += '  ';
      index += 1;
    } else if (state === 'line' || state === 'block') {
      output += char === '\n' ? '\n' : ' ';
    } else {
      output += char;
    }
  }
  return output;
}

function matchingEnd(source, start, open = '(', close = ')') {
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') quote = char;
    else if (char === open) depth += 1;
    else if (char === close && --depth === 0) return index;
  }
  return -1;
}

function splitTopLevel(source) {
  const parts = [];
  let start = 0;
  let quote = null;
  let escaped = false;
  const stack = [];
  const pairs = { ')': '(', ']': '[', '}': '{' };
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') quote = char;
    else if ('([{'.includes(char)) stack.push(char);
    else if (pairs[char] && stack.at(-1) === pairs[char]) stack.pop();
    else if (char === ',' && stack.length === 0) {
      parts.push(source.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(source.slice(start).trim());
  return parts.filter(Boolean);
}

function literal(expression) {
  const value = expression.trim().replace(/\s+as\s+(?:const|never|any|string)\s*$/, '');
  const match = value.match(/^(['"])([\s\S]*)\1$/);
  return match ? match[2] : null;
}

function topicValues(expression, topics, constants, loop = {}) {
  const value = expression.trim().replace(/\s+as\s+(?:const|string\[\])\s*$/, '');
  if (value.startsWith('...')) return topicValues(value.slice(3), topics, constants, loop);
  const direct = literal(value);
  if (direct !== null) return [direct];
  const topic = value.match(/^TOPICS\.([A-Z0-9_]+)$/);
  if (topic) return topics[topic[1]] ? [topics[topic[1]]] : [];
  if (/^\[[\s\S]*\]$/.test(value)) {
    return splitTopLevel(value.slice(1, -1)).flatMap((item) => topicValues(item, topics, constants, loop));
  }
  if (constants.has(value)) return topicValues(constants.get(value), topics, constants, loop);
  const indexed = value.match(/^([A-Za-z_$][\w$]*)\s*\[[^\]]+\]$/);
  if (indexed && constants.has(indexed[1])) {
    const object = constants.get(indexed[1]).trim();
    if (/^\{[\s\S]*\}$/.test(object)) {
      return splitTopLevel(object.slice(1, -1)).flatMap((property) => {
        const colon = property.indexOf(':');
        return colon === -1 ? [] : topicValues(property.slice(colon + 1), topics, constants, loop);
      });
    }
  }
  const template = value.match(/^`([^`]*)`$/);
  if (template) {
    let variants = [template[1]];
    for (const match of template[1].matchAll(/\$\{([A-Za-z_$][\w$]*)\}/g)) {
      const replacements = loop[match[1]] ?? [];
      if (!replacements.length) return [];
      variants = variants.flatMap((variant) => replacements.map((replacement) => variant.replace(match[0], replacement)));
    }
    return variants.some((variant) => variant.includes('${')) ? [] : variants;
  }
  return [];
}

function eventValues(expression, constants, loop = {}) {
  const direct = literal(expression.trim().replace(/\s+as\s+never\s*$/, ''));
  if (direct !== null) return [direct];
  const name = expression.trim();
  if (loop[name]) return loop[name];
  if (constants.has(name)) {
    const stored = constants.get(name).trim();
    if (/^\[[\s\S]*\]$/.test(stored)) {
      return splitTopLevel(stored.slice(1, -1)).flatMap((item) => eventValues(item, constants, loop));
    }
  }
  const template = name.match(/^`([^`]*)`$/);
  if (template) {
    let variants = [template[1]];
    for (const match of template[1].matchAll(/\$\{([A-Za-z_$][\w$]*)\}/g)) {
      const replacements = loop[match[1]] ?? [];
      if (!replacements.length) return [];
      variants = variants.flatMap((variant) => replacements.map((replacement) => variant.replace(match[0], replacement)));
    }
    return variants.some((variant) => variant.includes('${')) ? [] : variants;
  }
  return [];
}

function constantsFrom(source) {
  const constants = new Map();
  const pattern = /\b(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*(?::[^=;]+)?=\s*/g;
  for (const match of source.matchAll(pattern)) {
    const start = match.index + match[0].length;
    let end = start;
    let quote = null;
    const stack = [];
    for (; end < source.length; end += 1) {
      const char = source[end];
      if (quote) {
        if (char === '\\') end += 1;
        else if (char === quote) quote = null;
      } else if ("'\"`".includes(char)) quote = char;
      else if ('([{'.includes(char)) stack.push(char);
      else if (')]}'.includes(char)) stack.pop();
      else if (char === ';' && stack.length === 0) break;
    }
    constants.set(match[1], source.slice(start, end).trim());
  }
  return constants;
}

function loopValuesAt(source, offset, constants) {
  const loop = {};
  const pattern = /for\s*\(\s*const\s+([A-Za-z_$][\w$]*)\s+of\s+([\s\S]*?)\)\s*\{/g;
  for (const match of source.matchAll(pattern)) {
    if (match.index > offset) break;
    const bodyStart = match.index + match[0].length;
    const bodyEnd = matchingEnd(source, bodyStart - 1, '{', '}');
    if (bodyEnd === -1 || offset < bodyStart || offset > bodyEnd) continue;
    loop[match[1]] = eventValues(match[2], constants, loop);
  }
  return loop;
}

function callSites(source, methodPattern) {
  const sites = [];
  const pattern = new RegExp(methodPattern, 'g');
  for (const match of source.matchAll(pattern)) {
    const open = source.indexOf('(', match.index);
    const close = matchingEnd(source, open);
    if (close !== -1) sites.push({ offset: match.index, args: splitTopLevel(source.slice(open + 1, close)) });
  }
  return sites;
}

function propertyExpression(objectSource, name) {
  const pattern = new RegExp(`(?:^|[,{}])\\s*${name}\\s*:\\s*`, 'g');
  const match = pattern.exec(objectSource);
  if (!match) return null;
  const start = match.index + match[0].length;
  return splitTopLevel(objectSource.slice(start))[0] ?? null;
}

function sourceRecord(root, file, source, offset) {
  return { file: relative(root, file).split(sep).join('/'), line: lineAt(source, offset) };
}

function parseTopics(source) {
  const block = source.match(/\bTOPICS\s*=\s*\{([\s\S]*?)\}\s*as\s+const/);
  if (!block) throw new Error('Could not statically resolve TOPICS from packages/kafka/src/index.ts');
  const topics = {};
  for (const match of block[1].matchAll(/\b([A-Z0-9_]+)\s*:\s*(['"])(.*?)\2/g)) topics[match[1]] = match[3];
  if (!Object.keys(topics).length) throw new Error('TOPICS resolved to an empty object');
  return topics;
}

function serviceName(root, file) {
  const value = relative(resolve(root, 'services'), file).split(sep)[0];
  return value && value !== '..' ? value : null;
}

function functionScopes(source, file) {
  const scopes = [];
  const pattern = /\b(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g;
  for (const match of source.matchAll(pattern)) {
    const openParen = source.indexOf('(', match.index);
    const closeParen = matchingEnd(source, openParen);
    if (closeParen === -1) continue;
    let openBrace = -1;
    let angleDepth = 0;
    for (let index = closeParen + 1; index < source.length; index += 1) {
      const char = source[index];
      if (char === '<') angleDepth += 1;
      else if (char === '>') angleDepth = Math.max(0, angleDepth - 1);
      else if (char === '{' && angleDepth === 0) {
        openBrace = index;
        break;
      }
    }
    if (openBrace === -1) continue;
    const closeBrace = matchingEnd(source, openBrace, '{', '}');
    if (closeBrace === -1) continue;
    const parameters = splitTopLevel(source.slice(openParen + 1, closeParen)).map((parameter, index) => {
      const name = parameter.match(/^\s*([A-Za-z_$][\w$]*)\s*\??\s*(?::\s*([\s\S]*))?$/);
      return { index, name: name?.[1] ?? `#${index}`, type: name?.[2]?.trim() ?? '' };
    });
    scopes.push({ name: match[1], file, parameters, declarationStart: match.index, start: openBrace + 1, end: closeBrace });
  }
  return scopes;
}

function scopeAt(scopes, offset, file) {
  const containing = scopes
    .filter((scope) => offset >= scope.start && offset <= scope.end)
    .sort((a, b) => (a.end - a.start) - (b.end - b.start))[0];
  return containing ?? { name: '<top-level>', file, start: 0, end: Number.MAX_SAFE_INTEGER };
}

function receiverCallSites(source, method) {
  const sites = [];
  const pattern = new RegExp(`\\b([A-Za-z_$][\\w$]*)\\s*(?:\\?\\.)?\\.${method}\\s*\\(`, 'g');
  for (const match of source.matchAll(pattern)) {
    const open = source.indexOf('(', match.index);
    const close = matchingEnd(source, open);
    if (close !== -1) sites.push({ receiver: match[1], offset: match.index, args: splitTopLevel(source.slice(open + 1, close)) });
  }
  return sites;
}

function functionCalls(source, scope, allScopes) {
  let body = source.slice(scope.start, scope.end);
  const baseOffset = scope.start;
  if (scope.name === '<top-level>') {
    const chars = [...body];
    for (const nested of allScopes) {
      for (let index = nested.declarationStart; index <= nested.end && index < chars.length; index += 1) {
        if (chars[index] !== '\n') chars[index] = ' ';
      }
    }
    body = chars.join('');
  }
  const calls = [];
  for (const match of body.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)) {
    if (body[match.index - 1] === '.' || ['if', 'for', 'while', 'switch', 'catch', 'function'].includes(match[1])) continue;
    const open = body.indexOf('(', match.index);
    const close = matchingEnd(body, open);
    if (close !== -1) calls.push({ name: match[1], args: splitTopLevel(body.slice(open + 1, close)), offset: baseOffset + match.index });
  }
  return calls;
}

function importsFrom(source) {
  const imports = new Map();
  for (const match of source.matchAll(/\bimport\s+(?:type\s+)?\{([\s\S]*?)\}\s+from\s+(['"])(.*?)\2/g)) {
    for (const item of splitTopLevel(match[1])) {
      const names = item.trim().replace(/^type\s+/, '').split(/\s+as\s+/);
      imports.set(names[1] ?? names[0], { imported: names[0], specifier: match[3] });
    }
  }
  for (const match of source.matchAll(/\bimport\s+([A-Za-z_$][\w$]*)\s+from\s+(['"])(.*?)\2/g)) {
    imports.set(match[1], { imported: 'default', specifier: match[3] });
  }
  return imports;
}

async function readAllowlist(path) {
  let parsed;
  try {
    parsed = JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    throw new Error(`Invalid allowlist ${path}: ${error.message}`);
  }
  if (!parsed || Object.keys(parsed).some((key) => key !== 'entries') || !Array.isArray(parsed.entries)) {
    throw new Error('Allowlist must be an object containing only an entries array');
  }
  const keys = new Set();
  parsed.entries.forEach((entry, index) => {
    const allowed = ['category', 'service', 'event', 'topic', 'reason'];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry) ||
        Object.keys(entry).some((key) => !allowed.includes(key)) ||
        !['unreachable', 'unconsumed', 'unpublished', 'unknownTopic', 'unsupported'].includes(entry.category) ||
        typeof entry.service !== 'string' || !entry.service.trim() ||
        typeof entry.event !== 'string' || typeof entry.topic !== 'string' ||
        typeof entry.reason !== 'string' || !entry.reason.trim()) {
      throw new Error(`Malformed allowlist entry ${index + 1}; category/service/event/topic/reason are required and reason must be non-empty`);
    }
    const key = findingKey(entry);
    if (keys.has(key)) throw new Error(`Duplicate allowlist entry ${index + 1}: ${key}`);
    keys.add(key);
  });
  return parsed.entries;
}

function findingKey(item) {
  return [item.category, item.service, item.event, item.topic].join('|');
}

function extractFile(root, file, source, topics, serviceConstants = new Map()) {
  const clean = maskComments(source);
  const constants = new Map([...serviceConstants, ...constantsFrom(clean)]);
  const service = serviceName(root, file);
  const publishers = [];
  const consumerUnits = [];
  const graphScopes = [];
  const unsupported = [];
  if (!service || /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file)) return { publishers, consumerUnits, graphScopes, unsupported };

  const scopes = functionScopes(clean, file);
  const relativeFile = relative(root, file).split(sep).join('/');
  const fileImports = importsFrom(clean);
  const topScope = { name: '<top-level>', file, parameters: [], start: 0, end: clean.length };
  for (const scope of [topScope, ...scopes]) {
    graphScopes.push({
      service,
      id: `${relativeFile}#${scope.name}`,
      name: scope.name,
      file: relativeFile,
      absoluteFile: file,
      parameters: scope.parameters,
      imports: fileImports,
      helperHandlers: [],
      helperSubscriptions: [],
      calls: functionCalls(clean, scope, scopes),
      bootRoot: scope.name === '<top-level>' && relativeFile === `services/${service}/src/index.ts`,
    });
  }

  const graphById = new Map(graphScopes.map((scope) => [scope.id, scope]));

  const recordPublisher = (topicExpression, typeExpression, offset, kind) => {
    const loop = loopValuesAt(clean, offset, constants);
    const resolvedTopics = topicExpression ? topicValues(topicExpression, topics, constants, loop) : [];
    const resolvedEvents = typeExpression ? eventValues(typeExpression, constants, loop) : [];
    const location = sourceRecord(root, file, source, offset);
    for (const topic of resolvedTopics.filter((value) => !Object.values(topics).includes(value))) {
      unsupported.push({
        category: 'unknownTopic', service, event: resolvedEvents.join(',') || '?', topic,
        ...location, detail: `statically resolved ${kind} topic is absent from TOPICS`,
      });
    }
    if (!resolvedTopics.length || !resolvedEvents.length) {
      unsupported.push({
        category: 'unsupported', service, event: typeExpression?.trim() ?? '?',
        topic: topicExpression?.trim() ?? '?', ...location,
        detail: `${kind} topic or event type is not statically enumerable`,
      });
      return;
    }
    for (const topic of resolvedTopics) for (const event of resolvedEvents) {
      publishers.push({ service, topic, event, ...location });
    }
  };

  for (const site of callSites(clean, String.raw`(?:\?\.)?\.publish\s*\(`)) {
    if (site.args.length < 2) continue;
    const topicExpression = site.args[0] === 'prisma' ? site.args[1] : site.args[0];
    const eventObject = site.args[0] === 'prisma' ? site.args.at(-1) : site.args[1];
    const typeExpression = site.args[0] === 'prisma'
      ? propertyExpression(eventObject, 'eventType')
      : propertyExpression(eventObject, 'type');
    recordPublisher(topicExpression, typeExpression, site.offset, 'publish');
  }

  for (const site of callSites(clean, String.raw`\.outboxMessage\.create\s*\(`)) {
    const createObject = site.args[0] ?? '';
    const dataObject = propertyExpression(createObject, 'data');
    const topicExpression = dataObject ? propertyExpression(dataObject, 'topic') : null;
    const typeExpression = dataObject ? propertyExpression(dataObject, 'eventType') : null;
    recordPublisher(topicExpression, typeExpression, site.offset, 'transactional outbox write');
  }

  const instances = new Map();
  for (const match of clean.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*new\s+NexusConsumer\s*\(/g)) {
    const scope = scopeAt(scopes, match.index, file);
    const scopeId = `${relativeFile}#${scope.name}`;
    const unit = {
      id: `${scopeId}:${match[1]}@${lineAt(source, match.index)}`,
      service, scopeId, startFunction: scope.name, receiver: match[1],
      handlers: [], subscriptions: [], ...sourceRecord(root, file, source, match.index),
    };
    consumerUnits.push(unit);
    instances.set(`${scopeId}:${match[1]}`, unit);
  }
  const aliases = new Map();
  for (const match of clean.matchAll(/\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*([A-Za-z_$][\w$]*)\.on\.bind\(\2\)/g)) {
    const scope = scopeAt(scopes, match.index, file);
    aliases.set(`${relativeFile}#${scope.name}:${match[1]}`, match[2]);
  }

  const onSites = receiverCallSites(clean, 'on');
  for (const match of clean.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)) {
    const scope = scopeAt(scopes, match.index, file);
    const scopeId = `${relativeFile}#${scope.name}`;
    if (!aliases.has(`${scopeId}:${match[1]}`)) continue;
    const open = clean.indexOf('(', match.index);
    const close = matchingEnd(clean, open);
    if (close !== -1) onSites.push({ receiver: aliases.get(`${scopeId}:${match[1]}`), offset: match.index, args: splitTopLevel(clean.slice(open + 1, close)) });
  }
  for (const site of onSites) {
    if (!site.args.length) continue;
    const scope = scopeAt(scopes, site.offset, file);
    const scopeId = `${relativeFile}#${scope.name}`;
    const unit = instances.get(`${scopeId}:${site.receiver}`);
    const loop = loopValuesAt(clean, site.offset, constants);
    const events = eventValues(site.args[0], constants, loop);
    const location = sourceRecord(root, file, source, site.offset);
    if (!events.length) {
      unsupported.push({
        category: 'unsupported', service, event: site.args[0].trim(), topic: '?', ...location,
        detail: 'consumer handler event type is not statically enumerable',
      });
      continue;
    }
    if (unit) {
      unit.handlers.push(...events.map((event) => ({ service, event, unitId: unit.id, ...location })));
      continue;
    }
    const graphScope = graphById.get(scopeId);
    const parameter = graphScope?.parameters.find((item) => item.name === site.receiver && /\bNexusConsumer\b/.test(item.type));
    if (parameter) {
      graphScope.helperHandlers.push(...events.map((event) => ({ service, event, parameter: parameter.name, ...location })));
    } else if (/consumer/i.test(site.receiver) && /\bNexusConsumer\b/.test(clean)) {
      unsupported.push({
        category: 'unsupported', service, event: events.join(','), topic: '?', ...location,
        detail: `NexusConsumer handler receiver '${site.receiver}' cannot be bound to a concrete consumer unit`,
      });
    }
  }
  for (const site of receiverCallSites(clean, 'subscribe')) {
    if (!site.args.length) continue;
    const scope = scopeAt(scopes, site.offset, file);
    const scopeId = `${relativeFile}#${scope.name}`;
    const unit = instances.get(`${scopeId}:${site.receiver}`);
    const loop = loopValuesAt(clean, site.offset, constants);
    const values = topicValues(site.args[0], topics, constants, loop);
    const location = sourceRecord(root, file, source, site.offset);
    if (!values.length) {
      unsupported.push({
        category: 'unsupported', service, event: '?', topic: site.args[0].trim(), ...location,
        detail: 'consumer subscription topics are not statically enumerable',
      });
      continue;
    }
    if (unit) {
      unit.subscriptions.push(...values.map((topic) => ({ service, topic, unitId: unit.id, ...location })));
      continue;
    }
    const graphScope = graphById.get(scopeId);
    const parameter = graphScope?.parameters.find((item) => item.name === site.receiver && /\bNexusConsumer\b/.test(item.type));
    if (parameter) {
      graphScope.helperSubscriptions.push(...values.map((topic) => ({ service, topic, parameter: parameter.name, ...location })));
    }
  }
  return { publishers, consumerUnits, graphScopes, unsupported };
}

function importedModuleFile(fromFile, specifier, knownFiles) {
  if (!specifier.startsWith('.')) return null;
  const base = resolve(dirname(fromFile), specifier);
  const candidates = [
    base,
    base.replace(/\.(?:m?js)$/, '.ts'),
    `${base}.ts`,
    resolve(base, 'index.ts'),
    resolve(base.replace(/\.(?:m?js)$/, ''), 'index.ts'),
  ];
  return candidates.find((candidate) => knownFiles.has(candidate)) ?? null;
}

function startedConsumerUnits(extracted) {
  const activeScopes = new Set();
  const unsupported = [];
  const scopes = extracted.flatMap((item) => item.graphScopes);
  const units = extracted.flatMap((item) => item.consumerUnits);
  const knownFiles = new Set(scopes.map((scope) => scope.absoluteFile));
  const scopesByFileAndName = new Map();
  for (const scope of scopes) {
    const key = `${scope.absoluteFile}#${scope.name}`;
    const values = scopesByFileAndName.get(key) ?? [];
    values.push(scope);
    scopesByFileAndName.set(key, values);
  }
  const unitsById = new Map(units.map((unit) => [unit.id, unit]));
  const unitsByScopeReceiver = new Map(units.map((unit) => [`${unit.scopeId}:${unit.receiver}`, unit]));
  const resolveTargets = (scope, call) => {
    const local = scopesByFileAndName.get(`${scope.absoluteFile}#${call.name}`) ?? [];
    if (local.length) return local;
    const imported = scope.imports.get(call.name);
    if (!imported) return [];
    const targetFile = importedModuleFile(scope.absoluteFile, imported.specifier, knownFiles);
    return targetFile ? (scopesByFileAndName.get(`${targetFile}#${imported.imported}`) ?? []) : [];
  };
  const queue = scopes.filter((scope) => scope.bootRoot).map((scope) => ({ scope, bindings: new Map() }));
  const visitedStates = new Set();
  while (queue.length) {
    const { scope, bindings } = queue.shift();
    const stateKey = `${scope.id}|${[...bindings].sort().map(([key, value]) => `${key}=${value}`).join(',')}`;
    if (visitedStates.has(stateKey)) continue;
    visitedStates.add(stateKey);
    activeScopes.add(scope.id);
    for (const registration of scope.helperHandlers) {
      const unit = unitsById.get(bindings.get(registration.parameter));
      if (unit && !unit.handlers.some((handler) => handler.event === registration.event && handler.file === registration.file && handler.line === registration.line)) {
        unit.handlers.push({ ...registration, unitId: unit.id });
      }
    }
    for (const registration of scope.helperSubscriptions) {
      const unit = unitsById.get(bindings.get(registration.parameter));
      if (unit && !unit.subscriptions.some((sub) => sub.topic === registration.topic && sub.file === registration.file && sub.line === registration.line)) {
        unit.subscriptions.push({ ...registration, unitId: unit.id });
      }
    }
    for (const call of scope.calls) {
      const targets = resolveTargets(scope, call);
      if (targets.length > 1) {
        unsupported.push({
          category: 'unsupported', service: scope.service, event: call.name, topic: '?',
          file: scope.file, line: 1, detail: `module-qualified call resolves to multiple declarations in ${scope.file}`,
        });
        continue;
      }
      for (const target of targets) {
        const targetBindings = new Map();
        for (const parameter of target.parameters) {
          if (!/\bNexusConsumer\b/.test(parameter.type)) continue;
          const argument = call.args[parameter.index]?.trim();
          const localUnit = argument ? unitsByScopeReceiver.get(`${scope.id}:${argument}`) : null;
          const unitId = localUnit?.id ?? bindings.get(argument);
          if (unitId) targetBindings.set(parameter.name, unitId);
          else unsupported.push({
            category: 'unsupported', service: scope.service, event: call.name, topic: '?',
            file: scope.file, line: 1,
            detail: `NexusConsumer argument '${argument ?? '?'}' cannot be bound for ${target.file}#${target.name}`,
          });
        }
        queue.push({ scope: target, bindings: targetBindings });
      }
    }
  }
  return {
    activeScopes,
    activeUnits: new Set(units.filter((unit) => activeScopes.has(unit.scopeId)).map((unit) => unit.id)),
    unsupported,
  };
}

function analyze(topics, extracted, startup, allowlist) {
  const publishers = extracted.flatMap((item) => item.publishers);
  const consumerUnits = extracted.flatMap((item) => item.consumerUnits);
  const unsupported = [...extracted.flatMap((item) => item.unsupported), ...startup.unsupported];
  const handlers = consumerUnits.flatMap((unit) => unit.handlers);
  const subscriptions = consumerUnits.flatMap((unit) => unit.subscriptions);
  const activeUnits = consumerUnits.filter((unit) => startup.activeUnits.has(unit.id));
  const publishedByEvent = new Map();
  for (const publisher of publishers) {
    const values = publishedByEvent.get(publisher.event) ?? new Set();
    values.add(publisher.topic);
    publishedByEvent.set(publisher.event, values);
  }
  const findings = [...unsupported];
  const knownTopics = new Set(Object.values(topics));
  for (const publisher of publishers) {
    if (!knownTopics.has(publisher.topic)) {
      findings.push({ category: 'unknownTopic', ...publisher });
    }
    const reachable = activeUnits.some((unit) =>
      unit.handlers.some((handler) => handler.event === publisher.event) &&
      unit.subscriptions.some((sub) => sub.topic === publisher.topic));
    if (!reachable) findings.push({ category: 'unconsumed', ...publisher });
  }
  for (const unit of consumerUnits) {
    const unitTopics = new Set(unit.subscriptions.map((sub) => sub.topic));
    for (const handler of unit.handlers) {
      const eventTopics = publishedByEvent.get(handler.event) ?? new Set();
      if (!startup.activeUnits.has(unit.id)) {
        findings.push({
          category: 'unreachable', ...handler, topic: [...unitTopics].sort().join(',') || '?',
          detail: `consumer unit in ${unit.startFunction} is not reachable from the service boot path`,
        });
      } else if (eventTopics.size && ![...eventTopics].some((topic) => unitTopics.has(topic))) {
        findings.push({ category: 'unreachable', ...handler, topic: [...eventTopics].sort().join(',') });
      }
      if (!eventTopics.size) findings.push({ category: 'unpublished', ...handler, topic: [...unitTopics].sort().join(',') });
    }
  }
  const uniqueFindings = [...new Map(findings.map((finding) => [findingKey(finding), finding])).values()];
  const allowedKeys = new Map(allowlist.map((entry) => [findingKey(entry), entry]));
  const foundKeys = new Set(uniqueFindings.map(findingKey));
  for (const entry of allowlist) {
    if (!foundKeys.has(findingKey(entry))) {
      throw new Error(`Stale allowlist entry does not match a finding: ${findingKey(entry)}`);
    }
  }
  const active = uniqueFindings.filter((finding) => !allowedKeys.has(findingKey(finding)));
  const allowed = uniqueFindings.filter((finding) => allowedKeys.has(findingKey(finding)))
    .map((finding) => ({ ...finding, reason: allowedKeys.get(findingKey(finding)).reason }));
  return { publishers, handlers, subscriptions, consumerUnits, activeUnits, findings: active, allowed };
}

function renderDocs(topics, result) {
  const rows = result.publishers
    .slice()
    .sort((a, b) => a.event.localeCompare(b.event) || a.service.localeCompare(b.service))
    .map((item) => {
      const consumers = result.activeUnits.flatMap((unit) =>
        unit.handlers.filter((handler) => handler.event === item.event && unit.subscriptions.some((sub) => sub.topic === item.topic)));
      return `| \`${item.event}\` | \`${item.topic}\` | ${item.service} | ${consumers.map((c) => c.service).sort().join(', ') || '—'} |`;
    });
  return [
    '# Event contracts',
    '',
    '<!-- Generated by scripts/check-event-contracts.mjs. Do not edit by hand. -->',
    '',
    `TOPICS catalog: ${Object.keys(topics).length}. Static publishers: ${result.publishers.length}. Started-handler registrations: ${result.activeUnits.flatMap((unit) => unit.handlers).length}.`,
    '',
    '| Event | Topic | Publisher | Started reachable consumers |',
    '| --- | --- | --- | --- |',
    ...rows,
    '',
    '## Allowlisted findings',
    '',
    ...(result.allowed.length
      ? result.allowed.map((item) => `- ${CATEGORIES[item.category]}: ${item.service} / \`${item.event}\` / \`${item.topic}\` — ${item.reason}`)
      : ['None.']),
    '',
  ].join('\n');
}

export async function run(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const topicsPath = resolve(options.root, 'packages/kafka/src/index.ts');
  const topics = parseTopics(maskComments(await readFile(topicsPath, 'utf8')));
  const allowlist = await readAllowlist(options.allowlist);
  const sourceRoot = resolve(options.root, 'services');
  const files = (await walk(sourceRoot)).filter((file) =>
    /\.[cm]?[jt]sx?$/.test(file) &&
    !/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file));
  const extracted = [];
  const constantsByService = new Map();
  for (const file of files) {
    const service = serviceName(options.root, file);
    if (!service) continue;
    const values = constantsByService.get(service) ?? new Map();
    for (const [key, value] of constantsFrom(maskComments(await readFile(file, 'utf8')))) values.set(key, value);
    constantsByService.set(service, values);
  }
  for (const file of files) {
    extracted.push(extractFile(
      options.root, file, await readFile(file, 'utf8'), topics,
      constantsByService.get(serviceName(options.root, file)) ?? new Map(),
    ));
  }
  const startup = startedConsumerUnits(extracted);
  const result = analyze(topics, extracted, startup, allowlist);
  const docs = renderDocs(topics, result);
  if (options.check) {
    const current = await readFile(options.docs, 'utf8').catch(() => '');
    if (current.replace(/\r\n/g, '\n') !== docs) {
      result.findings.unshift({
        category: 'unsupported', service: 'repository', event: 'docs', topic: 'docs/EVENTS.md',
        file: relative(options.root, options.docs).split(sep).join('/'), line: 1,
        detail: 'generated event documentation is stale; run node scripts/check-event-contracts.mjs',
      });
    }
  } else {
    await writeFile(options.docs, docs, 'utf8');
  }
  const counts = Object.fromEntries(Object.keys(CATEGORIES).map((key) => [key, result.findings.filter((f) => f.category === key).length]));
  console.log(`Event contracts: ${result.publishers.length} publishers, ${result.handlers.length} handlers, ${startup.activeUnits.size} boot-started consumer units, ${result.allowed.length} allowlisted.`);
  for (const category of Object.keys(CATEGORIES)) {
    const group = result.findings.filter((finding) => finding.category === category);
    if (!group.length) continue;
    console.error(`\n${CATEGORIES[category]} (${group.length})`);
    for (const finding of group) {
      console.error(`- ${finding.service}: ${finding.event} @ ${finding.topic} (${finding.file}:${finding.line})${finding.detail ? ` — ${finding.detail}` : ''}`);
    }
  }
  console.log(`Finding counts: ${Object.entries(counts).map(([key, value]) => `${key}=${value}`).join(', ')}`);
  return result.findings.length ? 1 : 0;
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  run().then((code) => { process.exitCode = code; }).catch((error) => {
    console.error(`Event contract guard configuration error: ${error.message}`);
    process.exitCode = 2;
  });
}
