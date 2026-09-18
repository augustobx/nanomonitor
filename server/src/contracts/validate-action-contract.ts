import {
  ACTION_CONTRACT_HASH,
  ACTION_TYPES,
  AGENT_REPORTABLE_ACTION_STATUSES,
  ALLOWED_SERVICES_WHITELIST,
} from '../schemas/actions.schema.js';

console.log(
  `Action contract OK: ${ACTION_CONTRACT_HASH} (${ACTION_TYPES.length} actions, ${AGENT_REPORTABLE_ACTION_STATUSES.length} report statuses, ${ALLOWED_SERVICES_WHITELIST.length} services)`
);
