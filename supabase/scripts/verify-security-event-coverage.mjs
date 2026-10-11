import {readFile} from 'node:fs/promises';
import {securityCoverage} from '../functions/_shared/securityEvent.ts';
const file=process.argv[2];if(!file){console.error('Usage: verify-security-event-coverage.mjs SANITIZED_COVERAGE.json');process.exitCode=2}else{const result=securityCoverage(JSON.parse(await readFile(file,'utf8')));console.log(JSON.stringify(result));process.exitCode=result.status==='qualified'?0:1}
