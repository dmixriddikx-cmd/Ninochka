// Run the actual handlers with a conditional-write Blob model, including races.
import { spawnSync } from 'node:child_process';
const result = spawnSync(process.execPath, ['--experimental-test-module-mocks','--test','sync-service/api/sync.test.js'], {stdio:'inherit'});
process.exitCode = result.status ?? 1;
