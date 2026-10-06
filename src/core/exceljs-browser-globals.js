import { Buffer } from 'buffer';
import process from 'process';

// Initialize before renderer dependencies. Injecting this module into Buffer's own
// dependencies creates a cycle and lets JSZip cache an uninitialized constructor.
globalThis.Buffer = Buffer;
globalThis.process = process;
