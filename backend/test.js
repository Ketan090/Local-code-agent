const assert=require('assert');
const { parseFallbackToolCalls, TOOL_DEFINITIONS } = require('./dist/tools/index.js');
console.log('tools', TOOL_DEFINITIONS.length);
assert(TOOL_DEFINITIONS.length>=10);
const fb=parseFallbackToolCalls('<tool_call>{"name":"read_file","arguments":{"path":"src/App.tsx"}}</tool_call>');
assert(fb[0].name==='read_file');
console.log('LM Studio + tools tests passed');
