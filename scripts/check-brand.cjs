/** Fail on unreviewed legacy branding; exceptions have a reason and a bounded path. */
const { execFileSync } = require('node:child_process');
const { readFileSync, existsSync } = require('node:fs');
const rules = require('../docs/compatibility/legacy-brand-allowlist.json');
const files = [...new Set(execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(Boolean))];
const failures=[];
for(const file of files) {
 if(!existsSync(file) || rules.files[file] || rules.historicalPrefixes.some(prefix=>file.startsWith(prefix)))continue;
 const data=readFileSync(file); if(data.includes(0))continue;
 if(/doupu|豆谱/i.test(data.toString('utf8'))) failures.push(file);
}
if(failures.length) {console.error('Unreviewed legacy brand references:\n'+failures.join('\n'));process.exitCode=1;}
else console.log('Brand scan passed; only documented compatibility/history/resource exceptions remain.');
