import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeAccountError,safeError} from '../src/account/helpers.js';
test('MFA freshness refusal preserves the session as a step-up requirement',()=>assert.equal(normalizeAccountError({error:{code:'reauthentication_required'}},401).code,'reauthentication_required'));
test('quota refusal is separate from suspension and password rate limiting',()=>assert.equal(normalizeAccountError({error:{code:'remote_quota_exceeded',retryAfterSeconds:60}},429).code,'remote_quota_exceeded'));
test('deletion-pending is a restricted state instead of generic forbidden',()=>assert.equal(normalizeAccountError({error:{code:'account_deletion_pending'}},403).code,'account_deletion_pending'));
test('unknown email and wrong password have the same public error',()=>assert.equal(safeError({code:'user_not_found'}),safeError({code:'invalid_credentials'})));
test('a lifecycle conflict stays distinct from an unknown operation outcome',()=>{
 assert.equal(normalizeAccountError({error:{code:'operation_conflict'}},409).code,'operation_conflict');
 assert.match(safeError({code:'operation_conflict'}),/pending|started|refresh/i);
 assert.match(safeError({code:'account_operation_unknown'}),/could not be confirmed/i);
 assert.doesNotMatch(safeError({code:'account_operation_unknown'}),/deleted|cancelled|recorded/i);
});
