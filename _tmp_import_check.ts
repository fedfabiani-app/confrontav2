import * as claudeModule from './server/services/claude';
import * as jobsModule from './server/jobs/index';
console.log('claude exports:', Object.keys(claudeModule));
console.log('jobs exports ok:', typeof jobsModule.enqueueAggregatedNlpJob === 'function' && typeof jobsModule.enqueueAggregatedWeeklyNlpJob === 'function');
