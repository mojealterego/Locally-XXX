import {tools} from '../../../scripts/devsuite-core.mjs';
import {extendedTools} from '../../../scripts/devsuite-extended.mjs';

const registered = new Set([...Object.keys(tools),...Object.keys(extendedTools)]);
const algorithms = new Set(['sha256', 'sha512', 'sha1', 'md5']);
const defaultAlphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';

export class LocalToolError extends Error {
  constructor(code) { super(code); this.name = 'LocalToolError'; this.code = code; }
}
const reject = () => { throw new LocalToolError('INVALID_TOOL_REQUEST'); };
const plain = object => object !== null && typeof object === 'object' && !Array.isArray(object) && Object.getPrototypeOf(object) === Object.prototype;
function checkFields(object, allowed) {
  if (!plain(object) || Object.keys(object).some(key => !allowed.includes(key))) reject();
}
function limitedString(value, max = 32768) {
  if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > max) reject();
  return value;
}

/** Deterministic dispatch boundary. No shell, file system, network, or dynamic code execution. */
export function executeLocalTool(request) {
  checkFields(request, ['tool', 'args']);
  if (typeof request.tool !== 'string' || !registered.has(request.tool)) throw new LocalToolError('UNKNOWN_TOOL');
  const args = request.args ?? {};
  checkFields(args, ['input', 'algorithm', 'length', 'alphabet', 'indent']);
  let result;
  try {
    switch (request.tool) {
      case 'json.format':
        checkFields(args, ['input', 'indent']);
        result = tools['json.format'](limitedString(args.input), args.indent ?? 2);
        break;
      case 'base64.encode':
      case 'base64.decode':
      case 'jwt.inspect':
        checkFields(args, ['input']);
        result = tools[request.tool](limitedString(args.input));
        break;
      case 'hash.digest':
        checkFields(args, ['input', 'algorithm']);
        if (args.algorithm !== undefined && !algorithms.has(args.algorithm)) reject();
        result = tools['hash.digest'](limitedString(args.input), args.algorithm ?? 'sha256');
        break;
      case 'password.generate':
        checkFields(args, ['length', 'alphabet']);
        if (args.length !== undefined && (!Number.isInteger(args.length) || args.length < 12 || args.length > 1024)) reject();
        if (args.alphabet !== undefined) limitedString(args.alphabet, 256);
        result = tools['password.generate'](args.length ?? 24, args.alphabet ?? defaultAlphabet);
        break;
      case 'uuid.v4':
        checkFields(args, []);
        result = tools['uuid.v4']();
        break;
      default:
        if (!Object.hasOwn(extendedTools, request.tool)) throw new LocalToolError('UNKNOWN_TOOL');
        checkFields(args, ['input']);
        result = extendedTools[request.tool](limitedString(args.input));
        break;
    }
  } catch (error) {
    if (error instanceof LocalToolError) throw error;
    throw new LocalToolError('INVALID_TOOL_INPUT');
  }
  return {ok: true, tool: request.tool, result};
}
