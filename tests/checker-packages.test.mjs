// The published checkers (veriss-svelte, veriss-linaria) and the packages they need, as an npm consumer gets them:
// each packed with pnpm (no workspace: range may remain), installed side by side, the CLI run on a fixture with a known
// error (exit 1, the code in the output) and on a clean one (exit 0), and the API imported by its package name.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,mkdir,readdir,rename,symlink,rm,access} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const packages=fileURLToPath(new URL('../packages/',import.meta.url));
// Published packages, in dependency order (the order release.yml publishes them in).
const published=[['veriss','veriss'],['adapter-core','veriss-adapter-core'],['react-adapter','veriss-react'],['svelte-adapter','veriss-svelte'],['linaria','veriss-linaria']];

async function install() {
  const directory=await mkdtemp(join(tmpdir(),'veriss-checkers-'));
  const app=join(directory,'app'),modules=join(app,'node_modules');
  await mkdir(join(modules,'.bin'),{recursive:true});
  const manifests={};
  for(const [dir,name] of published) {
    const root=join(packages,dir),out=join(directory,dir);
    await mkdir(out);
    const packed=spawnSync('pnpm',['pack','--config.ignore-scripts=true','--pack-destination',out],{cwd:root,encoding:'utf8'});
    assert.equal(packed.status,0,packed.stderr || packed.stdout);
    const archive=(await readdir(out)).find(file=>file.endsWith('.tgz'));
    const unpacked=spawnSync('tar',['-xzf',join(out,archive),'-C',out],{encoding:'utf8'});
    assert.equal(unpacked.status,0,unpacked.stderr);
    const text=await readFile(join(out,'package/package.json'),'utf8');
    assert.doesNotMatch(text,/workspace:/,`${name}'s packed package.json keeps a workspace: range`);
    const metadata=JSON.parse(text);
    assert.equal(metadata.name,name);
    assert.equal(metadata.license,'MIT');
    assert.ok(!metadata.private,`${name} is private`);
    await access(join(out,'package/LICENSE'));
    await rename(join(out,'package'),join(modules,name));
    manifests[name]=metadata;
    // Third-party dependencies from the workspace install (what npm would fetch).
    for(const dependency of Object.keys(metadata.dependencies ?? {})) {
      const target=join(modules,dependency);
      if(await access(target).then(()=>true,()=>false)) continue;
      await mkdir(dirname(target),{recursive:true});
      await symlink(join(root,'node_modules',dependency),target,'dir');
    }
    for(const [bin,file] of Object.entries(metadata.bin ?? {})) await symlink(join('..',name,file),join(modules,'.bin',bin));
  }
  await writeFile(join(app,'package.json'),'{"type":"module"}');
  return {directory,app,manifests};
}

const run=(app,bin,args)=>spawnSync(join(app,'node_modules/.bin',bin),args,{cwd:app,encoding:'utf8',env:{PATH:`${dirname(process.execPath)}:/usr/bin:/bin`},timeout:60000});

test('veriss-svelte and veriss-linaria install from their packed tarballs and lint from the command line', async () => {
  const {directory,app,manifests}=await install();
  try {
    // Every peer a published package names is published too, at the lockstep version.
    for(const metadata of Object.values(manifests)) {
      assert.equal(metadata.version,manifests.veriss.version,metadata.name);
      for(const [peer,range] of Object.entries(metadata.peerDependencies ?? {})) {
        assert.ok(manifests[peer],`${metadata.name} peers on ${peer}, which is not published`);
        assert.equal(range,`^${manifests.veriss.version}`,`${metadata.name} → ${peer}`);
      }
    }
    const svelte=join(packages,'svelte-adapter/fixtures'),linaria=join(packages,'linaria/fixtures');
    for(const [bin,broken,clean] of [['veriss-svelte',join(svelte,'Wide.svelte'),join(svelte,'Card.svelte')],['veriss-linaria',join(linaria,'Wide.tsx'),join(linaria,'Card.js')]]) {
      const failing=run(app,bin,['--viewport','320-800','--height','600-900',broken]);
      assert.equal(failing.status,1,failing.stderr || failing.stdout);
      assert.match(failing.stdout,/Wide\.\w+:\d+\s+error\s+E_LAYOUT_ITEM_SIZE/);
      const json=run(app,bin,['--format','json','--viewport','320-800','--height','600-900',broken]);
      assert.equal(json.status,1,json.stderr);
      assert.ok(JSON.parse(json.stdout).some(m=>m.code==='E_LAYOUT_PAGE_OVERFLOW' && m.severity==='error'));
      const passing=run(app,bin,[clean]);
      assert.equal(passing.status,0,passing.stderr || passing.stdout);
      assert.match(passing.stdout,/0 error\(s\)/);
      const usage=run(app,bin,[]);
      assert.equal(usage.status,2);
      assert.match(usage.stderr,new RegExp(`usage: ${bin} `));
    }
    await writeFile(join(app,'check.mjs'),`import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {analyzeSvelte} from 'veriss-svelte';
import {analyzeLinaria} from 'veriss-linaria';
import {lint} from 'veriss-adapter-core';
const options={pageCSS:'*{box-sizing:border-box;margin:0}',viewport:{min:320,max:800,height:{min:600,max:900}},sourceLines:true};
for(const [analyze,file] of [[analyzeSvelte,${JSON.stringify(join(svelte,'Wide.svelte'))}],[analyzeLinaria,${JSON.stringify(join(linaria,'Wide.tsx'))}]]) {
  const source=readFileSync(file,'utf8');
  assert.ok(lint(analyze(source,options),{file,source}).some(m=>m.code==='E_LAYOUT_ITEM_SIZE' && m.severity==='error'),file);
}
`);
    const checked=spawnSync(process.execPath,['check.mjs'],{cwd:app,encoding:'utf8',env:{PATH:'/usr/bin:/bin'},timeout:60000});
    assert.equal(checked.status,0,checked.stderr || checked.stdout);
  } finally {await rm(directory,{recursive:true,force:true});}
});
